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
export type RemakeMode = "edit" | "new" | "video_frame" | "video_new" | "video_edit" | "video_cut" | "video_remove";
export type RemakeOpts = { prompt: string; mode: RemakeMode; slide?: number; seconds?: number; audio?: boolean; logo?: boolean; recaption?: boolean; refs?: string[] };
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
  const refs = await Promise.all((o.refs || []).filter((r) => fs.existsSync(absPath(r))).map((r) => sharp(absPath(r)).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer()));

  if (o.mode === "video_cut") {
    if (item.type !== "reel") throw new Error("“Cut out” is for reels");
    const brief = JSON.parse(item.brief || "{}");
    const last = Array.isArray(brief.versions) ? brief.versions[brief.versions.length - 1] : null;
    // right after an "Edit this video", cut exactly the ranges it re-filmed; otherwise find them from the prompt
    const known: { start: number; end: number }[] | null = last?.mode === "video_edit" && Array.isArray(brief.lastEdit) && brief.lastEdit.length ? brief.lastEdit : null;
    const r = await cutVideo(item, absPath(media[0]), o.prompt, refs, known, `${dir}/reel-v${n}.mp4`);
    const fresh = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)).get()!;
    const upd = saveVersion(fresh, [r.path], { prompt: o.prompt, mode: o.mode }, { autoSchedule: false, lastEdit: r.segments });
    db.update(schema.contentItems).set({ ...upd, type: "reel", error: r.segments.length ? null : "Nothing matched the instruction, so the video is unchanged", costUsd: (fresh.costUsd || 0) + r.costUsd, updatedAt: new Date() }).where(eq(schema.contentItems.id, itemId)).run();
    return r.costUsd;
  }

  if (o.mode === "video_edit" || o.mode === "video_remove") {
    if (item.type !== "reel") throw new Error("“Edit this video” is for reels");
    const r = await editVideo(item, absPath(media[0]), o.prompt, refs, `${dir}/reel-v${n}.mp4`, o.mode === "video_remove");
    const fresh = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)).get()!;
    const upd = saveVersion(fresh, [r.path], { prompt: o.prompt, mode: o.mode }, { autoSchedule: false, lastEdit: r.segments });
    db.update(schema.contentItems).set({ ...upd, type: "reel", error: r.segments.length ? null : "Nothing matched the instruction, so the video is unchanged", costUsd: (fresh.costUsd || 0) + r.costUsd, updatedAt: new Date() }).where(eq(schema.contentItems.id, itemId)).run();
    if (o.recaption) { const { writeReadyCopy } = await import("./readyCopy"); await writeReadyCopy(itemId); }
    return r.costUsd;
  }

  if (o.mode === "edit" || o.mode === "new") {
    const i = Math.min(Math.max(0, (o.slide ?? 1) - 1), media.length - 1);
    const src = absPath(media[i]);
    const aspect = (await aspectOf(src)) as "1:1" | "4:5" | "3:4" | "9:16" | "16:9";
    const ref = await sharp(src).resize(1536, 1536, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
    const prompt = o.mode === "edit"
      ? `Edit this social media creative. Change ONLY what the instruction asks; keep everything else (layout, people, product, logo, colours, text) exactly as it is.\nInstruction: ${o.prompt}\n${RULES}`
      : `Make a new social media creative for the same business, in the same visual style and brand colours as the reference image.\nBrief: ${o.prompt}\n${RULES}`;
    const r = await geminiImage(prompt + (refs.length ? "\nThe images after the first are references from the agency (e.g. the person or object the instruction is about)." : ""), aspect, undefined, [ref, ...refs]);
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
      const r = await geminiImage(`Make the first frame of a vertical 9:16 social video for this business, matching the style of the reference.\nScene: ${o.prompt}\nNo text or captions in the picture. ${RULES}`, "9:16", undefined, [ref, ...refs]);
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

/** Gemini finds the time ranges of a video that an instruction is about (frames every ~0.5 s + reference images). */
async function planSegments(item: Item, file: string, info: Awaited<ReturnType<typeof probe>>, instruction: string, refs: Buffer[], tmp: string, keepText = false) {
  const f = await ff();
  let cost = 0;
    // 1. sample frames
    const progress = (msg: string) => db.update(schema.contentItems).set({ error: `Remaking: ${msg}`, updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
    progress("step 1 of 3, looking through the video for the parts to change…");
    const step = Math.max(0.5, info.dur / 48); // at most ~48 frames: enough to find every shot, quick for Gemini
    const times: number[] = [];
    for (let t = 0; t < info.dur - 0.05; t += step) times.push(Number(t.toFixed(2)));
    const frames: Buffer[] = [];
    for (const [i, t] of times.entries()) {
      const o = path.join(tmp, `s${i}.jpg`);
      await run(f.bin, ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "6", o], { env: f.env, timeout: 60_000 }).catch(() => null);
      frames.push(fs.existsSync(o) ? fs.readFileSync(o) : Buffer.alloc(0));
    }
    const { geminiJsonParts } = await import("./veo");
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (refs.length) { parts.push({ text: "REFERENCE IMAGES from the agency:" }); refs.forEach((b) => parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } })); }
    parts.push({ text: `INSTRUCTION: ${instruction}\n\nThe video is ${info.dur.toFixed(1)} s long. Frames follow, each labelled with its time.` });
    frames.forEach((b, i) => { if (b.length) { parts.push({ text: `t=${times[i]}s` }); parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }); } });
    const sys = keepText ? `You are a video editor. Find every time range of the video where the person or object in the INSTRUCTION is visible. Be precise and complete: include the whole shot from its first to its last frame.
For each range give:
- frame_prompt: an instruction for an image editor working on a still frame from that range: remove ONLY that person/object and fill the space with the real background that would be behind it (continue the scenery naturally). ALL on-screen text (titles, names, subtitles, captions), the logo and every graphic must stay EXACTLY as they are, in the same place, size, font and colour, even text that is drawn over the person.
- motion: one sentence describing the camera movement of that shot without the person (e.g. "static camera, leaves moving in a light breeze").
- text_boxes: a tight box around EVERY piece of on-screen text and logo in that range (titles, names, subtitle lines, captions), as [ymin, xmin, ymax, xmax] in 0–1000 of the frame. Include every subtitle line that appears during the range.
Return ONLY JSON: {"segments":[{"start":0.0,"end":2.5,"frame_prompt":"...","motion":"...","text_boxes":[[700,40,760,960]]}]} with times in seconds. Return {"segments":[]} if it never appears.` : `You are a video editor. Find every time range of the video that must change to follow the INSTRUCTION (for example every shot where a given person is visible, including name titles or captions about them). Be precise and complete: include the whole shot from its first to its last frame. Leave everything else alone.
For each range give:
- frame_prompt: an instruction for an image editor working on a still frame from that range: what to remove or change, what to fill it with so it looks natural (continue the real background), and any on-screen text to remove because it refers to what is removed. Keep the logo, colours, lighting and everything else.
- motion: one sentence describing the camera movement and natural motion of that shot so it can be re-filmed (e.g. "slow push-in, leaves moving in a light breeze").
Return ONLY JSON: {"segments":[{"start":0.0,"end":2.5,"frame_prompt":"...","motion":"..."}]} with times in seconds. Return {"segments":[]} if nothing needs to change.`;
    // the frames are many images in one request: give Gemini up to 8 minutes, and try once more if it times out
    let r: { text: string; costUsd: number };
    try { r = await geminiJsonParts(sys, parts, process.env.VIDEO_EDIT_MODEL || undefined, 480_000); }
    catch (e) { console.error("video edit plan, retrying:", e instanceof Error ? e.message : e); r = await geminiJsonParts(sys, parts, process.env.VIDEO_EDIT_MODEL || undefined, 480_000); }
    cost += r.costUsd;
    let segs: Segment[] = [];
    try { segs = (JSON.parse(r.text.replace(/^```json|```$/g, "")).segments || []) as Segment[]; } catch { throw new Error("Couldn’t read the edit plan"); }
    // tidy: pad to the sampling step, clamp, merge overlaps
    segs = segs.map((s) => ({ ...s, start: Math.max(0, Number(s.start) - step / 2), end: Math.min(info.dur, Number(s.end) + step / 2) })).filter((s) => s.end - s.start > 0.2).sort((a, b) => a.start - b.start);
    const merged: Segment[] = [];
    for (const s of segs) { const last = merged[merged.length - 1]; if (last && s.start <= last.end + 0.3) last.end = Math.max(last.end, s.end); else merged.push({ ...s }); }
  return { segments: merged, step, costUsd: cost };
}

