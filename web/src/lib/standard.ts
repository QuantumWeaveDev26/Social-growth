/**
 * The content standard's media side (see playbooks/saas/standard.md):
 *  - owner photos: described once, offered to the writer by number, used as real visuals (children never)
 *  - voice: a natural regional voice (Gemini TTS, Indian English for Indian businesses), ElevenLabs as fallback
 *  - music: a real-instrument Lyria bed under every reel
 *  - posts made from an owner photo: the real photo + headline overlay (no AI re-drawing of the photo)
 */
import fs from "node:fs";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { absPath } from "./storage";
import { textToSpeech, type Alignment } from "./ai";
import { veoConfigured, describePhoto, geminiSpeech, lyriaMusic } from "./veo";

type Customer = typeof schema.customers.$inferSelect;
export type OwnerPhoto = { n: number; path: string; desc: string; child: boolean };

const details = (c: Customer) => JSON.parse(c.details || "{}") as Record<string, unknown>;

/** The owner's photos with a one-line description each (described once, then cached in details.photo_notes). */
export async function ownerPhotos(customerId: string): Promise<{ photos: OwnerPhoto[]; costUsd: number }> {
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  if (!c) return { photos: [], costUsd: 0 };
  const d = details(c);
  const paths: string[] = Array.isArray(d.photos) ? (d.photos as string[]) : [];
  const notes = (d.photo_notes && typeof d.photo_notes === "object" ? d.photo_notes : {}) as Record<string, { desc: string; child: boolean }>;
  let cost = 0, changed = false;
  if (veoConfigured()) {
    for (const p of paths) {
      if (notes[p]) continue;
      try {
        const jpg = await sharp(fs.readFileSync(absPath(p))).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
        const r = await describePhoto(jpg);
        notes[p] = { desc: r.desc || "a photo from the business", child: r.child };
        cost += r.costUsd; changed = true;
      } catch (e) { console.error("describe photo:", e instanceof Error ? e.message : e); }
    }
  }
  if (changed) {
    // re-read before writing so a concurrent edit of the business form isn't lost
    const fresh = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
    const fd = fresh ? details(fresh) : d;
    fd.photo_notes = { ...((fd.photo_notes as object) || {}), ...notes };
    db.update(schema.customers).set({ details: JSON.stringify(fd) }).where(eq(schema.customers.id, customerId)).run();
  }
  return { photos: paths.map((p, i) => ({ n: i + 1, path: p, desc: notes[p]?.desc || "a photo from the business", child: !!notes[p]?.child })), costUsd: cost };
}

/** Lines for BUSINESS FACTS: what each owner photo shows, by number. */
export function photoLines(photos: OwnerPhoto[]) {
  if (!photos.length) return "";
  return "OWNER PHOTOS (real; pick by number in \"photo\"; never the ones marked child):\n" + photos.map((p) => `${p.n}. ${p.desc}${p.child ? " (shows a child: never use)" : ""}`).join("\n");
}

/** A usable owner photo for a writer's pick, or null. */
export function pickPhoto(photos: OwnerPhoto[], n: unknown) {
  const i = Number(n);
  const p = Number.isInteger(i) ? photos.find((x) => x.n === i) : undefined;
  return p && !p.child && fs.existsSync(absPath(p.path)) ? p : null;
}

/** An owner photo cropped to a frame (cover, gently centred). */
export async function photoFrame(p: OwnerPhoto, w: number, h: number) {
  return sharp(fs.readFileSync(absPath(p.path))).rotate().resize(w, h, { fit: "cover", position: sharp.strategy.attention }).png().toBuffer();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function wrap(text: string, maxChars: number) {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + w).trim().length > maxChars && line) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

