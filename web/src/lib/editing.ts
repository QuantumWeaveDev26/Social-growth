/**
 * AI video editing: the edit plan that drives the ReelPro Remotion composition, and the change router
 * that picks the cheapest way to apply a customer's note. Values must match video/src/ReelPro.tsx.
 */
import { chatJson } from "./ai";

export const STYLES = ["warm", "expert", "playful", "premium"] as const;
export const MOTIONS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up"] as const;
export const TEXT_ANIMS = ["rise", "pop", "words", "slide", "type"] as const;
export const TRANSITIONS = ["fade", "slide_up", "slide_left", "wipe", "flip", "iris", "clock_wipe", "zoom_punch", "light_leak", "cut"] as const;
export const CAPTION_STYLES = ["highlight", "pop", "underline", "minimal"] as const;

export type Style = (typeof STYLES)[number];
export type EditPlan = {
  style: Style;
  hook: string;
  scenes: Array<{ motion: (typeof MOTIONS)[number]; text_anim: (typeof TEXT_ANIMS)[number] }>;
  transitions: Array<(typeof TRANSITIONS)[number]>;
  caption_style: (typeof CAPTION_STYLES)[number];
  end_card: { cta: string; line: string };
};

const DEFAULTS: Record<Style, Omit<EditPlan, "hook" | "end_card">> = {
  warm: { style: "warm", scenes: [{ motion: "zoom_in", text_anim: "rise" }, { motion: "pan_right", text_anim: "rise" }, { motion: "zoom_out", text_anim: "pop" }, { motion: "pan_up", text_anim: "pop" }], transitions: ["light_leak", "slide_up", "fade"], caption_style: "highlight" },
  expert: { style: "expert", scenes: [{ motion: "zoom_in", text_anim: "slide" }, { motion: "pan_left", text_anim: "slide" }, { motion: "zoom_in", text_anim: "slide" }, { motion: "zoom_out", text_anim: "slide" }], transitions: ["wipe", "slide_left", "clock_wipe"], caption_style: "underline" },
  playful: { style: "playful", scenes: [{ motion: "zoom_in", text_anim: "pop" }, { motion: "pan_right", text_anim: "pop" }, { motion: "zoom_out", text_anim: "pop" }, { motion: "zoom_in", text_anim: "pop" }], transitions: ["zoom_punch", "flip", "slide_up"], caption_style: "pop" },
  premium: { style: "premium", scenes: [{ motion: "zoom_in", text_anim: "type" }, { motion: "pan_left", text_anim: "rise" }, { motion: "zoom_out", text_anim: "rise" }, { motion: "pan_up", text_anim: "rise" }], transitions: ["fade", "wipe", "fade"], caption_style: "minimal" },
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const words = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().split(" ").slice(0, max).join(" ");

export const styleForTone = (tone?: string | null): Style => pick(tone, STYLES, "warm");

/** Coerces whatever the model returned into a valid plan for `sceneCount` scenes. */
export function sanitizePlan(raw: unknown, sceneCount: number, tone?: string | null): EditPlan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const style = pick(r.style, STYLES, styleForTone(tone));
  const d = DEFAULTS[style];
  const rs = Array.isArray(r.scenes) ? (r.scenes as Array<Record<string, unknown>>) : [];
  const scenes = Array.from({ length: sceneCount }, (_, i) => {
    const def = d.scenes[i % d.scenes.length];
    return { motion: pick(rs[i]?.motion, MOTIONS, def.motion), text_anim: pick(rs[i]?.text_anim, TEXT_ANIMS, def.text_anim) };
  });
  // neighbouring scenes never share a camera move
  for (let i = 1; i < scenes.length; i++) if (scenes[i].motion === scenes[i - 1].motion) scenes[i].motion = MOTIONS[(MOTIONS.indexOf(scenes[i].motion) + 1) % MOTIONS.length];
  const rt = Array.isArray(r.transitions) ? r.transitions : [];
  const transitions = Array.from({ length: Math.max(0, sceneCount - 1) }, (_, i) => pick(rt[i], TRANSITIONS, d.transitions[i % d.transitions.length]));
  const ec = (r.end_card && typeof r.end_card === "object" ? r.end_card : {}) as Record<string, unknown>;
  return {
    style, scenes, transitions,
    hook: words(r.hook, 6),
    caption_style: pick(r.caption_style, CAPTION_STYLES, d.caption_style),
    end_card: { cta: words(ec.cta, 5), line: words(ec.line, 8) },
  };
}

/** Asks the editor model for a plan (≈ $0.002). Falls back to the style defaults if the call fails. */
export async function makeEditPlan(o: {
  system: string; copy: Record<string, unknown>; tone?: string | null; feedback?: string | null; previous?: unknown;
}): Promise<{ plan: EditPlan; costUsd: number }> {
  const scenes = (o.copy.scenes as Array<Record<string, string>>) || [];
  const user = [
    `BRAND TONE: ${styleForTone(o.tone)}`,
    `SCRIPT:\n${JSON.stringify({ cover_text: o.copy.cover_text, vo_script: o.copy.vo_script, scenes: scenes.map((s) => ({ on_screen_text: s.on_screen_text, spoken: s.spoken, picture: s.visual_prompt })) })}`,
    o.previous ? `PREVIOUS EDIT PLAN:\n${JSON.stringify(o.previous)}` : "",
    o.feedback ? `CUSTOMER FEEDBACK (must be applied): ${o.feedback}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const r = await chatJson<Record<string, unknown>>(o.system, user);
    return { plan: sanitizePlan(r.data, scenes.length || 4, o.tone), costUsd: r.costUsd };
  } catch {
    return { plan: sanitizePlan(o.previous ?? {}, scenes.length || 4, o.tone), costUsd: 0 };
  }
}

export type Route = { route: "restyle" | "text" | "voice" | "scenes" | "full"; scenes: number[]; reason: string };

/** Picks the smallest change that applies the customer's note. Unknown or failed → full remake. */
export async function routeChange(o: { system: string; type: "post" | "reel"; note: string; copy: Record<string, unknown> }): Promise<{ route: Route; costUsd: number }> {
  const allowed = o.type === "reel" ? ["restyle", "text", "voice", "scenes", "full"] : ["text", "full"];
  try {
    const summary = o.type === "reel"
      ? { scenes: ((o.copy.scenes as Array<Record<string, string>>) || []).map((s, i) => ({ n: i + 1, on_screen_text: s.on_screen_text, picture: s.visual_prompt })), cover_text: o.copy.cover_text }
      : { on_image_text: o.copy.on_image_text, picture: o.copy.image_prompt };
    const r = await chatJson<Record<string, unknown>>(o.system, `TYPE: ${o.type}\nCURRENT: ${JSON.stringify(summary)}\nCUSTOMER NOTE: ${o.note}`);
    const route = allowed.includes(String(r.data.route)) ? (String(r.data.route) as Route["route"]) : "full";
    const scenes = (Array.isArray(r.data.scenes) ? r.data.scenes : []).map(Number).filter((n) => n >= 1 && n <= 4);
    return { route: { route: route === "scenes" && !scenes.length ? "full" : route, scenes, reason: String(r.data.reason || "") }, costUsd: r.costUsd };
  } catch {
    return { route: { route: "full", scenes: [], reason: "router unavailable" }, costUsd: 0 };
  }
}
