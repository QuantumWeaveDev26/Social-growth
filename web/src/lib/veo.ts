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
const PRICE_PER_SEC = Number(process.env.VEO_PRICE_PER_SEC || (VEO_MODEL.includes("lite") ? 0.03 : VEO_MODEL.includes("fast") ? (RESOLUTION === "1080p" ? 0.1 : 0.08) : 0.2));

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

const base = () => {
  const k = sa()!;
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${k.project_id}/locations/${LOCATION}/publishers/google/models/${VEO_MODEL}`;
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

/**
 * Turns one still image into a vertical clip. Returns the MP4 bytes and its list-price cost.
 * Waits for Google's long-running operation (usually 1–3 minutes).
 */
export async function imageToVideo(imagePath: string, prompt: string, o: { seconds?: number; onWait?: (s: number) => void } = {}) {
  const seconds = [4, 6, 8].includes(o.seconds ?? CLIP_SECONDS) ? (o.seconds ?? CLIP_SECONDS) : 8;
  const img = fs.readFileSync(imagePath).toString("base64");
  const mimeType = imagePath.toLowerCase().endsWith(".jpg") || imagePath.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
  const op = await call<{ name: string }>(`${base()}:predictLongRunning`, {
    instances: [{ prompt, image: { bytesBase64Encoded: img, mimeType } }],
    parameters: { aspectRatio: "9:16", durationSeconds: seconds, resolution: RESOLUTION, generateAudio: false, sampleCount: 1, personGeneration: "allow_adult", enhancePrompt: true },
  });
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const st = await call<{ done?: boolean; error?: { message?: string }; response?: { videos?: Array<{ bytesBase64Encoded?: string; gcsUri?: string }>; raiMediaFilteredReasons?: string[]; raiMediaFilteredCount?: number } }>(
      `${base()}:fetchPredictOperation`, { operationName: op.name },
    );
    o.onWait?.(Math.round((Date.now() - started) / 1000));
    if (st.error) throw new Error(`Veo failed: ${st.error.message}`);
    if (st.done) {
      const v = st.response?.videos?.[0];
      if (!v?.bytesBase64Encoded) {
        const why = st.response?.raiMediaFilteredReasons?.join("; ");
        throw new Error(why ? `Veo blocked the clip: ${why}` : `Veo returned no video${v?.gcsUri ? " (only a storage link)" : ""}`);
      }
      return { mp4: Buffer.from(v.bytesBase64Encoded, "base64"), seconds, costUsd: seconds * PRICE_PER_SEC };
    }
    if (Date.now() - started > 10 * 60_000) throw new Error("Veo took longer than 10 minutes");
  }
}

/** Motion direction for a scene, built from its still-image description. */
export const motionPrompt = (visual: string) =>
  `Animate this exact photograph into a realistic, smooth vertical video. Keep the same people, products, place, colours and lighting. ` +
  `Gentle cinematic camera movement (slow push-in or subtle pan) with natural motion in the scene: ${visual}. ` +
  `Photorealistic, steady, no cuts, no new objects, no text, letters, captions, logos or watermarks.`;

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

export function veoTestResult(customerId: string) {
  const v = db.select().from(schema.kv).where(eq(schema.kv.key, `veo_test:${customerId}`)).get()?.value;
  return v ? (JSON.parse(v) as { status: string; path?: string; error?: string; waited?: number; costUsd?: number; model?: string; at: number }) : null;
}
