import Link from "next/link";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtTime, inr } from "@/lib/format";
import { generationPaused } from "@/lib/jobs";
import { getActivity } from "@/lib/activity";
import { clientRows } from "@/lib/adminData";
import { toggleGeneration } from "./actions";
import { AdminShell } from "./AdminShell";
import { IssueChips } from "./ui";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function AdminOverview() {
  const admin = await requireAdmin();
  const paused = generationPaused();
  const rows = clientRows();
  const now = Date.now();
  const worker = getActivity().worker;

  const active = rows.filter((r) => r.status === "active").length;
  const onboarding = rows.filter((r) => r.status === "onboarding").length;
  const pausedClients = rows.filter((r) => r.status === "paused").length;
  const mrr = rows.filter((r) => r.sub?.status === "active" && r.sub.daysLeft > 0).reduce((a, r) => a + (r.plan?.price ?? 0), 0);
  const renewals = rows.filter((r) => r.sub && r.sub.daysLeft > 0 && r.sub.daysLeft <= 7).length;
  const posted = rows.reduce((a, r) => a + r.postedThisMonth, 0);
  const ahead = rows.reduce((a, r) => a + r.upcoming, 0);
  const waitingOk = rows.reduce((a, r) => a + r.reviewAll, 0);
  const spend = rows.reduce((a, r) => a + r.spendMonth, 0);
  const attention = rows.filter((r) => r.issues.length).sort((a, b) => score(b) - score(a));
  const failedJobs = db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(eq(schema.jobs.status, "failed")).get()?.n ?? 0;

  const names = new Map(rows.map((r) => [r.id, r.name]));
  const soon = db.select().from(schema.contentItems)
    .where(and(inArray(schema.contentItems.status, ["approved", "scheduled"]), gte(schema.contentItems.slotAt, new Date(now)), lt(schema.contentItems.slotAt, new Date(now + 48 * 3600e3))))
    .orderBy(asc(schema.contentItems.slotAt)).limit(12).all();

  return (
    <AdminShell active="overview" email={admin.email} badges={{ clients: attention.filter((r) => r.issues.some((i) => i.level === "red")).length, jobs: failedJobs }}>
      <div className="grid grid-cols-4 gap-3 xl:grid-cols-7">
        <Kpi label="Active clients" value={active} sub={`${onboarding} in setup · ${pausedClients} paused`} href="/admin/customers?show=active" />
        <Kpi label="Monthly revenue" value={inr(mrr)} sub="active plans, incl. GST" />
        <Kpi label="Renewals in 7 days" value={renewals} href="/admin/customers?sort=renewal" />
        <Kpi label="Posted this month" value={posted} sub={`${ahead} scheduled ahead`} />
        <Kpi label="Waiting for client OK" value={waitingOk} sub="all clients" />
        <Kpi label="Need attention" value={attention.length} tone={attention.length ? "red" : undefined} href="/admin/customers?show=attention" />
        <Kpi label="AI spend" value={usd(spend)} sub="latest month of each client" />
      </div>

      <form action={toggleGeneration} className={`mt-6 flex items-center justify-between gap-6 rounded-[14px] px-5 py-4 ${paused ? "bg-amber-wash" : "bg-sheet ring-1 ring-line"}`}>
        <input type="hidden" name="pause" value={paused ? "0" : "1"} />
        <p className={paused ? "text-amber-deep" : "text-ink-2"}>
          {paused ? <><span className="font-semibold">AI generation is paused.</span> Nothing new is written or designed, so no AI credit is spent. Publishing approved posts and emails continue.</> : <>AI generation is running for all active clients. Pausing holds every queued item until you resume.</>}
        </p>
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/admin/activity" className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
            <span className={`size-2 rounded-full ${worker.online ? "bg-mint" : "bg-red"}`} aria-hidden />Worker {worker.online ? `running · ${worker.active}/${worker.concurrency} busy` : "not running"}
          </Link>
          <button className={`btn ${paused ? "btn-mint" : "btn-ghost"}`}>{paused ? "Resume generation" : "Pause all generation"}</button>
        </div>
      </form>

      <div className="mt-8 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Needs attention <span className="tnum font-normal text-ink-3">· {attention.length}</span></h2>
            <Link href="/admin/customers?show=attention" className="text-sm font-medium text-ink-2 underline hover:text-ink">See all clients</Link>
          </div>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[12px] bg-sheet ring-1 ring-line">
            {!attention.length && <li className="px-4 py-8 text-center text-ink-2">All clients are on track.</li>}
            {attention.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white">
                <Link href={`/admin/customers/${r.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold hover:underline">{r.name}</span>
                  <span className="block truncate text-xs text-ink-3">{r.plan?.name ?? "No plan"} · {r.conn.ig ? `@${r.conn.ig}` : "not connected"}</span>
                </Link>
                <IssueChips issues={r.issues} />
              </li>
            ))}
          </ul>
          {attention.length > 10 && <p className="mt-2 text-sm text-ink-3">+{attention.length - 10} more on the Clients tab.</p>}
        </section>

        <section>
          <h2 className="text-lg font-bold">Going out in the next 48 hours <span className="tnum font-normal text-ink-3">· {soon.length}{soon.length === 12 ? "+" : ""}</span></h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[12px] bg-sheet ring-1 ring-line">
            {!soon.length && <li className="px-4 py-8 text-center text-ink-2">Nothing approved for the next 48 hours.</li>}
            {soon.map((it) => {
              const copy = it.copy ? JSON.parse(it.copy) : {};
              return (
                <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.9rem]">
                  <span className="tnum w-28 shrink-0 font-semibold">{fmtDateTime(it.slotAt).replace(/,.*/, "")} {fmtTime(it.slotAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{copy.on_image_text || copy.cover_text || JSON.parse(it.brief).topic}</span>
                    <Link href={`/admin/customers/${it.customerId}`} className="block truncate text-xs text-ink-3 hover:underline">{names.get(it.customerId)} · {it.type}</Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}

function score(r: { issues: { level: string }[] }) {
  return r.issues.reduce((a, i) => a + (i.level === "red" ? 10 : 1), 0);
}

function Kpi({ label, value, sub, href, tone }: { label: string; value: string | number; sub?: string; href?: string; tone?: "red" }) {
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`tnum mt-1.5 font-display text-[1.7rem] leading-none tracking-[-0.02em] ${tone === "red" ? "text-red" : "text-ink"}`} style={{ fontWeight: 800 }}>{value}</p>
      {sub && <p className="mt-1.5 truncate text-xs text-ink-3">{sub}</p>}
    </>
  );
  const cls = "block rounded-[12px] bg-sheet px-4 py-3.5 ring-1 ring-line";
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-white`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
