/**
 * Knowledge bank: BrandMint's private creative rules (hooks, reel frameworks, post formats, visuals, industries, quality).
 * Stored in the database (never in the public repo), edited at Admin → Knowledge, and added to every writing step.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const KB_SECTIONS = [
  { id: "core", label: "Core rules", hint: "Truth, one goal per asset, CTA routing, tone meanings. Used by every step." },
  { id: "strategy", label: "Audience, offers and month plan", hint: "Brand profile and month plan." },
  { id: "hooks", label: "Hooks", hint: "Hook library and selection test. Posts and reels." },
  { id: "reels", label: "Reel frameworks", hint: "4-scene, 30-second frameworks with full examples. Reels." },
  { id: "posts", label: "Image post formats", hint: "Post formats with full examples. Posts." },
  { id: "visuals", label: "Visuals and filmmaking", hint: "Image prompts, Veo motion, realism rules. Posts and reels." },
  { id: "captions", label: "Captions and CTAs", hint: "Caption structures, CTA library, languages. Posts and reels." },
  { id: "industries", label: "Industry playbooks", hint: "Per-industry pains, ideas, best CTA, never-say. Every step." },
  { id: "quality", label: "Quality check and compliance", hint: "Hard gates, 0–10 score, compliance. Editor step." },
  { id: "linkedin", label: "LinkedIn playbook", hint: "Hooks, structures and formatting for LinkedIn posts. Built from Admin → Creator study. LinkedIn posts." },
] as const;
export type KbId = (typeof KB_SECTIONS)[number]["id"];

/** Which sections each writing step reads. */
const STAGE: Record<string, KbId[]> = {
  brand_profile: ["core", "strategy", "industries"],
  month_plan: ["core", "strategy", "hooks", "industries"],
  post: ["core", "hooks", "posts", "visuals", "captions", "industries"],
  reel: ["core", "hooks", "reels", "visuals", "captions", "industries"],
  editor: ["core", "captions", "quality", "industries"],
  linkedin_post: ["core", "hooks", "linkedin", "captions", "industries"],
};

export const kbGet = (id: string) => db.select().from(schema.kv).where(eq(schema.kv.key, `kb:${id}`)).get()?.value || "";
export function kbSet(id: string, text: string) {
  db.insert(schema.kv).values({ key: `kb:${id}`, value: text }).onConflictDoUpdate({ target: schema.kv.key, set: { value: text } }).run();
}

/** The knowledge text for one writing step (empty when nothing is uploaded). */
export function knowledgeFor(stage: string) {
  const parts = (STAGE[stage] || []).map((id) => [id, kbGet(id)] as const).filter(([, t]) => t.trim());
  if (!parts.length) return "";
  return "=== BRANDMINT KNOWLEDGE BANK (house rules; follow them, adapt examples, never copy example businesses or facts) ===\n" +
    parts.map(([id, t]) => `--- ${KB_SECTIONS.find((s) => s.id === id)?.label} ---\n${t.trim()}`).join("\n\n");
}

/** Splits an uploaded file that uses "=== SECTION: id ===" markers into sections. */
export function splitUpload(text: string) {
  const out: Partial<Record<KbId, string>> = {};
  const re = /^=== SECTION: ([a-z]+) ===\s*$/gm;
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const id = m[1] as KbId;
    if (!KB_SECTIONS.some((s) => s.id === id)) return;
    out[id] = text.slice((m.index ?? 0) + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
  });
  return out;
}
