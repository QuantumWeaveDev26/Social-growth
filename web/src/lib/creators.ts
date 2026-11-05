/**
 * Creator Study: learn LinkedIn writing patterns from business creators the team admires.
 *
 * Collection is manual on purpose: a team member copies a creator's recent posts from their own
 * browser and pastes them here. BrandMint never visits or scrapes LinkedIn (LinkedIn's User Agreement
 * bans scraping, and its API gives no access to other people's posts).
 *
 * The pasted text is only used for the analysis and is deleted afterwards. What we keep are patterns
 * written as reusable templates, never the creator's own sentences.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { chatJson } from "./ai";
import { enqueue } from "./jobs";

export type Creator = { id: string; name: string; url?: string; notes?: string; addedAt: number };
export type Study = { status: "queued" | "running" | "done" | "failed"; at: number; chars?: number; report?: CreatorReport; error?: string; engine?: string; costUsd?: number };
export type Synthesis = { status: "queued" | "running" | "done" | "failed"; at: number; creatorIds?: string[]; markdown?: string; error?: string };

export type CreatorReport = {
  posts_analysed: number;
  summary: string;
  posting_rhythm?: string;
  hook_patterns: { name: string; template: string; why_it_works: string; share_pct?: number }[];
  structures: { name: string; outline: string; used_for: string }[];
  formatting: { typical_length_words?: string; line_breaks?: string; emoji?: string; hashtags?: string; lists?: string; other?: string };
  topics: { theme: string; share_pct?: number }[];
  ctas: { pattern: string; how_often?: string }[];
  voice: { tone: string; signature_moves: string[] };
  signature_lines?: { template: string; used_for: string }[];
  best_performers?: { what: string; why: string }[];
  adapt_for_small_business: string[];
  avoid: string[];
};

const kvGet = (key: string) => db.select().from(schema.kv).where(eq(schema.kv.key, key)).get()?.value;
const kvSet = (key: string, value: string) =>
  db.insert(schema.kv).values({ key, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value } }).run();
const kvDel = (key: string) => db.delete(schema.kv).where(eq(schema.kv.key, key)).run();
const read = <T>(key: string): T | null => { try { const v = kvGet(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };

export const MAX_PASTE = 120_000; // characters per study (about 40–60 posts)

export const listCreators = () => read<Creator[]>("creators") || [];
export const getCreator = (id: string) => listCreators().find((c) => c.id === id) || null;
export const getStudy = (id: string) => read<Study>(`creator_study:${id}`);
export const getSynthesis = () => read<Synthesis>("creator_synthesis");

export function addCreator(name: string, url?: string, notes?: string) {
  const c: Creator = { id: crypto.randomUUID().slice(0, 8), name: name.trim().slice(0, 80), url: url?.trim().slice(0, 200) || undefined, notes: notes?.trim().slice(0, 500) || undefined, addedAt: Date.now() };
  kvSet("creators", JSON.stringify([...listCreators(), c]));
  return c;
}

export function removeCreator(id: string) {
  kvSet("creators", JSON.stringify(listCreators().filter((c) => c.id !== id)));
  kvDel(`creator_study:${id}`);
  kvDel(`creator_raw:${id}`);
}

/** Saves the pasted posts for one run and queues the analysis. */
export function queueStudy(id: string, pasted: string) {
  const text = pasted.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_PASTE);
  kvSet(`creator_raw:${id}`, text);
  kvSet(`creator_study:${id}`, JSON.stringify({ ...(getStudy(id) || {}), status: "queued", at: Date.now(), chars: text.length, error: undefined } satisfies Study));
  enqueue("creator_study", { creatorId: id });
}

export function queueSynthesis() {
  kvSet("creator_synthesis", JSON.stringify({ ...(getSynthesis() || {}), status: "queued", at: Date.now(), error: undefined } satisfies Synthesis));
  enqueue("creator_synthesis", {});
}

const STUDY_SYSTEM = `You are a LinkedIn content strategist studying one creator's recent posts so a content team can learn from their craft.
The input is raw text copied from the creator's LinkedIn activity page. It contains noise (navigation, "Like Comment Repost", reshared posts by others, comments, ads, "…see more"). Ignore the noise and anything not written by this creator.

Rules:
- Describe PATTERNS, not content. Write every hook and structure as a reusable template with [placeholders], e.g. "I [did surprising thing] for [time]. Here's what happened:".
- Never quote more than 8 consecutive words from any post. Do not reproduce their stories, numbers or claims.
- Only report engagement-based "best performers" if reaction/comment counts are actually visible in the text; otherwise leave that list empty.
- share_pct values are your estimate of how often a pattern appears among the posts (0–100), only when you can tell. Patterns can overlap, so they need not add up to 100.
- "posting_rhythm": work it out from the relative timestamps on each post (e.g. "1h", "2d", "1w", "1mo"). Count how many posts fall in the last 7 days and the last 30 days and state it plainly, e.g. "about 1 a day, sometimes 2". Do not claim more than the timestamps show.
- "typical_length_words": estimate from the actual posts and give the usual range plus the occasional long ones, e.g. "80–200 words; a few long posts of 350+".
- "signature_lines": the creator's recurring pivot, transition and closing lines (the moves they reuse across many posts), written as short templates with [placeholders], e.g. "But here's the [catch] nobody is talking about." Only lines that recur in 3 or more posts. Each template must stay under 12 words. Generalise them into a move anyone could use; never reproduce the creator's own tagline, sign-off or community/newsletter plug, even with a placeholder (describe that habit under "ctas" instead).
- "adapt_for_small_business": concrete rules for using these patterns in posts for Indian small businesses (cafés, salons, clinics, gyms, boutiques, D2C brands, tutors), written for the business owner's own LinkedIn profile or Company Page. Talk in things an owner actually sees: walk-ins, bookings, WhatsApp enquiries, repeat customers, reviews, busy hours. No corporate metrics such as "conversion lift", CAC or funnels.
- "avoid": things this creator does that would not suit small businesses, or that read as hype/bait.

Return JSON exactly in this shape:
{"posts_analysed": number, "summary": string, "posting_rhythm": string,
 "hook_patterns": [{"name": string, "template": string, "why_it_works": string, "share_pct": number}],
 "structures": [{"name": string, "outline": string, "used_for": string}],
 "formatting": {"typical_length_words": string, "line_breaks": string, "emoji": string, "hashtags": string, "lists": string, "other": string},
 "topics": [{"theme": string, "share_pct": number}],
 "ctas": [{"pattern": string, "how_often": string}],
 "voice": {"tone": string, "signature_moves": [string]},
 "signature_lines": [{"template": string, "used_for": string}],
 "best_performers": [{"what": string, "why": string}],
 "adapt_for_small_business": [string], "avoid": [string]}`;

