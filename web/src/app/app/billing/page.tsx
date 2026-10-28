import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { razorpayLive } from "@/lib/razorpay";
import { daysLeft } from "@/lib/billing";
import { inr } from "@/lib/format";
import { RenewForm } from "./RenewForm";

export const metadata = { title: "Billing" };
const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d) : "—");

export default async function Billing({ searchParams }: { searchParams: Promise<{ renewed?: string }> }) {
  const sp = await searchParams;
  const { customer } = await requireCustomer();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plans = db.select().from(schema.plans).orderBy(asc(schema.plans.sort)).all();
  const plan = plans.find((p) => p.id === sub?.planId);
  const history = db.select().from(schema.payments).where(eq(schema.payments.customerId, customer.id)).orderBy(desc(schema.payments.createdAt)).all().filter((p) => p.status === "paid");
  const left = daysLeft(sub?.periodEnd);
  const lapsed = sub?.status === "past_due" || left <= 0;
  return (
    <main className="px-12 pb-20 pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Billing</h1>
        <p className="mt-3 text-ink-2">Plans run for 30 days at a time. Renew early and the new period starts when the current one ends.</p>
      </header>
      {sp.renewed && <p role="status" className="mt-6 rounded-[12px] bg-mint-wash px-4 py-3 text-mint-deep">Renewed. Thank you. Next month will be planned automatically about 10 days before the month ends.</p>}
      <div className="mt-8 grid max-w-[1000px] grid-cols-[1fr_380px] gap-12">
        <section>
          <div className={`rounded-[14px] p-6 ${lapsed ? "bg-amber-wash" : "bg-sheet ring-1 ring-line"}`}>
            <p className="text-sm text-ink-2">Current plan</p>
            <p className="mt-1 font-display text-2xl" style={{ fontWeight: 800 }}>{plan?.name ?? "No plan"} {plan && <span className="tnum text-base font-semibold text-ink-2">· {inr(plan.priceInr)}/month</span>}</p>
            <p className={`tnum mt-3 ${lapsed ? "font-semibold text-amber-deep" : "text-ink-2"}`}>
              {!sub ? "Not started" : lapsed ? `Ended ${day(sub.periodEnd)}. New content is paused until you renew; approved posts still go out.` : `Active until ${day(sub.periodEnd)} · ${left} day${left === 1 ? "" : "s"} left`}
            </p>
            <p className="mt-1 text-sm text-ink-3">{sub?.provider === "demo" ? "Demo billing: renews automatically without charging." : "Paid with Razorpay."}</p>
          </div>
          <h2 className="mt-10 font-bold">Payment history</h2>
          <table className="tnum mt-3 w-full text-left text-[0.9rem]">
            <thead className="border-b border-line text-ink-2"><tr><th className="py-2 font-semibold">Date</th><th className="font-semibold">Plan</th><th className="font-semibold">Period</th><th className="font-semibold">Amount</th><th className="font-semibold">Reference</th></tr></thead>
            <tbody className="divide-y divide-line">
              {history.map((h) => (
                <tr key={h.id}><td className="py-2.5">{day(h.createdAt)}</td><td>{plans.find((p) => p.id === h.planId)?.name}</td><td>{day(h.periodStart)} – {day(h.periodEnd)}</td><td>{h.amountInr ? inr(h.amountInr) : h.provider === "admin" ? "Added by BrandMint" : "Demo"}</td><td className="font-mono text-xs text-ink-3">{h.paymentId ?? "—"}</td></tr>
              ))}
              {!history.length && <tr><td colSpan={5} className="py-6 text-center text-ink-2">No payments yet.</td></tr>}
            </tbody>
          </table>
        </section>
        <aside>
          <div className="sticky top-8 rounded-[14px] bg-sheet p-6 ring-1 ring-line">
            <h2 className="font-bold">{lapsed ? "Renew your plan" : "Renew early or change plan"}</h2>
            <p className="mb-4 mt-1 text-sm text-ink-2">A plan change takes effect from the next period.</p>
            <RenewForm plans={plans} current={sub?.planId ?? "growth"} live={razorpayLive()} label={lapsed ? "Renew now" : "Pay for next period"} />
          </div>
        </aside>
      </div>
    </main>
  );
}
