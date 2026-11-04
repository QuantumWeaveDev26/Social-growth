"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { applyPayment, applySubscriptionCharge } from "@/lib/billing";
import {
  razorpayLive, createSubscription, fetchSubscription, cancelSubscription, changeSubscriptionPlan, verifySubscriptionSignature,
} from "@/lib/razorpay";
import { notify } from "@/lib/notify";

export type BillState = { error?: string; ok?: string; checkout?: { subscriptionId: string; key: string; name: string; email: string; plan: string } } | undefined;

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
const planById = (id: string) => db.select().from(schema.plans).where(eq(schema.plans.id, id)).get();
const autopayOn = (s?: { rzpSubscriptionId: string | null; rzpStatus: string | null }) =>
  !!s?.rzpSubscriptionId && ["created", "authenticated", "active", "pending"].includes(s.rzpStatus || "");

/** Demo servers (no Razorpay keys): renew for free so the flow can be tested. */
export async function demoRenew(_: BillState, fd: FormData): Promise<BillState> {
  const { customer } = await requireCustomer();
  const plan = planById(String(fd.get("plan")));
  if (!plan) return { error: "Choose a plan." };
  if (razorpayLive()) return { error: "Use auto-pay." };
  const { end } = applyPayment(customer.id, plan.id, "demo");
  notify(customer.id, { kind: "renewed", title: "Plan renewed", body: `${plan.name} is active until ${fmt(end)}.`, link: "/app/billing" });
  redirect("/app/billing?renewed=1");
}

/** Sets up monthly auto-pay. If the current period is already paid, the first charge waits until it ends. */
export async function setupAutopay(_: BillState, fd: FormData): Promise<BillState> {
  const { user, customer } = await requireCustomer();
  const plan = planById(String(fd.get("plan")));
  if (!plan) return { error: "Choose a plan." };
  if (!razorpayLive()) return { error: "Payments aren’t switched on yet on this server." };
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  if (autopayOn(sub)) return { error: "Auto-pay is already on. Use Change plan instead." };
  const paidUntil = sub?.status === "active" && sub.periodEnd && sub.periodEnd.getTime() > Date.now() ? sub.periodEnd : undefined;
  try {
    const rs = await createSubscription(plan, customer.id, paidUntil);
    db.update(schema.subscriptions).set({ rzpSubscriptionId: rs.id, rzpStatus: rs.status }).where(eq(schema.subscriptions.customerId, customer.id)).run();
    if (!sub) db.insert(schema.subscriptions).values({ customerId: customer.id, planId: plan.id, status: "pending", provider: "razorpay", rzpSubscriptionId: rs.id, rzpStatus: rs.status }).run();
    return { checkout: { subscriptionId: rs.id, key: process.env.RAZORPAY_KEY_ID!, name: user.name, email: user.email, plan: `${plan.name} · monthly auto-pay` } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Auto-pay could not start. Try again." };
  }
}

export async function confirmAutopay(paymentId: string, subscriptionId: string, signature: string) {
  const { customer } = await requireCustomer();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  if (!sub || sub.rzpSubscriptionId !== subscriptionId || !verifySubscriptionSignature(paymentId, subscriptionId, signature))
    return { error: "We couldn’t verify that. If you were charged, write to support@brandmintai.io and we’ll fix it within a day." };
  const rs = await fetchSubscription(subscriptionId).catch(() => null);
  const planId = rs?.notes?.planId || sub.planId;
  if (rs && rs.status === "active") {
    // charged now (no paid period left): start a new period
    applySubscriptionCharge({
      customerId: customer.id, planId, subscriptionId, paymentId, amountInr: planById(planId)?.priceInr ?? 0,
      start: rs.current_start ? new Date(rs.current_start * 1000) : null, end: rs.current_end ? new Date(rs.current_end * 1000) : null, rzpStatus: rs.status,
    });
  } else {
    // mandate set up; first charge when the paid period ends
    db.update(schema.subscriptions).set({ rzpStatus: rs?.status ?? "authenticated", provider: "razorpay" }).where(eq(schema.subscriptions.id, sub.id)).run();
  }
  revalidatePath("/app/billing");
  return { ok: true };
}

/** Changes plan from the next monthly charge. */
export async function switchPlan(_: BillState, fd: FormData): Promise<BillState> {
  const { customer } = await requireCustomer();
  const plan = planById(String(fd.get("plan")));
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  if (!plan || !sub) return { error: "Choose a plan." };
  if (plan.id === sub.planId) return { error: "You’re already on that plan." };
  if (!autopayOn(sub)) return { error: "Set up auto-pay first." };
  try {
    await changeSubscriptionPlan(sub.rzpSubscriptionId!, plan);
    db.insert(schema.kv).values({ key: `pending_plan:${customer.id}`, value: plan.id }).onConflictDoUpdate({ target: schema.kv.key, set: { value: plan.id } }).run();
    revalidatePath("/app/billing");
    return { ok: `Done. You’ll move to ${plan.name} from your next monthly charge${sub.periodEnd ? ` on ${fmt(sub.periodEnd)}` : ""}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { error: `Razorpay couldn’t change the plan on this payment method${msg ? ` (${msg})` : ""}. Turn off auto-pay, then set it up again on the new plan once this period ends.` };
  }
}

/** Stops auto-pay at the end of the current period. */
export async function stopAutopay(_: BillState, _fd: FormData): Promise<BillState> {
  const { customer } = await requireCustomer();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  if (!sub?.rzpSubscriptionId) return { error: "Auto-pay isn’t on." };
  try {
    // not charged yet (first charge in the future): cancel right away; otherwise at the end of the period
    await cancelSubscription(sub.rzpSubscriptionId, sub.rzpStatus === "active" || sub.rzpStatus === "pending");
    db.update(schema.subscriptions).set({ rzpStatus: "cancelling" }).where(eq(schema.subscriptions.id, sub.id)).run();
    revalidatePath("/app/billing");
    return { ok: `Auto-pay is off. Your plan stays active${sub.periodEnd ? ` until ${fmt(sub.periodEnd)}` : ""}, then new content stops.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn’t turn off auto-pay. Try again." };
  }
}
