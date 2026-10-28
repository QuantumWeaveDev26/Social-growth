import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"), // owner | admin
  customerId: text("customer_id"),
  sessionVersion: integer("session_version").notNull().default(0), // bump to sign out every session
  createdAt: now("created_at"),
});

export const customers = sqliteTable("customers", {
  id: id(),
  businessName: text("business_name").notNull(),
  status: text("status").notNull().default("onboarding"), // onboarding | active | paused
  onboardStep: integer("onboard_step").notNull().default(1),
  details: text("details"), // JSON business form
  websiteUrl: text("website_url"),
  logoPath: text("logo_path"),
  brandColors: text("brand_colors"), // JSON ["#hex"]
  postingTimes: text("posting_times"), // JSON ["10:00","18:30"]
  createdAt: now("created_at"),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(), // starter | growth | scale
  name: text("name").notNull(),
  priceInr: integer("price_inr").notNull(),
  posts: integer("posts").notNull(),
  reels: integer("reels").notNull(),
  revisions: integer("revisions").notNull().default(2),
  report: integer("report", { mode: "boolean" }).notNull().default(false),
  features: text("features").notNull(), // JSON list
  sort: integer("sort").notNull().default(0),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: id(),
  customerId: text("customer_id").notNull().unique(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | past_due | cancelled
  provider: text("provider").notNull().default("demo"), // razorpay | demo
  orderId: text("order_id"),
  paymentId: text("payment_id"),
  periodStart: integer("period_start", { mode: "timestamp_ms" }),
  periodEnd: integer("period_end", { mode: "timestamp_ms" }),
  createdAt: now("created_at"),
});

export const metaConnections = sqliteTable("meta_connections", {
  id: id(),
  customerId: text("customer_id").notNull().unique(),
  mode: text("mode").notNull().default("demo"), // live | demo
  kind: text("kind").notNull().default("facebook"), // facebook (Page + linked IG) | instagram (Instagram Login, IG only)
  metaUserId: text("meta_user_id"), // Facebook or Instagram app-scoped user id, used by deauthorize/data-deletion callbacks
  pageId: text("page_id"),
  pageName: text("page_name"),
  igUserId: text("ig_user_id"),
  igUsername: text("ig_username"),
  pageToken: text("page_token"), // encrypted (Page token, or Instagram user token for kind=instagram)
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp_ms" }), // null = does not expire
  status: text("status").notNull().default("connected"), // connected | needs_reconnect
  lastError: text("last_error"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
  connectedAt: now("connected_at"),
});

/** Short-lived holding area while an owner with several Pages picks one. */
export const metaPending = sqliteTable("meta_pending", {
  id: id(),
  customerId: text("customer_id").notNull(),
  payload: text("payload").notNull(), // encrypted JSON { metaUserId, pages: [{ id, name, token, igId, igUsername }] }
  createdAt: now("created_at"),
});

export const brandProfiles = sqliteTable("brand_profiles", {
  id: id(),
  customerId: text("customer_id").notNull(),
  version: integer("version").notNull(),
  summary: text("summary").notNull(),
  profileMd: text("profile_md").notNull(),
  pillars: text("pillars").notNull().default("[]"), // JSON [{name, why}]
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
  createdAt: now("created_at"),
});

export const contentPlans = sqliteTable(
  "content_plans",
  {
    id: id(),
    customerId: text("customer_id").notNull(),
    month: text("month").notNull(), // 2026-11
    status: text("status").notNull().default("draft"), // draft | generating | review | done
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("plan_customer_month").on(t.customerId, t.month)],
);

export const contentItems = sqliteTable("content_items", {
  id: id(),
  customerId: text("customer_id").notNull(),
  planId: text("plan_id").notNull(),
  type: text("type").notNull(), // post | reel
  slotAt: integer("slot_at", { mode: "timestamp_ms" }).notNull(),
  pillar: text("pillar").notNull(),
  brief: text("brief").notNull(), // JSON concept from the month plan
  copy: text("copy"), // JSON generated copy
  mediaPath: text("media_path"),
  thumbPath: text("thumb_path"),
  status: text("status").notNull().default("planned"),
  // planned | generating | awaiting_approval | changes_requested | approved | scheduled | published | failed
  revisionCount: integer("revision_count").notNull().default(0),
  error: text("error"),
  costUsd: real("cost_usd").notNull().default(0),
  updatedAt: now("updated_at"),
});

export const approvals = sqliteTable("approvals", {
  id: id(),
  itemId: text("item_id").notNull(),
  decision: text("decision").notNull(), // approved | changes
  comment: text("comment"),
  createdAt: now("created_at"),
});

export const publishJobs = sqliteTable("publish_jobs", {
  id: id(),
  itemId: text("item_id").notNull(),
  platform: text("platform").notNull(), // facebook | instagram
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled | published | failed
  remoteId: text("remote_id"),
  error: text("error"),
  createdAt: now("created_at"),
});

export const jobs = sqliteTable("jobs", {
  id: id(),
  customerId: text("customer_id"),
  type: text("type").notNull(), // brand_profile | plan_month | generate_item | publish_due
  payload: text("payload").notNull().default("{}"),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  attempts: integer("attempts").notNull().default(0),
  runAt: integer("run_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  error: text("error"),
  step: text("step"), // live progress label while running
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  createdAt: now("created_at"),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

/** One row per worker process; the heartbeat tells the UI whether background work is alive. */
export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  host: text("host").notNull(),
  concurrency: integer("concurrency").notNull(),
  active: integer("active").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  beatAt: integer("beat_at", { mode: "timestamp_ms" }).notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type Plan = typeof plans.$inferSelect;

/** In-app notifications; email is sent by the worker when emailStatus = "pending". */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    customerId: text("customer_id"),
    userId: text("user_id"), // set for account emails (password reset)
    kind: text("kind").notNull(), // month_ready | approvals_due | connection_broken | post_failed | renewal_due | renewed | past_due | password_reset | welcome
    dedupeKey: text("dedupe_key"), // one notification per key
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    emailStatus: text("email_status").notNull().default("none"), // none | pending | sent | failed
    emailError: text("email_error"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("notifications_dedupe").on(t.dedupeKey)],
);

export const passwordResets = sqliteTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  createdAt: now("created_at"),
});

/** Billing history: one row per paid (or demo) period. */
export const payments = sqliteTable("payments", {
  id: id(),
  customerId: text("customer_id").notNull(),
  planId: text("plan_id").notNull(),
  amountInr: integer("amount_inr").notNull(),
  provider: text("provider").notNull(), // razorpay | demo | admin
  orderId: text("order_id"),
  paymentId: text("payment_id"),
  status: text("status").notNull().default("paid"), // created | paid | failed
  periodStart: integer("period_start", { mode: "timestamp_ms" }),
  periodEnd: integer("period_end", { mode: "timestamp_ms" }),
  createdAt: now("created_at"),
});

/** Small key/value store for scheduler bookkeeping. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
