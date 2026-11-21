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
import { systemUserPages } from "@/lib/meta";
import { pullFromMeta, undoRemake, replaceMedia, type RemakeMode } from "@/lib/readyRemake";
import { enqueue } from "@/lib/jobs";
import { notify } from "@/lib/notify";
import { seal } from "@/lib/crypto";
import { READY_PLAN, istDate, slots, parseTimes } from "@/lib/ready";

const back = (id: string) => revalidatePath(`/admin/customers/${id}`);
const VIDEO = new Set([".mp4", ".mov", ".m4v"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Uploads ready-made files and lays them out on the calendar as drafts. */
export async function adminReadyUpload(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  const files = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return;
  const when = slots(files.length, String(fd.get("startDay") || ""), parseTimes(String(fd.get("times") || "")), Number(fd.get("everyDays") || 1));
  const caption = String(fd.get("caption") || "").trim();
  const created: string[] = [];
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
      mediaPath: rel, status: "ready_draft", error: caption ? null : "Waiting for captions…",
    }).run();
    created.push(itemId);
  }
  if (!caption && created.length) { const { writeReadyCopyAll } = await import("@/lib/readyCopy"); void writeReadyCopyAll(created); }
  back(customerId);
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
    if (status === "approved") db.update(schema.contentItems).set({ pendingNote: null }).where(eq(schema.contentItems.id, item.id)).run();
  } else if (item.status === "ready_draft") error = null;
  const changed = JSON.stringify(copy) !== (item.copy || "{}") || at.getTime() !== item.slotAt.getTime();
  if (changed && item.status !== "ready_draft") await pullFromMeta(item.id, item.customerId); // the worker re-schedules it with the new caption/time
  db.update(schema.contentItems).set({ copy: JSON.stringify(copy), slotAt: at, status, error, updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  back(item.customerId);
}

/** Takes a scheduled item back to draft (the worker also removes it from Meta's scheduler). */
export async function adminReadyUnschedule(fd: FormData) {
  const item = await loadItem(fd);
  if (["approved", "scheduled", "failed", "awaiting_approval"].includes(item.status)) {
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
    if (d.pendingNote) continue; // the client asked for changes: handle it first
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

// ---------------------------------------------------------------- AI captions
/** Rewrites one item's captions + ad copy with AI (looks at the creative). */
export async function adminReadyWriteCopy(fd: FormData) {
  const item = await loadItem(fd);
  const { writeReadyCopyAll } = await import("@/lib/readyCopy");
  await writeReadyCopyAll([item.id], String(fd.get("note") || "").trim().slice(0, 1000));
  back(item.customerId);
}

/** Writes captions for every draft that has none yet (or all drafts with all=1). */
export async function adminReadyWriteCopyAll(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  const all = String(fd.get("all") || "") === "1";
  const drafts = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.customerId, customerId), eq(schema.contentItems.planId, READY_PLAN), eq(schema.contentItems.status, "ready_draft"))).all()
    .filter((d) => all || !String(JSON.parse(d.copy || "{}").instagram_caption || "").trim())
    .filter((d) => !(/captions…/.test(d.error || "") && d.updatedAt.getTime() > Date.now() - 15 * 60_000)); // not ones already being written
  for (const d of drafts) db.update(schema.contentItems).set({ error: "Waiting for captions…", updatedAt: new Date() }).where(eq(schema.contentItems.id, d.id)).run();
  const { writeReadyCopyAll } = await import("@/lib/readyCopy");
  void writeReadyCopyAll(drafts.map((d) => d.id));
  back(customerId);
}

/** Saves facts the caption writer should use for this client (WhatsApp, website, location, offers…). */
export async function adminSaveCaptionNotes(fd: FormData) {
  await requireAdmin();
  const customerId = String(fd.get("customerId"));
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  if (!c) return;
  const d = JSON.parse(c.details || "{}");
  d.caption_notes = String(fd.get("notes") || "").trim().slice(0, 3000);
  db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, customerId)).run();
  back(customerId);
}

