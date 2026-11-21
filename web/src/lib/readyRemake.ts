/**
 * Admin remakes of ready-made content, from the admin's own prompt:
 *   - posts / carousel slides → Gemini image (edit the current picture, or make a new one)
 *   - reels → Veo 3.1 (from a frame of the current video, or from a new Gemini start image)
 * Every remake keeps the previous version, so it can be undone. Nothing reaches the client until the
 * admin presses "Send to client for review".
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { absPath, saveFile } from "./storage";
import { deleteFacebookPost } from "./meta";
import { READY_PLAN } from "./ready";

const run = promisify(execFile);
type Item = typeof schema.contentItems.$inferSelect;
export type RemakeMode = "edit" | "new" | "video_frame" | "video_new";
export type RemakeOpts = { prompt: string; mode: RemakeMode; slide?: number; seconds?: number; audio?: boolean; logo?: boolean; recaption?: boolean };
export type Version = { media: string[]; at: string; prompt?: string; mode?: string };

const ASPECTS = [["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["9:16", 0.5625], ["16:9", 1.778]] as const;
async function aspectOf(file: string) {
  const m = await sharp(file).metadata();
  const r = (m.width || 1) / (m.height || 1);
  return ASPECTS.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a))[0];
}

export function mediaOf(item: Item): string[] {
  const b = JSON.parse(item.brief || "{}");
  return Array.isArray(b.slides) && b.slides.length ? b.slides : [item.mediaPath!].filter(Boolean);
}

/** One JPEG frame from a video at `at` seconds. */
async function frameAt(file: string, at = 0.3) {
  const { ffmpegPath } = await import("./readyCopy");
  const ff = ffmpegPath();
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rf-")), "f.jpg");
  await run(ff, ["-v", "error", "-y", "-ss", String(at), "-i", file, "-frames:v", "1", "-q:v", "2", out], { env: { ...process.env, LD_LIBRARY_PATH: path.dirname(ff) }, timeout: 60_000 });
  return fs.readFileSync(out);
}

async function brandLogoFile(customerId: string) {
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  return c?.logoPath && fs.existsSync(absPath(c.logoPath)) ? absPath(c.logoPath) : null;
}

const RULES = "Keep it photorealistic and believable. Do not add prices, discounts, phone numbers, ratings, awards or claims that were not asked for. Do not add children. Spell any text exactly as written in the instruction.";

/** Takes an item off Meta's own scheduler (Facebook image posts), so an edit can't leave a stale post there. */
export async function pullFromMeta(itemId: string, customerId: string) {
  const jobs = db.select().from(schema.publishJobs).where(and(eq(schema.publishJobs.itemId, itemId), eq(schema.publishJobs.status, "meta_scheduled"))).all();
  if (!jobs.length) return;
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customerId)).get();
  for (const j of jobs) {
    try { if (conn && j.remoteId) await deleteFacebookPost(conn, j.remoteId); } catch (e) { console.error("pull from Meta schedule:", e instanceof Error ? e.message : e); continue; }
    db.update(schema.publishJobs).set({ status: "cancelled" }).where(eq(schema.publishJobs.id, j.id)).run();
  }
}

/** Saves a new set of media as the current version and keeps the old one in brief.versions. */
function saveVersion(item: Item, media: string[], v: Omit<Version, "media" | "at">, extra: Record<string, unknown> = {}) {
  const brief = JSON.parse(item.brief || "{}");
  const versions: Version[] = Array.isArray(brief.versions) ? brief.versions : [];
  versions.push({ media: mediaOf(item), at: new Date().toISOString(), ...v });
  brief.versions = versions.slice(-10);
  if (media.length > 1) brief.slides = media; else delete brief.slides;
  Object.assign(brief, extra);
  return { brief: JSON.stringify(brief), mediaPath: media[0], thumbPath: null as string | null };
}

