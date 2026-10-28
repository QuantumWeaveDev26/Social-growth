import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { RotateCcw } from "lucide-react";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { Wordmark } from "@/components/ui";
import { ActivityPanel } from "@/components/ActivityPanel";
import { getActivity } from "@/lib/activity";
import { fmtDateTime, inr } from "@/lib/format";
import { signOut } from "../(auth)/actions";
import { retryJob, setCustomerStatus } from "./actions";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function Admin() {
  const admin = await requireAdmin();
  const customers = db.select().from(schema.customers).orderBy(desc(schema.customers.createdAt)).all();
  const subs = new Map(db.select().from(schema.subscriptions).all().map((s) => [s.customerId, s]));
  const plans = new Map(db.select().from(schema.plans).all().map((p) => [p.id, p]));
  const conns = new Map(db.select().from(schema.metaConnections).all().map((c) => [c.customerId, c]));
  const stats = new Map(
    db.select({
      customerId: schema.contentItems.customerId,
      total: sql<number>`count(*)`,
      review: sql<number>`sum(case when ${schema.contentItems.status} = 'awaiting_approval' then 1 else 0 end)`,
      approved: sql<number>`sum(case when ${schema.contentItems.status} in ('approved','scheduled','published') then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${schema.contentItems.status} = 'failed' then 1 else 0 end)`,
      cost: sql<number>`sum(${schema.contentItems.costUsd})`,
    }).from(schema.contentItems).groupBy(schema.contentItems.customerId).all().map((r) => [r.customerId, r]),
  );
  const jobs = db.select().from(schema.jobs).where(sql`${schema.jobs.status} = 'failed'`).orderBy(desc(schema.jobs.finishedAt)).limit(40).all();
  const running = db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(sql`${schema.jobs.status} = 'running' or (${schema.jobs.status} = 'queued' and ${schema.jobs.runAt} <= ${Date.now()})`).get()?.n ?? 0;
  const names = new Map(customers.map((c) => [c.id, c.businessName]));
  const owned = new Set(db.select({ c: schema.users.customerId }).from(schema.users).all().map((u) => u.c));
  const mrr = [...subs.values()].filter((s) => s.status === "active").reduce((a, s) => a + (plans.get(s.planId)?.priceInr ?? 0), 0);
  const totalCost = [...stats.values()].reduce((a, s) => a + (s.cost || 0), 0);
  const items = db.select({ n: sql<number>`count(*)` }).from(schema.contentItems).where(sql`${schema.contentItems.thumbPath} is not null`).get()?.n ?? 0;

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between bg-rail px-10 py-4 text-rail-text">
        <div className="flex items-center gap-4"><Wordmark dark href="/admin" /><span className="text-sm">Operations</span></div>
        <form action={signOut} className="text-sm">{admin.email} · <button className="underline hover:text-white">Sign out</button></form>
      </header>
      <main className="px-10 pb-20 pt-8">
        <p className="tnum flex gap-10 border-b border-line pb-6 text-[0.95rem] text-ink-2">
          <span><span className="font-display text-2xl text-ink" style={{ fontWeight: 800 }}>{customers.length}</span> customers</span>
          <span><span className="font-display text-2xl text-ink" style={{ fontWeight: 800 }}>{inr(mrr)}</span> monthly revenue</span>
          <span><span className="font-display text-2xl text-ink" style={{ fontWeight: 800 }}>{items}</span> items made</span>
          <span><span className="font-display text-2xl text-ink" style={{ fontWeight: 800 }}>{usd(totalCost)}</span> AI spend</span>
          <span><span className="font-display text-2xl text-ink" style={{ fontWeight: 800 }}>{running}</span> jobs in flight</span>
        </p>

        <h2 className="mt-10 text-lg font-bold">Live activity</h2>
        <div className="mt-3"><ActivityPanel initial={getActivity()} admin /></div>

        <h2 className="mt-12 text-lg font-bold">Customers</h2>
        <div className="mt-3 overflow-hidden rounded-[12px] bg-sheet ring-1 ring-line">
          <table className="tnum w-full text-left text-[0.88rem]">
            <thead className="border-b border-line text-ink-2"><tr>{["Business", "Plan", "Status", "Instagram", "Items", "To review", "Approved", "Failed", "AI cost", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {customers.map((c) => {
                const s = stats.get(c.id); const sub = subs.get(c.id); const conn = conns.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-white">
                    <td className="px-4 py-3 font-semibold"><Link href={`/admin/customers/${c.id}`} className="hover:text-mint-deep hover:underline">{c.businessName}</Link>{!owned.has(c.id) && <span className="chip ml-2 bg-amber-wash text-amber-deep">No login</span>}<span className="block text-xs font-normal text-ink-3">{fmtDateTime(c.createdAt)}</span></td>
                    <td className="px-4 py-3">{sub ? `${plans.get(sub.planId)?.name} (${sub.provider})` : "—"}</td>
                    <td className="px-4 py-3 capitalize">{c.status}{c.status === "onboarding" ? ` · step ${c.onboardStep}` : ""}</td>
                    <td className="px-4 py-3">{conn ? `@${conn.igUsername}${conn.mode === "demo" ? " (demo)" : ""}` : "—"}</td>
                    <td className="px-4 py-3">{s?.total ?? 0}</td>
                    <td className="px-4 py-3">{s?.review ?? 0}</td>
                    <td className="px-4 py-3">{s?.approved ?? 0}</td>
                    <td className={`px-4 py-3 ${s?.failed ? "font-semibold text-red" : ""}`}>{s?.failed ?? 0}</td>
                    <td className="px-4 py-3">{usd(s?.cost ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      {c.status !== "onboarding" && (
                        <form action={setCustomerStatus}>
                          <input type="hidden" name="customerId" value={c.id} />
                          <input type="hidden" name="status" value={c.status === "paused" ? "active" : "paused"} />
                          <button className="text-sm font-medium text-ink-2 underline hover:text-ink">{c.status === "paused" ? "Resume" : "Pause"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!customers.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-2">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-lg font-bold">Failed jobs</h2>
        <div className="mt-3 overflow-hidden rounded-[12px] bg-sheet ring-1 ring-line">
          <table className="tnum w-full text-left text-[0.88rem]">
            <thead className="border-b border-line text-ink-2"><tr>{["Job", "Customer", "Status", "Tries", "Created", "Error", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {!jobs.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-2">No failed jobs.</td></tr>}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2.5 font-mono text-xs">{j.type}</td>
                  <td className="px-4 py-2.5">{j.customerId ? names.get(j.customerId) : "—"}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${j.status === "done" ? "bg-mint-wash text-mint-deep" : j.status === "failed" ? "bg-red-wash text-red" : "bg-[#eef1ef] text-ink-2"}`}>{j.status}</span></td>
                  <td className="px-4 py-2.5">{j.attempts}</td>
                  <td className="px-4 py-2.5 text-ink-2">{fmtDateTime(j.createdAt)}</td>
                  <td className="max-w-[360px] truncate px-4 py-2.5 text-ink-2" title={j.error ?? ""}>{j.error}</td>
                  <td className="px-4 py-2.5 text-right">
                    {j.status === "failed" && (
                      <form action={retryJob}><input type="hidden" name="jobId" value={j.id} /><button className="inline-flex items-center gap-1 text-sm font-medium text-mint-deep hover:underline"><RotateCcw className="size-3.5" aria-hidden />Retry</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