/** A 4:5 post from a real owner photo: the photo untouched, a soft top shade, the problem headline and the solution line. */
export async function photoPost(p: OwnerPhoto, headline: string, sub: string, accent: string) {
  const W = 1080, H = 1350;
  const base = await photoFrame(p, W, H);
  const hl = wrap(headline, 18).slice(0, 3), sl = wrap(sub, 40).slice(0, 2);
  // bold sans is ~0.6 em per character: size the headline so its longest line fits 950 px
  const longest = Math.max(...hl.map((l) => l.length), 1);
  const hSize = Math.min(88, Math.floor(950 / (longest * 0.62)));
  let y = 120;
  const tspans = hl.map((l) => { const s = `<text x="64" y="${y + hSize}" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="${hSize}" fill="#ffffff">${esc(l)}</text>`; y += hSize * 1.08; return s; }).join("");
  y += 18;
  const subs = sl.map((l) => { const s = `<text x="64" y="${y + 38}" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="38" fill="#f1f1ea">${esc(l)}</text>`; y += 50; return s; }).join("");
  const shade = Math.min(H, y + 220);
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.72"/><stop offset="${(y / shade).toFixed(2)}" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="${shade}" fill="url(#g)"/><rect x="64" y="96" width="120" height="10" rx="5" fill="${esc(accent)}"/>${tspans}${subs}</svg>`;
  return sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

// ---------------------------------------------------------------- voice
function wav(pcm: Buffer, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** Trim leading/trailing near-silence from 16-bit mono PCM. */
function trimPcm(pcm: Buffer, rate = 24000) {
  const n = Math.floor(pcm.length / 2), thr = 500, pad = Math.round(rate * 0.04);
  let a = 0, b = n - 1;
  while (a < n && Math.abs(pcm.readInt16LE(a * 2)) < thr) a++;
  while (b > a && Math.abs(pcm.readInt16LE(b * 2)) < thr) b--;
  return pcm.subarray(Math.max(0, a - pad) * 2, Math.min(n, b + pad) * 2);
}

const VOICES = { female: process.env.GEMINI_VOICE_FEMALE || "Kore", male: process.env.GEMINI_VOICE_MALE || "Orus" };

function speakingStyle(c: Customer) {
  const d = details(c);
  const lang = String(d.language || "English").trim();
  const indian = /india|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|kochi|jaipur|ahmedabad|karnataka|telangana|kerala|tamil|maharashtra/i.test(`${d.city || ""} ${d.address || ""} ${c.businessName}`) || !d.city;
  if (/^english/i.test(lang)) {
    return indian
      ? "Read this as a warm, confident Indian English speaker — a natural urban Indian accent, friendly and clear, like a respected local business owner talking to customers. Natural conversational pace, slightly upbeat"
      : "Read this as a warm, friendly local speaker with a natural accent, clear and conversational";
  }
  return `Read this naturally in ${lang}, as a warm, friendly local speaker, clear and conversational`;
}

/**
 * The reel voiceover. Gemini TTS sentence by sentence (natural regional voice; exact sentence timings for the
 * captions), falling back to ElevenLabs. Returns audio + an ElevenLabs-style alignment for the caption code.
 */
export async function voiceover(c: Customer, script: string): Promise<{ audio: Buffer; ext: "wav" | "mp3"; alignment: Alignment; costUsd: number; engine: string }> {
  if (process.env.VOICE_ENGINE !== "elevenlabs" && veoConfigured()) {
    try {
      const d = details(c);
      const voice = String(d.voice || "").toLowerCase() === "male" ? VOICES.male : VOICES.female;
      const style = speakingStyle(c);
      const sentences = script.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [script];
      const rate = 24000, gap = Buffer.alloc(Math.round(rate * 0.2) * 2);
      const parts: Buffer[] = [];
      const al: Alignment = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
      let t = 0.15; parts.push(Buffer.alloc(Math.round(rate * 0.15) * 2));
      for (const s of sentences) {
        let pcm: Buffer | null = null;
        for (let a = 0; a < 3 && !pcm; a++) {
          try { pcm = trimPcm(await geminiSpeech(s, voice, style)); } catch (e) { if (a === 2) throw e; await new Promise((r) => setTimeout(r, 4000 * (a + 1))); }
        }
        const dur = pcm!.length / 2 / rate;
        // spread this sentence's characters over its real duration (good enough for phrase captions)
        const chars = (s + " ").split("");
        chars.forEach((ch, i) => { al.characters.push(ch); al.character_start_times_seconds.push(t + (dur * i) / chars.length); al.character_end_times_seconds.push(t + (dur * (i + 1)) / chars.length); });
        parts.push(pcm!, gap); t += dur + 0.2;
      }
      return { audio: wav(Buffer.concat(parts), rate), ext: "wav", alignment: al, costUsd: (script.length / 1000) * 0.08, engine: "gemini" };
    } catch (e) {
      console.error("Gemini voice failed, using ElevenLabs:", e instanceof Error ? e.message : e);
    }
  }
  const r = await textToSpeech(script);
  return { audio: r.mp3, ext: "mp3", alignment: r.alignment, costUsd: r.costUsd, engine: "elevenlabs" };
}

/** A real-instrument music bed for a reel (null if Google isn't set up or Lyria fails; the reel still renders). */
export async function musicBed(mood: string): Promise<{ wav: Buffer; costUsd: number } | null> {
  if (process.env.REEL_MUSIC === "off" || !veoConfigured()) return null;
  try { return { wav: await lyriaMusic(mood || "warm, uplifting acoustic guitar and light percussion, 100 BPM"), costUsd: 0.06 }; }
  catch (e) { console.error("music:", e instanceof Error ? e.message : e); return null; }
}
