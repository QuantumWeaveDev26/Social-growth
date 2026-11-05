/**
 * Veo 3.1 image-to-video on Google Cloud (Gemini Enterprise Agent Platform, formerly Vertex AI).
 * Auth: a service-account key (JSON) in GOOGLE_SA_JSON_B64 (base64). Billed to that project's billing account.
 * Each scene image becomes a short vertical clip (no Veo audio: our voiceover + captions go on top in Remotion).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

type SA = { client_email: string; private_key: string; project_id: string; token_uri?: string };

export const VEO_MODEL = process.env.VEO_MODEL || "veo-3.1-fast-generate-001";
const LOCATION = process.env.VEO_LOCATION || "us-central1";
const CLIP_SECONDS = Number(process.env.VEO_CLIP_SECONDS || 8); // Veo allows 4, 6 or 8
const RESOLUTION = process.env.VEO_RESOLUTION || "720p";
/** List price per second (USD) for cost tracking: Fast video-only 720p = $0.08, 1080p = $0.10. */
/** Vertex list price per second of video without audio (cloud.google.com/vertex-ai/generative-ai/pricing, Nov 2026). */
export function veoPricePerSec(model: string, res = RESOLUTION) {
  const hd = res === "1080p";
  if (model.includes("lite")) return hd ? 0.05 : 0.03;
  if (model.includes("fast")) return hd ? 0.1 : 0.08;
  return 0.2;
}
const PRICE_PER_SEC = Number(process.env.VEO_PRICE_PER_SEC || veoPricePerSec(VEO_MODEL));
export const VEO_LITE_MODEL = process.env.VEO_LITE_MODEL || "veo-3.1-lite-generate-001";

function sa(): SA | null {
  const b64 = process.env.GOOGLE_SA_JSON_B64;
  if (!b64) return null;
  try { return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as SA; } catch { return null; }
}
export const veoConfigured = () => !!sa();

/** Whether this client's reels use Veo: everyone (REEL_VIDEO_ENGINE=veo) or switched on per client in admin. */
export function veoFor(customerId: string) {
  if (!veoConfigured()) return false;
  if (process.env.REEL_VIDEO_ENGINE === "veo") return true;
  return db.select().from(schema.kv).where(eq(schema.kv.key, `veo_for:${customerId}`)).get()?.value === "1";
}
export function setVeoFor(customerId: string, on: boolean) {
  db.insert(schema.kv).values({ key: `veo_for:${customerId}`, value: on ? "1" : "0" })
    .onConflictDoUpdate({ target: schema.kv.key, set: { value: on ? "1" : "0" } }).run();
}

