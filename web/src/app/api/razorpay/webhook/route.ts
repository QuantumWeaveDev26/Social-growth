/**
 * Razorpay webhooks (Dashboard → Account & Settings → Webhooks).
 * URL: https://<APP_HOST>/api/razorpay/webhook · secret = RAZORPAY_WEBHOOK_SECRET
 * Events: subscription.activated, subscription.charged, subscription.pending, subscription.halted,
 *         subscription.cancelled, subscription.completed, subscription.updated, payment.captured, payment.failed
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyWebhook, planForRzp } from "@/lib/razorpay";
import { applySubscriptionCharge } from "@/lib/billing";
import { fulfilPaidRemake } from "@/lib/remakes";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Sub = { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null; notes?: Record<string, string> };
type Pay = { id: string; amount: number; order_id?: string; status: string; notes?: Record<string, string>; error_description?: string };

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature") || "")) return new Response("bad signature", { status: 400 });
  const evt = JSON.parse(raw) as { event: string; payload: { subscription?: { entity: Sub }; payment?: { entity: Pay } } };
  const s = evt.payload.subscription?.entity;
  const p = evt.payload.payment?.entity;

  // one-time payments: paid remakes (backup for when the browser closes before the checkout handler runs)
  if (evt.event === "payment.captured" && p?.notes?.kind === "remake" && p.order_id) {
    fulfilPaidRemake(p.order_id, p.id);
    return Response.json({ ok: true });
  }
  if (!s) return Response.json({ ok: true, ignored: evt.event });

  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.rzpSubscriptionId, s.id)).get();
  const customerId = sub?.customerId ?? s.notes?.customerId;
  if (!customerId) return Response.json({ ok: true, ignored: "unknown subscription" });
  const planId = planForRzp(s.plan_id) ?? sub?.planId ?? s.notes?.planId ?? "starter";

  switch (evt.event) {
    case "subscription.activated":
    case "subscription.charged": {
      if (!p) break;
      const start = s.current_start ? new Date(s.current_start * 1000) : null;
      const end = s.current_end ? new Date(s.current_end * 1000) : null;
      const isNew = applySubscriptionCharge({ customerId, planId, subscriptionId: s.id, paymentId: p.id, amountInr: Math.round(p.amount / 100), start, end, rzpStatus: s.status });
      if (isNew) db.delete(schema.kv).where(eq(schema.kv.key, `pending_plan:${customerId}`)).run();
      // a renewal after the first charge: tell the client
      if (isNew && evt.event === "subscription.charged" && sub?.status === "active" && end) {
        notify(customerId, { kind: "renewed", title: "Your plan renewed", body: `Auto-pay charged ₹${Math.round(p.amount / 100)}. Your plan now runs until ${fmt(end)}.`, link: "/app/billing", dedupeKey: `renewed:${p.id}` });
      }
      break;
    }
    case "subscription.pending":
      // a renewal charge failed; Razorpay retries for a few days
      db.update(schema.subscriptions).set({ rzpStatus: "pending" }).where(eq(schema.subscriptions.customerId, customerId)).run();
      notify(customerId, { kind: "past_due", email: true, title: "Your auto-pay didn’t go through", body: "We couldn’t collect this month’s payment. Razorpay will retry over the next few days.\n\nMake sure your UPI Autopay mandate or card is active and has enough balance.", link: "/app/billing", cta: "Check billing", dedupeKey: `rzp_pending:${s.id}:${s.current_end}` });
      break;
    case "subscription.halted":
      db.update(schema.subscriptions).set({ rzpStatus: "halted", status: "past_due" }).where(eq(schema.subscriptions.customerId, customerId)).run();
      notify(customerId, { kind: "past_due", email: true, title: "Your plan is on hold", body: "Auto-pay failed after several tries, so new content is paused. Posts you already approved still go out.\n\nSet up auto-pay again from Billing to continue.", link: "/app/billing", cta: "Set up auto-pay", dedupeKey: `rzp_halted:${s.id}:${s.current_end}` });
      break;
    case "subscription.cancelled":
    case "subscription.completed":
      db.update(schema.subscriptions).set({ rzpStatus: s.status }).where(eq(schema.subscriptions.customerId, customerId)).run();
      break;
    case "subscription.updated":
      db.update(schema.subscriptions).set({ rzpStatus: s.status }).where(eq(schema.subscriptions.customerId, customerId)).run();
      break;
  }
  return Response.json({ ok: true });
}
