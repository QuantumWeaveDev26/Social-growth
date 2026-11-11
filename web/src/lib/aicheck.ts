/**
 * Admin "AI check": one small writing call and one image on the live server, so the team can see that
 * Google (Gemini text + Gemini image) works before a demo. Costs about ₹10.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { chatJson, generateImage } from "./ai";
import { saveFile } from "./storage";

type Step = { ok: boolean; model?: string; ms: number; detail: string; path?: string };
export type AiCheck = { status: "queued" | "running" | "done"; at: number; text?: Step; image?: Step };

const KEY = "ai_check";
const save = (v: AiCheck) => {
  const value = JSON.stringify(v);
  db.insert(schema.kv).values({ key: KEY, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run();
};
export const aiCheckResult = (): AiCheck | null => {
  try { const v = db.select().from(schema.kv).where(eq(schema.kv.key, KEY)).get()?.value; return v ? JSON.parse(v) : null; } catch { return null; }
};
export const queueAiCheck = () => save({ status: "queued", at: Date.now() });

export async function runAiCheck() {
  const state: AiCheck = { status: "running", at: Date.now() };
  save(state);
  let t = Date.now();
  try {
    const r = await chatJson<{ headline: string }>("You write short ad headlines. Return JSON {\"headline\": string}.", "One headline for a cosy neighbourhood café in Bengaluru.");
    state.text = { ok: true, model: r.engine, ms: Date.now() - t, detail: String(r.data.headline || "").slice(0, 120) };
  } catch (e) {
    state.text = { ok: false, ms: Date.now() - t, detail: String(e instanceof Error ? e.message : e).slice(0, 600) };
  }
  save(state);
  t = Date.now();
  try {
    const img = await generateImage("A warm, inviting photo of a cup of filter coffee on a wooden café table, morning light, no text.", "4:5");
    const path = saveFile(`ai-check/check-${Date.now()}.png`, img.png);
    state.image = { ok: true, ms: Date.now() - t, detail: `$${img.costUsd.toFixed(3)} · 1080×1350`, path };
  } catch (e) {
    state.image = { ok: false, ms: Date.now() - t, detail: String(e instanceof Error ? e.message : e).slice(0, 700) };
  }
  save({ ...state, status: "done", at: Date.now() });
}
