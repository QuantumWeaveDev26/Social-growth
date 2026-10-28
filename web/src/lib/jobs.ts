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

/** Atomically claim the next due job (SQLite: single-writer, so select + conditional update is safe). */
export function claimNext() {
  const next = db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "queued"), lte(schema.jobs.runAt, new Date())))
    .orderBy(asc(schema.jobs.runAt))
    .limit(1)
    .get();
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
