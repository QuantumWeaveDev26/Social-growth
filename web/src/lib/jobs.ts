import { and, asc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";

export type JobType = "brand_profile" | "plan_month" | "generate_item" | "publish_due" | "send_email";

export function enqueue(type: JobType, payload: Record<string, unknown>, opts: { customerId?: string; runAt?: Date } = {}) {
  return db
    .insert(schema.jobs)
    .values({ type, payload: JSON.stringify(payload), customerId: opts.customerId ?? null, runAt: opts.runAt ?? new Date() })
    .returning()
    .get();
}

/** Jobs that spend AI credit. They wait while generation is paused (globally or for that customer). */
const SPENDING = ["brand_profile", "plan_month", "generate_item"];

export function generationPaused() {
  return db.select().from(schema.kv).where(eq(schema.kv.key, "generation_paused")).get()?.value === "1";
}
export function setGenerationPaused(on: boolean) {
  db.insert(schema.kv).values({ key: "generation_paused", value: on ? "1" : "0" })
    .onConflictDoUpdate({ target: schema.kv.key, set: { value: on ? "1" : "0" } }).run();
}

/** Claim the next due job (SQLite: single writer, so select + conditional update is safe). */
export function claimNext() {
  const globalPause = generationPaused();
  const paused = new Set(db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.status, "paused")).all().map((c) => c.id));
  const candidates = db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "queued"), lte(schema.jobs.runAt, new Date())))
    .orderBy(asc(schema.jobs.runAt))
    .limit(50)
    .all();
  const next = candidates.find((j) => !SPENDING.includes(j.type) || (!globalPause && !(j.customerId && paused.has(j.customerId))));
  if (!next) return null;
  const res = db
    .update(schema.jobs)
    .set({ status: "running", attempts: next.attempts + 1, startedAt: new Date(), step: "Starting" })
    .where(and(eq(schema.jobs.id, next.id), eq(schema.jobs.status, "queued")))
    .run();
  return res.changes ? { ...next, attempts: next.attempts + 1 } : null;
}

export function finishJob(id: string, error?: string, retry?: { attempts: number }) {
  if (error && retry && retry.attempts < 3) {
    db.update(schema.jobs).set({ status: "queued", step: null, error, runAt: new Date(Date.now() + 30_000 * retry.attempts) }).where(eq(schema.jobs.id, id)).run();
    return;
  }
  db.update(schema.jobs)
    .set({ status: error ? "failed" : "done", error: error ?? null, finishedAt: new Date(), step: null })
    .where(eq(schema.jobs.id, id))
    .run();
}

export type StepFn = (label: string) => void;
export const stepper = (jobId: string): StepFn => (label) => {
  db.update(schema.jobs).set({ step: label }).where(eq(schema.jobs.id, jobId)).run();
};
