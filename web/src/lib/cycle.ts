/**
 * Daily housekeeping, run by the worker:
 *  - billing: demo plans auto-renew; paid plans get a renewal reminder, then lapse to past_due
 *  - next month: plan it ~10 days before the month ends for active subscriptions
 *  - approvals digest: one email a day when posts in the next 3 days still need an OK
 *  - backups: nightly SQLite snapshot, keep 7
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db, schema, sqlite } from "@/db";
import { enqueue } from "./jobs";
import { notify } from "./notify";
import { applyPayment, daysLeft } from "./billing";
import { currentMonth, monthLabel, nextMonth, fmtDateTime } from "./format";

const ist = () => new Date(Date.now() + 5.5 * 3600e3);
const today = () => ist().toISOString().slice(0, 10);

function ranToday(task: string) {
  const row = db.select().from(schema.kv).where(eq(schema.kv.key, `daily:${task}`)).get();
  return row?.value === today();
}
function markRan(task: string) {
  db.insert(schema.kv).values({ key: `daily:${task}`, value: today() }).onConflictDoUpdate({ target: schema.kv.key, set: { value: today() } }).run();
}

/** Runs each daily task once per IST day, at or after its hour. Safe to call often. */
export async function runDaily(log: (m: string) => void = console.log) {
  const hour = ist().getUTCHours();
  const tasks: Array<[string, number, () => unknown]> = [
    ["backup", 3, backupDatabase],
    ["billing", 6, billing],
    ["plan_next_month", 7, planNextMonths],
    ["approvals_digest", 10, approvalsDigest],
  ];
  for (const [name, at, fn] of tasks) {
    if (hour < at || ranToday(name)) continue;
    try { const r = await fn(); markRan(name); log(`daily ${name}: ${JSON.stringify(r ?? "ok")}`); }
    catch (e) { log(`daily ${name} failed: ${e instanceof Error ? e.message : e}`); }
  }
}

export function billing() {
  const subs = db.select().from(schema.subscriptions).where(inArray(schema.subscriptions.status, ["active", "past_due"])).all();
  let renewed = 0, reminded = 0, lapsed = 0;
  for (const s of subs) {
    if (!s.periodEnd) continue;
    const left = daysLeft(s.periodEnd);
    if (s.provider === "demo") {
      if (left <= 0) {
        applyPayment(s.customerId, s.planId, "demo");
        notify(s.customerId, { kind: "renewed", title: "Your plan renewed", body: "Your demo plan rolled over to a new 30-day period.", link: "/app/billing", dedupeKey: `renewed:${s.id}:${today()}` });
        renewed++;
      }
      continue;
    }
    if (s.status === "active" && left > 0 && left <= 5) {
      const r = notify(s.customerId, {
        kind: "renewal_due", email: true, dedupeKey: `renewal_due:${s.id}:${s.periodEnd.getTime()}`, link: "/app/billing", cta: "Renew my plan",
        title: `Your plan ends in ${left} day${left === 1 ? "" : "s"}`,
        body: `Your BrandMint AI plan runs until ${fmtDateTime(s.periodEnd).split(",").slice(0, 2).join(",")}.\n\nRenew now so next month’s posts are planned and approved posts keep going out without a gap.`,
      });
      if (r) reminded++;
    }
    if (s.status === "active" && left <= 0) {
      db.update(schema.subscriptions).set({ status: "past_due" }).where(eq(schema.subscriptions.id, s.id)).run();
      notify(s.customerId, {
        kind: "past_due", email: true, dedupeKey: `past_due:${s.id}:${s.periodEnd.getTime()}`, link: "/app/billing", cta: "Renew my plan",
        title: "Your plan has ended",
        body: "We’ve paused planning new content. Posts you already approved still go out as scheduled.\n\nRenew to plan your next month.",
      });
      lapsed++;
    }
  }
  return { renewed, reminded, lapsed };
}

export function planNextMonths() {
  const now = ist();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  if (daysInMonth - now.getUTCDate() > 10) return { planned: 0, reason: "too early in the month" };
  const target = nextMonth(currentMonth());
  const customers = db.select().from(schema.customers).where(eq(schema.customers.status, "active")).all();
  let planned = 0;
  for (const c of customers) {
    const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, c.id)).get();
    if (!sub || sub.status !== "active") continue;
    const exists = db.select().from(schema.contentPlans).where(and(eq(schema.contentPlans.customerId, c.id), eq(schema.contentPlans.month, target))).get();
    const queued = db.select().from(schema.jobs).where(and(eq(schema.jobs.customerId, c.id), eq(schema.jobs.type, "plan_month"), inArray(schema.jobs.status, ["queued", "running"]))).get();
    if (exists || queued) continue;
    enqueue("plan_month", { customerId: c.id, month: target }, { customerId: c.id });
    planned++;
  }
  return { planned, month: monthLabel(target) };
}

export function approvalsDigest() {
  const soon = new Date(Date.now() + 3 * 86400e3);
  const rows = db.select({ customerId: schema.contentItems.customerId, id: schema.contentItems.id, slotAt: schema.contentItems.slotAt })
    .from(schema.contentItems)
    .where(and(eq(schema.contentItems.status, "awaiting_approval"), lte(schema.contentItems.slotAt, soon))).all();
  const byCustomer = new Map<string, typeof rows>();
  rows.forEach((r) => byCustomer.set(r.customerId, [...(byCustomer.get(r.customerId) || []), r]));
  let sent = 0;
  for (const [customerId, list] of byCustomer) {
    const overdue = list.filter((r) => r.slotAt.getTime() < Date.now()).length;
    const r = notify(customerId, {
      kind: "approvals_due", email: true, dedupeKey: `approvals_due:${customerId}:${today()}`, link: "/app?show=review", cta: "Review now",
      title: `${list.length} post${list.length === 1 ? "" : "s"} need your OK`,
      body: `${list.length} post${list.length === 1 ? " is" : "s are"} scheduled in the next 3 days but not approved yet${overdue ? `, and ${overdue} already missed ${overdue === 1 ? "its" : "their"} time` : ""}.\n\nNothing posts without your OK. Approve them and late ones go out within minutes.`,
    });
    if (r) sent++;
  }
  return { customers: byCustomer.size, sent };
}

export async function backupDatabase() {
  const dbFile = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
  const dir = path.join(path.dirname(path.resolve(dbFile)), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `brandmint-${today()}.db`);
  await sqlite.backup(out);
  const old = fs.readdirSync(dir).filter((f) => /^brandmint-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -7);
  old.forEach((f) => fs.rmSync(path.join(dir, f)));
  return { file: path.basename(out), sizeKb: Math.round(fs.statSync(out).size / 1024), removed: old.length };
}

