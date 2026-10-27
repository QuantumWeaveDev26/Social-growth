import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDateTime, inr } from "@/lib/format";
import { MetaConnect } from "@/components/MetaConnect";
import { disconnectMeta, saveSettings, checkMeta } from "../actions";

export const metadata = { title: "Accounts and plan" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; meta?: string }> }) {
  const sp = await searchParams;
  const { customer, user } = await requireCustomer();
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  const times = JSON.parse(customer.postingTimes || '["10:00","18:30"]') as string[];
  const colours = JSON.parse(customer.brandColors || '["#1F9D74","#13221D"]') as string[];
  return (
    <main className="px-12 pb-20 pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Accounts and plan</h1>
        <p className="mt-3 text-ink-2">Signed in as {user.email}</p>
      </header>
      <div className="max-w-[820px] divide-y divide-line">
        <section className="grid grid-cols-[220px_1fr] gap-10 py-9">
          <div><h2 className="font-bold">Instagram and Facebook</h2><p className="mt-1 text-sm text-ink-2">Where approved content is posted.</p></div>
          <div>
            <MetaConnect conn={conn} message={sp.meta} disconnect={disconnectMeta} check={checkMeta} />
          </div>
        </section>

        <section className="grid grid-cols-[220px_1fr] gap-10 py-9">
          <div><h2 className="font-bold">Plan</h2><p className="mt-1 text-sm text-ink-2">Billed monthly.</p></div>
          <div className="tnum">
            {plan && sub ? (
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[0.95rem]">
                <dt className="text-ink-2">Plan</dt><dd className="font-semibold">{plan.name} · {inr(plan.priceInr)}/month</dd>
                <dt className="text-ink-2">Each month</dt><dd>{plan.posts} posts, {plan.reels} reels, {plan.revisions} revisions per item</dd>
                <dt className="text-ink-2">Current period</dt><dd>{sub.periodStart && sub.periodEnd ? `${fmtDateTime(sub.periodStart).split(",").slice(0, 2).join(",")} to ${fmtDateTime(sub.periodEnd).split(",").slice(0, 2).join(",")}` : "Not started"}</dd>
                <dt className="text-ink-2">Payment</dt><dd>{sub.provider === "demo" ? "Demo (no charge)" : `Razorpay · ${sub.paymentId}`}</dd>
              </dl>
            ) : <p className="text-ink-2">No active plan.</p>}
          </div>
        </section>

        <form action={saveSettings} className="grid grid-cols-[220px_1fr] gap-10 py-9">
          <div><h2 className="font-bold">Posting and colours</h2><p className="mt-1 text-sm text-ink-2">Applies to the next month you plan.</p></div>
          <div className="space-y-6">
            {sp.saved && <p role="status" className="rounded-[10px] bg-mint-wash px-3 py-2 text-sm text-mint-deep">Saved.</p>}
            <div>
              <p className="label">Posting times (IST)</p>
              <div className="flex gap-4">
                <input type="time" name="t1" defaultValue={times[0]} className="field tnum w-36" aria-label="First posting time" />
                <input type="time" name="t2" defaultValue={times[1] || "18:30"} className="field tnum w-36" aria-label="Second posting time" />
              </div>
            </div>
            <div>
              <p className="label">Brand colours</p>
              <div className="flex gap-4">
                <input type="color" name="c1" defaultValue={colours[0] || "#1F9D74"} className="h-10 w-14 cursor-pointer rounded-[8px] border border-line-strong bg-white p-1" aria-label="Main colour" />
                <input type="color" name="c2" defaultValue={colours[1] || "#13221D"} className="h-10 w-14 cursor-pointer rounded-[8px] border border-line-strong bg-white p-1" aria-label="Second colour" />
              </div>
            </div>
            <SubmitButton pending="Saving">Save changes</SubmitButton>
          </div>
        </form>
      </div>
    </main>
  );
}
