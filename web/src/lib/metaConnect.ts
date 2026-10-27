import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { seal } from "./crypto";
import type { FbPage } from "./meta";

type Customer = typeof schema.customers.$inferSelect;

export const backUrl = (c: Customer, extra?: string) => {
  const base = c.status === "onboarding" ? "/onboarding?step=4" : "/app/settings";
  return extra ? `${base}${base.includes("?") ? "&" : "?"}${extra}` : base;
};

export function saveConnection(customerId: string, v: Partial<typeof schema.metaConnections.$inferInsert> & { token?: string | null }) {
  const { token, ...rest } = v;
  const values = {
    customerId, status: "connected", lastError: null, lastCheckedAt: new Date(), connectedAt: new Date(),
    pageToken: token ? seal(token) : null, tokenExpiresAt: null,
    pageId: null, pageName: null, igUserId: null, igUsername: null, metaUserId: null,
    ...rest,
  } as typeof schema.metaConnections.$inferInsert;
  db.insert(schema.metaConnections).values(values).onConflictDoUpdate({ target: schema.metaConnections.customerId, set: values }).run();
  // anything that was waiting on the connection can post again
  db.update(schema.contentItems).set({ error: null }).where(eq(schema.contentItems.customerId, customerId)).run();
}

export function savePage(customerId: string, metaUserId: string, p: FbPage) {
  saveConnection(customerId, { mode: "live", kind: "facebook", metaUserId, pageId: p.id, pageName: p.name, igUserId: p.igId, igUsername: p.igUsername, token: p.token });
}
