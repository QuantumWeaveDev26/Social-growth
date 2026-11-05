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

/**
 * Records one auto-pay charge (first payment or a monthly renewal). Safe to call twice for the same
 * payment: the checkout handler and the webhook can both report it.
 */
export function applySubscriptionCharge(o: {
  customerId: string; planId: string; subscriptionId: string; paymentId: string; amountInr: number;
  start?: Date | null; end?: Date | null; rzpStatus?: string;
}) {
  if (db.select().from(schema.payments).where(eq(schema.payments.paymentId, o.paymentId)).get()) return false;
  const start = o.start ?? new Date();
  const end = o.end && o.end.getTime() > start.getTime() ? o.end : new Date(start.getTime() + PERIOD_DAYS * DAY);
  const values = {
    customerId: o.customerId, planId: o.planId, status: "active", provider: "razorpay",
    paymentId: o.paymentId, periodStart: start, periodEnd: end, rzpSubscriptionId: o.subscriptionId, rzpStatus: o.rzpStatus ?? "active",
  };
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, o.customerId)).get();
  if (sub) db.update(schema.subscriptions).set(values).where(eq(schema.subscriptions.id, sub.id)).run();
  else db.insert(schema.subscriptions).values(values).run();
  db.insert(schema.payments).values({
    customerId: o.customerId, planId: o.planId, amountInr: o.amountInr, provider: "razorpay", kind: "plan",
    orderId: o.subscriptionId, paymentId: o.paymentId, status: "paid", periodStart: start, periodEnd: end,
  }).run();
  return true;
}

/** Start of the client’s current monthly cycle (revision rounds reset here). */
export function cycleStart(sub: { periodStart: Date | null; periodEnd: Date | null; createdAt: Date } | undefined) {
  if (!sub) return new Date(0);
  if (sub.periodEnd) {
    // paid months can stack (early renewals), so count back in 30-day steps to the cycle that contains today
    const now = Date.now();
    const ahead = sub.periodEnd.getTime() > now ? Math.floor((sub.periodEnd.getTime() - now) / (PERIOD_DAYS * DAY)) : 0;
    const back = new Date(sub.periodEnd.getTime() - (ahead + 1) * PERIOD_DAYS * DAY);
    // auto-pay periods follow Razorpay's calendar month: use the real start when it falls inside this cycle
    return sub.periodStart && sub.periodStart > back && sub.periodStart.getTime() <= now ? sub.periodStart : back;
  }
  return sub.periodStart ?? sub.createdAt;
}
