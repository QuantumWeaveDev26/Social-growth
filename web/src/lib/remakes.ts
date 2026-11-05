/**
 * Revision rounds: each plan includes a number of rounds per monthly cycle (Starter 1, Growth 2, Premium 3).
 * The owner notes changes on any items; one "Submit revision round" sends all notes at once and uses one round.
 * After the rounds are used, a change to a single item is paid on the spot: ₹199 an image, ₹399 a video.
 * Retrying an item that failed to make is always free and doesn't count.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { cycleStart, PERIOD_DAYS } from "./billing";
import { enqueue } from "./jobs";

export const REMAKE_PRICE_INR = {
  post: Number(process.env.REMAKE_PRICE_POST || 199),
  reel: Number(process.env.REMAKE_PRICE_REEL || 399),
} as const;
export const remakePrice = (type: string) => (type === "reel" ? REMAKE_PRICE_INR.reel : REMAKE_PRICE_INR.post);

type Round = { at: number; items: number };
const roundsKey = (customerId: string) => `rev_rounds:${customerId}`;
function rounds(customerId: string): Round[] {
  try { return JSON.parse(db.select().from(schema.kv).where(eq(schema.kv.key, roundsKey(customerId))).get()?.value || "[]"); } catch { return []; }
}

/** Revision rounds included this cycle, used and left. */
export function remakeAllowance(customerId: string) {
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customerId)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  const free = plan?.revisions ?? 1;
  const since = cycleStart(sub);
  const used = rounds(customerId).filter((r) => r.at >= since.getTime()).length;
  const next = new Date(since.getTime() + PERIOD_DAYS * 86400e3);
  const resetsOn = sub?.periodEnd && sub.periodEnd < next ? sub.periodEnd : next;
  return { free, used, left: Math.max(0, free - used), resetsOn, planId: sub?.planId ?? null };
}

/** Items with a change noted for the next round (still waiting for the owner's OK). */
export function pendingNotes(customerId: string) {
  return db.select({ id: schema.contentItems.id, type: schema.contentItems.type, note: schema.contentItems.pendingNote })
    .from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customerId), eq(schema.contentItems.status, "awaiting_approval"), isNotNull(schema.contentItems.pendingNote)))
    .all().filter((r) => (r.note || "").trim());
}

export function setPendingNote(itemId: string, note: string | null) {
  db.update(schema.contentItems).set({ pendingNote: note?.trim() ? note.trim().slice(0, 1000) : null }).where(eq(schema.contentItems.id, itemId)).run();
}

/** Sends every noted change as one revision round. Returns how many items went back into making. */
export function submitRound(customerId: string) {
  const a = remakeAllowance(customerId);
  if (a.left <= 0) return { ok: false as const, error: "You’ve used this month’s revision rounds." };
  const notes = pendingNotes(customerId);
  if (!notes.length) return { ok: false as const, error: "Note a change on at least one item first." };
  for (const n of notes) { startRemake(n.id, customerId, n.note!, "round"); setPendingNote(n.id, null); }
  const value = JSON.stringify([...rounds(customerId), { at: Date.now(), items: notes.length }].slice(-50));
  db.insert(schema.kv).values({ key: roundsKey(customerId), value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run();
  return { ok: true as const, items: notes.length, left: a.left - 1 };
}

/** Puts an item back into making with the client's note. */
export function startRemake(itemId: string, customerId: string, comment: string, charge: "round" | "paid" | "retry") {
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)).get();
  if (!item) return;
  db.insert(schema.approvals).values({ itemId, decision: "changes", comment, charge, createdAt: new Date() }).run();
  if (charge !== "retry") rememberFeedback(customerId, comment);
  db.update(schema.contentItems)
    .set({ status: "changes_requested", pendingNote: null, revisionCount: charge === "retry" ? item.revisionCount : item.revisionCount + 1, error: null, updatedAt: new Date() })
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

/** Keeps the owner's change requests so every future post and month follows them (last 15). */
export function rememberFeedback(customerId: string, note: string) {
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  if (!c || note.trim().length < 4) return;
  const d = JSON.parse(c.details || "{}");
  const notes: string[] = Array.isArray(d.feedback_notes) ? d.feedback_notes : [];
  if (!notes.includes(note.trim())) notes.push(note.trim().slice(0, 300));
  d.feedback_notes = notes.slice(-15);
  db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, customerId)).run();
}
