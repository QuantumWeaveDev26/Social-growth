/**
 * Writes the words for ready-made posts, carousels and reels: Instagram caption, Facebook post, hashtags,
 * alt text and Meta ad copy (primary text, headline, description). The model LOOKS at the creative (image,
 * every carousel slide, or frames from the reel) and uses only the business facts it is given.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { absPath } from "./storage";
import { visionJson } from "./ai";
import { businessFacts } from "./engine";

const run = promisify(execFile);
type Item = typeof schema.contentItems.$inferSelect;

export type ReadyCopy = {
  instagram_caption: string; facebook_post: string; hashtags: string[]; alt_text: string;
  ad: { primary_text: string; headline: string; description: string };
};

const SYSTEM = `You are the senior social media copywriter of a performance-marketing agency in India. You write the words that go WITH a finished creative (a post, a carousel or a reel) for Instagram and Facebook, plus Meta ad copy for boosting it.

Look at the creative carefully (every image / slide / video frame you are given): its on-screen text, what it shows, who it is for. Your words must match and extend it, never contradict it.

RULES
1. Story: PROBLEM → SOLUTION → OUTCOME → ONE CTA. First line = a scroll-stopping hook in the audience's words (a question or a sharp statement), under 12 words. Then the solution (what this business does), then the outcome (concrete, modest, believable), then one clear call to action.
2. Facts only: use only the BUSINESS FACTS and what is visibly on the creative. Never invent prices, discounts, "limited seats", rankings, results, testimonials, years, awards or guarantees. If a fact (e.g. WhatsApp number, website) is not given, don't make one up.
3. CTA: if WhatsApp is given and the goal is enquiries/bookings, the CTA is to message on WhatsApp ("Tap the link in bio / DM us on WhatsApp"); on Facebook you may say "Message us on WhatsApp" with the number if given. Otherwise "DM us" / "Link in bio".
4. Never mention "the creative", "the image", "the video", "this post", "on screen", "slide" (except "swipe") or how the content was made: write as the business talking to its audience.
5. Voice: plain, warm, confident Indian English (or the language in the facts). Short lines, line breaks between ideas, 1–3 fitting emojis max. No hype words ("revolutionary", "game-changer"), no AI tells ("Unlock", "Elevate", "Dive into", em dashes).
6. Instagram caption: 60–150 words before hashtags, readable on a phone. Carousels: tease the swipe ("Swipe to see…"). Reels: talk to a viewer who just watched it.
7. Facebook post: a little shorter and more conversational, same message, no hashtag block (0–3 hashtags max).
8. Hashtags: 6–10, specific and relevant (niche + local area + topic). No banned or generic spam tags (#love #instagood #follow4follow).
9. Alt text: one plain sentence describing the image for screen readers.
10. Meta ad copy: primary_text ≤ 125 characters (hook + benefit + CTA), headline ≤ 40 characters, description ≤ 30 characters.

Return ONLY JSON: {"instagram_caption": "...(no hashtags inside)...", "facebook_post": "...", "hashtags": ["#..."], "alt_text": "...", "ad": {"primary_text": "...", "headline": "...", "description": "..."}}`;

/** Remotion's bundled ffmpeg (the image ships it for the reel renderer). */
function ffmpegPath() {
  const roots = [path.resolve(process.cwd(), "../video/node_modules/@remotion"), "/app/video/node_modules/@remotion"];
  for (const r of roots) for (const v of ["compositor-linux-x64-gnu", "compositor-linux-x64-musl", "compositor-darwin-arm64", "compositor-darwin-x64"]) {
    const p = path.join(r, v, "ffmpeg");
    if (fs.existsSync(p)) return p;
  }
  return "ffmpeg";
}

