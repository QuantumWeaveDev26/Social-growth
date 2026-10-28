/**
 * Background worker: runs queued jobs and publishes due content.
 *   npx tsx --env-file=.env scripts/worker.ts
 */
import os from "node:os";
import crypto from "node:crypto";
import { claimNext, finishJob, stepper } from "../src/lib/jobs";
import { buildBrandProfile, planMonth, generateItem, publishDue, syncConnections } from "../src/lib/engine";
import { db, schema } from "../src/db";
import { deliverNotification } from "../src/lib/notify";
import { runDaily } from "../src/lib/cycle";
import { eq } from "drizzle-orm";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);
let active = 0;

async function handle(job: NonNullable<ReturnType<typeof claimNext>>) {
  const p = JSON.parse(job.payload || "{}");
  try {
    const step = stepper(job.id);
    if (job.type === "brand_profile") await buildBrandProfile(p.customerId, step);
    else if (job.type === "plan_month") await planMonth(p.customerId, p.month, step);
    else if (job.type === "generate_item") await generateItem(p.itemId, step);
    else if (job.type === "publish_due") await publishDue();
    else if (job.type === "send_email") await deliverNotification(p.notificationId, p.cta);
    finishJob(job.id);
    console.log(new Date().toISOString(), "done", job.type, job.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(new Date().toISOString(), "error", job.type, msg);
    if (job.type === "generate_item" && job.attempts >= 3) {
      db.update(schema.contentItems).set({ status: "failed", error: msg.slice(0, 400) }).where(eq(schema.contentItems.id, p.itemId)).run();
    }
    finishJob(job.id, msg.slice(0, 1000), { attempts: job.attempts });
  }
}

async function tick() {
  while (active < CONCURRENCY) {
    const job = claimNext();
    if (!job) break;
    active++;
    handle(job).finally(() => active--);
  }
}

// jobs left "running" by a previous worker process go back in the queue
const stale = db.update(schema.jobs).set({ status: "queued" }).where(eq(schema.jobs.status, "running")).run();
if (stale.changes) console.log(`requeued ${stale.changes} interrupted job(s)`);

// publishing runs on its own clock so a busy generation queue never delays a post
let publishing = false;
setInterval(async () => {
  if (publishing) return;
  publishing = true;
  try { await publishDue(); } catch (e) { console.error("publish error", e); } finally { publishing = false; }
}, 30_000);
setInterval(tick, 1500);

// connection health: token checks + Instagram token refresh
const sync = () => syncConnections().catch((e) => console.error("connection sync error", e));
sync();
setInterval(sync, 30 * 60_000);

// daily housekeeping (billing, next month, approvals digest, backups)
const daily = () => runDaily().catch((e) => console.error("daily error", e));
setTimeout(daily, 20_000);
setInterval(daily, 10 * 60_000);

// heartbeat: lets the app show whether the worker is alive and how busy it is
const WORKER_ID = crypto.randomUUID();
const startedAt = new Date();
const beat = () => {
  const row = { id: WORKER_ID, host: os.hostname(), concurrency: CONCURRENCY, active, startedAt, beatAt: new Date() };
  db.insert(schema.workers).values(row).onConflictDoUpdate({ target: schema.workers.id, set: { active, beatAt: row.beatAt } }).run();
};
beat();
setInterval(beat, 5000);
const bye = () => { try { db.delete(schema.workers).where(eq(schema.workers.id, WORKER_ID)).run(); } finally { process.exit(0); } };
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
console.log(`worker started (concurrency ${CONCURRENCY})`);
