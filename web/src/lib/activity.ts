import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { monthLabel } from "./format";
import { generationPaused } from "./jobs";

export type ActivityJob = {
  id: string;
  kind: "brand_profile" | "plan_month" | "generate_item" | "publish";
  title: string;
  detail: string | null;
  customer: string | null;
  itemId: string | null;
  itemType: string | null;
  status: string;
  step: string | null;
  attempts: number;
  at: number; // started, finished or scheduled time (ms)
  durationMs: number | null;
  error: string | null;
};

export type Activity = {
  now: number;
  worker: { online: boolean; active: number; concurrency: number; lastBeat: number | null; host: string | null };
  running: ActivityJob[];
  queued: ActivityJob[];
  queuedTotal: number;
  held: number;
  recent: ActivityJob[];
  upcoming: { itemId: string; title: string; type: string; at: number; customer: string | null }[];
  today: { done: number; failed: number; published: number };
  paused: boolean;
};

const HELD_AFTER = 60 * 60 * 1000;

/** Snapshot of background work. Pass a customerId to scope it to one business (customer view). */
export function getActivity(customerId?: string): Activity {
  const now = Date.now();
  const scope = customerId ? eq(schema.jobs.customerId, customerId) : undefined;
  const notPublishTick = sql`${schema.jobs.type} != 'publish_due'`;

  const names = new Map(db.select({ id: schema.customers.id, n: schema.customers.businessName }).from(schema.customers).all().map((c) => [c.id, c.n]));
  const itemCache = new Map<string, { title: string; type: string } | null>();
  const item = (id?: string) => {
    if (!id) return null;
    if (!itemCache.has(id)) {
      const it = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
      if (!it) itemCache.set(id, null);
      else {
        const copy = it.copy ? JSON.parse(it.copy) : {};
        const brief = JSON.parse(it.brief);
        itemCache.set(id, { title: copy.on_image_text || copy.cover_text || brief.topic || "Untitled", type: it.type });
      }
    }
    return itemCache.get(id) ?? null;
  };

  const toJob = (j: typeof schema.jobs.$inferSelect): ActivityJob => {
    const p = JSON.parse(j.payload || "{}");
    const it = j.type === "generate_item" ? item(p.itemId) : null;
    const title =
      j.type === "brand_profile" ? "Brand profile"
      : j.type === "plan_month" ? `Planning ${p.month ? monthLabel(p.month) : "the month"}`
      : it ? `${it.type === "reel" ? "Reel" : "Post"}: ${it.title}` : "Post";
    const start = j.startedAt?.getTime() ?? null;
    const end = j.finishedAt?.getTime() ?? null;
    return {
      id: j.id, kind: j.type as ActivityJob["kind"], title, detail: null,
      customer: j.customerId ? names.get(j.customerId) ?? null : null,
      itemId: p.itemId ?? null, itemType: it?.type ?? null,
      status: j.status, step: j.step, attempts: j.attempts,
      at: (j.status === "running" ? start : j.status === "queued" ? j.runAt.getTime() : end ?? j.createdAt.getTime()) ?? now,
      durationMs: start && end ? end - start : start && j.status === "running" ? now - start : null,
      error: j.error,
    };
  };

  const running = db.select().from(schema.jobs).where(and(eq(schema.jobs.status, "running"), notPublishTick, scope)).orderBy(asc(schema.jobs.startedAt)).all().map(toJob);
  const dueWhere = and(eq(schema.jobs.status, "queued"), notPublishTick, lte(schema.jobs.runAt, new Date(now + HELD_AFTER)), scope);
  const queued = db.select().from(schema.jobs).where(dueWhere).orderBy(asc(schema.jobs.runAt)).limit(8).all().map(toJob);
  const queuedTotal = db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(dueWhere).get()?.n ?? 0;
  const held = db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(and(eq(schema.jobs.status, "queued"), gt(schema.jobs.runAt, new Date(now + HELD_AFTER)), scope)).get()?.n ?? 0;
  const finished = db.select().from(schema.jobs).where(and(inArray(schema.jobs.status, ["done", "failed"]), notPublishTick, scope)).orderBy(desc(schema.jobs.finishedAt)).limit(15).all().map(toJob);

  // publishing events
  const pubRows = db
    .select({ pj: schema.publishJobs, customerId: schema.contentItems.customerId })
    .from(schema.publishJobs)
    .innerJoin(schema.contentItems, eq(schema.publishJobs.itemId, schema.contentItems.id))
    .where(and(inArray(schema.publishJobs.status, ["published", "failed", "meta_scheduled", "schedule_failed"]), customerId ? eq(schema.contentItems.customerId, customerId) : undefined))
    .orderBy(desc(schema.publishJobs.createdAt)).limit(10).all();
  const published: ActivityJob[] = pubRows.map(({ pj, customerId: cid }) => {
    const it = item(pj.itemId);
    const where = pj.platform === "facebook" ? "Facebook" : "Instagram";
    const verb = pj.status === "meta_scheduled" ? "Scheduled on Facebook (Meta Business Suite)"
      : pj.status === "schedule_failed" ? "Couldn’t add to Facebook’s schedule (we’ll still post it on time)"
      : pj.status === "failed" ? `Couldn’t post to ${where}` : `Posted to ${where}`;
    return {
      id: pj.id, kind: "publish", title: `${verb}: ${it?.title ?? ""}`, detail: pj.remoteId,
      customer: names.get(cid) ?? null, itemId: pj.itemId, itemType: it?.type ?? null, status: pj.status === "published" || pj.status === "meta_scheduled" ? "done" : "failed",
      step: null, attempts: 1, at: pj.createdAt.getTime(), durationMs: null, error: pj.error,
    };
  });
  const recent = [...finished, ...published].sort((a, b) => b.at - a.at).slice(0, 15);

  const upcoming = db.select().from(schema.contentItems)
    .where(and(inArray(schema.contentItems.status, ["scheduled", "approved"]), customerId ? eq(schema.contentItems.customerId, customerId) : undefined))
    .orderBy(asc(schema.contentItems.slotAt)).limit(5).all()
    .map((i) => ({ itemId: i.id, title: item(i.id)?.title ?? "", type: i.type, at: i.slotAt.getTime(), customer: names.get(i.customerId) ?? null }));

  const dayStart = new Date(new Date(now + 5.5 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+05:30");
  const todayRows = db.select({ s: schema.jobs.status, n: sql<number>`count(*)` }).from(schema.jobs)
    .where(and(notPublishTick, gt(schema.jobs.finishedAt, dayStart), scope)).groupBy(schema.jobs.status).all();
  const publishedToday = db.select({ n: sql<number>`count(*)` }).from(schema.publishJobs)
    .innerJoin(schema.contentItems, eq(schema.publishJobs.itemId, schema.contentItems.id))
    .where(and(eq(schema.publishJobs.status, "published"), gt(schema.publishJobs.createdAt, dayStart), customerId ? eq(schema.contentItems.customerId, customerId) : undefined)).get()?.n ?? 0;

  const workers = db.select().from(schema.workers).all().filter((w) => now - w.beatAt.getTime() < 20_000);
  const last = db.select().from(schema.workers).orderBy(desc(schema.workers.beatAt)).get();

  return {
    now,
    worker: {
      online: workers.length > 0,
      active: workers.reduce((a, w) => a + w.active, 0),
      concurrency: workers.reduce((a, w) => a + w.concurrency, 0),
      lastBeat: last?.beatAt.getTime() ?? null,
      host: workers[0]?.host ?? last?.host ?? null,
    },
    running, queued, queuedTotal, held, recent, upcoming,
    paused: generationPaused() || (!!customerId && db.select({ s: schema.customers.status }).from(schema.customers).where(eq(schema.customers.id, customerId)).get()?.s === "paused"),
    today: {
      done: todayRows.find((r) => r.s === "done")?.n ?? 0,
      failed: todayRows.find((r) => r.s === "failed")?.n ?? 0,
      published: publishedToday,
    },
  };
}