export async function remakeReady(itemId: string, o: RemakeOpts) {
  const item = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.id, itemId), eq(schema.contentItems.planId, READY_PLAN))).get();
  if (!item) throw new Error("Item not found");
  const media = mediaOf(item);
  const n = (JSON.parse(item.brief || "{}").versions?.length || 0) + 2;
  const dir = `${item.customerId}/${READY_PLAN}/${item.id}`;
  let cost = 0;
  let next = [...media];
  const { geminiImage, imageToVideo } = await import("./veo");

  if (o.mode === "edit" || o.mode === "new") {
    const i = Math.min(Math.max(0, (o.slide ?? 1) - 1), media.length - 1);
    const src = absPath(media[i]);
    const aspect = (await aspectOf(src)) as "1:1" | "4:5" | "3:4" | "9:16" | "16:9";
    const ref = await sharp(src).resize(1536, 1536, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
    const prompt = o.mode === "edit"
      ? `Edit this social media creative. Change ONLY what the instruction asks; keep everything else (layout, people, product, logo, colours, text) exactly as it is.\nInstruction: ${o.prompt}\n${RULES}`
      : `Make a new social media creative for the same business, in the same visual style and brand colours as the reference image.\nBrief: ${o.prompt}\n${RULES}`;
    const r = await geminiImage(prompt, aspect, undefined, [ref]);
    cost += r.costUsd;
    let png: Buffer<ArrayBufferLike> = r.png;
    if (o.logo) { const { withLogo } = await import("./engine"); png = await withLogo(png, await brandLogoFile(item.customerId)); }
    const jpg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    next[i] = saveFile(`${dir}/slide${String(i + 1).padStart(2, "0")}-v${n}.jpg`, jpg);
  } else {
    // reel: pick a start frame, then Veo 3.1 films it
    let start: Buffer<ArrayBufferLike>;
    if (o.mode === "video_frame" && item.type === "reel") start = await frameAt(absPath(media[0]));
    else {
      const ref = item.type === "reel" ? await frameAt(absPath(media[0])) : await sharp(absPath(media[0])).jpeg().toBuffer();
      const r = await geminiImage(`Make the first frame of a vertical 9:16 social video for this business, matching the style of the reference.\nScene: ${o.prompt}\nNo text or captions in the picture. ${RULES}`, "9:16", undefined, [ref]);
      cost += r.costUsd; start = r.png;
    }
    const startFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rs-")), "start.jpg");
    fs.writeFileSync(startFile, await sharp(start).jpeg({ quality: 92 }).toBuffer());
    const prompt = `${o.prompt}\nStyle: real footage filmed on a cinema camera, natural light, real-world physics, steady camera. Everything in the first frame stays consistent: same people, products, shapes and colours. ${o.audio ? "Natural ambient sound only, no music, no speech." : ""}`;
    const v = await imageToVideo(startFile, prompt, { seconds: o.seconds ?? 8, audio: o.audio, model: process.env.VEO_REMAKE_MODEL || undefined });
    cost += v.costUsd;
    next = [saveFile(`${dir}/reel-v${n}.mp4`, v.mp4)];
  }

  const fresh = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)).get()!;
  const upd = saveVersion(fresh, next, { prompt: o.prompt, mode: o.mode }, { autoSchedule: false }); // a changed item waits for the admin (and the client's OK)
  db.update(schema.contentItems).set({
    ...upd, type: next[0].endsWith(".mp4") ? "reel" : "post",
    error: null, costUsd: (fresh.costUsd || 0) + cost, updatedAt: new Date(),
  }).where(eq(schema.contentItems.id, itemId)).run();
  if (o.recaption) { const { writeReadyCopy } = await import("./readyCopy"); await writeReadyCopy(itemId); }
  return cost;
}

/** Restores the version before the current one. */
export function undoRemake(item: Item) {
  const brief = JSON.parse(item.brief || "{}");
  const versions: Version[] = Array.isArray(brief.versions) ? brief.versions : [];
  const prev = versions.pop();
  if (!prev) return false;
  brief.versions = versions;
  if (prev.media.length > 1) brief.slides = prev.media; else delete brief.slides;
  db.update(schema.contentItems).set({ brief: JSON.stringify(brief), mediaPath: prev.media[0], thumbPath: null, type: prev.media[0].endsWith(".mp4") ? "reel" : "post", updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
  return true;
}

/** Replaces the media with files the admin uploads (e.g. a corrected version from the designer). */
export async function replaceMedia(item: Item, files: File[]) {
  const n = (JSON.parse(item.brief || "{}").versions?.length || 0) + 2;
  const dir = `${item.customerId}/${READY_PLAN}/${item.id}`;
  const out: string[] = [];
  for (const [k, f] of files.entries()) {
    const ext = path.extname(f.name).toLowerCase();
    const buf = Buffer.from(await f.arrayBuffer());
    if ([".mp4", ".mov", ".m4v"].includes(ext)) { out.splice(0, out.length, saveFile(`${dir}/reel-v${n}${ext === ".mov" ? ".mov" : ".mp4"}`, buf)); break; }
    const jpg = await sharp(buf).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    out.push(saveFile(`${dir}/slide${String(k + 1).padStart(2, "0")}-v${n}.jpg`, jpg));
  }
  if (!out.length) return;
  const upd = saveVersion(item, out, { mode: "upload" }, { autoSchedule: false });
  db.update(schema.contentItems).set({ ...upd, type: out[0].match(/\.(mp4|mov)$/) ? "reel" : "post", updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
}
