/**
 * Notifications: every notice shows in the app; important ones are also emailed.
 * Emails go out through the n8n gateway (type "email", Gmail) from the worker's send_email job.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { enqueue } from "./jobs";

export type NoticeKind =
  | "month_ready" | "approvals_due" | "connection_broken" | "post_failed"
  | "renewal_due" | "renewed" | "past_due" | "password_reset" | "welcome";

type Notice = { kind: NoticeKind; title: string; body: string; link?: string; email?: boolean; dedupeKey?: string; cta?: string };

/** Records a notification for a customer (all its users). Returns null when the dedupe key already exists. */
export function notify(customerId: string | null, n: Notice, userId?: string) {
  if (n.dedupeKey && db.select({ id: schema.notifications.id }).from(schema.notifications).where(eq(schema.notifications.dedupeKey, n.dedupeKey)).get()) return null;
  const row = db.insert(schema.notifications).values({
    customerId, userId: userId ?? null, kind: n.kind, dedupeKey: n.dedupeKey ?? null,
    title: n.title, body: n.body, link: n.link ?? null, emailStatus: n.email ? "pending" : "none",
  }).onConflictDoNothing().returning().get();
  if (row && n.email) enqueue("send_email", { notificationId: row.id, cta: n.cta ?? null }, { customerId: customerId ?? undefined });
  return row ?? null;
}

export function unreadCount(customerId: string) {
  return db.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.customerId, customerId), isNull(schema.notifications.readAt))).all().length;
}

// ---------------------------------------------------------------- email
const appUrl = () => process.env.APP_URL || "http://localhost:3000";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function emailHtml(o: { title: string; body: string; link?: string | null; cta?: string | null; footer?: string }) {
  const url = o.link ? (o.link.startsWith("http") ? o.link : `${appUrl()}${o.link}`) : null;
  const paras = o.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3e4f49">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #dde3e0">
<tr><td style="padding:22px 28px;border-bottom:1px solid #dde3e0;font-size:17px;font-weight:bold;color:#13221d">BrandMint <span style="color:#1f9d74">AI</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#13221d">${esc(o.title)}</h1>
${paras}
${url ? `<p style="margin:22px 0 4px"><a href="${esc(url)}" style="display:inline-block;background:#13221d;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:10px">${esc(o.cta || "Open BrandMint AI")}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #dde3e0;font-size:12px;line-height:1.5;color:#5d6d67">${esc(o.footer || "You’re getting this because you use BrandMint AI for your social media.")}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Sends one email through the gateway. Throws on failure. */
export async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch(process.env.AI_GATEWAY_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-qw-key": process.env.AI_GATEWAY_KEY || "" },
    body: JSON.stringify({ type: "email", to, subject, html, from_name: "BrandMint AI" }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !j.id) throw new Error(`Email failed: ${typeof j.error === "string" ? j.error : JSON.stringify(j.error || j).slice(0, 200)}`);
  return j.id as string;
}

/** Worker job: email a notification to its recipients. */
export async function deliverNotification(notificationId: string, cta?: string | null) {
  const n = db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId)).get();
  if (!n || n.emailStatus === "sent") return;
  const recipients = n.userId
    ? db.select().from(schema.users).where(eq(schema.users.id, n.userId)).all()
    : n.customerId ? db.select().from(schema.users).where(eq(schema.users.customerId, n.customerId)).all() : [];
  if (!recipients.length) {
    db.update(schema.notifications).set({ emailStatus: "failed", emailError: "No recipient" }).where(eq(schema.notifications.id, n.id)).run();
    return;
  }
  try {
    for (const u of recipients) await sendEmail(u.email, n.title, emailHtml({ title: n.title, body: n.body, link: n.link, cta }));
    db.update(schema.notifications).set({ emailStatus: "sent", emailError: null }).where(eq(schema.notifications.id, n.id)).run();
  } catch (e) {
    db.update(schema.notifications).set({ emailStatus: "failed", emailError: String(e).slice(0, 300) }).where(eq(schema.notifications.id, n.id)).run();
    throw e;
  }
}
