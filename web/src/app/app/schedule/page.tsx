import Link from "next/link";
import { and, asc, desc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { CalendarClock, CalendarDays, Check, ExternalLink, Film, List } from "lucide-react";
import { Calendar, type CalEntry } from "./Calendar";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { mediaUrl } from "@/lib/storage";
import { fmtDay, fmtDateTime, fmtTime, istDayKey } from "@/lib/format";
import { platformsFor, FB_SCHEDULE_MAX_MS } from "@/lib/meta";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

type Item = typeof schema.contentItems.$inferSelect;
type Job = typeof schema.publishJobs.$inferSelect;
type Badge = { label: string; tone: "mint" | "plain" | "done"; href?: string };

const titleOf = (it: Item) => {
  const copy = it.copy ? JSON.parse(it.copy) : {};
  return copy.on_image_text || copy.cover_text || JSON.parse(it.brief).topic || "Untitled";
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const { customer } = await requireCustomer();
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "calendar";
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  const platforms = conn ? platformsFor(conn) : (["facebook", "instagram"] as const);
  const now = Date.now();

  const upcoming = db.select().from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customer.id), inArray(schema.contentItems.status, ["approved", "scheduled"])))
    .orderBy(asc(schema.contentItems.slotAt)).all();
  const posted = db.select().from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customer.id), eq(schema.contentItems.status, "published"), gt(schema.contentItems.slotAt, new Date(now - 14 * 86400e3))))
    .orderBy(desc(schema.contentItems.slotAt)).all();
  const waiting = db.select({ id: schema.contentItems.id }).from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customer.id), eq(schema.contentItems.status, "awaiting_approval"))).all().length;

  const ids = [...upcoming, ...posted].map((i) => i.id);
  const jobs = ids.length ? db.select().from(schema.publishJobs).where(inArray(schema.publishJobs.itemId, ids)).all() : [];
  const jobsFor = (id: string) => jobs.filter((j) => j.itemId === id);

  const badge = (it: Item, platform: "facebook" | "instagram", its: Job[]): Badge => {
    const done = its.find((j) => j.platform === platform && j.status === "published");
    if (done) {
      const href = platform === "facebook" ? `https://www.facebook.com/${done.remoteId}` : conn?.igUsername ? `https://www.instagram.com/${conn.igUsername}/` : undefined;
      return { label: "Posted", tone: "done", href };
    }
    if (platform === "instagram") return { label: `BrandMint posts at ${fmtTime(it.slotAt)}`, tone: "plain" };
    const onMeta = its.find((j) => j.platform === "facebook" && j.status === "meta_scheduled" && j.scheduledAt.getTime() === it.slotAt.getTime());
    if (onMeta) return { label: "In Meta Business Suite", tone: "mint", href: metaScheduledUrl(conn?.pageId) };
    if (it.type === "reel") return { label: `BrandMint posts at ${fmtTime(it.slotAt)}`, tone: "plain" };
    if (it.slotAt.getTime() > now + FB_SCHEDULE_MAX_MS) return { label: "Goes to Meta’s scheduler nearer the date", tone: "plain" };
    return { label: `BrandMint posts at ${fmtTime(it.slotAt)}`, tone: "plain" };
  };

  // calendar month (IST)
  const today = istDayKey(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : today.slice(0, 7);
  const [cy, cm] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(cy, cm - 1, 1) - 5.5 * 3600e3);
  const monthEnd = new Date(Date.UTC(cy, cm, 1) - 5.5 * 3600e3);
  const monthItems = view === "calendar"
    ? db.select().from(schema.contentItems)
      .where(and(eq(schema.contentItems.customerId, customer.id), gte(schema.contentItems.slotAt, monthStart), lt(schema.contentItems.slotAt, monthEnd),
        inArray(schema.contentItems.status, ["awaiting_approval", "approved", "scheduled", "published", "failed"])))
      .orderBy(asc(schema.contentItems.slotAt)).all()
    : [];
  const monthJobs = monthItems.length ? db.select().from(schema.publishJobs).where(inArray(schema.publishJobs.itemId, monthItems.map((i) => i.id))).all() : [];
  const entries: CalEntry[] = monthItems.map((it) => {
    const its = monthJobs.filter((j) => j.itemId === it.id);
    const state: CalEntry["state"] = it.status === "published" ? "posted" : it.status === "failed" ? "failed" : it.status === "awaiting_approval" ? "review" : "scheduled";
    const posted = (p: string) => its.some((j) => j.platform === p && j.status === "published");
    const onMeta = its.some((j) => j.platform === "facebook" && j.status === "meta_scheduled" && j.scheduledAt.getTime() === it.slotAt.getTime());
    const live = state === "scheduled" || state === "posted";
    return {
      id: it.id, day: istDayKey(it.slotAt), time: fmtTime(it.slotAt), title: titleOf(it),
      thumb: mediaUrl(it.thumbPath || (it.mediaPath?.endsWith(".mp4") ? null : it.mediaPath)), reel: it.type === "reel", state,
      fb: !live || !(platforms as readonly string[]).includes("facebook") ? null : posted("facebook") ? "posted" : onMeta ? "meta" : "brandmint",
      ig: !live || !(platforms as readonly string[]).includes("instagram") ? null : posted("instagram") ? "posted" : "brandmint",
    };
  });

  // group upcoming by IST day
  const days = new Map<string, Item[]>();
  for (const it of upcoming) days.set(istDayKey(it.slotAt), [...(days.get(istDayKey(it.slotAt)) || []), it]);

  return (
    <main className="px-12 pb-20 pt-10">
      <header className="flex items-end justify-between gap-8 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Schedule</h1>
          <p className="mt-3 max-w-[70ch] text-ink-2">
            Everything you’ve approved, by day. Facebook image posts also appear in your Meta Business Suite under <span className="font-semibold text-ink">Scheduled</span>. Instagram doesn’t let outside apps add to its schedule, so BrandMint posts those at the time shown.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <nav className="flex rounded-[10px] bg-sheet p-1 ring-1 ring-line" aria-label="View">
          <Link href={`/app/schedule${sp.month ? `?month=${sp.month}` : ""}`} aria-current={view === "calendar" ? "page" : undefined} className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium ${view === "calendar" ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}><CalendarDays className="size-4" aria-hidden />Calendar</Link>
          <Link href="/app/schedule?view=list" aria-current={view === "list" ? "page" : undefined} className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}><List className="size-4" aria-hidden />List</Link>
        </nav>
        {conn?.pageId && conn.kind !== "instagram" && (
          <a href={metaScheduledUrl(conn.pageId)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost shrink-0">Open Meta Business Suite<ExternalLink className="size-4" aria-hidden /></a>
        )}
        </div>
      </header>

      {!conn && (
        <p className="mt-6 rounded-[12px] bg-amber-wash px-5 py-4 text-[0.95rem] text-amber-deep">
          Facebook and Instagram aren’t connected yet, so nothing can post. <Link href="/app/settings" className="font-semibold underline">Connect them</Link>.
        </p>
      )}
      {waiting > 0 && (
        <p className="mt-6 rounded-[12px] bg-sheet px-5 py-4 text-[0.95rem] text-ink-2 ring-1 ring-line">
          <span className="font-semibold text-ink">{waiting} {waiting === 1 ? "post is" : "posts are"} waiting for your OK</span> and won’t be scheduled until you approve {waiting === 1 ? "it" : "them"}. <Link href="/app?show=review" className="font-semibold text-ink underline">Review now</Link>
        </p>
      )}

      {view === "calendar" ? <Calendar month={month} today={today} entries={entries} /> : (<>
      <section className="mt-8">
        <h2 className="text-[1.05rem] font-bold">Coming up <span className="tnum font-normal text-ink-3">· {upcoming.length}</span></h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-ink-2"><CalendarClock className="size-4" aria-hidden />Nothing scheduled yet. Approve posts on your proof sheet and they’ll appear here.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {[...days.entries()].map(([key, list]) => (
              <div key={key}>
                <p className="tnum text-sm font-semibold uppercase tracking-wide text-ink-3">{fmtDay(list[0].slotAt)}</p>
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[14px] bg-sheet ring-1 ring-line">
                  {list.map((it) => <Row key={it.id} it={it} badges={platforms.map((p) => [p, badge(it, p, jobsFor(it.id))] as const)} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {posted.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[1.05rem] font-bold">Posted in the last 14 days <span className="tnum font-normal text-ink-3">· {posted.length}</span></h2>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[14px] bg-sheet ring-1 ring-line">
            {posted.map((it) => <Row key={it.id} it={it} showDay badges={platforms.map((p) => [p, badge(it, p, jobsFor(it.id))] as const)} />)}
          </ul>
        </section>
      )}
      </>)}
    </main>
  );
}

