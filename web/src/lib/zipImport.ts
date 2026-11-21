/**
 * Imports a zip of ready-made content for a client:
 *   - images  → posts (JPEG, Instagram's API only takes JPEG)
 *   - NAME_slide1.png, NAME_slide2.png … → one carousel post (slides in number order)
 *   - .mp4/.mov → reels
 * Posts and reels are spread over the calendar (reels evenly between posts) as drafts; captions are
 * written afterwards by readyCopy.ts.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import yauzl from "yauzl";
import { db, schema } from "@/db";
import { saveFile, STORAGE_ROOT } from "./storage";
import { READY_PLAN, slots, autoPlan, type Kind } from "./ready";

const VIDEO = new Set([".mp4", ".mov", ".m4v"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

type Entry = { name: string; base: string; ext: string; read: () => Promise<Buffer> };

function listZip(file: string): Promise<{ entries: Entry[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err);
      const entries: Entry[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        const name = e.fileName.replace(/\\/g, "/");
        const base = path.posix.basename(name);
        const ext = path.extname(base).toLowerCase();
        const skip = name.endsWith("/") || name.includes("__MACOSX/") || base.startsWith(".") || (!IMAGE.has(ext) && !VIDEO.has(ext));
        if (!skip) {
          entries.push({
            name, base, ext,
            read: () => new Promise<Buffer>((res, rej) => zip.openReadStream(e, (er, s) => {
              if (er || !s) return rej(er);
              const chunks: Buffer[] = [];
              s.on("data", (c: Buffer) => chunks.push(c)); s.on("end", () => res(Buffer.concat(chunks))); s.on("error", rej);
            })),
          });
        }
        zip.readEntry();
      });
      zip.on("end", () => resolve({ entries, close: () => zip.close() }));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

type Unit = { key: string; type: "post" | "reel"; files: Entry[] };

/** Groups entries into posts, carousels and reels. */
function group(entries: Entry[]): Unit[] {
  const posts = new Map<string, { n: number; e: Entry }[]>();
  const reels: Unit[] = [];
  for (const e of entries) {
    const stem = e.base.slice(0, -e.ext.length);
    if (VIDEO.has(e.ext)) { reels.push({ key: stem, type: "reel", files: [e] }); continue; }
    const m = /^(.+?)[\s_-]*(?:slides?|carousel)[\s_-]*(\d+)$/i.exec(stem); // NAME_slide2, NAME-slides 3, NAME carousel1
    const key = m && m[1] ? m[1] : stem;
    const n = m ? Number(m[2]) : 0;
    const dir = path.posix.dirname(e.name);
    const k = `${dir}/${key}`;
    posts.set(k, [...(posts.get(k) || []), { n, e }]);
  }
  const postUnits: Unit[] = [...posts.entries()].map(([k, list]) => ({ key: path.posix.basename(k), type: "post" as const, files: list.sort((a, b) => a.n - b.n || natural(a.e.base, b.e.base)).map((x) => x.e) }));
  postUnits.sort((a, b) => natural(a.key, b.key));
  reels.sort((a, b) => natural(a.key, b.key));
  // spread reels evenly between posts
  const P = postUnits.length, R = reels.length;
  return [...postUnits.map((u, i) => ({ u, at: (i + 0.5) / Math.max(1, P) })), ...reels.map((u, j) => ({ u, at: (j + 0.5) / Math.max(1, R) + 1e-6 }))]
    .sort((a, b) => a.at - b.at).map((x) => x.u);
}

export type ImportOpts = { startDay: string; mode: "auto" | "manual"; days: number; times: string[]; everyDays: number; autoSchedule: boolean };

export async function importZip(customerId: string, zipFile: string, opts: ImportOpts) {
  const { entries, close } = await listZip(zipFile);
  try {
    let units = group(entries);
    let when: Date[];
    if (opts.mode === "auto") {
      const kinds: Kind[] = units.map((u) => (u.type === "reel" ? "reel" : u.files.length > 1 ? "carousel" : "post"));
      const plan = autoPlan(kinds, opts.startDay, opts.days);
      units = plan.order.map((i) => units[i]);
      when = plan.order.map((i) => plan.when[i]);
    } else when = slots(units.length, opts.startDay, opts.times, opts.everyDays);
    const ids: string[] = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const itemId = crypto.randomUUID();
      const dir = `${customerId}/${READY_PLAN}/${itemId}`;
      const paths: string[] = [];
      if (u.type === "reel") paths.push(saveFile(`${dir}/reel${u.files[0].ext === ".mp4" ? ".mp4" : u.files[0].ext}`, await u.files[0].read()));
      else {
        for (const [k, f] of u.files.entries()) {
          const jpg = await sharp(await f.read()).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
          paths.push(saveFile(`${dir}/slide${String(k + 1).padStart(2, "0")}.jpg`, jpg));
        }
      }
      db.insert(schema.contentItems).values({
        id: itemId, customerId, planId: READY_PLAN, type: u.type,
        slotAt: when[i] ?? new Date(Date.now() + (i + 1) * 86400e3), pillar: "Ready-made",
        brief: JSON.stringify({ source: "zip", autoSchedule: opts.autoSchedule, file: u.files.length > 1 ? `${u.key} (${u.files.length} slides)` : u.files[0].base, ...(paths.length > 1 ? { slides: paths } : {}) }),
        copy: JSON.stringify({ instagram_caption: "", facebook_post: "" }),
        mediaPath: paths[0], status: "ready_draft", error: "Waiting for captions…",
      }).run();
      ids.push(itemId);
    }
    return ids;
  } finally { close(); }
}

/** Streams an upload to a temp file under storage (not memory). */
export async function saveUploadToTemp(body: ReadableStream<Uint8Array>) {
  const dir = path.join(STORAGE_ROOT, "_tmp");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${crypto.randomUUID()}.zip`);
  const out = fs.createWriteStream(file);
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
  }
  await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
  return file;
}
