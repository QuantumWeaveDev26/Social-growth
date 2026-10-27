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
  d.exec(`create table if not exists workers (
    id text primary key not null, host text not null, concurrency integer not null,
    active integer not null default 0, started_at integer not null, beat_at integer not null)`);
}
