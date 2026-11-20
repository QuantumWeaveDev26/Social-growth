"use server";
/**
 * Ready-made content: posts and reels made outside the generator (client work, agency edits) that we
 * only need to schedule. They become ordinary content items (planId "ready"), so the existing worker
 * publishes them to Facebook + Instagram at their time, and image posts also go on Meta's own scheduler.
 *
 * Lifecycle: ready_draft (uploaded, captions/time being set; the worker ignores it)
 *            → approved (scheduled; the worker posts it at slotAt) → published | failed
 */
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { saveFile } from "@/lib/storage";
import { systemUserPages, deleteFacebookPost } from "@/lib/meta";
import { seal } from "@/lib/crypto";
import { READY_PLAN, istDate } from "@/lib/ready";

const back = (id: string) => revalidatePath(`/admin/customers/${id}`);
const VIDEO = new Set([".mp4", ".mov", ".m4v"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Spreads n items over the posting times, one slot each, starting at the first free slot after `from`. */
function slots(n: number, startDay: string, times: string[], everyDays: number) {
  const out: Date[] = [];
  const earliest = Date.now() + 30 * 60_000;
  let day = new Date(`${startDay}T00:00:00+05:30`);
  if (isNaN(day.getTime())) day = new Date();
  for (let guard = 0; out.length < n && guard < 400; guard++) {
    const ymd = new Date(day.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
    for (const t of times) {
      const d = istDate(ymd, t);
      if (d && d.getTime() >= earliest && out.length < n) out.push(d);
    }
    day = new Date(day.getTime() + Math.max(1, everyDays) * 86400e3);
  }
  return out;
}

/** Uploads ready-made files and lays them out on the calendar as drafts. */
export async function adminReadyUpload(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  const files = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return;
  const times = String(fd.get("times") || "10:00,18:30").split(/[,\s]+/).map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0")).sort();
  const when = slots(files.length, String(fd.get("startDay") || ""), times.length ? times : ["10:00", "18:30"], Number(fd.get("everyDays") || 1));
  const caption = String(fd.get("caption") || "").trim();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = path.extname(f.name).toLowerCase();
    const isVideo = VIDEO.has(ext);
    if (!isVideo && !IMAGE.has(ext)) continue;
    const itemId = crypto.randomUUID();
    const dir = `${customerId}/${READY_PLAN}/${itemId}`;
    let buf: Buffer = Buffer.from(await f.arrayBuffer());
    let rel: string;
    if (isVideo) rel = saveFile(`${dir}/reel.mp4`, buf);
    else {
      // Instagram's publishing API only takes JPEG images
      buf = await sharp(buf).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      rel = saveFile(`${dir}/post.jpg`, buf);
    }
    db.insert(schema.contentItems).values({
      id: itemId, customerId, planId: READY_PLAN, type: isVideo ? "reel" : "post",
      slotAt: when[i] ?? new Date(Date.now() + (i + 1) * 86400e3), pillar: "Ready-made",
      brief: JSON.stringify({ source: "upload", file: f.name }),
      copy: JSON.stringify({ instagram_caption: caption, facebook_post: caption }),
      mediaPath: rel, status: "ready_draft",
    }).run();
  }
  back(customerId);
}


/** Takes an item off Meta's own scheduler (Facebook image posts), so an edit or unschedule can't leave a stale post there. */
async function pullFromMeta(itemId: string, customerId: string) {
  const jobs = db.select().from(schema.publishJobs).where(and(eq(schema.publishJobs.itemId, itemId), eq(schema.publishJobs.status, "meta_scheduled"))).all();
  if (!jobs.length) return;
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customerId)).get();
  for (const j of jobs) {
    try { if (conn && j.remoteId) await deleteFacebookPost(conn, j.remoteId); } catch (e) { console.error("pull from Meta schedule:", e instanceof Error ? e.message : e); continue; }
    db.update(schema.publishJobs).set({ status: "cancelled" }).where(eq(schema.publishJobs.id, j.id)).run();
  }
}

async function loadItem(fd: FormData) {
  await requireAdmin();
  const itemId = String(fd.get("itemId"));
  const item = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.id, itemId), eq(schema.contentItems.planId, READY_PLAN))).get();
  if (!item) throw new Error("Item not found");
  return item;
}