let cached: { token: string; exp: number } | null = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const k = sa();
  if (!k) throw new Error("Veo isn't configured (GOOGLE_SA_JSON_B64 missing)");
  const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({ iss: k.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: k.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(k.private_key, "base64url");
  const res = await fetch(k.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description || j.error || res.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

const base = (model = VEO_MODEL) => {
  const k = sa()!;
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${k.project_id}/locations/${LOCATION}/publishers/google/models/${model}`;
};

async function call<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* keep raw text */ }
  if (!res.ok) throw new Error(`Veo ${res.status}: ${((j.error as { message?: string })?.message || text).slice(0, 300)}`);
  return j as T;
}

// ---------------------------------------------------------------- Imagen (images on the same Google Cloud project)
export const IMAGEN_MODEL = process.env.IMAGEN_MODEL || "imagen-4.0-generate-001";
const IMAGEN_PRICE = Number(process.env.IMAGEN_PRICE || (IMAGEN_MODEL.includes("fast") ? 0.02 : IMAGEN_MODEL.includes("ultra") ? 0.06 : 0.04));

/** Photorealistic image from Imagen 4. aspect: "1:1" | "3:4" | "4:3" | "9:16" | "16:9". */
export async function imagenImage(prompt: string, aspect: "1:1" | "3:4" | "4:3" | "9:16" | "16:9") {
  const k = sa();
  if (!k) throw new Error("Google image generation isn't configured (GOOGLE_SA_JSON_B64 missing)");
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${k.project_id}/locations/${LOCATION}/publishers/google/models/${IMAGEN_MODEL}:predict`;
  const r = await call<{ predictions?: Array<{ bytesBase64Encoded?: string; raiFilteredReason?: string }> }>(url, {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: aspect, personGeneration: "allow_adult", sampleImageSize: "2K", enhancePrompt: true, outputOptions: { mimeType: "image/png" } },
  });
  const p0 = r.predictions?.[0];
  if (!p0?.bytesBase64Encoded) throw new Error(`Imagen returned no image${p0?.raiFilteredReason ? `: ${p0.raiFilteredReason}` : " (blocked by safety filters)"}`);
  return { png: Buffer.from(p0.bytesBase64Encoded, "base64"), costUsd: IMAGEN_PRICE };
}

/**
 * Turns one still image into a vertical clip. Returns the MP4 bytes and its list-price cost.
 * Waits for Google's long-running operation (usually 1–3 minutes).
 */
export async function imageToVideo(imagePath: string, prompt: string, o: { seconds?: number; onWait?: (s: number) => void; model?: string } = {}) {
  const model = o.model || VEO_MODEL;
  const seconds = [4, 6, 8].includes(o.seconds ?? CLIP_SECONDS) ? (o.seconds ?? CLIP_SECONDS) : 8;
  // crop to an exact 9:16 frame first, so Veo fills the screen instead of adding black bars
  const sharp = (await import("sharp")).default;
  const img = (await sharp(fs.readFileSync(imagePath)).resize(1080, 1920, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer()).toString("base64");
  const mimeType = "image/jpeg";
  const op = await call<{ name: string }>(`${base(model)}:predictLongRunning`, {
    instances: [{ prompt, image: { bytesBase64Encoded: img, mimeType } }],
    parameters: { aspectRatio: "9:16", durationSeconds: seconds, resolution: RESOLUTION, generateAudio: false, sampleCount: 1, personGeneration: "allow_adult", enhancePrompt: true },
  });
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const st = await call<{ done?: boolean; error?: { message?: string }; response?: { videos?: Array<{ bytesBase64Encoded?: string; gcsUri?: string }>; raiMediaFilteredReasons?: string[]; raiMediaFilteredCount?: number } }>(
      `${base(model)}:fetchPredictOperation`, { operationName: op.name },
    );
    o.onWait?.(Math.round((Date.now() - started) / 1000));
    if (st.error) throw new Error(`Veo failed: ${st.error.message}`);
    if (st.done) {
      const v = st.response?.videos?.[0];
      if (!v?.bytesBase64Encoded) {
        const why = st.response?.raiMediaFilteredReasons?.join("; ");
        throw new Error(why ? `Veo blocked the clip: ${why}` : `Veo returned no video${v?.gcsUri ? " (only a storage link)" : ""}`);
      }
      return { mp4: Buffer.from(v.bytesBase64Encoded, "base64"), seconds, costUsd: seconds * (o.model ? Number(process.env.VEO_PRICE_PER_SEC || veoPricePerSec(model)) : PRICE_PER_SEC) };
    }
    if (Date.now() - started > 10 * 60_000) throw new Error("Veo took longer than 10 minutes");
  }
}

/**
 * Veo prompt for one scene, in Google's recommended order: action + subject, camera, style/atmosphere, then guardrails.
 * `motion` is the scene-specific direction written by the reel writer; `visual` (the still-image description) is context.
 */
export const motionPrompt = (visual: string, motion = "") => {
  const action = motion.trim() || `Natural, lively real-time movement in this scene: ${visual}. Slow push-in.`;
  return [
    action,
    `Scene context: ${visual}.`,
    "Style: photorealistic, filmed on a modern cinema camera, natural skin tones and textures, real-world physics, smooth 24fps motion, shallow depth of field.",
    "Continuity: start exactly from the provided image and keep the same people, hands, faces, products, place, colours and lighting; do not add new people, body parts or objects; no morphing.",
    "No text, letters, captions, signs with words, logos or watermarks. No dialogue or lip-sync.",
  ].join(" ");
};

/** Admin test: films one clip from this client's most recent image and records the result. */
export async function runVeoTest(customerId: string) {
  const { saveFile, absPath } = await import("./storage");
  const { desc, and, isNotNull } = await import("drizzle-orm");
  const set = (v: Record<string, unknown>) => {
    const value = JSON.stringify({ ...v, at: Date.now() });
    db.insert(schema.kv).values({ key: `veo_test:${customerId}`, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run();
  };
  const item = db.select().from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customerId), isNotNull(schema.contentItems.thumbPath)))
    .orderBy(desc(schema.contentItems.updatedAt)).get();
  if (!item?.thumbPath) { set({ status: "failed", error: "This client has no images yet to film." }); return; }
  set({ status: "running", source: item.thumbPath });
  try {
    const brief = JSON.parse(item.brief || "{}");
    const v = await imageToVideo(absPath(item.thumbPath), motionPrompt(String(brief.topic || brief.title || "the scene in the photo")), {
      onWait: (sec) => set({ status: "running", source: item.thumbPath, waited: sec }),
    });
    const out = saveFile(`${customerId}/veo-test/test-${Date.now()}.mp4`, v.mp4);
    set({ status: "done", path: out, source: item.thumbPath, costUsd: v.costUsd, model: VEO_MODEL });
  } catch (e) {
    set({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 400), source: item.thumbPath });
  }
}

