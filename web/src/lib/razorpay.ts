import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Plan } from "@/db/schema";

export const razorpayLive = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function rzp<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.description || `Razorpay error ${res.status}`);
  return j as T;
}

const hmac = (secret: string, data: string) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------------------------------------------------------------- one-time payments (paid remakes)
export async function createOrder(amountInr: number, receipt: string, notes: Record<string, string> = {}) {
  return rzp<{ id: string; amount: number; currency: string }>("/orders", "POST", { amount: amountInr * 100, currency: "INR", receipt: receipt.slice(0, 40), notes });
}

export function verifySignature(orderId: string, paymentId: string, signature: string) {
  return same(hmac(process.env.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`), signature);
}

// ---------------------------------------------------------------- auto-pay subscriptions
const kvGet = (key: string) => db.select().from(schema.kv).where(eq(schema.kv.key, key)).get()?.value;
const kvSet = (key: string, value: string) =>
  db.insert(schema.kv).values({ key, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run();

/** The Razorpay plan for one of our plans at its current price (created once, then reused). Test and live keys get separate plans. */
export async function rzpPlanFor(plan: Plan) {
  const mode = (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_live") ? "live" : "test";
  const key = `rzp_plan:${mode}:${plan.id}:${plan.priceInr}`;
  const have = kvGet(key);
  if (have) return have;
  const p = await rzp<{ id: string }>("/plans", "POST", {
    period: "monthly", interval: 1,
    item: { name: `BrandMint AI · ${plan.name}`, amount: plan.priceInr * 100, currency: "INR", description: `${plan.posts} posts + ${plan.reels} reels a month` },
    notes: { planId: plan.id },
  });
  kvSet(key, p.id);
  kvSet(`rzp_plan_rev:${p.id}`, plan.id);
  return p.id;
}

/** Our plan id for a Razorpay plan id. */
export const planForRzp = (rzpPlanId: string) => kvGet(`rzp_plan_rev:${rzpPlanId}`);

export type RzpSubscription = { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null; charge_at: number | null; short_url?: string; notes?: Record<string, string> };

/** Creates a monthly auto-pay subscription. startAt (optional) delays the first charge, e.g. to the end of a period already paid. */
export async function createSubscription(plan: Plan, customerId: string, startAt?: Date) {
  const body: Record<string, unknown> = {
    plan_id: await rzpPlanFor(plan),
    total_count: 120, // up to 10 years of monthly charges; the client can cancel any time
    customer_notify: 1,
    notes: { customerId, planId: plan.id },
  };
  if (startAt && startAt.getTime() > Date.now() + 3600e3) body.start_at = Math.floor(startAt.getTime() / 1000);
  return rzp<RzpSubscription>("/subscriptions", "POST", body);
}

export const fetchSubscription = (id: string) => rzp<RzpSubscription>(`/subscriptions/${id}`);
export const cancelSubscription = (id: string, atCycleEnd = true) =>
  rzp<RzpSubscription>(`/subscriptions/${id}/cancel`, "POST", { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
export const changeSubscriptionPlan = async (id: string, plan: Plan) =>
  rzp<RzpSubscription>(`/subscriptions/${id}`, "PATCH", { plan_id: await rzpPlanFor(plan), schedule_change_at: "cycle_end" });

/** Checkout handler signature for a subscription payment. */
export function verifySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string) {
  return same(hmac(process.env.RAZORPAY_KEY_SECRET!, `${paymentId}|${subscriptionId}`), signature);
}

/** Webhook signature (Dashboard → Webhooks secret). */
export function verifyWebhook(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return same(hmac(secret, rawBody), signature);
}
