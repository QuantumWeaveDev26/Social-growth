import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, ChevronLeft, ChevronRight, Film, Check, Heart, MessageCircle, Send, Bookmark, ThumbsUp, Share2, Loader2 } from "lucide-react";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { mediaUrl } from "@/lib/storage";
import { fmtDateTime } from "@/lib/format";
import { StatusChip, ApproveMark } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { approveItem, unscheduleItem, postNow } from "../../actions";
import { ChangesForm, PreviewTabs } from "./Client";

export const metadata = { title: "Review" };

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ approved?: string; posting?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { customer } = await requireCustomer();
  const item = db.select().from(schema.contentItems).where(and(eq(schema.contentItems.id, id), eq(schema.contentItems.customerId, customer.id))).get();
  if (!item) notFound();
  const siblings = db.select({ id: schema.contentItems.id, status: schema.contentItems.status }).from(schema.contentItems).where(eq(schema.contentItems.planId, item.planId)).orderBy(asc(schema.contentItems.slotAt)).all();
  const idx = siblings.findIndex((s) => s.id === id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const nextToReview = [...siblings.slice(idx + 1), ...siblings.slice(0, idx)].find((s) => s.status === "awaiting_approval");
  const history = db.select().from(schema.approvals).where(eq(schema.approvals.itemId, id)).orderBy(desc(schema.approvals.createdAt)).all();
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  const revLeft = Math.max(0, (plan?.revisions ?? 2) - item.revisionCount);
  const brief = JSON.parse(item.brief);
  const copy = item.copy ? JSON.parse(item.copy) : null;
  const making = ["planned", "generating", "changes_requested"].includes(item.status);
  const isVideo = item.mediaPath?.endsWith(".mp4");
  const handle = conn?.igUsername || customer.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const logo = mediaUrl(customer.logoPath);
  const published = db.select().from(schema.publishJobs).where(eq(schema.publishJobs.itemId, id)).all();
  // approved and its time has come: the worker picks it up within ~30 seconds
  const posting = (item.status === "scheduled" || item.status === "approved") && item.slotAt.getTime() <= Date.now();
  const postedAt = published.filter((p) => p.status === "published").map((p) => p.createdAt).sort((a, b) => b.getTime() - a.getTime())[0];

  const media = making || !item.mediaPath ? (
    <div className="developing grid size-full place-items-center">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-2"><Loader2 className="size-4 animate-spin" aria-hidden />{item.status === "changes_requested" ? "Remaking with your note" : "Being made"}</p>
    </div>
  ) : isVideo ? (
    <video src={mediaUrl(item.mediaPath)!} poster={mediaUrl(item.thumbPath) ?? undefined} controls playsInline className="size-full bg-black object-contain" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaUrl(item.mediaPath)!} alt={copy?.alt_text || ""} className="size-full object-cover" />
  );

  const avatar = logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="size-8 rounded-full bg-white object-contain ring-1 ring-line" />
  ) : (
    <span className="grid size-8 place-items-center rounded-full bg-mint text-sm font-bold text-white">{customer.businessName[0]}</span>
  );

  const ig = (
    <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-line">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">{avatar}<span className="text-[0.88rem] font-semibold">{handle}</span></div>
      <div className={`${item.type === "reel" ? "aspect-[9/16] max-h-[620px]" : "aspect-square"} w-full`}>{media}</div>
      <div className="flex items-center gap-4 px-3.5 pt-3 text-ink"><Heart className="size-6" aria-hidden /><MessageCircle className="size-6" aria-hidden /><Send className="size-6" aria-hidden /><Bookmark className="ml-auto size-6" aria-hidden /></div>
      <p className="whitespace-pre-line px-3.5 pb-4 pt-2 text-[0.88rem] leading-relaxed"><span className="font-semibold">{handle}</span> {copy?.instagram_caption}</p>
    </div>
  );
  const fb = (
    <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-line">
      <div className="flex items-center gap-2.5 px-4 py-3">{avatar}<span><span className="block text-[0.9rem] font-semibold">{conn?.pageName || customer.businessName}</span><span className="block text-[0.75rem] text-ink-3">{fmtDateTime(item.slotAt)}</span></span></div>
      <p className="whitespace-pre-line px-4 pb-3 text-[0.92rem] leading-relaxed">{copy?.facebook_post}</p>
      <div className={`${item.type === "reel" ? "aspect-[9/16] max-h-[620px]" : "aspect-square"} w-full`}>{media}</div>
      <div className="flex justify-around border-t border-line py-2.5 text-[0.85rem] font-semibold text-ink-2"><span className="flex items-center gap-1.5"><ThumbsUp className="size-4" aria-hidden />Like</span><span className="flex items-center gap-1.5"><MessageCircle className="size-4" aria-hidden />Comment</span><span className="flex items-center gap-1.5"><Share2 className="size-4" aria-hidden />Share</span></div>
    </div>
  );

  return (
    <main className="px-12 pb-20 pt-8">
      <AutoRefresh active={making || posting} />
      <div className="flex items-center justify-between">
        <Link href="/app" className="flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />Proof sheet</Link>
        <div className="flex items-center gap-1 text-sm text-ink-2">
          <span className="tnum mr-2">{idx + 1} of {siblings.length}</span>
          {prev ? <Link href={`/app/items/${prev.id}`} className="btn btn-ghost px-2 py-1.5" aria-label="Previous item"><ChevronLeft className="size-4" /></Link> : <span className="btn btn-ghost px-2 py-1.5" aria-disabled="true"><ChevronLeft className="size-4" /></span>}
          {next ? <Link href={`/app/items/${next.id}`} className="btn btn-ghost px-2 py-1.5" aria-label="Next item"><ChevronRight className="size-4" /></Link> : <span className="btn btn-ghost px-2 py-1.5" aria-disabled="true"><ChevronRight className="size-4" /></span>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-12">
        <PreviewTabs ig={ig} fb={fb} />

        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusChip status={item.status} />
            {item.type === "reel" && <span className="chip bg-[#eef1ef] text-ink-2"><Film className="size-3" aria-hidden />Reel</span>}
            <span className="chip bg-[#eef1ef] text-ink-2">{item.pillar}</span>
          </div>
          <h1 className="mt-4 font-display text-[2rem] leading-[1.1] tracking-[-0.025em]" style={{ fontWeight: 800 }}>{copy?.on_image_text || copy?.cover_text || brief.topic}</h1>
          <p className="tnum mt-2 text-ink-2">Goes live {fmtDateTime(item.slotAt)} on Instagram and Facebook</p>

          {sp.approved && sp.approved !== id && (
            <p className="mt-5 flex items-center gap-3 rounded-[12px] bg-mint-wash px-4 py-3 text-sm font-medium text-mint-deep">
              <ApproveMark draw className="w-7" />Approved and scheduled. Here’s the next one to review.
            </p>
          )}

          {item.status === "awaiting_approval" && (
            <div className="mt-8 rounded-[14px] bg-sheet p-6 ring-1 ring-line">
              <form action={approveItem} className="flex items-center gap-4">
                <input type="hidden" name="itemId" value={id} />
                {nextToReview && <input type="hidden" name="next" value={nextToReview.id} />}
                <SubmitButton className="btn btn-mint px-6 py-3 text-base" pending="Approving"><Check className="size-5" aria-hidden />Approve and schedule</SubmitButton>
                <p className="text-sm text-ink-2">{nextToReview ? "Then we take you to the next one." : "This is the last one waiting."}</p>
              </form>
              <div className="mt-6 border-t border-line pt-5">
                <ChangesForm itemId={id} revLeft={revLeft} />
              </div>
            </div>
          )}

          {item.status === "failed" && (
            <div className="mt-8 rounded-[14px] bg-red-wash p-6">
              <p className="font-semibold text-red">This one didn’t come out right</p>
              <p className="mt-1 text-sm text-ink-2">{item.error || "Something failed while making it."} Tell us what you want and we’ll try again. This doesn’t use a revision.</p>
              <div className="mt-5"><ChangesForm itemId={id} revLeft={1} free /></div>
            </div>
          )}

          {posting && (
            <div className="mt-8 flex items-center gap-4 rounded-[14px] bg-mint-wash/70 p-6" role="status" aria-live="polite">
              <Loader2 className="size-8 shrink-0 animate-spin text-mint-deep" aria-hidden />
              <div>
                <p className="font-semibold text-mint-deep">Posting to {conn ? `@${conn.igUsername} and ${conn.pageName}` : "Instagram and Facebook"} now…</p>
                <p className="text-sm text-ink-2">This takes up to a minute. You don’t need to click again; this page updates by itself.</p>
              </div>
            </div>
          )}

          {(item.status === "scheduled" || item.status === "approved") && !posting && (
            <div className="mt-8 flex items-center justify-between gap-6 rounded-[14px] bg-mint-wash/70 p-6">
              <div className="flex items-center gap-4">
                <ApproveMark draw={sp.approved === id} className="w-12" />
                <div>
                  <p className="font-semibold text-mint-deep">Approved. Scheduled for {fmtDateTime(item.slotAt)}.</p>
                  <p className="text-sm text-ink-2">{conn ? `Will post to @${conn.igUsername} and ${conn.pageName}.` : "Connect Instagram and Facebook in Accounts so this can post."}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={postNow}><input type="hidden" name="itemId" value={id} /><SubmitButton className="btn btn-primary" pending="Posting">Post now</SubmitButton></form>
                <form action={unscheduleItem}><input type="hidden" name="itemId" value={id} /><SubmitButton className="btn btn-ghost" pending="Pulling back">Pull back for changes</SubmitButton></form>
              </div>
            </div>
          )}

          {item.status === "published" && (
            <div className="mt-8 rounded-[14px] bg-mint-wash/70 p-6">
              <p className="flex items-center gap-2 font-semibold text-mint-deep"><Check className="size-5" aria-hidden />Posted{postedAt ? ` · ${fmtDateTime(postedAt)}` : ""}</p>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {published.filter((p) => p.status === "published").map((p) => {
                  const href = p.platform === "facebook" ? `https://www.facebook.com/${p.remoteId}` : conn?.igUsername ? `https://www.instagram.com/${conn.igUsername}/` : null;
                  const label = p.platform === "facebook" ? "View on Facebook" : "View on Instagram";
                  return <li key={p.id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">{label}</a> : <span className="capitalize">{p.platform}: posted</span>}</li>;
                })}
              </ul>
            </div>
          )}

          {copy && (
            <dl className="mt-10 divide-y divide-line border-y border-line text-[0.93rem]">
              {item.type === "post" ? (
                <>
                  <Row k="Text on image">{copy.on_image_text}{copy.sub_text ? <span className="block text-ink-2">{copy.sub_text}</span> : null}</Row>
                  <Row k="Alt text">{copy.alt_text}</Row>
                </>
              ) : (
                <>
                  <Row k="Voiceover">{copy.vo_script}</Row>
                  <Row k="Scenes">
                    <ol className="list-decimal space-y-1 pl-4">{(copy.scenes || []).map((s: { on_screen_text: string; spoken: string }, i: number) => <li key={i}><span className="font-semibold">{s.on_screen_text}</span> <span className="text-ink-2">· {s.spoken}</span></li>)}</ol>
                  </Row>
                </>
              )}
              <Row k="Why this post">{brief.angle || brief.goal}</Row>
            </dl>
          )}

          {history.length > 0 && (
            <div className="mt-10">
              <h2 className="text-[1.02rem] font-bold">History</h2>
              <ol className="mt-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${h.decision === "approved" ? "bg-mint" : "bg-amber"}`} aria-hidden />
                    <span><span className="font-semibold">{h.decision === "approved" ? "Approved" : "Changes requested"}</span> <span className="tnum text-ink-3">· {fmtDateTime(h.createdAt)}</span>{h.comment && <span className="mt-0.5 block text-ink-2">“{h.comment}”</span>}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-6 py-3.5">
      <dt className="font-semibold text-ink-2">{k}</dt>
      <dd className="leading-relaxed">{children}</dd>
    </div>
  );
}
