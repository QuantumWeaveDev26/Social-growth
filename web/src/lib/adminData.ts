/**
 * Per-client status for the admin dashboard. Everything is aggregated in SQL (one grouped query per
 * table), so the cost stays flat as the client list grows.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { daysLeft } from "./billing";
import { currentMonth } from "./format";

export type Issue = { label: string; level: "red" | "amber" };

export type ClientRow = {
  id: string;
  name: string;
  owner: string | null;
  status: string; // onboarding | active | paused
  onboardStep: number;
  createdAt: Date;
  plan: { name: string; price: number; quota: number } | null;
  sub: { status: string; provider: string; daysLeft: number; periodEnd: Date | null } | null;
  conn: { state: "connected" | "needs_reconnect" | "none"; ig: string | null; page: string | null; demo: boolean };
  month: { label: string | null; posted: number; scheduled: number; review: number; making: number; failed: number; total: number };
  reviewAll: number;
  upcoming: number;
  postedThisMonth: number;
  nextPostAt: Date | null;
  lastPostedAt: Date | null;
  oldestReviewAt: Date | null;
  spendMonth: number;
  spendTotal: number;
  issues: Issue[];
};

const DAY = 86400e3;

export function monthRange(month = currentMonth()) {
  const [y, m] = month.split("-").map(Number);
  // IST month boundaries expressed in UTC
  return { start: new Date(Date.UTC(y, m - 1, 1) - 5.5 * 3600e3), end: new Date(Date.UTC(y, m, 1) - 5.5 * 3600e3) };
}

export function clientRows(): ClientRow[] {
  const now = Date.now();
  const { start, end } = monthRange();
  const customers = db.select().from(schema.customers).all();
  const owners = new Map(db.select({ c: schema.users.customerId, email: schema.users.email }).from(schema.users).where(eq(schema.users.role, "owner")).all().map((u) => [u.c, u.email]));
  const subs = new Map(db.select().from(schema.subscriptions).all().map((s) => [s.customerId, s]));
  const plans = new Map(db.select().from(schema.plans).all().map((p) => [p.id, p]));
  const conns = new Map(db.select().from(schema.metaConnections).all().map((c) => [c.customerId, c]));
  const ci = schema.contentItems;
  const cnt = (cond: ReturnType<typeof sql>) => sql<number>`coalesce(sum(case when ${cond} then 1 else 0 end), 0)`;

  // "This month" = each client's latest content plan (the month they're being made / approving)
  const latestPlan = new Map<string, { id: string; month: string }>();
  for (const p of db.select({ id: schema.contentPlans.id, c: schema.contentPlans.customerId, month: schema.contentPlans.month }).from(schema.contentPlans).all()) {
    const cur = latestPlan.get(p.c);
    if (!cur || p.month > cur.month) latestPlan.set(p.c, { id: p.id, month: p.month });
  }
  const byPlan = new Map(
    db.select({
      planId: ci.planId,
      posted: cnt(sql`${ci.status} = 'published'`),
      scheduled: cnt(sql`${ci.status} in ('approved','scheduled')`),
      review: cnt(sql`${ci.status} = 'awaiting_approval'`),
      making: cnt(sql`${ci.status} in ('planned','generating','changes_requested')`),
      failed: cnt(sql`${ci.status} = 'failed'`),
      total: sql<number>`count(*)`,
      spend: sql<number>`coalesce(sum(${ci.costUsd}), 0)`,
    }).from(ci).groupBy(ci.planId).all().map((r) => [r.planId, r]),
  );
  const postedThisMonth = new Map(
    db.select({ id: ci.customerId, n: sql<number>`count(*)` }).from(ci)
      .where(and(eq(ci.status, "published"), gte(ci.slotAt, start), lt(ci.slotAt, end))).groupBy(ci.customerId).all().map((r) => [r.id, r.n]),
  );
  const overall = new Map(
    db.select({
      id: ci.customerId,
      spend: sql<number>`coalesce(sum(${ci.costUsd}), 0)`,
      failedAll: cnt(sql`${ci.status} = 'failed'`),
      next: sql<number | null>`min(case when ${ci.status} in ('approved','scheduled') and ${ci.slotAt} >= ${now} then ${ci.slotAt} end)`,
      last: sql<number | null>`max(case when ${ci.status} = 'published' then ${ci.slotAt} end)`,
      oldestReview: sql<number | null>`min(case when ${ci.status} = 'awaiting_approval' then ${ci.updatedAt} end)`,
      reviewAll: cnt(sql`${ci.status} = 'awaiting_approval'`),
      upcoming: cnt(sql`${ci.status} in ('approved','scheduled') and ${ci.slotAt} >= ${now}`),
    }).from(ci).groupBy(ci.customerId).all().map((r) => [r.id, r]),
  );

  return customers.map((c) => {
    const sub = subs.get(c.id);
    const plan = sub ? plans.get(sub.planId) : undefined;
    const conn = conns.get(c.id);
    const lp = latestPlan.get(c.id);
    const m = (lp && byPlan.get(lp.id)) || { posted: 0, scheduled: 0, review: 0, making: 0, failed: 0, total: 0, spend: 0 };
    const o = overall.get(c.id);
    const left = sub ? daysLeft(sub.periodEnd) : 0;
    const connState: ClientRow["conn"]["state"] = !conn ? "none" : conn.status === "needs_reconnect" ? "needs_reconnect" : "connected";
    const nextPostAt = o?.next ? new Date(Number(o.next)) : null;
    const oldestReviewAt = o?.oldestReview ? new Date(Number(o.oldestReview)) : null;

    const issues: Issue[] = [];
    if (c.status === "onboarding") {
      if (now - c.createdAt.getTime() > 3 * DAY) issues.push({ label: `Stuck in setup (step ${c.onboardStep})`, level: "amber" });
    } else {
      if (connState === "needs_reconnect") issues.push({ label: "Reconnect Meta", level: "red" });
      if (connState === "none") issues.push({ label: "Meta not connected", level: "red" });
      if (sub && (sub.status === "past_due" || left <= 0)) issues.push({ label: "Payment overdue", level: "red" });
      else if (sub && left <= 5) issues.push({ label: `Renews in ${left}d`, level: "amber" });
      if ((o?.failedAll ?? 0) > 0) issues.push({ label: `${o!.failedAll} failed`, level: "red" });
      if (oldestReviewAt && now - oldestReviewAt.getTime() > 3 * DAY) issues.push({ label: `Approvals waiting ${Math.floor((now - oldestReviewAt.getTime()) / DAY)}d`, level: "amber" });
      if (c.status === "active" && connState === "connected" && !nextPostAt) issues.push({ label: "Nothing scheduled", level: "amber" });
    }

    return {
      id: c.id, name: c.businessName, owner: owners.get(c.id) ?? null, status: c.status, onboardStep: c.onboardStep, createdAt: c.createdAt,
      plan: plan ? { name: plan.name, price: plan.priceInr, quota: plan.posts + plan.reels } : null,
      sub: sub ? { status: sub.status, provider: sub.provider, daysLeft: left, periodEnd: sub.periodEnd } : null,
      conn: { state: connState, ig: conn?.igUsername ?? null, page: conn?.pageName ?? null, demo: conn?.mode === "demo" },
      month: { label: lp?.month ?? null, posted: m.posted, scheduled: m.scheduled, review: m.review, making: m.making, failed: m.failed, total: m.total },
      reviewAll: o?.reviewAll ?? 0, upcoming: o?.upcoming ?? 0, postedThisMonth: postedThisMonth.get(c.id) ?? 0,
      nextPostAt, lastPostedAt: o?.last ? new Date(Number(o.last)) : null, oldestReviewAt,
      spendMonth: m.spend, spendTotal: o?.spend ?? 0, issues,
    };
  });
}

export const needsAttention = (r: ClientRow) => r.issues.some((i) => i.level === "red") || r.issues.length > 0;
