/**
 * Remakes: each client gets the plan's free remakes per monthly cycle (3 by default, shared across all
 * posts and reels). After that a remake is paid on the spot: ₹199 for a post, ₹399 for a reel.
 * Retrying a post that failed to make is always free and doesn't count.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cycleStart, PERIOD_DAYS } from "./billing";
import { enqueue } from "./jobs";

export const REMAKE_PRICE_INR = {
  post: Number(process.env.REMAKE_PRICE_POST || 199),
  reel: Number(process.env.REMAKE_PRICE_REEL || 399),
} as const;
export const remakePrice = (type: string) => (type === "reel" ? REMAKE_PRICE_INR.reel : REMAKE_PRICE_INR.post);

export function remakeAllowance(customerId: string) {
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customerId)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  const free = plan?.revisions ?? 3;
  const since = cycleStart(sub);
  const used = db.select({ n: sql<number>`count(*)` }).from(schema.approvals)
    .innerJoin(schema.contentItems, eq(schema.contentItems.id, schema.approvals.itemId))
    .where(and(eq(schema.contentItems.customerId, customerId), eq(schema.approvals.decision, "changes"), eq(schema.approvals.charge, "free"), gte(schema.approvals.createdAt, since)))
    .get()?.n ?? 0;
  const resetsOn = sub?.periodEnd && sub.periodEnd.getTime() > Date.now() ? sub.periodEnd : new Date(since.getTime() + PERIOD_DAYS * 86400e3);
  return { free, used, left: Math.max(0, free - used), resetsOn, planId: sub?.planId ?? null };
}

/** Puts an item back into making with the client's note. */
export function startRemake(itemId: string, customerId: string, comment: string, charge: "free" | "paid" | "retry") {
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)).get();
  if (!item) return;
  db.insert(schema.approvals).values({ itemId, decision: "changes", comment, charge, createdAt: new Date() }).run();
  db.update(schema.contentItems)
    .set({ status: "changes_requested", revisionCount: charge === "retry" ? item.revisionCount : item.revisionCount + 1, error: null, updatedAt: new Date() })
    .where(eq(schema.contentItems.id, itemId)).run();
  // a paid remake runs even while AI generation is paused for testing: the client has paid for it
  enqueue("generate_item", { itemId, ...(charge === "paid" ? { paid: true } : {}) }, { customerId });
}

/** Completes a paid remake once its payment is confirmed. Safe to call twice (checkout handler + webhook). */
export function fulfilPaidRemake(orderId: string, paymentId: string) {
  const p = db.select().from(schema.payments).where(and(eq(schema.payments.orderId, orderId), eq(schema.payments.kind, "remake"))).get();
  if (!p || !p.itemId) return { error: "Payment not found" as const };
  if (p.status === "paid") return { ok: true as const, itemId: p.itemId };
  db.update(schema.payments).set({ status: "paid", paymentId }).where(eq(schema.payments.id, p.id)).run();
  startRemake(p.itemId, p.customerId, p.note || "Remake", "paid");
  return { ok: true as const, itemId: p.itemId };
}