/** Saves captions + time. With schedule=1 it also schedules it (needs a time at least 5 minutes ahead and a caption). */
export async function adminReadySave(fd: FormData) {
  const item = await loadItem(fd);
  const ig = String(fd.get("ig") || "").trim().slice(0, 2200);
  const fb = String(fd.get("fb") || "").trim() || ig;
  const at = istDate(String(fd.get("day") || ""), String(fd.get("time") || "")) ?? item.slotAt;
  const schedule = String(fd.get("schedule") || "") === "1";
  const copy = { ...JSON.parse(item.copy || "{}"), instagram_caption: ig, facebook_post: fb };
  let status = item.status, error: string | null = item.error;
  if (schedule) {
    if (!ig) error = "Add a caption before scheduling";
    else if (at.getTime() < Date.now() + 5 * 60_000) error = "Pick a time at least 5 minutes from now";
    else { status = "approved"; error = null; }
  } else if (item.status === "ready_draft") error = null;
  const changed = JSON.stringify(copy) !== (item.copy || "{}") || at.getTime() !== item.slotAt.getTime();
  if (changed && item.status !== "ready_draft") await pullFromMeta(item.id, item.customerId); // the worker re-schedules it with the new caption/time
  db.update(schema.contentItems).set({ copy: JSON.stringify(copy), slotAt: at, status, error, updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  back(item.customerId);
}

/** Takes a scheduled item back to draft (the worker also removes it from Meta's scheduler). */
export async function adminReadyUnschedule(fd: FormData) {
  const item = await loadItem(fd);
  if (item.status === "approved" || item.status === "scheduled" || item.status === "failed") {
    await pullFromMeta(item.id, item.customerId);
    db.update(schema.contentItems).set({ status: "ready_draft", error: null, updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  }
  back(item.customerId);
}

export async function adminReadyDelete(fd: FormData) {
  const item = await loadItem(fd);
  if (item.status === "published") return back(item.customerId);
  await pullFromMeta(item.id, item.customerId);
  db.delete(schema.publishJobs).where(eq(schema.publishJobs.itemId, item.id)).run();
  if (item.status !== "published") db.delete(schema.contentItems).where(eq(schema.contentItems.id, item.id)).run();
  back(item.customerId);
}

/** Schedules every draft that has a caption and a future time. */
export async function adminReadyScheduleAll(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  const drafts = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.customerId, customerId), eq(schema.contentItems.planId, READY_PLAN), eq(schema.contentItems.status, "ready_draft"))).all();
  for (const d of drafts) {
    const ig = String(JSON.parse(d.copy || "{}").instagram_caption || "").trim();
    const ok = ig && d.slotAt.getTime() >= Date.now() + 5 * 60_000;
    db.update(schema.contentItems).set(ok ? { status: "approved", error: null } : { error: ig ? "Time has passed: pick a new time" : "Add a caption before scheduling" }).where(eq(schema.contentItems.id, d.id)).run();
  }
  back(customerId);
}

// ---------------------------------------------------------------- Business Manager connection
/** Connects one of the system user's Pages (and its linked Instagram) to this client. */
export async function adminConnectBusinessPage(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  const pageId = String(fd.get("pageId"));
  const page = (await systemUserPages()).find((p) => p.id === pageId);
  if (!page) throw new Error("That Page isn’t assigned to the system user any more");
  const values = {
    mode: "live", kind: "facebook", metaUserId: "business_manager", pageId: page.id, pageName: page.name,
    igUserId: page.igId, igUsername: page.igUsername, pageToken: seal(page.token), tokenExpiresAt: null,
    status: "connected", lastError: null, lastCheckedAt: new Date(), connectedAt: new Date(),
  };
  const existing = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customerId)).get();
  if (existing) db.update(schema.metaConnections).set(values).where(eq(schema.metaConnections.id, existing.id)).run();
  else db.insert(schema.metaConnections).values({ customerId, ...values }).run();
  back(customerId);
}

export async function adminDisconnectMeta(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  db.delete(schema.metaConnections).where(eq(schema.metaConnections.customerId, customerId)).run();
  back(customerId);
}
