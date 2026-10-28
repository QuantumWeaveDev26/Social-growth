"use server";
import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { applyPayment } from "@/lib/billing";
import { enqueue } from "@/lib/jobs";
import { notify } from "@/lib/notify";
import crypto from "node:crypto";
import { hashPassword } from "@/lib/auth";

const back = (id: string) => revalidatePath(`/admin/customers/${id}`);

export async function adminChangePlan(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  db.update(schema.subscriptions).set({ planId: String(fd.get("plan")) }).where(eq(schema.subscriptions.customerId, id)).run();
  back(id);
}

export async function adminExtend(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, id)).get();
  applyPayment(id, sub?.planId ?? "starter", "admin");
  notify(id, { kind: "renewed", title: "30 days added to your plan", body: "The BrandMint AI team extended your plan by 30 days.", link: "/app/billing" });
  back(id);
}

export async function adminSetStatus(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  db.update(schema.customers).set({ status: String(fd.get("status")) }).where(eq(schema.customers.id, id)).run();
  back(id);
}

/** Re-runs every failed item and failed job for this customer. */
export async function adminRetryFailed(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  const failed = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.customerId, id), eq(schema.contentItems.status, "failed"))).all();
  for (const it of failed) {
    if (it.mediaPath && it.copy) {
      // made fine but posting failed: put it back in the schedule
      db.update(schema.contentItems).set({ status: "scheduled", error: null, slotAt: new Date(Date.now() + 10 * 60_000) }).where(eq(schema.contentItems.id, it.id)).run();
      db.delete(schema.publishJobs).where(and(eq(schema.publishJobs.itemId, it.id), eq(schema.publishJobs.status, "failed"))).run();
    } else {
      db.update(schema.contentItems).set({ status: "planned", error: null }).where(eq(schema.contentItems.id, it.id)).run();
      enqueue("generate_item", { itemId: it.id }, { customerId: id });
    }
  }
  db.update(schema.jobs).set({ status: "queued", attempts: 0, error: null, runAt: new Date() })
    .where(and(eq(schema.jobs.customerId, id), eq(schema.jobs.status, "failed"), inArray(schema.jobs.type, ["brand_profile", "plan_month"]))).run();
  back(id);
}

/** Starts jobs that were put on hold (scheduled far in the future). */
export async function adminReleaseHeld(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  const held = db.select().from(schema.jobs).where(and(eq(schema.jobs.customerId, id), eq(schema.jobs.status, "queued"), gt(schema.jobs.runAt, new Date(Date.now() + 3600e3)))).all();
  held.forEach((j, i) => db.update(schema.jobs).set({ runAt: new Date(Date.now() + i * 2000) }).where(eq(schema.jobs.id, j.id)).run());
  back(id);
}

export async function adminPlanMonth(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  const month = String(fd.get("month"));
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  enqueue("plan_month", { customerId: id, month }, { customerId: id });
  back(id);
}

export async function adminRebuildProfile(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  enqueue("brand_profile", { customerId: id }, { customerId: id });
  back(id);
}

/** Gives an orphaned business a login again and emails the owner a link to set their password. */
export async function adminAttachOwner(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("customerId"));
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const name = String(fd.get("name") || "").trim() || email.split("@")[0];
  if (!email.includes("@")) return;
  const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  let userId = existing?.id;
  if (existing) db.update(schema.users).set({ customerId: id }).where(eq(schema.users.id, existing.id)).run();
  else userId = db.insert(schema.users).values({ email, name, customerId: id, passwordHash: await hashPassword(crypto.randomBytes(24).toString("hex")) }).returning().get().id;
  const token = crypto.randomBytes(32).toString("base64url");
  db.insert(schema.passwordResets).values({ userId: userId!, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 72 * 3600e3) }).run();
  notify(null, {
    kind: "password_reset", email: true, link: `/reset?token=${token}`, cta: "Set my password",
    title: "Set a password for BrandMint AI",
    body: "Your BrandMint AI account is ready for you. Choose a password to sign in. Everything you set up earlier is still there.\n\nThis link works for 3 days and only once.",
  }, userId);
  back(id);
}