function metaScheduledUrl(pageId?: string | null) {
  return `https://business.facebook.com/latest/posts/scheduled_posts${pageId ? `?asset_id=${pageId}` : ""}`;
}

function Row({ it, badges, showDay }: { it: Item; badges: ReadonlyArray<readonly ["facebook" | "instagram", Badge]>; showDay?: boolean }) {
  const thumb = mediaUrl(it.thumbPath || (it.mediaPath?.endsWith(".mp4") ? null : it.mediaPath));
  return (
    <li className="flex items-center gap-5 px-5 py-3.5">
      <span className="tnum w-24 shrink-0 text-sm font-semibold">{showDay ? fmtDateTime(it.slotAt) : fmtTime(it.slotAt)}</span>
      <Link href={`/app/items/${it.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-11 shrink-0 rounded-[6px] object-cover ring-1 ring-line" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-[6px] bg-[#eef1ef] text-ink-3"><Film className="size-4" aria-hidden /></span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium">{titleOf(it)}</span>
          <span className="block text-xs text-ink-3">{it.type === "reel" ? "Reel" : "Post"} · {it.pillar}</span>
        </span>
      </Link>
      <span className="flex shrink-0 flex-wrap justify-end gap-2">
        {badges.map(([p, b]) => {
          const cls = b.tone === "done" ? "bg-mint text-white" : b.tone === "mint" ? "bg-mint-wash text-mint-deep" : "bg-[#eef1ef] text-ink-2";
          const inner = <>{b.tone !== "plain" && <Check className="size-3" aria-hidden />}<span className="font-semibold">{p === "facebook" ? "Facebook" : "Instagram"}</span> · {b.label}{b.href && <ExternalLink className="size-3" aria-hidden />}</>;
          return b.href
            ? <a key={p} href={b.href} target="_blank" rel="noopener noreferrer" className={`chip ${cls} hover:opacity-80`}>{inner}</a>
            : <span key={p} className={`chip ${cls}`}>{inner}</span>;
        })}
      </span>
    </li>
  );
}
