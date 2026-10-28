import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const file = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");

const g = globalThis as unknown as { __sqlite?: Database.Database };
const sqlite = g.__sqlite ?? new Database(file);
if (!g.__sqlite) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  migrate(sqlite);
  g.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { schema };

/** Small additive migrations so existing databases pick up new columns without a manual step. */
function migrate(d: Database.Database) {
  const cols = (t: string) => (d.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  const jobCols = cols("jobs");
  if (jobCols.length) {
    if (!jobCols.includes("step")) d.exec("alter table jobs add column step text");
    if (!jobCols.includes("started_at")) d.exec("alter table jobs add column started_at integer");
  }
  const mc = cols("meta_connections");
  if (mc.length) {
    const add = (c: string, t: string) => { if (!mc.includes(c)) d.exec(`alter table meta_connections add column ${c} ${t}`); };
    add("kind", "text not null default 'facebook'");
    add("meta_user_id", "text");
    add("token_expires_at", "integer");
    add("last_error", "text");
    add("last_checked_at", "integer");
  }
  d.exec(`create table if not exists meta_pending (
    id text primary key not null, customer_id text not null, payload text not null,
    created_at integer not null default (unixepoch() * 1000))`);
  const uc = cols("users");
  if (uc.length && !uc.includes("session_version")) d.exec("alter table users add column session_version integer not null default 0");
  d.exec(`create table if not exists notifications (
    id text primary key not null, customer_id text, user_id text, kind text not null, dedupe_key text,
    title text not null, body text not null, link text, email_status text not null default 'none', email_error text,
    read_at integer, created_at integer not null default (unixepoch() * 1000))`);
  d.exec("create unique index if not exists notifications_dedupe on notifications (dedupe_key)");
  d.exec(`create table if not exists password_resets (
    id text primary key not null, user_id text not null, token_hash text not null unique,
    expires_at integer not null, used_at integer, created_at integer not null default (unixepoch() * 1000))`);
  d.exec(`create table if not exists payments (
    id text primary key not null, customer_id text not null, plan_id text not null, amount_inr integer not null,
    provider text not null, order_id text, payment_id text, status text not null default 'paid',
    period_start integer, period_end integer, created_at integer not null default (unixepoch() * 1000))`);
  d.exec("create table if not exists kv (key text primary key not null, value text not null)");
  d.exec(`create table if not exists workers (
    id text primary key not null, host text not null, concurrency integer not null,
    active integer not null default 0, started_at integer not null, beat_at integer not null)`);
}
