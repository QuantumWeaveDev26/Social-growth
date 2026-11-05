import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { razorpayLive } from "@/lib/razorpay";
import { daysLeft } from "@/lib/billing";
import { inr } from "@/lib/format";
import { PlanForm, StopAutopay } from "./RenewForm";
import { remakeAllowance } from "@/lib/remakes";

export const metadata = { title: "Billing" };
const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d) : "—");

export default async function Billing({ searchParams }: { searchParams: Promise<{ renewed?: string; autopay?: string }> }) {
  const sp = await searchParams;
  const { customer } = await requireCustomer();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plans = db.select().from(schema.plans).orderBy(asc(schema.plans.sort)).all();
  const plan = plans.find((p) => p.id === sub?.planId);
  const history = db.select().from(schema.payments).where(eq(schema.payments.customerId, customer.id)).orderBy(desc(schema.payments.createdAt)).all().filter((p) => p.status === "paid");
  const left = daysLeft(sub?.periodEnd);
  const lapsed = sub?.status === "past_due" || left <= 0;
  const live = razorpayLive();
  const autopay = !!sub?.rzpSubscriptionId && ["created", "authenticated", "active", "pending"].includes(sub.rzpStatus || "");
  const pendingPlanId = db.select().from(schema.kv).where(eq(schema.kv.key, `pending_plan:${customer.id}`)).get()?.value;
  const pendingPlan = pendingPlanId && pendingPlanId !== sub?.planId ? plans.find((p) => p.id === pendingPlanId) : undefined;
  const remakes = remakeAllowance(customer.id);
  const payLine = !sub ? "" : sub.provider === "demo" ? "Demo billing: renews automatically without charging."
    : autopay ? (sub.rzpStatus === "pending" ? "Auto-pay: last charge failed, Razorpay is retrying. Check your UPI mandate or card." : `Auto-pay is on. Next charge ${day(sub.periodEnd)}${pendingPlan ? ` on the ${pendingPlan.name} plan` : ""}.`)
    : sub.rzpStatus === "cancelling" || sub.rzpStatus === "cancelled" ? `Auto-pay is off. The plan ends ${day(sub.periodEnd)}.`
    : sub.rzpStatus === "halted" ? "Auto-pay stopped after failed charges. Set it up again to continue."
    : "Auto-pay isn’t set up.";
  return (
    <main className="px-4 sm:px-8 lg:px-12 pb-20 pt-6 lg:pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[1.85rem] sm:text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Billing</h1>
        <p className="mt-3 text-ink-2">Plans renew every month by auto-pay (UPI Autopay or card). Each month includes {remakes.free} revision round{remakes.free === 1 ? "" : "s"}; after that, a change is ₹199 an image or ₹399 a video. Prices include GST. Your Meta ad budget is paid by you directly to Meta.</p>
      </header>
      {sp.autopay && <p role="status" className="mt-6 rounded-[12px] bg-mint-wash px-4 py-3 text-mint-deep">Auto-pay is set up. You’ll get a receipt from Razorpay each month.</p>}
      {sp.renewed && <p role="status" className="mt-6 rounded-[12px] bg-mint-wash px-4 py-3 text-mint-deep">Renewed. Thank you. Next month will be planned automatically about 10 days before the month ends.</p>}
      <div className="mt-8 grid max-w-[1000px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        <section>
          <div className={`rounded-[14px] p-6 ${lapsed ? "bg-amber-wash" : "bg-sheet ring-1 ring-line"}`}>
            <p className="text-sm text-ink-2">Current plan</p>
            <p className="mt-1 font-display text-2xl" style={{ fontWeight: 800 }}>{plan?.name ?? "No plan"} {plan && <span className="tnum text-base font-semibold text-ink-2">· {inr(plan.priceInr)}/month</span>}</p>
            <p className={`tnum mt-3 ${lapsed ? "font-semibold text-amber-deep" : "text-ink-2"}`}>
              {!sub ? "Not started" : lapsed ? `Ended ${day(sub.periodEnd)}. New content is paused until you renew; approved posts still go out.` : `Active until ${day(sub.periodEnd)} · ${left} day${left === 1 ? "" : "s"} left`}
            </p>
            <p className="mt-1 text-sm text-ink-3">{payLine}</p>
            <p className="tnum mt-3 text-sm text-ink-2">Revision rounds this month: <span className="font-semibold text-ink">{remakes.left} of {remakes.free} left</span> · resets {day(remakes.resetsOn)}</p>
          </div>
          <h2 className="mt-10 font-bold">Payment history</h2>
          <div className="mt-3 overflow-x-auto"><table className="tnum w-full min-w-[520px] text-left text-[0.9rem]">
            <thead className="border-b border-line text-ink-2"><tr><th className="py-2 font-semibold">Date</th><th className="font-semibold">Plan</th><th className="font-semibold">Period</th><th className="font-semibold">Amount</th><th className="font-semibold">Reference</th></tr></thead>
            <tbody className="divide-y divide-line">
              {history.map((h) => (
                <tr key={h.id}><td className="py-2.5">{day(h.createdAt)}</td><td>{h.kind === "remake" ? "Extra change" : plans.find((p) => p.id === h.planId)?.name}</td><td>{h.kind === "remake" ? "—" : `${day(h.periodStart)} – ${day(h.periodEnd)}`}</td><td>{h.amountInr ? inr(h.amountInr) : h.provider === "admin" ? "Added by BrandMint" : "Demo"}</td><td className="font-mono text-xs text-ink-3">{h.paymentId ?? "—"}</td></tr>
              ))}
              {!history.length && <tr><td colSpan={5} className="py-6 text-center text-ink-2">No payments yet.</td></tr>}
            </tbody>
          </table></div>
        </section>
        <aside>
          <div className="sticky top-8 space-y-6 rounded-[14px] bg-sheet p-6 ring-1 ring-line">
            {!live ? (
              <>
                <div><h2 className="font-bold">Renew or change plan</h2><p className="mt-1 text-sm text-ink-2">Demo server: no card is charged.</p></div>
                <PlanForm plans={plans} current={sub?.planId ?? "growth"} mode="demo" label="Renew (demo)" />
              </>
            ) : autopay ? (
              <>
                <div><h2 className="font-bold">Change plan</h2><p className="mt-1 text-sm text-ink-2">The new plan starts from your next monthly charge.</p></div>
                <PlanForm plans={plans} current={pendingPlan?.id ?? sub?.planId ?? "growth"} mode="switch" label="Change plan" />
                <div className="border-t border-line pt-5"><StopAutopay until={day(sub?.periodEnd ?? null)} /></div>
              </>
            ) : (
              <>
                <div>
                  <h2 className="font-bold">{lapsed ? "Restart your plan" : "Set up auto-pay"}</h2>
                  <p className="mt-1 text-sm text-ink-2">{lapsed ? "You’ll be charged now and every month after." : `Nothing is charged until ${day(sub?.periodEnd ?? null)}, when your current period ends.`} Cancel any time.</p>
                </div>
                <PlanForm plans={plans} current={sub?.planId ?? "growth"} mode="setup" label="Set up auto-pay" />
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