/** Removes the ranges the instruction is about (picture and sound together), so the reel gets shorter. */
export async function cutVideo(item: Item, file: string, instruction: string, refs: Buffer[], known: { start: number; end: number }[] | null, outRel: string) {
  const f = await ff();
  const info = await probe(file);
  if (!info.dur) throw new Error("Couldn’t read the video");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-"));
  let cost = 0;
  try {
    let segs: { start: number; end: number }[];
    if (known) segs = known.map((s) => ({ start: Math.max(0, s.start), end: Math.min(info.dur, s.end) }));
    else { const p = await planSegments(item, file, info, instruction, refs, tmp); cost += p.costUsd; segs = p.segments; }
    if (!segs.length) return { path: saveFile(outRel, fs.readFileSync(file)), segments: [], costUsd: cost };
    db.update(schema.contentItems).set({ error: "Remaking: cutting the video…", updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
    const keep: [number, number][] = [];
    let cursor = 0;
    for (const s of segs.sort((a, b) => a.start - b.start)) { if (s.start - cursor > 0.1) keep.push([cursor, s.start]); cursor = Math.max(cursor, s.end); }
    if (info.dur - cursor > 0.1) keep.push([cursor, info.dur]);
    if (!keep.length) throw new Error("That would cut the whole video");
    const W = info.w - (info.w % 2), H = info.h - (info.h % 2);
    const vf = `scale=${W}:${H}${f.full ? `,fps=${info.fps}` : ""},format=yuv420p`;
    const pieces: string[] = [];
    for (const [i, [a, b]] of keep.entries()) {
      const o = path.join(tmp, `k${i}.mp4`);
      const fade = f.full && info.audio ? ["-af", `afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, b - a - 0.06).toFixed(3)}:d=0.06`] : [];
      await run(f.bin, ["-v", "error", "-y", "-ss", a.toFixed(3), "-t", (b - a).toFixed(3), "-i", file, "-vf", vf, ...fade, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", ...(info.audio ? ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : ["-an"]), "-video_track_timescale", "90000", o], { env: f.env, timeout: 300_000 });
      pieces.push(o);
    }
    fs.writeFileSync(path.join(tmp, "list.txt"), pieces.map((p) => `file '${p}'`).join("\n"));
    const out = path.join(tmp, "out.mp4");
    await run(f.bin, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "list.txt"), "-c", "copy", "-movflags", "+faststart", out], { env: f.env, timeout: 300_000 });
    return { path: saveFile(outRel, fs.readFileSync(out)), segments: segs.map((s) => ({ start: Number(s.start.toFixed(2)), end: Number(s.end.toFixed(2)), change: "cut" })), costUsd: cost };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- edit an existing video
/** A full ffmpeg (Debian package in the image) when present; Remotion's trimmed build otherwise. */
async function ff() {
  if (fs.existsSync("/usr/bin/ffmpeg")) return { bin: "/usr/bin/ffmpeg", env: process.env, full: true };
  const { ffmpegPath } = await import("./readyCopy");
  const bin = ffmpegPath();
  return { bin, env: { ...process.env, LD_LIBRARY_PATH: path.dirname(bin) }, full: bin === "ffmpeg" };
}

async function probe(file: string) {
  const f = await ff();
  const { stderr } = await run(f.bin, ["-hide_banner", "-i", file], { env: f.env }).catch((e) => e as { stderr: string });
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr || "");
  const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr || "");
  const fps = /([\d.]+) fps/.exec(stderr || "");
  return {
    dur: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    w: v ? Number(v[1]) : 1080, h: v ? Number(v[2]) : 1920,
    fps: fps ? Math.round(Number(fps[1])) || 30 : 30, audio: /Audio:/.test(stderr || ""),
  };
}

type Segment = { start: number; end: number; frame_prompt: string; motion: string; text_boxes?: number[][] };

/**
 * Changes only the parts of a reel the instruction is about (e.g. "remove this person"), keeping the rest
 * of the video and the original soundtrack as they are:
 *   1. Gemini looks at a frame every half second (plus the agency's reference images) and returns the time ranges to change
 *   2. for each range: Gemini image edits its first frame, Veo 3.1 films it for the length of the range
 *   3. the untouched parts and the new clips are joined; the original audio goes back on top
 */
export async function editVideo(item: Item, file: string, instruction: string, refs: Buffer[], outRel: string, keepText = false) {
  const f = await ff();
  const info = await probe(file);
  if (!info.dur) throw new Error("Couldn’t read the video");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ve-"));
  let cost = 0;
  try {
    const progress = (msg: string) => db.update(schema.contentItems).set({ error: `Remaking: ${msg}`, updatedAt: new Date() }).where(eq(schema.contentItems.id, item.id)).run();
    const plan = await planSegments(item, file, info, instruction, refs, tmp, keepText);
    cost += plan.costUsd;
    const merged = plan.segments, step = plan.step;
    void step;
    const { geminiImage, imageToVideo } = await import("./veo");
    if (!merged.length) { return { path: saveFile(outRel, fs.readFileSync(file)), segments: [], costUsd: cost }; }

    // 2. new footage for each range (Veo makes 4/6/8 s clips; longer ranges are filmed in pieces)
    const W = info.w - (info.w % 2), H = info.h - (info.h % 2);
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${f.full ? `,fps=${info.fps}` : ""},format=yuv420p`;
    const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", "-video_track_timescale", "90000"];
    const pieces: string[] = [];
    let cursor = 0, k = 0;
    const cut = async (from: number, to: number) => {
      if (to - from < 0.04) return;
      const o = path.join(tmp, `p${k++}.mp4`);
      await run(f.bin, ["-v", "error", "-y", "-ss", from.toFixed(3), "-t", (to - from).toFixed(3), "-i", file, "-vf", vf, ...enc, o], { env: f.env, timeout: 300_000 });
      pieces.push(o);
    };
    const total = merged.reduce((n, s) => n + Math.ceil((s.end - s.start) / 8), 0);
    let done = 0;
    for (const s of merged) {
      await cut(cursor, s.start);
      for (let a = s.start; a < s.end - 0.04; a += 8) {
        const len = Math.min(8, s.end - a);
        progress(`step 2 of 3, re-filming ${s.start.toFixed(1)}–${s.end.toFixed(1)} s (clip ${++done} of ${total}, about 2–4 minutes each)…`);
        const fr = path.join(tmp, `f${k}.jpg`);
        await run(f.bin, ["-v", "error", "-y", "-ss", (a + Math.min(0.1, len / 2)).toFixed(3), "-i", file, "-frames:v", "1", "-q:v", "2", fr], { env: f.env, timeout: 60_000 });
        const still = await geminiImage(keepText
          ? `Edit this frame from a vertical social video. ${s.frame_prompt}\nRemove only that; do not move, resize, recolour or remove any text, logo or graphic. Same framing and lighting. Photorealistic.`
          : `Edit this frame from a vertical social video. ${s.frame_prompt}\nKeep everything else exactly as it is (framing, lighting, colours, logo). Photorealistic, no new text.`, "9:16", undefined, [fs.readFileSync(fr), ...refs]);
        cost += still.costUsd;
        const stillFile = path.join(tmp, `e${k}.jpg`);
        fs.writeFileSync(stillFile, await sharp(still.png).jpeg({ quality: 92 }).toBuffer());
        const secs = len <= 4 ? 4 : len <= 6 ? 6 : 8;
        const v = await imageToVideo(stillFile, `${s.motion}. Real footage, steady camera, natural light. Everything stays exactly as in the first frame: no people appear, nothing new enters the frame.`, { seconds: secs, negative: "people appearing, person walking in, faces, text, captions, watermark, morphing, flicker" });
        cost += v.costUsd;
        const raw = path.join(tmp, `v${k}.mp4`); fs.writeFileSync(raw, v.mp4);
        const o = path.join(tmp, `p${k++}.mp4`);
        if (!keepText) await run(f.bin, ["-v", "error", "-y", "-t", len.toFixed(3), "-i", raw, "-vf", vf, ...enc, o], { env: f.env, timeout: 300_000 });
        else {
          // only the person's area comes from the new footage; the original video (with its moving text) stays everywhere else
          const orig = path.join(tmp, `o${k}.mp4`), clean = path.join(tmp, `c${k}.mp4`);
          await run(f.bin, ["-v", "error", "-y", "-ss", a.toFixed(3), "-t", len.toFixed(3), "-i", file, "-vf", vf, ...enc, orig], { env: f.env, timeout: 300_000 });
          await run(f.bin, ["-v", "error", "-y", "-t", len.toFixed(3), "-i", raw, "-vf", vf, ...enc, clean], { env: f.env, timeout: 300_000 });
          // a fresh mask for every frame, so the person is followed as they move
          const fdir = path.join(tmp, `fr${k}`), mdir = path.join(tmp, `mk${k}`);
          fs.mkdirSync(fdir); fs.mkdirSync(mdir);
          const w2 = Math.round(W / 4) * 2, h2 = Math.round(H / 4) * 2; // masks at half size, scaled up when merging
          await run(f.bin, ["-v", "error", "-y", "-i", orig, "-vf", `scale=${w2}:${h2}`, path.join(fdir, "%05d.png")], { env: f.env, timeout: 300_000 });
          const names = fs.readdirSync(fdir).filter((x) => x.endsWith(".png")).sort();
          await removalMasks(names.map((x) => path.join(fdir, x)), still.png, w2, h2, s.text_boxes || [], mdir);
          await run(f.bin, ["-v", "error", "-y", "-i", orig, "-i", clean, "-framerate", String(info.fps), "-i", path.join(mdir, "%05d.png"),
            "-filter_complex", `[0:v]format=gbrp[a];[1:v]format=gbrp[b];[2:v]scale=${W}:${H},format=gbrp[m];[a][b][m]maskedmerge,format=yuv420p[v]`,
            "-map", "[v]", "-t", len.toFixed(3), ...enc, o], { env: f.env, timeout: 300_000 });
        }
        pieces.push(o);
      }
      cursor = s.end;
    }
    await cut(cursor, info.dur);

    // 3. join, then put the original soundtrack back
    progress("step 3 of 3, putting the video back together…");
    fs.writeFileSync(path.join(tmp, "list.txt"), pieces.map((p) => `file '${p}'`).join("\n"));
    const joined = path.join(tmp, "joined.mp4");
    await run(f.bin, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "list.txt"), "-c", "copy", joined], { env: f.env, timeout: 300_000 });
    const out = path.join(tmp, "out.mp4");
    await run(f.bin, ["-v", "error", "-y", "-i", joined, "-i", file, "-map", "0:v", ...(info.audio ? ["-map", "1:a", "-c:a", "aac", "-b:a", "192k"] : []), "-c:v", "copy", "-t", info.dur.toFixed(3), "-movflags", "+faststart", out], { env: f.env, timeout: 300_000 });
    return { path: saveFile(outRel, fs.readFileSync(out)), segments: merged.map((s) => ({ start: Number(s.start.toFixed(2)), end: Number(s.end.toFixed(2)), change: s.frame_prompt })), costUsd: cost };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Per-frame masks (white = take the cleaned footage) for "remove a person":
 *  - the person = big shapes where the frame differs from the cleaned still (small specks and thin strokes ignored)
 *  - inside the person, on-screen text is kept from the original: pixels in Gemini's text boxes that look like text
 *    (white/grey or lime letters), and pixels that already match the clean background
 */
export async function removalMasks(files: string[], cleanPng: Buffer, w2: number, h2: number, boxes: number[][], outDir: string) {
  const N = w2 * h2;
  const rgb = async (b: Buffer | string, blur?: number) => { let p = sharp(b).resize(w2, h2, { fit: "cover" }).removeAlpha(); if (blur) p = p.blur(blur); return p.raw().toBuffer(); };
  const clean = await rgb(cleanPng, 1);
  const inBox = new Uint8Array(N);
  for (const bx of boxes) {
    if (!Array.isArray(bx) || bx.length < 4) continue;
    const [y0, x0, y1, x1] = bx.map(Number);
    for (let y = Math.max(0, Math.floor((y0 / 1000) * h2) - 3); y < Math.min(h2, Math.ceil((y1 / 1000) * h2) + 3); y++)
      for (let x = Math.max(0, Math.floor((x0 / 1000) * w2) - 3); x < Math.min(w2, Math.ceil((x1 / 1000) * w2) + 3); x++) inBox[y * w2 + x] = 1;
  }
  if (!boxes.length) inBox.fill(1); // no boxes from Gemini: look for letters anywhere
  // letters in the cleaned still (Gemini keeps the text): a letter is kept from the original only where the still has one too
  const isText = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = 0.3 * r + 0.59 * g + 0.11 * b; return (l > 105 && mx - mn < 70) || (g > 165 && r > 120 && b < 150 && g > b + 50); };
  const cleanRaw = await sharp(cleanPng).resize(w2, h2, { fit: "cover" }).removeAlpha().raw().toBuffer();
  const stillText = new Uint8Array(N);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const i = y * w2 + x;
    if (!inBox[i] || !isText(cleanRaw[i * 3], cleanRaw[i * 3 + 1], cleanRaw[i * 3 + 2])) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h2 && xx >= 0 && xx < w2) stillText[yy * w2 + xx] = 1; }
  }
  const q = 4, w = Math.ceil(w2 / q), h = Math.ceil(h2 / q);
  const morph = (src: Uint8Array, r: number, grow: boolean) => {
    const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = grow ? 0 : 1; for (let k = -r; k <= r; k++) { const xx = x + k; const v = xx >= 0 && xx < w ? src[y * w + xx] : 0; if (grow && v) { m = 1; break; } if (!grow && !v) { m = 0; break; } } a[y * w + x] = m; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = grow ? 0 : 1; for (let k = -r; k <= r; k++) { const yy = y + k; const v = yy >= 0 && yy < h ? a[yy * w + x] : 0; if (grow && v) { m = 1; break; } if (!grow && !v) { m = 0; break; } } b[y * w + x] = m; }
    return b;
  };
  let prev: Uint8Array<ArrayBuffer> | null = null;
  for (const [fi, file] of files.entries()) {
    const raw = await sharp(file).resize(w2, h2, { fit: "cover" }).removeAlpha().raw().toBuffer();
    const o = await rgb(file, 1);
    const d = new Uint8Array(N);
    for (let i = 0; i < N; i++) d[i] = Math.max(Math.abs(o[i * 3] - clean[i * 3]), Math.abs(o[i * 3 + 1] - clean[i * 3 + 1]), Math.abs(o[i * 3 + 2] - clean[i * 3 + 2]));
    let g = new Uint8Array(w * h);
    const cnt = new Uint8Array(w * h);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) if (d[y * w2 + x] > 40) cnt[((y / q) | 0) * w + ((x / q) | 0)]++;
    for (let i = 0; i < g.length; i++) g[i] = cnt[i] >= 5 ? 1 : 0;
    g = morph(g, 2, false); // drop thin strokes and specks
    const seen = new Uint8Array(w * h), keep = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) {
      if (!g[i] || seen[i]) continue;
      const stack = [i], comp: number[] = []; seen[i] = 1;
      while (stack.length) { const c = stack.pop()!; comp.push(c); const cx = c % w, cy = (c / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const ni = ny * w + nx; if (g[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } } }
      if (comp.length > w * h * 0.004) for (const c of comp) keep[c] = 1;
    }
    g = morph(keep, 2 + 5, true); // back to size, plus a margin for hair, edges and motion blur
    let area = 0; for (const v of g) area += v;
    if (area > w * h * 0.65 && prev) g = prev as Uint8Array<ArrayBuffer>; // the whole frame changed (camera move, flash): reuse the last good shape
    prev = g;
    const m = Buffer.alloc(N);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const i = y * w2 + x;
      if (!g[((y / q) | 0) * w + ((x / q) | 0)]) continue;
      if (stillText[i] && isText(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2])) continue; // a letter drawn over the person: keep the original (with its animation)
      m[i] = 255;
    }
    fs.writeFileSync(path.join(outDir, `${String(fi + 1).padStart(5, "0")}.png`), await sharp(m, { raw: { width: w2, height: h2, channels: 1 } }).blur(1.2).png().toBuffer());
  }
}
