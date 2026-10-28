import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { Wordmark, StatusChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { daysLeft } from "@/lib/billing";
import { currentMonth, nextMonth, fmtDateTime, inr, monthLabel } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import { adminChangePlan, adminExtend, adminSetStatus, adminRetryFailed, adminReleaseHeld, adminPlanMonth, adminRebuildProfile } from "./actions";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, id)).get();
  if (!c) notFound();
  const owner = db.select().from(schema.users).where(eq(schema.users.customerId, id)).get();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, id)).get();
  const plans = db.select().from(schema.plans).orderBy(asc(schema.plans.sort)).all();
  const plan = plans.find((p) => p.id === sub?.planId);
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, id)).get();
  const months = db.select().from(schema.contentPlans).where(eq(schema.contentPlans.customerId, id)).orderBy(desc(schema.contentPlans.month)).all();
  const counts = db.select({ planId: schema.contentItems.planId, status: schema.contentItems.status, n: sql<number>`count(*)`, cost: sql<number>`sum(${schema.contentItems.costUsd})` })
    .from(schema.contentItems).where(eq(schema.contentItems.customerId, id)).groupBy(schema.contentItems.planId, schema.contentItems.status).all();
  const failed = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.customerId, id), eq(schema.contentItems.status, "failed"))).orderBy(asc(schema.contentItems.slotAt)).all();
  const held = db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(and(eq(schema.jobs.customerId, id), eq(schema.jobs.status, "queued"), gt(schema.jobs.runAt, new Date(Date.now() + 3600e3)))).get()?.n ?? 0;
  const notices = db.select().from(schema.notifications).where(eq(schema.notifications.customerId, id)).orderBy(desc(schema.notifications.createdAt)).limit(12).all();
  const payments = db.select().from(schema.payments).where(eq(schema.payments.customerId, id)).orderBy(desc(schema.payments.createdAt)).all().filter((p) => p.status === "paid");
  const details = JSON.parse(c.details || "{}");
  const totalCost = counts.reduce((a, r) => a + (r.cost || 0), 0);
  const Hidden = () => <input type="hidden" name="customerId" value={id} />;

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 bg-rail px-10 py-4 text-rail-text"><Wordmark dark href="/admin" /><span className="text-sm">Operations</span></header>
      <main className="px-10 pb-20 pt-8">
        <Link href="/admin" className="flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />All customers</Link>
        <div className="mt-4 flex items-end justify-between gap-6 border-b border-line pb-6">
          <div>
            <h1 className="font-display text-[2.2rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>{c.businessName}</h1>
            <p className="tnum mt-2 text-ink-2">{owner?.name} · {owner?.email} · joined {fmtDateTime(c.createdAt)} · <span className="capitalize">{c.status}</span> · AI spend {usd(totalCost)}</p>
          </div>
          <form action={adminSetStatus}><Hidden /><input type="hidden" name="status" value={c.status === "paused" ? "active" : "paused"} />
            <SubmitButton className="btn btn-ghost" pending="Saving">{c.status === "paused" ? "Resume customer" : "Pause customer"}</SubmitButton>
          </form>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-8">
          <section className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
            <h2 className="font-bold">Subscription</h2>
            <p className="tnum mt-2 text-sm text-ink-2">{plan ? `${plan.name} · ${inr(plan.priceInr)}` : "None"} · {sub?.status ?? "—"} · {sub?.provider}</p>
            <p className="tnum text-sm text-ink-2">{sub?.periodEnd ? `Until ${fmtDateTime(sub.periodEnd)} (${daysLeft(sub.periodEnd)} days)` : ""}</p>
            <form action={adminChangePlan} className="mt-4 flex gap-2"><Hidden />
              <select name="plan" defaultValue={sub?.planId} className="field py-1.5">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <SubmitButton className="btn btn-ghost" pending="Saving">Change</SubmitButton>
            </form>
            <form action={adminExtend} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Adding">Add 30 days (no charge)</SubmitButton></form>
            {payments.length > 0 && <p className="tnum mt-3 text-xs text-ink-3">{payments.length} payment record{payments.length === 1 ? "" : "s"} · last {fmtDateTime(payments[0].createdAt)}</p>}
          </section>
          <section className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
            <h2 className="font-bold">Facebook and Instagram</h2>
            {conn ? (
              <div className="mt-2 space-y-1 text-sm text-ink-2">
                <p>{conn.kind === "facebook" ? `Page: ${conn.pageName}` : "Instagram login"} · {conn.igUsername ? `@${conn.igUsername}` : "no Instagram"}</p>
                <p>{conn.mode} · <span className={conn.status === "connected" ? "text-mint-deep" : "font-semibold text-red"}>{conn.status}</span></p>
                {conn.lastError && <p className="text-red">{conn.lastError}</p>}
              </div>
            ) : <p className="mt-2 text-sm text-ink-2">Not connected.</p>}
            <h2 className="mt-5 font-bold">Business</h2>
            <p className="mt-1 line-clamp-4 text-sm text-ink-2">{details.offer || "—"}</p>
            <form action={adminRebuildProfile} className="mt-3"><Hidden /><SubmitButton className="btn btn-ghost" pending="Queued">Rewrite brand profile</SubmitButton></form>
          </section>
          <section className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
            <h2 className="font-bold">Content controls</h2>
            <form action={adminPlanMonth} className="mt-3 flex gap-2"><Hidden />
              <select name="month" className="field py-1.5" defaultValue={nextMonth(currentMonth())}>
                {[currentMonth(), nextMonth(currentMonth()), nextMonth(nextMonth(currentMonth()))].map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <SubmitButton className="btn btn-ghost" pending="Queued">Plan month</SubmitButton>
            </form>
            <form action={adminRetryFailed} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Retrying" disabled={!failed.length}>Retry {failed.length} failed item{failed.length === 1 ? "" : "s"}</SubmitButton></form>
            <form action={adminReleaseHeld} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Releasing" disabled={!held}>Release {held} on-hold item{held === 1 ? "" : "s"}</SubmitButton></form>
          </section>
        </div>

        <h2 className="mt-10 text-lg font-bold">Months</h2>
        <table className="tnum mt-3 w-full overflow-hidden rounded-[12px] bg-sheet text-left text-[0.88rem] ring-1 ring-line">
          <thead className="border-b border-line text-ink-2"><tr>{["Month", "Status", "Items", "Awaiting", "Approved/posted", "Being made", "Failed", "AI cost"].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {months.map((m) => {
              const rows = counts.filter((r) => r.planId === m.id);
              const n = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + r.n, 0);
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-semibold">{monthLabel(m.month)}</td><td className="px-4 capitalize">{m.status}</td>
                  <td className="px-4">{rows.reduce((a, r) => a + r.n, 0)}</td><td className="px-4">{n(["awaiting_approval"])}</td>
                  <td className="px-4">{n(["approved", "scheduled", "published"])}</td><td className="px-4">{n(["planned", "generating", "changes_requested"])}</td>
                  <td className={`px-4 ${n(["failed"]) ? "font-semibold text-red" : ""}`}>{n(["failed"])}</td><td className="px-4">{usd(rows.reduce((a, r) => a + (r.cost || 0), 0))}</td>
                </tr>
              );
            })}
            {!months.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-2">No months planned yet.</td></tr>}
          </tbody>
        </table>

        {failed.length > 0 && (
          <>
            <h2 className="mt-10 text-lg font-bold">Failed items</h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {failed.map((f) => (
                <li key={f.id} className="flex items-center gap-4 py-3 text-sm">
                  {f.thumbPath ? <img src={mediaUrl(f.thumbPath)!} alt="" className="size-10 rounded object-cover" /> : <span className="size-10 rounded bg-line" />}
                  <span className="flex-1">{JSON.parse(f.brief).topic}<span className="block text-red">{f.error}</span></span>
                  <StatusChip status={f.status} /><span className="tnum text-ink-3">{fmtDateTime(f.slotAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-10 text-lg font-bold">Notifications sent</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
          {notices.map((n) => (
            <li key={n.id} className="flex gap-4 py-2.5"><span className="flex-1 font-medium">{n.title}</span><span className="text-ink-3">{n.emailStatus === "none" ? "in-app" : `email ${n.emailStatus}`}{n.emailError ? `: ${n.emailError.slice(0, 60)}` : ""}</span><span className="tnum text-ink-3">{fmtDateTime(n.createdAt)}</span></li>
          ))}
          {!notices.length && <li className="py-4 text-ink-2">None yet.</li>}
        </ul>
      </main>
    </div>
  );
}