/** Four frames from a video (20%, 40%, 60%, 85%) as JPEGs. */
async function videoFrames(file: string): Promise<Buffer[]> {
  const ff = ffmpegPath();
  const env = { ...process.env, LD_LIBRARY_PATH: path.dirname(ff) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  try {
    let dur = 20;
    try {
      const { stderr } = await run(ff, ["-hide_banner", "-i", file], { env }).catch((e) => e as { stderr: string });
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr || "");
      if (m) dur = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    } catch { /* keep default */ }
    const out: Buffer[] = [];
    for (const [i, f] of [0.2, 0.4, 0.6, 0.85].entries()) {
      const o = path.join(dir, `f${i}.jpg`);
      try {
        await run(ff, ["-v", "error", "-y", "-ss", (dur * f).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", o], { env, timeout: 60_000 });
        if (fs.existsSync(o)) out.push(fs.readFileSync(o));
      } catch (e) { console.error("frame:", e instanceof Error ? e.message.slice(0, 200) : e); }
    }
    return out;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const small = (file: string) => sharp(fs.readFileSync(file)).rotate().resize(768, 768, { fit: "inside" }).flatten({ background: "#fff" }).jpeg({ quality: 80 }).toBuffer();

/** Every media path of an item (carousel slides in order, or the single file). */
export function itemMedia(item: Item): string[] {
  const b = JSON.parse(item.brief || "{}");
  return Array.isArray(b.slides) && b.slides.length ? (b.slides as string[]) : [item.mediaPath!].filter(Boolean);
}

/** Writes and saves the copy for one ready-made item. Returns the cost. */
export async function writeReadyCopy(itemId: string): Promise<number> {
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)).get();
  if (!item) return 0;
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, item.customerId)).get()!;
  const profile = db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.customerId, c.id)).orderBy(desc(schema.brandProfiles.version)).get();
  const d = JSON.parse(c.details || "{}") as Record<string, unknown>;
  const media = itemMedia(item);
  const isReel = item.type === "reel";
  const images = isReel ? await videoFrames(absPath(media[0])) : await Promise.all(media.slice(0, 8).map((m) => small(absPath(m))));
  const kind = isReel ? `a REEL (video). You get ${images.length} frames from it in order.` : media.length > 1 ? `a CAROUSEL with ${media.length} slides, shown in order.` : "a single-image POST.";
  const user = [
    businessFacts(c),
    d.caption_notes ? `EXTRA FACTS FROM THE AGENCY (true, use them):\n${String(d.caption_notes)}` : "",
    profile?.profileMd ? `BRAND PROFILE:\n${profile.profileMd.slice(0, 4000)}` : "",
    `The creative is ${kind} File name: ${JSON.parse(item.brief || "{}").file || ""}.`,
    "Write the copy now.",
  ].filter(Boolean).join("\n\n");
  const r = await visionJson<ReadyCopy>(SYSTEM, user, images);
  const x = r.data;
  const tags = (Array.isArray(x.hashtags) ? x.hashtags : []).map((h) => String(h).trim()).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)).slice(0, 12);
  const ig = [String(x.instagram_caption || "").trim(), tags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
  const prev = JSON.parse(item.copy || "{}");
  const copy = { ...prev, instagram_caption: ig, facebook_post: String(x.facebook_post || "").trim() || ig, hashtags: tags, alt_text: String(x.alt_text || "").slice(0, 1000), ad: x.ad || null, written_by: r.engine };
  // batches uploaded with "schedule automatically" go live as soon as their words are written
  const auto = JSON.parse(item.brief || "{}").autoSchedule === true && item.status === "ready_draft" && item.slotAt.getTime() > Date.now() + 5 * 60_000;
  db.update(schema.contentItems).set({ copy: JSON.stringify(copy), error: null, costUsd: (item.costUsd || 0) + r.costUsd, updatedAt: new Date(), ...(auto ? { status: "approved" } : {}) }).where(eq(schema.contentItems.id, item.id)).run();
  return r.costUsd;
}

/** Writes copy for several items one after another (background; errors land on the item). */
export async function writeReadyCopyAll(ids: string[]) {
  for (const id of ids) {
    try {
      db.update(schema.contentItems).set({ error: "Writing captions…", updatedAt: new Date() }).where(eq(schema.contentItems.id, id)).run();
      await writeReadyCopy(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("ready copy:", msg);
      db.update(schema.contentItems).set({ error: `Couldn’t write captions: ${msg.slice(0, 200)}` }).where(eq(schema.contentItems.id, id)).run();
    }
  }
}
