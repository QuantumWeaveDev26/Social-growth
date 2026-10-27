"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { saveFile } from "@/lib/storage";
import { createOrder, razorpayLive, verifySignature } from "@/lib/razorpay";
import { currentMonth, nextMonth } from "@/lib/format";

export type StepState = { error?: string; order?: { id: string; amount: number; key: string; name: string; email: string } } | undefined;

const setStep = (customerId: string, step: number) =>
  db.update(schema.customers).set({ onboardStep: step }).where(eq(schema.customers.id, customerId)).run();

function activateSubscription(customerId: string, planId: string, provider: "razorpay" | "demo", orderId?: string, paymentId?: string) {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 86400e3);
  const values = { customerId, planId, status: "active", provider, orderId: orderId ?? null, paymentId: paymentId ?? null, periodStart: start, periodEnd: end };
  const existing = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customerId)).get();
  if (existing) db.update(schema.subscriptions).set(values).where(eq(schema.subscriptions.id, existing.id)).run();
  else db.insert(schema.subscriptions).values(values).run();
}

/** Step 1: plan + payment */
export async function choosePlan(_: StepState, fd: FormData): Promise<StepState> {
  const { user, customer } = await requireCustomer({ allowOnboarding: true });
  const planId = String(fd.get("plan") || "");
  const plan = db.select().from(schema.plans).where(eq(schema.plans.id, planId)).get();
  if (!plan) return { error: "Choose a plan to continue." };
  if (!razorpayLive()) {
    activateSubscription(customer.id, plan.id, "demo");
    setStep(customer.id, 2);
    redirect("/onboarding");
  }
  try {
    const order = await createOrder(plan.priceInr, customer.id.slice(0, 30));
    db.insert(schema.subscriptions)
      .values({ customerId: customer.id, planId: plan.id, status: "pending", provider: "razorpay", orderId: order.id })
      .onConflictDoUpdate({ target: schema.subscriptions.customerId, set: { planId: plan.id, status: "pending", provider: "razorpay", orderId: order.id } })
      .run();
    return { order: { id: order.id, amount: order.amount, key: process.env.RAZORPAY_KEY_ID!, name: user.name, email: user.email } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Payment could not start. Try again." };
  }
}

export async function confirmPayment(orderId: string, paymentId: string, signature: string) {
  const { customer } = await requireCustomer({ allowOnboarding: true });
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  if (!sub || sub.orderId !== orderId || !verifySignature(orderId, paymentId, signature)) return { error: "We couldn’t verify that payment. If you were charged, write to us and we’ll fix it within a day." };
  activateSubscription(customer.id, sub.planId, "razorpay", orderId, paymentId);
  setStep(customer.id, 2);
  return { ok: true };
}

/** Step 2: business details */
export async function saveBusiness(_: StepState, fd: FormData): Promise<StepState> {
  const { customer } = await requireCustomer({ allowOnboarding: true });
  const get = (k: string) => String(fd.get(k) || "").trim();
  const details = {
    category: get("category"), city: get("city"), offer: get("offer"), audience: get("audience"),
    different: get("different"), offers_now: get("offers_now"), tone: get("tone"), language: get("language"), avoid: get("avoid"),
  };
  if (!details.offer || !details.audience) return { error: "Tell us what you sell and who buys it. Those two answers shape everything." };
  db.update(schema.customers)
    .set({ businessName: get("businessName") || customer.businessName, websiteUrl: get("website") || null, details: JSON.stringify(details), onboardStep: Math.max(customer.onboardStep, 3) })
    .where(eq(schema.customers.id, customer.id))
    .run();
  redirect("/onboarding");
}

/** Step 3: brand kit */
export async function saveBrandKit(_: StepState, fd: FormData): Promise<StepState> {
  const { customer } = await requireCustomer({ allowOnboarding: true });
  const colours = ["c1", "c2"].map((k) => String(fd.get(k) || "")).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const times = ["t1", "t2"].map((k) => String(fd.get(k) || "")).filter((t) => /^\d{2}:\d{2}$/.test(t));
  let logoPath = customer.logoPath;
  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 5 * 1024 * 1024) return { error: "That logo is over 5 MB. Export a smaller PNG and try again." };
    try {
      const png = await sharp(Buffer.from(await logo.arrayBuffer())).resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      logoPath = saveFile(`${customer.id}/brand/logo.png`, png);
    } catch {
      return { error: "We couldn’t read that file as an image. Upload a PNG, JPG or SVG." };
    }
  }
  db.update(schema.customers)
    .set({ brandColors: JSON.stringify(colours.length ? colours : ["#1F9D74"]), postingTimes: JSON.stringify(times.length ? times : ["10:00", "18:30"]), logoPath, onboardStep: Math.max(customer.onboardStep, 4) })
    .where(eq(schema.customers.id, customer.id))
    .run();
  // brand profile is written while the owner connects Meta
  enqueue("brand_profile", { customerId: customer.id }, { customerId: customer.id });
  redirect("/onboarding");
}

/** Step 4 is the Meta connect route; this skips ahead once connected. */
export async function afterMeta() {
  const { customer } = await requireCustomer({ allowOnboarding: true });
  setStep(customer.id, Math.max(customer.onboardStep, 5));
  redirect("/onboarding");
}

/** Step 5: confirm brand profile (optionally with corrections) and start the first month. */
export async function confirmProfile(_: StepState, fd: FormData): Promise<StepState> {
  const { customer } = await requireCustomer({ allowOnboarding: true });
  const corrections = String(fd.get("corrections") || "").trim();
  const profile = db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.customerId, customer.id)).orderBy(desc(schema.brandProfiles.version)).get();
  if (!profile) return { error: "Your brand profile is still being written. Give it a moment." };
  if (corrections) {
    const details = JSON.parse(customer.details || "{}");
    details.owner_corrections = [details.owner_corrections, corrections].filter(Boolean).join("\n");
    db.update(schema.customers).set({ details: JSON.stringify(details) }).where(eq(schema.customers.id, customer.id)).run();
    enqueue("brand_profile", { customerId: customer.id }, { customerId: customer.id });
    revalidatePath("/onboarding");
    return { error: undefined };
  }
  db.update(schema.brandProfiles).set({ confirmed: true }).where(eq(schema.brandProfiles.id, profile.id)).run();
  db.update(schema.customers).set({ status: "active", onboardStep: 6 }).where(eq(schema.customers.id, customer.id)).run();
  const now = new Date(Date.now() + 5.5 * 3600e3);
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
  const month = daysInMonth - now.getUTCDate() >= 20 ? currentMonth() : nextMonth(currentMonth());
  enqueue("plan_month", { customerId: customer.id, month }, { customerId: customer.id });
  redirect("/app?welcome=1");
}
