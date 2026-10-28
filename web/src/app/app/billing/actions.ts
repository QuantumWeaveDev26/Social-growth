"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { applyPayment } from "@/lib/billing";
import { createOrder, razorpayLive, verifySignature } from "@/lib/razorpay";
import { notify } from "@/lib/notify";

export type RenewState = { error?: string; order?: { id: string; amount: number; key: string; name: string; email: string } } | undefined;

export async function startRenewal(_: RenewState, fd: FormData): Promise<RenewState> {
  const { user, customer } = await requireCustomer();
  const plan = db.select().from(schema.plans).where(eq(schema.plans.id, String(fd.get("plan")))).get();
  if (!plan) return { error: "Choose a plan." };
  if (!razorpayLive()) {
    const { end } = applyPayment(customer.id, plan.id, "demo");
    notify(customer.id, { kind: "renewed", title: "Plan renewed", body: `${plan.name} is active until ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(end)}.`, link: "/app/billing" });
    redirect("/app/billing?renewed=1");
  }
  try {
    const order = await createOrder(plan.priceInr, `renew-${customer.id.slice(0, 20)}`);
    db.insert(schema.payments).values({ customerId: customer.id, planId: plan.id, amountInr: plan.priceInr, provider: "razorpay", orderId: order.id, status: "created" }).run();
    return { order: { id: order.id, amount: order.amount, key: process.env.RAZORPAY_KEY_ID!, name: user.name, email: user.email } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Payment could not start. Try again." };
  }
}

export async function finishRenewal(orderId: string, paymentId: string, signature: string) {
  const { customer } = await requireCustomer();
  const pending = db.select().from(schema.payments).where(and(eq(schema.payments.orderId, orderId), eq(schema.payments.customerId, customer.id))).get();
  if (!pending || !verifySignature(orderId, paymentId, signature)) return { error: "We couldn’t verify that payment. If you were charged, write to support@brandmintai.io and we’ll fix it within a day." };
  if (pending.status === "paid") return { ok: true };
  db.update(schema.payments).set({ status: "superseded" }).where(eq(schema.payments.id, pending.id)).run();
  applyPayment(customer.id, pending.planId, "razorpay", { orderId, paymentId });
  return { ok: true };
}
