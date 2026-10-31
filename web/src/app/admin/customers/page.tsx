import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtDay, inr } from "@/lib/format";
import { clientRows, type ClientRow } from "@/lib/adminData";
import { AdminShell } from "../AdminShell";
import { IssueChips, MonthBar, MONTH_LEGEND } from "../ui";
import { setCustomerStatus } from "../actions";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

const PAGE = 25;
const SHOWS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "active", label: "Active" },
  { id: "onboarding", label: "In setup" },
  { id: "paused", label: "Paused" },
] as const;
const SORTS = [
  { id: "attention", label: "Most urgent" },
  { id: "name", label: "Name" },
  { id: "renewal", label: "Renewal date" },
  { id: "next", label: "Next post" },
  { id: "newest", label: "Newest" },
  { id: "spend", label: "AI spend" },
] as const;

const usd = (n: number) => `$${n.toFixed(2)}`;
const urgency = (r: ClientRow) => r.issues.reduce((a, i) => a + (i.level === "red" ? 10 : 1), 0);

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; sort?: string; page?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const show = SHOWS.some((s) => s.id === sp.show) ? sp.show! : "all";
  const sort = SORTS.some((s) => s.id === sp.sort) ? sp.sort! : "attention";
  const all = clientRows();

  const counts: Record<string, number> = {
    all: all.length,
    attention: all.filter((r) => r.issues.length).length,
    active: all.filter((r) => r.status === "active").length,
    onboarding: all.filter((r) => r.status === "onboarding").length,
    paused: all.filter((r) => r.status === "paused").length,
  };
  let rows = all.filter((r) => show === "all" ? true : show === "attention" ? r.issues.length > 0 : r.status === show);
  if (q) rows = rows.filter((r) => [r.name, r.owner, r.conn.ig, r.conn.page].some((v) => v?.toLowerCase().includes(q)));
  const far = Number.MAX_SAFE_INTEGER;
  rows.sort((a, b) => {
    switch (sort) {
      case "name": return a.name.localeCompare(b.name);
      case "renewal": return (a.sub?.periodEnd?.getTime() ?? far) - (b.sub?.periodEnd?.getTime() ?? far);
      case "next": return (a.nextPostAt?.getTime() ?? far) - (b.nextPostAt?.getTime() ?? far);
      case "newest": return b.createdAt.getTime() - a.createdAt.getTime();
      case "spend": return b.spendMonth - a.spendMonth;
      default: return urgency(b) - urgency(a) || a.name.localeCompare(b.name);
    }
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const visible = rows.slice((page - 1) * PAGE, page * PAGE);
  const href = (o: Partial<Record<"q" | "show" | "sort" | "page", string>>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), show, sort, ...o });
    if (p.get("show") === "all") p.delete("show");
    if (p.get("sort") === "attention") p.delete("sort");
    if (p.get("page") === "1") p.delete("page");
    const s = p.toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };

  return (
    <AdminShell active="clients" email={admin.email} badges={{ clients: all.filter((r) => r.issues.some((i) => i.level === "red")).length }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter">
          {SHOWS.map((s) => (
            <Link key={s.id} href={href({ show: s.id, page: "1" })} aria-current={show === s.id ? "true" : undefined}
              className={`tnum rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${show === s.id ? "bg-ink text-white" : "bg-sheet text-ink-2 ring-1 ring-line hover:text-ink"}`}>
              {s.label} <span className={show === s.id ? "text-rail-text" : s.id === "attention" && counts.attention ? "text-red" : "text-ink-3"}>{counts[s.id]}</span>
            </Link>
          ))}
        </nav>
        <form action="/admin/customers" className="flex items-center gap-2">
          {show !== "all" && <input type="hidden" name="show" value={show} />}
          <label className="relative block w-80">
            <span className="sr-only">Search clients</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input name="q" defaultValue={sp.q} placeholder="Business, email or @handle" className="field w-full py-2" style={{ paddingLeft: "2.25rem" }} />
          </label>
          <select name="sort" defaultValue={sort} className="field py-2" style={{ width: "12rem" }} aria-label="Sort by">
            {SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
          </select>
          <button className="btn btn-ghost py-2">Apply</button>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[12px] bg-sheet ring-1 ring-line">
        <table className="tnum w-full min-w-[1100px] text-left text-[0.88rem]">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Client", "Plan & renewal", "Meta", "Content (latest month)", "Next post", "Status", "AI spend", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!visible.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-2">{q ? `No clients match “${sp.q}”.` : "No clients here."}</td></tr>}
            {visible.map((r) => (
              <tr key={r.id} className="align-top hover:bg-white">
                <td className="max-w-[220px] px-4 py-3">
                  <Link href={`/admin/customers/${r.id}`} className="block truncate font-semibold hover:text-mint-deep hover:underline">{r.name}</Link>
                  <span className="block truncate text-xs text-ink-3">{r.owner ?? "No login"} · since {fmtDay(r.createdAt)}</span>
                </td>
                <td className="px-4 py-3">
                  {r.plan ? <span className="block font-medium">{r.plan.name} <span className="font-normal text-ink-3">{inr(r.plan.price)}</span></span> : <span className="text-ink-3">No plan</span>}
                  {r.sub && <span className={`block text-xs ${r.sub.daysLeft <= 0 ? "font-semibold text-red" : r.sub.daysLeft <= 5 ? "text-amber-deep" : "text-ink-3"}`}>
                    {r.sub.daysLeft <= 0 ? "Expired" : `Renews in ${r.sub.daysLeft}d`}{r.sub.provider === "demo" ? " · demo" : ""}
                  </span>}
                </td>
                <td className="px-4 py-3">
                  {r.conn.state === "none" ? <span className="text-ink-3">Not connected</span> : (
                    <>
                      <span className={`flex items-center gap-1.5 ${r.conn.state === "needs_reconnect" ? "font-semibold text-red" : ""}`}>
                        <span className={`size-2 rounded-full ${r.conn.state === "connected" ? "bg-mint" : "bg-red"}`} aria-hidden />
                        {r.conn.ig ? `@${r.conn.ig}` : r.conn.page}
                      </span>
                      <span className="block truncate text-xs text-ink-3">{r.conn.state === "needs_reconnect" ? "Needs reconnect" : r.conn.page ?? "Instagram only"}{r.conn.demo ? " · demo" : ""}</span>
                    </>
                  )}
                </td>
                <td className="w-[200px] px-4 py-3"><MonthBar m={r.month} quota={r.plan?.quota ?? null} /></td>
                <td className="whitespace-nowrap px-4 py-3">{r.nextPostAt ? fmtDateTime(r.nextPostAt) : <span className="text-ink-3">—</span>}
                  {r.lastPostedAt && <span className="block text-xs text-ink-3">last {fmtDay(r.lastPostedAt)}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="mb-1 block text-xs capitalize text-ink-3">{r.status === "onboarding" ? `In setup · step ${r.onboardStep}/5` : r.status}</span>
                  <span className="flex"><IssueChips issues={r.issues} /></span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{usd(r.spendMonth)}<span className="block text-xs text-ink-3">{usd(r.spendTotal)} total</span></td>
                <td className="px-4 py-3 text-right">
                  <span className="flex flex-col items-end gap-1 text-sm">
                    <Link href={`/admin/customers/${r.id}`} className="font-medium text-mint-deep hover:underline">Open</Link>
                    {r.status !== "onboarding" && (
                      <form action={setCustomerStatus}>
                        <input type="hidden" name="customerId" value={r.id} />
                        <input type="hidden" name="status" value={r.status === "paused" ? "active" : "paused"} />
                        <button className="font-medium text-ink-2 underline hover:text-ink">{r.status === "paused" ? "Resume" : "Pause"}</button>
                      </form>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-sm text-ink-3">
        <ul className="flex flex-wrap gap-4">
          {MONTH_LEGEND.map(([cls, l]) => <li key={l} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${cls}`} aria-hidden />{l}</li>)}
        </ul>
        {pages > 1 && (
          <nav className="tnum flex items-center gap-2" aria-label="Pages">
            {page > 1 ? <Link href={href({ page: String(page - 1) })} className="btn btn-ghost py-1.5">Previous</Link> : null}
            <span>Page {page} of {pages} · {rows.length} clients</span>
            {page < pages ? <Link href={href({ page: String(page + 1) })} className="btn btn-ghost py-1.5">Next</Link> : null}
          </nav>
        )}
      </div>
    </AdminShell>
  );
}