export async function runCreatorStudy(id: string) {
  const creator = getCreator(id);
  const raw = kvGet(`creator_raw:${id}`) || "";
  const prev = getStudy(id) || ({} as Study);
  const save = (s: Partial<Study>) => kvSet(`creator_study:${id}`, JSON.stringify({ ...prev, ...s, at: Date.now() }));
  if (!creator) { kvDel(`creator_raw:${id}`); return; }
  if (raw.length < 300) { save({ status: "failed", error: "Not enough text pasted. Copy at least 10 posts." }); kvDel(`creator_raw:${id}`); return; }
  save({ status: "running" });
  try {
    const r = await chatJson<CreatorReport>(STUDY_SYSTEM, `CREATOR: ${creator.name}${creator.notes ? `\nTEAM NOTES: ${creator.notes}` : ""}\n\nPASTED POSTS:\n${raw}`);
    if (!Array.isArray(r.data.hook_patterns) || !r.data.summary) throw new Error("The analysis came back incomplete. Try again.");
    const arr = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
    const d = r.data;
    const report: CreatorReport = {
      ...d, posts_analysed: Number(d.posts_analysed) || 0, hook_patterns: arr(d.hook_patterns), structures: arr(d.structures), topics: arr(d.topics),
      ctas: arr(d.ctas), signature_lines: arr(d.signature_lines), best_performers: arr(d.best_performers), adapt_for_small_business: arr(d.adapt_for_small_business), avoid: arr(d.avoid),
      formatting: d.formatting || {}, voice: { tone: d.voice?.tone || "", signature_moves: arr(d.voice?.signature_moves) },
    };
    save({ status: "done", report, engine: r.engine, costUsd: r.costUsd, error: undefined });
  } catch (e) {
    save({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 400) });
  } finally {
    kvDel(`creator_raw:${id}`); // the creator's own posts are never kept
  }
}

const SYNTH_SYSTEM = `You turn several LinkedIn creator studies into one practical playbook section for BrandMint's knowledge bank.
BrandMint writes LinkedIn posts for Indian small businesses (cafés, salons, clinics, fitness, fashion, education, real estate, home services, D2C), posted from the owner's personal profile or the business's Company Page. Every post is approved by the owner before it goes out.

Write the playbook in plain Markdown with these headings, in this order:
## Hooks: 10–15 hook templates with [placeholders], each with a one-line "use when".
## Signature lines: 6–10 short pivot, transition and closing line templates that make posts feel written by a person.
## Post structures: 5–8 structures as short numbered outlines, each with "best for".
## Formatting rules: length, line breaks, emoji, lists, hashtags (number and placement), links.
## Calls to action: patterns that fit small businesses (WhatsApp, visit, book, comment).
## Voice: how to sound credible and human, not like a guru.
## Rhythm: suggested weekly mix of post types.
## Never do: bait, hype and anything that hurts trust.

Rules: talk in things a small-business owner sees (walk-ins, bookings, WhatsApp enquiries, repeat customers, reviews), never corporate metrics. Templates and rules only, no creator's sentences, stories, names or numbers. Keep it under 1,400 words. Prefer patterns that appear across several creators.
Return JSON: {"markdown": string}`;

export async function runCreatorSynthesis() {
  const done = listCreators().map((c) => ({ c, s: getStudy(c.id) })).filter((x) => x.s?.status === "done" && x.s.report);
  const save = (s: Partial<Synthesis>) => kvSet("creator_synthesis", JSON.stringify({ ...(getSynthesis() || {}), ...s, at: Date.now() }));
  if (!done.length) { save({ status: "failed", error: "Study at least one creator first." }); return; }
  save({ status: "running" });
  try {
    const input = done.map(({ c, s }) => `### Study ${c.name}\n${JSON.stringify(s!.report)}`).join("\n\n");
    const r = await chatJson<{ markdown: string }>(SYNTH_SYSTEM, input);
    if (!r.data.markdown || r.data.markdown.length < 400) throw new Error("The playbook came back too short. Try again.");
    save({ status: "done", markdown: r.data.markdown, creatorIds: done.map((d) => d.c.id), error: undefined });
  } catch (e) {
    save({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 400) });
  }
}