// ---------------------------------------------------------------- remakes + client review
/** Queues a remake from the admin's prompt (Gemini image for posts/slides, Veo 3.1 for reels). Runs even while generation is paused. */
export async function adminReadyRemake(fd: FormData) {
  const item = await loadItem(fd);
  const prompt = String(fd.get("prompt") || "").trim().slice(0, 2000);
  if (prompt.length < 4 || item.status === "published") return back(item.customerId);
  const mode = String(fd.get("mode") || "edit") as RemakeMode;
  // reference images (e.g. a screenshot of the person or frame the prompt is about)
  const refs: string[] = [];
  for (const f of (fd.getAll("refs") as File[]).filter((f) => f && f.size > 0 && f.type.startsWith("image/")).slice(0, 4)) {
    const jpg = await sharp(Buffer.from(await f.arrayBuffer())).rotate().resize(1600, 1600, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
    refs.push(saveFile(`${item.customerId}/${READY_PLAN}/${item.id}/refs/${crypto.randomUUID()}.jpg`, jpg));
  }
  const opts = { prompt, mode, refs, slide: Number(fd.get("slide") || 1), seconds: Number(fd.get("seconds") || 8), audio: fd.get("audio") === "1", logo: fd.get("logo") === "1", recaption: fd.get("recaption") === "1" };
  if (item.status !== "ready_draft") await pullFromMeta(item.id, item.customerId);
  db.update(schema.contentItems).set({ status: "ready_draft", error: mode === "video_edit" ? "Remaking: finding the parts to change, then re-filming them (5–15 minutes)…" : mode.startsWith("video") ? "Remaking: filming with Veo (2–5 minutes)…" : "Remaking: new image (under a minute)…", updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  enqueue("ready_remake", { itemId: item.id, opts }, { customerId: item.customerId });
  back(item.customerId);
}

export async function adminReadyUndo(fd: FormData) {
  const item = await loadItem(fd);
  if (item.status !== "published") undoRemake(item);
  back(item.customerId);
}

/** Replaces the creative with uploaded files (a fixed version from the designer). */
export async function adminReadyReplace(fd: FormData) {
  const item = await loadItem(fd);
  const files = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length || item.status === "published") return back(item.customerId);
  if (item.status !== "ready_draft") await pullFromMeta(item.id, item.customerId);
  await replaceMedia(item, files);
  db.update(schema.contentItems).set({ status: "ready_draft", updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  back(item.customerId);
}

/** Sends this item to the client to approve. It posts only after they approve it. */
export async function adminReadySendReview(fd: FormData) {
  const item = await loadItem(fd);
  const ig = String(JSON.parse(item.copy || "{}").instagram_caption || "").trim();
  if (!ig) { db.update(schema.contentItems).set({ error: "Add a caption before sending for review" }).where(eq(schema.contentItems.id, item.id)).run(); return back(item.customerId); }
  if (item.status !== "ready_draft") await pullFromMeta(item.id, item.customerId);
  db.update(schema.contentItems).set({ status: "awaiting_approval", pendingNote: null, error: null, updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  const waiting = db.select({ id: schema.contentItems.id }).from(schema.contentItems).where(and(eq(schema.contentItems.customerId, item.customerId), eq(schema.contentItems.status, "awaiting_approval"))).all().length;
  notify(item.customerId, {
    // one email per half hour, however many posts are sent in that time
    kind: "approvals_due", email: true, dedupeKey: `ready_review:${item.customerId}:${Math.floor(Date.now() / 1_800_000)}`, link: waiting > 1 ? "/app/schedule" : `/app/items/${item.id}`, cta: "Review",
    title: waiting > 1 ? `${waiting} posts are waiting for your OK` : "A post is waiting for your OK",
    body: `We’ve updated a post for you. Have a look and approve it, or tell us what to change.\n\nIt goes live only after you approve it.`,
  });
  back(item.customerId);
}
