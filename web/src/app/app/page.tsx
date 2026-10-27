import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Film, AlertTriangle, CheckCheck, Loader2 } from "lucide-react";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { ApproveMark } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { mediaUrl } from "@/lib/storage";
import { fmtTime, monthLabel } from "@/lib/format";
import { approveAllReady, startNextMonth } from "./actions";

export const metadata = { title: "Proof sheet" };

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "review", label: "Needs your OK" },
  { id: "making", label: "Being made" },
  { id: "approved", label: "Approved" },
] as const;

const groupOf = (s: string) =>
  s === "awaiting_approval" || s === "failed" ? "review" : ["planned", "generating", "changes_requested"].includes(s) ? "making" : "approved";

export default async function ProofSheet({ searchParams }: { searchParams: Promise<{ month?: string; show?: string; approved?: string; welcome?: string }> }) {
  const { customer } = await requireCustomer();
  const sp = await searchParams;
  const plans = db.select().from(schema.contentPlans).where(eq(schema.contentPlans.customerId, customer.id)).orderBy(asc(schema.contentPlans.month)).all();
  const planJob = db.select().from(schema.jobs)
    .where(and(eq(schema.jobs.customerId, customer.id), eq(schema.jobs.type, "plan_month"), inArray(schema.jobs.status, ["queued", "running"])))
    .orderBy(desc(schema.jobs.createdAt)).get();
  const failedPlan = db.select().from(schema.jobs)
    .where(and(eq(schema.jobs.customerId, customer.id), eq(schema.jobs.type, "plan_month"), eq(schema.jobs.status, "failed"))).orderBy(desc(schema.jobs.createdAt)).get();
  const plan = plans.find((p) => p.month === sp.month) ?? plans.at(-1);

  if (!plan) {
    return (
      <main className="px-12 py-12">
        <AutoRefresh active={!!planJob} />
        <h1 className="font-display text-[2.2rem] tracking-[-0.03em]" style={{ fontWeight: 800 }}>{planJob ? "Planning your month" : "Your proof sheet is empty"}</h1>
        {planJob ? (
          <>
            <p className="mt-3 max-w-[60ch] text-ink-2">We’re choosing topics from your brand profile and spacing them across the month. Frames will appear here as each post is made, usually within a few minutes.</p>
            <div className="mt-10 grid grid-cols-6 gap-3">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="developing aspect-square rounded-[8px]" />)}</div>
          </>
        ) : (
          <>
            <p className="mt-3 max-w-[60ch] text-ink-2">{failedPlan ? `The last plan didn’t finish: ${failedPlan.error?.slice(0, 140)}. Try again.` : "Start a month and we’ll fill this sheet with posts and reels for you to approve."}</p>
            <form action={startNextMonth} className="mt-6"><SubmitButton pending="Starting">Plan my month</SubmitButton></form>
          </>
        )}
      </main>
    );
  }

  const items = db.select().from(schema.contentItems).where(eq(schema.contentItems.planId, plan.id)).orderBy(asc(schema.contentItems.slotAt)).all();
  const counts = { review: 0, making: 0, approved: 0 } as Record<string, number>;
  items.forEach((i) => counts[groupOf(i.status)]++);
  const ready = items.filter((i) => i.status === "awaiting_approval").length;
  const show = FILTERS.some((f) => f.id === sp.show) ? sp.show! : "all";
  const visible = show === "all" ? items : items.filter((i) => groupOf(i.status) === show);
  const posts = items.filter((i) => i.type === "post").length;

  // contact-sheet strips: one per week (Mon start, IST)
  const weeks = new Map<string, typeof visible>();
  for (const it of visible) {
    const d = new Date(it.slotAt.getTime() + 5.5 * 3600e3);
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = mon.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) || []), it]);
  }
  const fmtWeek = (k: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(k));

  return (
    <main className="px-12 pb-20 pt-10">
      <AutoRefresh active={counts.making > 0} />
      <header className="flex items-end justify-between gap-8 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>{monthLabel(plan.month)}</h1>
            {plans.length > 1 && (
              <nav className="flex gap-1 text-sm" aria-label="Month">
                {plans.map((p) => (
                  <Link key={p.id} href={`/app?month=${p.month}`} className={`rounded-full px-2.5 py-1 ${p.id === plan.id ? "bg-ink text-white" : "text-ink-2 hover:bg-white"}`}>{monthLabel(p.month).split(" ")[0].slice(0, 3)}</Link>
                ))}
              </nav>
            )}
          </div>
          <p className="tnum mt-3 text-ink-2">
            {posts} posts and {items.length - posts} reels · <span className="font-semibold text-ink">{counts.review} to review</span> · {counts.approved} approved{counts.making ? ` · ${counts.making} being made` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ready > 0 && (
            <form action={approveAllReady}>
              <input type="hidden" name="planId" value={plan.id} />
              <SubmitButton className="btn btn-mint" pending="Approving"><CheckCheck className="size-4" aria-hidden />Approve all {ready} ready</SubmitButton>
            </form>
          )}
          {counts.making === 0 && counts.review === 0 && (
            <form action={startNextMonth}><SubmitButton className="btn btn-ghost" pending="Starting">Plan next month</SubmitButton></form>
          )}
        </div>
      </header>

      {sp.welcome && counts.review === 0 && (
        <p className="mt-6 rounded-[12px] bg-mint-wash px-5 py-4 text-[0.95rem] text-mint-deep">
          Your month is being made. Each frame develops here as it’s ready. You can leave this page; we keep working.
        </p>
      )}

      <nav className="mt-6 flex gap-1.5" aria-label="Filter">
        {FILTERS.map((f) => {
          const n = f.id === "all" ? items.length : counts[f.id];
          return (
            <Link key={f.id} href={`/app?month=${plan.month}&show=${f.id}`} aria-current={show === f.id ? "true" : undefined}
              className={`tnum rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${show === f.id ? "bg-ink text-white" : "bg-sheet text-ink-2 ring-1 ring-line hover:text-ink"}`}>
              {f.label} <span className={show === f.id ? "text-rail-text" : "text-ink-3"}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="mt-16 text-center text-ink-2">Nothing here right now. {show === "review" ? "You’re all caught up." : ""}</p>
      ) : (
        <div className="mt-8 space-y-10">
          {[...weeks.entries()].map(([wk, list]) => (
            <section key={wk} aria-label={`Week of ${fmtWeek(wk)}`}>
              <h2 className="tnum mb-3 text-[0.95rem] font-semibold text-ink-2">Week of {fmtWeek(wk)}</h2>
              <ul className="grid grid-cols-6 gap-x-3 gap-y-5">
                {list.map((it) => {
                  const brief = JSON.parse(it.brief);
                  const copy = it.copy ? JSON.parse(it.copy) : null;
                  const making = ["planned", "generating", "changes_requested"].includes(it.status);
                  const approved = ["approved", "scheduled", "published"].includes(it.status);
                  const draw = sp.approved === it.id || (sp.approved === "all" && it.status === "scheduled");
                  const d = new Date(it.slotAt.getTime() + 5.5 * 3600e3);
                  return (
                    <li key={it.id}>
                      <Link href={`/app/items/${it.id}`} className="group block rounded-[10px] focus-visible:outline-offset-4">
                        <div className={`relative aspect-square overflow-hidden rounded-[8px] bg-[#e7ece9] ring-1 ring-line transition-shadow duration-300 group-hover:shadow-[var(--shadow-lift)] ${it.status === "awaiting_approval" ? "ring-2 ring-ink" : ""}`}>
                          {making || !it.thumbPath ? (
                            <div className="developing flex size-full flex-col justify-end p-3">
                              <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-ink-3">
                                {it.status === "failed" ? <AlertTriangle className="size-3.5 text-red" aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                                {it.status === "changes_requested" ? "Redoing with your note" : it.status === "failed" ? "Needs attention" : it.status === "generating" ? "Developing" : "Queued"}
                              </p>
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(it.thumbPath)!} alt={copy?.alt_text || brief.topic || ""} loading="lazy" className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]" />
                          )}
                          {it.type === "reel" && <span className="chip absolute left-2 top-2 bg-ink/85 text-white"><Film className="size-3" aria-hidden />Reel</span>}
                          {approved && <ApproveMark draw={draw} className="absolute bottom-0.5 right-0.5 w-14 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]" />}
                          {it.status === "awaiting_approval" && <span className="chip absolute bottom-2 left-2 bg-ink text-white">Needs your OK</span>}
                          {it.status === "published" && <span className="chip absolute bottom-2 left-2 bg-mint text-white">Posted</span>}
                          {it.status === "failed" && it.thumbPath && <span className="chip absolute bottom-2 left-2 bg-red-wash text-red">Needs attention</span>}
                        </div>
                        <div className="mt-1.5 px-0.5">
                          <span className="tnum block text-[0.72rem] font-semibold text-ink-3">
                            {new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(d)} · {fmtTime(it.slotAt)}
                          </span>
                          <span className="block truncate text-[0.83rem] font-medium group-hover:text-mint-deep">{copy?.on_image_text || copy?.cover_text || brief.topic}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
