"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { currentMonth, nextMonth } from "@/lib/format";

async function ownItem(itemId: string) {
  const { customer } = await requireCustomer();
  const item = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.id, itemId), eq(schema.contentItems.customerId, customer.id))).get();
  if (!item) throw new Error("Not found");
  return { customer, item };
}

export async function approveItem(fd: FormData) {
  const itemId = String(fd.get("itemId"));
  const { item } = await ownItem(itemId);
  if (item.status !== "awaiting_approval") redirect(`/app/items/${itemId}`);
  db.update(schema.contentItems).set({ status: "scheduled", updatedAt: new Date() }).where(eq(schema.contentItems.id, itemId)).run();
  db.insert(schema.approvals).values({ itemId, decision: "approved" }).run();
  revalidatePath("/app");
  const next = String(fd.get("next") || "");
  redirect(next ? `/app/items/${next}?approved=${itemId}` : `/app?approved=${itemId}`);
}

export type ChangeState = { error?: string } | undefined;
export async function requestChanges(_: ChangeState, fd: FormData): Promise<ChangeState> {
  const itemId = String(fd.get("itemId"));
  const comment = String(fd.get("comment") || "").trim();
  const { customer, item } = await ownItem(itemId);
  if (comment.length < 4) return { error: "Say what to change, even in a few words, so the next version gets it right." };
  if (!["awaiting_approval", "failed"].includes(item.status)) return { error: "This item is already being remade." };
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  if (plan && item.status !== "failed" && item.revisionCount >= plan.revisions) return { error: `You’ve used all ${plan.revisions} revisions on this item. Approve it, or write to us and we’ll look at it by hand.` };
  db.insert(schema.approvals).values({ itemId, decision: "changes", comment }).run();
  db.update(schema.contentItems)
    .set({ status: "changes_requested", revisionCount: item.status === "failed" ? item.revisionCount : item.revisionCount + 1, updatedAt: new Date() })
    .where(eq(schema.contentItems.id, itemId))
    .run();
  enqueue("generate_item", { itemId }, { customerId: customer.id });
  revalidatePath("/app");
  redirect(`/app/items/${itemId}`);
}

export async function approveAllReady(fd: FormData) {
  const { customer } = await requireCustomer();
  const planId = String(fd.get("planId"));
  const ready = db.select({ id: schema.contentItems.id }).from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customer.id), eq(schema.contentItems.planId, planId), eq(schema.contentItems.status, "awaiting_approval"))).all();
  if (ready.length) {
    db.update(schema.contentItems).set({ status: "scheduled", updatedAt: new Date() }).where(inArray(schema.contentItems.id, ready.map((r) => r.id))).run();
    db.insert(schema.approvals).values(ready.map((r) => ({ itemId: r.id, decision: "approved" }))).run();
  }
  revalidatePath("/app");
  redirect(`/app?approved=all`);
}

export async function unscheduleItem(fd: FormData) {
  const itemId = String(fd.get("itemId"));
  const { item } = await ownItem(itemId);
  if (item.status === "scheduled" || item.status === "approved") {
    db.update(schema.contentItems).set({ status: "awaiting_approval", updatedAt: new Date() }).where(eq(schema.contentItems.id, itemId)).run();
  }
  revalidatePath("/app");
  redirect(`/app/items/${itemId}`);
}

export async function startNextMonth() {
  const { customer } = await requireCustomer();
  const plans = db.select().from(schema.contentPlans).where(eq(schema.contentPlans.customerId, customer.id)).all();
  const latest = plans.map((p) => p.month).sort().at(-1) || currentMonth();
  const month = plans.length ? nextMonth(latest) : currentMonth();
  enqueue("plan_month", { customerId: customer.id, month }, { customerId: customer.id });
  redirect(`/app?month=${month}`);
}

export async function saveSettings(fd: FormData) {
  const { customer } = await requireCustomer();
  const times = ["t1", "t2"].map((k) => String(fd.get(k) || "")).filter((t) => /^\d{2}:\d{2}$/.test(t));
  const colours = ["c1", "c2"].map((k) => String(fd.get(k) || "")).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  db.update(schema.customers).set({ postingTimes: JSON.stringify(times), brandColors: JSON.stringify(colours) }).where(eq(schema.customers.id, customer.id)).run();
  redirect("/app/settings?saved=1");
}

export async function disconnectMeta() {
  const { customer } = await requireCustomer();
  db.delete(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).run();
  redirect("/app/settings");
}

export async function rebuildProfile(fd: FormData) {
  const { customer } = await requireCustomer();
  const corrections = String(fd.get("corrections") || "").trim();
  if (corrections) {
    const details = JSON.parse(customer.details || "{}");
    details.owner_corrections = [details.owner_corrections, corrections].filter(Boolean).join("\n");
    db.update(schema.customers).set({ details: JSON.stringify(details) }).where(eq(schema.customers.id, customer.id)).run();
  }
  enqueue("brand_profile", { customerId: customer.id }, { customerId: customer.id });
  redirect("/app/brand?rebuilding=1");
}

export async function checkMeta() {
  const { customer } = await requireCustomer();
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  if (!conn) redirect("/app/settings");
  const { checkConnection, MetaError } = await import("@/lib/meta");
  try {
    const info = await checkConnection(conn);
    db.update(schema.metaConnections).set({ status: "connected", lastError: null, lastCheckedAt: new Date(), pageName: info.pageName ?? conn.pageName, igUsername: info.igUsername ?? conn.igUsername }).where(eq(schema.metaConnections.id, conn.id)).run();
    redirect("/app/settings?meta=connected");
  } catch (e) {
    if (!(e instanceof MetaError)) throw e;
    db.update(schema.metaConnections).set({ lastError: e.message, lastCheckedAt: new Date(), ...(e.needsReconnect ? { status: "needs_reconnect" } : {}) }).where(eq(schema.metaConnections.id, conn.id)).run();
    redirect("/app/settings");
  }
}
