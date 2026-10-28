import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const DAY = 86400e3;
export const PERIOD_DAYS = 30;

/** Starts or extends a subscription by one period and records the payment. */
export function applyPayment(customerId: string, planId: string, provider: "razorpay" | "demo" | "admin", ids: { orderId?: string; paymentId?: string } = {}) {
  const plan = db.select().from(schema.plans).where(eq(schema.plans.id, planId)).get();
  if (!plan) throw new Error("Unknown plan");
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customerId)).get();
  const now = Date.now();
  // renewing early stacks onto the current period; lapsed subscriptions start today
  const extending = !!(sub?.periodEnd && sub.status === "active" && sub.periodEnd.getTime() > now);
  const start = extending ? sub!.periodEnd! : new Date(now);
  const end = new Date(start.getTime() + PERIOD_DAYS * DAY);
  const values = {
    customerId, planId, status: "active", provider: provider === "admin" ? sub?.provider ?? "demo" : provider,
    orderId: ids.orderId ?? null, paymentId: ids.paymentId ?? null,
    periodStart: extending && sub?.periodStart ? sub.periodStart : start,
    periodEnd: end,
  };
  if (sub) db.update(schema.subscriptions).set(values).where(eq(schema.subscriptions.id, sub.id)).run();
  else db.insert(schema.subscriptions).values(values).run();
  db.insert(schema.payments).values({
    customerId, planId, amountInr: provider === "razorpay" ? plan.priceInr : 0, provider,
    orderId: ids.orderId ?? null, paymentId: ids.paymentId ?? null, status: "paid", periodStart: start, periodEnd: end,
  }).run();
  return { start, end };
}

export const daysLeft = (end: Date | null | undefined) => (end ? Math.ceil((end.getTime() - Date.now()) / DAY) : 0);