/** Admin test: the same image and motion directions filmed by Veo 3.1 Fast and Veo 3.1 Lite, side by side. */
export async function runVeoCompare(customerId: string) {
  const { saveFile, absPath } = await import("./storage");
  const { desc, and, isNotNull } = await import("drizzle-orm");
  const key = `veo_compare:${customerId}`;
  let state: Record<string, unknown> = {};
  const set = (v: Record<string, unknown>) => {
    state = { ...state, ...v, at: Date.now() };
    const value = JSON.stringify(state);
    db.insert(schema.kv).values({ key, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run();
  };
  const item = db.select().from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customerId), isNotNull(schema.contentItems.thumbPath)))
    .orderBy(desc(schema.contentItems.updatedAt)).get();
  if (!item?.thumbPath) { set({ status: "failed", error: "This client has no images yet to film." }); return; }
  set({ status: "running", source: item.thumbPath, resolution: RESOLUTION });
  const brief = JSON.parse(item.brief || "{}");
  const prompt = motionPrompt(String(brief.topic || brief.title || "the scene in the photo"));
  const one = async (label: "fast" | "lite", model: string) => {
    const t0 = Date.now();
    try {
      const v = await imageToVideo(absPath(item.thumbPath!), prompt, { model });
      const path = saveFile(`${customerId}/veo-test/compare-${label}-${Date.now()}.mp4`, v.mp4);
      set({ [label]: { model, path, costUsd: v.costUsd, seconds: Math.round((Date.now() - t0) / 1000) } });
    } catch (e) {
      set({ [label]: { model, error: String(e instanceof Error ? e.message : e).slice(0, 300) } });
    }
  };
  await Promise.all([one("fast", VEO_MODEL.includes("lite") ? "veo-3.1-fast-generate-001" : VEO_MODEL), one("lite", VEO_LITE_MODEL)]);
  set({ status: "done" });
}

type CompareSide = { model: string; path?: string; costUsd?: number; seconds?: number; error?: string };
export function veoCompareResult(customerId: string) {
  const v = db.select().from(schema.kv).where(eq(schema.kv.key, `veo_compare:${customerId}`)).get()?.value;
  return v ? (JSON.parse(v) as { status: string; error?: string; resolution?: string; fast?: CompareSide; lite?: CompareSide; at: number }) : null;
}

export function veoTestResult(customerId: string) {
  const v = db.select().from(schema.kv).where(eq(schema.kv.key, `veo_test:${customerId}`)).get()?.value;
  return v ? (JSON.parse(v) as { status: string; path?: string; error?: string; waited?: number; costUsd?: number; model?: string; at: number }) : null;
}

// ---------------------------------------------------------------- Gemini text (same Google Cloud project)
export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
/** List prices per 1M tokens for cost tracking (override with GEMINI_PRICE_IN / GEMINI_PRICE_OUT). */
const G_IN = Number(process.env.GEMINI_PRICE_IN || 0.3);
const G_OUT = Number(process.env.GEMINI_PRICE_OUT || 2.5);

export async function geminiJson(system: string, user: string, model = GEMINI_TEXT_MODEL) {
  const k = sa();
  if (!k) throw new Error("Gemini isn't configured (GOOGLE_SA_JSON_B64 missing)");
  const loc = process.env.GEMINI_LOCATION || "global";
  const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${k.project_id}/locations/${loc}/publishers/google/models/${model}:generateContent`;
  const r = await call<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }>(url, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: 16384 },
  });
  const text = r.candidates?.[0]?.content?.parts?.map((x) => x.text || "").join("") || "";
  if (!text) throw new Error(`Gemini returned no text (${r.candidates?.[0]?.finishReason || "no candidates"})`);
  const u = r.usageMetadata || {};
  const costUsd = ((u.promptTokenCount || 0) * G_IN + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * G_OUT) / 1e6;
  return { text, costUsd };
}
