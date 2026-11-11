import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { StatusChip } from "@/components/ui";
import { AdminShell } from "../../AdminShell";
import { SubmitButton } from "@/components/SubmitButton";
import { daysLeft } from "@/lib/billing";
import { currentMonth, nextMonth, fmtDateTime, inr, monthLabel } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import { adminChangePlan, adminExtend, adminSetStatus, adminRetryFailed, adminReleaseHeld, adminPlanMonth, adminRebuildProfile, adminAttachOwner, adminAllowGeneration, adminSetVeo, adminVeoTest, adminVeoCompare, adminCompareWriters, adminRedoImages } from "./actions";
import { veoCompareResult, veoConfigured, veoFor, veoTestResult } from "@/lib/veo";
import { AutoRefresh } from "@/components/AutoRefresh";
import { generationPaused, generationAllowList } from "@/lib/jobs";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, id)).get();
  if (!c) notFound();
  const owner = db.select().from(schema.users).where(eq(schema.users.customerId, id)).get();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, id)).get();
  const plans = db.select().from(schema.plans).orderBy(asc(schema.plans.sort)).all();
  const plan = plans.find((p) => p.id === sub?.planId);
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, id)).get();
  const months = db.select().from(schema.contentPlans).where(eq(schema.contentPlans.customerId, id)).orderBy(desc(schema.contentPlans.month)).all();
  const counts = db.select({ planId: schema.contentItems.planId, status: schema.contentItems.status, n: sql<number>`count(*)`, cost: sql<number>`sum(${schema.contentItems.costUsd})` })
    .from(schema.contentItems).where(eq(schema.contentItems.customerId, id)).groupBy(schema.contentItems.planId, schema.contentItems.status).all();
  const failed = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.customerId, id), eq(schema.contentItems.status, "failed"))).orderBy(asc(schema.contentItems.slotAt)).all();
  const held = db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(and(eq(schema.jobs.customerId, id), eq(schema.jobs.status, "queued"), gt(schema.jobs.runAt, new Date(Date.now() + 3600e3)))).get()?.n ?? 0;
  const notices = db.select().from(schema.notifications).where(eq(schema.notifications.customerId, id)).orderBy(desc(schema.notifications.createdAt)).limit(12).all();
  const payments = db.select().from(schema.payments).where(eq(schema.payments.customerId, id)).orderBy(desc(schema.payments.createdAt)).all().filter((p) => p.status === "paid");
  const details = JSON.parse(c.details || "{}");
  const totalCost = counts.reduce((a, r) => a + (r.cost || 0), 0);
  const Hidden = () => <input type="hidden" name="customerId" value={id} />;

  return (
    <AdminShell active="clients">


        <Link href="/admin/customers" className="flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />All clients</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1 className="font-display text-[2.2rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>{c.businessName}</h1>
            <p className="tnum mt-2 text-ink-2">{owner?.name} · {owner?.email} · joined {fmtDateTime(c.createdAt)} · <span className="capitalize">{c.status}</span> · AI spend {usd(totalCost)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          {generationPaused() && (() => { const on = generationAllowList().has(id); return (
            <form action={adminAllowGeneration}><Hidden /><input type="hidden" name="on" value={on ? "0" : "1"} />
              <SubmitButton className={`btn ${on ? "btn-ghost" : ""}`} pending="Saving">{on ? "Stop AI for this client (back to paused)" : "Allow AI for this client while paused"}</SubmitButton>
            </form>); })()}
          <form action={adminSetStatus}><Hidden /><input type="hidden" name="status" value={c.status === "paused" ? "active" : "paused"} />
            <SubmitButton className="btn btn-ghost" pending="Saving">{c.status === "paused" ? "Resume customer (generation runs again)" : "Pause customer (holds AI generation)"}</SubmitButton>
          </form>
          </div>
        </div>

        {!owner && (
          <form action={adminAttachOwner} className="mt-6 flex flex-wrap items-end gap-3 rounded-[14px] bg-amber-wash p-5">
            <Hidden />
            <p className="w-full text-sm text-amber-deep"><span className="font-semibold">This business has no login.</span> Add the owner’s email and we’ll email them a link to set a password. Their content and settings stay as they are.</p>
            <div><label className="label" htmlFor="o-name">Owner name</label><input id="o-name" name="name" className="field w-56" /></div>
            <div><label className="label" htmlFor="o-email">Owner email</label><input id="o-email" name="email" type="email" required className="field w-72" /></div>
            <SubmitButton pending="Sending">Create login and email link</SubmitButton>
          </form>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
          <section className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
            <h2 className="font-bold">Subscription</h2>
            <p className="tnum mt-2 text-sm text-ink-2">{plan ? `${plan.name} · ${inr(plan.priceInr)}` : "None"} · {sub?.status ?? "—"} · {sub?.provider}</p>
            <p className="tnum text-sm text-ink-2">{sub?.periodEnd ? `Until ${fmtDateTime(sub.periodEnd)} (${daysLeft(sub.periodEnd)} days)` : ""}</p>
            <form action={adminChangePlan} className="mt-4 flex gap-2"><Hidden />
              <select name="plan" defaultValue={sub?.planId} className="field py-1.5">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <SubmitButton className="btn btn-ghost" pending="Saving">Change</SubmitButton>
            </form>
            <form action={adminExtend} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Adding">Add 30 days (no charge)</SubmitButton></form>
            {payments.length > 0 && <p className="tnum mt-3 text-xs text-ink-3">{payments.length} payment record{payments.length === 1 ? "" : "s"} · last {fmtDateTime(payments[0].createdAt)}</p>}
          </section>
          <section className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
            <h2 className="font-bold">Facebook and Instagram</h2>
            {conn ? (
              <div className="mt-2 space-y-1 text-sm text-ink-2">
                <p>{conn.kind === "facebook" ? `Page: ${conn.pageName}` : "Instagram login"} · {conn.igUsername ? `@${conn.igUsername}` : "no Instagram"}</p>
                <p>{conn.mode} · <span className={conn.status === "connected" ? "text-mint-deep" : "font-semibold text-red"}>{conn.status}</span></p>
                {conn.lastError && <p className="text-red">{conn.lastError}</p>}
              </div>
            ) : <p className="mt-2 text-sm text-ink-2">Not connected.</p>}
            <h2 className="mt-5 font-bold">Business</h2>
            <p className="mt-1 line-clamp-4 text-sm text-ink-2">{details.offer || "—"}</p>
            <form action={adminRebuildProfile} className="mt-3"><Hidden /><SubmitButton className="btn btn-ghost" pending="Queued">Rewrite brand profile</SubmitButton></form>
          </section>
          <section className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
            <h2 className="font-bold">Content controls</h2>
            <form action={adminPlanMonth} className="mt-3 flex gap-2"><Hidden />
              <select name="month" className="field py-1.5" defaultValue={nextMonth(currentMonth())}>
                {[currentMonth(), nextMonth(currentMonth()), nextMonth(nextMonth(currentMonth()))].map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <SubmitButton className="btn btn-ghost" pending="Queued">Plan month</SubmitButton>
            </form>
            <form action={adminRetryFailed} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Retrying" disabled={!failed.length}>Retry {failed.length} failed item{failed.length === 1 ? "" : "s"}</SubmitButton></form>
            <form action={adminReleaseHeld} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Releasing" disabled={!held}>Release {held} on-hold item{held === 1 ? "" : "s"}</SubmitButton></form>
            {veoConfigured() && (() => {
              const on = veoFor(id); const t = veoTestResult(id); const busy = t && ["queued", "running"].includes(t.status);
              return (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm font-semibold">Veo video (Google Cloud)</p>
                  <form action={adminSetVeo} className="mt-2"><Hidden /><input type="hidden" name="on" value={on ? "0" : "1"} />
                    <SubmitButton className="btn btn-ghost w-full" pending="Saving">{on ? "Reels use Veo: on (switch off)" : "Use Veo moving clips for reels"}</SubmitButton>
                  </form>
                  <form action={adminVeoTest} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Queued" disabled={!!busy}>Film one test clip</SubmitButton></form>
                  {t && (
                    <div className="mt-2 text-sm text-ink-2">
                      <AutoRefresh active={!!busy} />
                      {busy ? `Filming… ${t.waited ? `${t.waited}s` : "starting"}` : t.status === "done" && t.path ? (
                        <><video src={mediaUrl(t.path)!} controls className="mt-1 w-full rounded-[10px]" /><span className="tnum">{t.model} · ${t.costUsd?.toFixed(2)}</span></>
                      ) : <span className="text-red">Test failed: {t.error}</span>}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        </div>

        {(() => {
          const rows = db.select({ status: schema.contentItems.status, type: schema.contentItems.type }).from(schema.contentItems).where(eq(schema.contentItems.customerId, id)).all();
          const failed = rows.filter((r) => r.status === "failed").length;
          const review = rows.filter((r) => r.status === "awaiting_approval" && r.type === "post").length;
          const redoing = db.select({ id: schema.jobs.id }).from(schema.jobs).where(and(eq(schema.jobs.customerId, id), eq(schema.jobs.type, "redo_image"), inArray(schema.jobs.status, ["queued", "running"]))).all().length;
          return (
            <section className="mt-10 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
              <AutoRefresh active={redoing > 0} ms={6000} />
              <h2 className="font-bold">Fix this client’s content</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <form action={adminRetryFailed}><Hidden /><SubmitButton className="btn btn-primary" pending="Queued" disabled={!failed}>Retry {failed} item{failed === 1 ? "" : "s"} that need attention</SubmitButton></form>
                <form action={adminRedoImages}><Hidden /><SubmitButton className="btn btn-ghost" pending="Queued" disabled={!review || redoing > 0}>Redo {review} post image{review === 1 ? "" : "s"} (keeps captions)</SubmitButton></form>
                {redoing > 0 && <span className="text-sm text-ink-2">Redoing images: {redoing} left…</span>}
              </div>
              <p className="mt-2 text-sm text-ink-3">Redo makes a new picture for each post waiting for approval (about ₹10 each) and stamps the logo again. Use it after fixing a logo or an image problem.</p>
            </section>
          );
        })()}

        {veoConfigured() && (() => {
          const c = veoCompareResult(id);
          const busy = !!c && ["queued", "running"].includes(c.status);
          const Side = ({ label, r }: { label: string; r?: { model: string; path?: string; costUsd?: number; seconds?: number; error?: string } }) => (
            <div className="rounded-[12px] bg-white p-3 ring-1 ring-line">
              <p className="font-semibold">{label}</p>
              {!r ? <p className="mt-2 text-sm text-ink-3">{busy ? "Filming…" : "Not filmed yet"}</p>
                : r.error ? <p className="mt-2 text-sm text-red">Failed: {r.error}</p>
                : <>
                    <video src={mediaUrl(r.path!)!} controls playsInline className="mx-auto mt-2 aspect-[9/16] max-h-[520px] w-full rounded-[10px] bg-black object-contain" />
                    <p className="tnum mt-2 text-sm text-ink-2">{r.model} · ${r.costUsd?.toFixed(2)} (₹{Math.round((r.costUsd || 0) * 94.53)}) · took {r.seconds}s</p>
                  </>}
            </div>
          );
          return (
            <section className="mt-10 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
              <AutoRefresh active={busy} ms={6000} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">Veo Fast vs Veo Lite</h2>
                  <p className="mt-1 text-sm text-ink-2">Same image, same motion directions, 8 seconds{c?.resolution ? ` at ${c.resolution}` : ""}. Compare quality before choosing the reel model.</p>
                </div>
                <form action={adminVeoCompare}><Hidden /><SubmitButton className="btn btn-primary" pending="Queued" disabled={busy}>{c ? "Film again" : "Film both"}</SubmitButton></form>
              </div>
              {c?.status === "failed" && <p className="mt-3 text-sm text-red">{c.error}</p>}
              {c && c.status !== "failed" && (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Side label="Veo 3.1 Fast" r={c.fast} />
                  <Side label="Veo 3.1 Lite" r={c.lite} />
                </div>
              )}
            </section>
          );
        })()}

        {(() => {
          const raw = db.select().from(schema.kv).where(eq(schema.kv.key, `writer_compare:${id}`)).get()?.value;
          const w = raw ? JSON.parse(raw) : null;
          const busy = w && ["queued", "running"].includes(w.status);
          const Col = ({ name, r }: { name: string; r?: Record<string, unknown> }) => (
            <div className="rounded-[12px] bg-white p-4 ring-1 ring-line">
              <p className="text-sm font-semibold">{name} {r?.model ? <span className="font-normal text-ink-3">· {String(r.model)} · {String(r.seconds)}s · ${Number(r.costUsd || 0).toFixed(3)}</span> : null}</p>
              {r?.error ? <p className="mt-2 text-sm text-red">{String(r.error)}</p> : r ? (
                <div className="mt-2 space-y-2 whitespace-pre-wrap text-sm"><p className="font-bold">{String(r.on_image_text || "")}</p><p>{String(r.instagram_caption || "")}</p><p className="text-ink-2">{String(r.facebook_post || "")}</p></div>
              ) : null}
            </div>
          );
          return (
            <section className="mt-8 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><h2 className="font-bold">Writer comparison</h2><p className="text-sm text-ink-2">Same brief, OpenAI vs Gemini. {w?.brief ? `Brief: ${w.brief}` : ""}</p></div>
                <form action={adminCompareWriters}><Hidden /><SubmitButton className="btn btn-ghost" pending="Queued" disabled={!!busy}>{busy ? "Writing…" : "Compare writers (~$0.05)"}</SubmitButton></form>
              </div>
              <AutoRefresh active={!!busy} />
              {w?.status === "failed" && <p className="mt-3 text-sm text-red">{w.error}</p>}
              {w?.status === "done" && <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"><Col name="OpenAI" r={w.openai} /><Col name="Gemini" r={w.gemini} /></div>}
            </section>
          );
        })()}

        <h2 className="mt-10 text-lg font-bold">Months</h2>
        <div className="mt-3 overflow-x-auto rounded-[12px] ring-1 ring-line"><table className="tnum w-full min-w-[720px] bg-sheet text-left text-[0.88rem]">
          <thead className="border-b border-line text-ink-2"><tr>{["Month", "Status", "Items", "Awaiting", "Approved/posted", "Being made", "Failed", "AI cost"].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {months.map((m) => {
              const rows = counts.filter((r) => r.planId === m.id);
              const n = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + r.n, 0);
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-semibold">{monthLabel(m.month)}</td><td className="px-4 capitalize">{m.status}</td>
                  <td className="px-4">{rows.reduce((a, r) => a + r.n, 0)}</td><td className="px-4">{n(["awaiting_approval"])}</td>
                  <td className="px-4">{n(["approved", "scheduled", "published"])}</td><td className="px-4">{n(["planned", "generating", "changes_requested"])}</td>
                  <td className={`px-4 ${n(["failed"]) ? "font-semibold text-red" : ""}`}>{n(["failed"])}</td><td className="px-4">{usd(rows.reduce((a, r) => a + (r.cost || 0), 0))}</td>
                </tr>
              );
            })}
            {!months.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-2">No months planned yet.</td></tr>}
          </tbody>
        </table></div>

        {failed.length > 0 && (
          <>
            <h2 className="mt-10 text-lg font-bold">Failed items</h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {failed.map((f) => (
                <li key={f.id} className="flex items-center gap-4 py-3 text-sm">
                  {f.thumbPath ? <img src={mediaUrl(f.thumbPath)!} alt="" className="size-10 rounded object-cover" /> : <span className="size-10 rounded bg-line" />}
                  <span className="flex-1">{JSON.parse(f.brief).topic}<span className="block text-red">{f.error}</span></span>
                  <StatusChip status={f.status} /><span className="tnum text-ink-3">{fmtDateTime(f.slotAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-10 text-lg font-bold">Notifications sent</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
          {notices.map((n) => (
            <li key={n.id} className="flex gap-4 py-2.5"><span className="flex-1 font-medium">{n.title}</span><span className="text-ink-3">{n.emailStatus === "none" ? "in-app" : `email ${n.emailStatus}`}{n.emailError ? `: ${n.emailError.slice(0, 60)}` : ""}</span><span className="tnum text-ink-3">{fmtDateTime(n.createdAt)}</span></li>
          ))}
          {!notices.length && <li className="py-4 text-ink-2">None yet.</li>}
        </ul>
    </AdminShell>

  );
}
