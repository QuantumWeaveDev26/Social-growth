import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { SubmitButton } from "@/components/SubmitButton";
import { mediaUrl } from "@/lib/storage";
import { fmtDateTime } from "@/lib/format";
import { READY_PLAN, istParts } from "@/lib/ready";
import { businessConnectLive, systemUserPages, MetaError } from "@/lib/meta";
import { adminReadyUpload, adminReadySave, adminReadyUnschedule, adminReadyDelete, adminReadyScheduleAll, adminConnectBusinessPage, adminDisconnectMeta, adminReadyWriteCopy, adminReadyWriteCopyAll, adminReadyRemake, adminReadyUndo, adminReadyReplace, adminReadySendReview } from "./ready";
import { ZipUpload, RefreshWhile } from "./ZipUpload";

const STATUS: Record<string, { label: string; cls: string }> = {
  ready_draft: { label: "Draft", cls: "bg-paper text-ink-2 ring-1 ring-line" },
  approved: { label: "Scheduled", cls: "bg-mint-wash text-mint-deep" },
  scheduled: { label: "Scheduled", cls: "bg-mint-wash text-mint-deep" },
  published: { label: "Posted", cls: "bg-ink text-white" },
  failed: { label: "Failed", cls: "bg-red-wash text-red" },
  awaiting_approval: { label: "With client for review", cls: "bg-amber-wash text-amber-deep" },
};

/** Connect a client's Page through our Business Manager system user (partner access). */
export async function BusinessConnect({ customerId, connectedPageId }: { customerId: string; connectedPageId?: string | null }) {
  const Hidden = () => <input type="hidden" name="customerId" value={customerId} />;
  if (!businessConnectLive()) {
    return <p className="mt-3 text-xs text-ink-3">To connect Pages you manage through partner access, set <code>META_SYSTEM_USER_TOKEN</code> on the server.</p>;
  }
  let pages: Awaited<ReturnType<typeof systemUserPages>> = [];
  let err = "";
  try { pages = await systemUserPages(); } catch (e) { err = e instanceof MetaError ? e.message : String(e); }
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-semibold">Connect through Business Manager</p>
      {err ? <p className="mt-1 text-sm text-red">Couldn’t list Pages: {err}</p>
        : !pages.length ? <p className="mt-1 text-sm text-ink-2">No Pages are assigned to the system user yet.</p>
        : (
          <form action={adminConnectBusinessPage} className="mt-2 flex flex-wrap gap-2"><Hidden />
            <select name="pageId" defaultValue={connectedPageId ?? undefined} className="field min-w-0 flex-1 py-1.5">
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.igUsername ? ` · @${p.igUsername}` : " · no Instagram linked"}</option>)}
            </select>
            <SubmitButton className="btn btn-ghost" pending="Connecting">{connectedPageId ? "Switch" : "Connect"}</SubmitButton>
          </form>
        )}
      {connectedPageId && (
        <form action={adminDisconnectMeta} className="mt-2"><Hidden /><SubmitButton className="btn btn-ghost w-full" pending="Removing">Disconnect</SubmitButton></form>
      )}
    </div>
  );
}

/** Upload ready-made posts/reels, set captions + times, schedule. The normal worker posts them. */
export function ReadyContent({ customerId, connected, postingTimes }: { customerId: string; connected: boolean; postingTimes: string[] }) {
  const items = db.select().from(schema.contentItems)
    .where(and(eq(schema.contentItems.customerId, customerId), eq(schema.contentItems.planId, READY_PLAN)))
    .orderBy(asc(schema.contentItems.slotAt)).all();
  const drafts = items.filter((i) => i.status === "ready_draft").length;
  const scheduled = items.filter((i) => ["approved", "scheduled"].includes(i.status)).length;
  const inReview = items.filter((i) => i.status === "awaiting_approval").length;
  const asked = items.filter((i) => i.pendingNote && i.status === "ready_draft").length;
  const posted = items.filter((i) => i.status === "published").length;
  const today = istParts(new Date()).day;
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  const notes = String(JSON.parse(c?.details || "{}").caption_notes || "");
  const busy = (i: (typeof items)[number]) => /captions…|^Remaking/.test(i.error || "") && i.updatedAt.getTime() > Date.now() - 15 * 60_000; // being written / remade now
  const writing = items.some(busy);
  const noCaption = items.filter((i) => i.status === "ready_draft" && !String(JSON.parse(i.copy || "{}").instagram_caption || "").trim() && !busy(i)).length;
  const Hidden = () => <input type="hidden" name="customerId" value={customerId} />;

  return (
    <section className="mt-10 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">Ready-made content</h2>
          <p className="tnum mt-1 text-sm text-ink-2">Posts and reels made outside the generator. {drafts} draft · {inReview} with client · {scheduled} scheduled · {posted} posted. Times are India time.</p>
          {asked > 0 && <p className="mt-2 text-sm font-semibold text-amber-deep">The client asked for changes on {asked} {asked === 1 ? "item" : "items"} (marked below).</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {noCaption > 0 && <form action={adminReadyWriteCopyAll}><Hidden /><SubmitButton className="btn btn-ghost" pending="Starting">Write captions with AI ({noCaption})</SubmitButton></form>}
          {drafts > 0 && <form action={adminReadyScheduleAll}><Hidden /><SubmitButton pending="Scheduling">Schedule all drafts with captions</SubmitButton></form>}
        </div>
      </div>
      {!connected && <p className="mt-3 rounded-[10px] bg-amber-wash p-3 text-sm text-amber-deep">Facebook/Instagram isn’t connected for this client yet. Scheduled items wait and go out once it’s connected.</p>}

      <RefreshWhile active={writing} />
      <ZipUpload customerId={customerId} today={today} times={postingTimes.join(", ")} notes={notes} />

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-ink-2">Or upload individual files</summary>
      <form action={adminReadyUpload} className="mt-3 grid gap-3 rounded-[12px] bg-paper p-4 ring-1 ring-line md:grid-cols-[1.4fr_1fr_1fr_0.7fr]">
        <Hidden />
        <div className="md:col-span-4">
          <label className="label" htmlFor="r-files">Files (images = posts, .mp4 = reels). They’re placed on the calendar in file-name order.</label>
          <input id="r-files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" required className="field" />
        </div>
        <div><label className="label" htmlFor="r-cap">Caption for all (blank = AI writes each)</label><input id="r-cap" name="caption" className="field" /></div>
        <div><label className="label" htmlFor="r-day">Start date</label><input id="r-day" name="startDay" type="date" defaultValue={today} className="field" /></div>
        <div><label className="label" htmlFor="r-times">Times each posting day</label><input id="r-times" name="times" defaultValue={postingTimes.join(", ")} className="field" /></div>
        <div><label className="label" htmlFor="r-every">Every … days</label><input id="r-every" name="everyDays" type="number" min={1} max={14} defaultValue={1} className="field" /></div>
        <div className="md:col-span-4"><SubmitButton pending="Uploading">Upload and place on calendar</SubmitButton></div>
      </form>
      </details>

      {items.length > 0 && (
        <div className="mt-6 space-y-4">
          {items.map((it) => {
            const copy = JSON.parse(it.copy || "{}");
            const { day, time } = istParts(it.slotAt);
            const st = STATUS[it.status] ?? { label: it.status, cls: "bg-paper text-ink-2" };
            const locked = it.status === "published";
            const url = mediaUrl(it.mediaPath)!;
            const brief = JSON.parse(it.brief || "{}");
            const slides: string[] = Array.isArray(brief.slides) ? brief.slides : [];
            const versions = Array.isArray(brief.versions) ? brief.versions.length : 0;
            const ad = copy.ad as { primary_text?: string; headline?: string; description?: string } | null | undefined;
            return (
              <div key={it.id} className="grid gap-4 rounded-[12px] p-4 ring-1 ring-line md:grid-cols-[160px_1fr]">
                <div>
                  {it.type === "reel" ? <video src={url} controls preload="metadata" className="aspect-[9/16] w-full rounded-[10px] bg-ink object-cover" />
                    : <img src={url} alt="" className="w-full rounded-[10px]" />}
                  {slides.length > 1 && (
                    <div className="mt-1 grid grid-cols-4 gap-1">{slides.slice(1, 9).map((s) => <img key={s} src={mediaUrl(s)!} alt="" className="aspect-square w-full rounded object-cover" />)}</div>
                  )}
                  <p className="mt-1 truncate text-xs text-ink-3" title={brief.file}>{it.type === "reel" ? "Reel" : slides.length > 1 ? `Carousel · ${slides.length} slides` : "Post"} · {brief.file}</p>
                </div>
                <form action={adminReadySave} className="grid gap-3">
                  <input type="hidden" name="itemId" value={it.id} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="tnum text-sm text-ink-2">{fmtDateTime(it.slotAt)}</span>
                    {it.error && <span className={`text-sm ${/captions…|^Remaking/.test(it.error) ? "text-ink-2" : "text-red"}`}>{it.error}</span>}
                  </div>
                  {Array.isArray(brief.lastEdit) && brief.lastEdit.length > 0 && <p className="text-xs text-ink-3">Last video edit re-filmed {brief.lastEdit.map((x: { start: number; end: number }) => `${x.start}–${x.end} s`).join(", ")}. Watch those parts before sending it on.</p>}
                  {it.pendingNote && <p className="rounded-[10px] bg-amber-wash p-3 text-sm text-amber-deep"><span className="font-semibold">Client asked for changes:</span> {it.pendingNote}</p>}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><label className="label" htmlFor={`ig-${it.id}`}>Instagram caption</label><textarea id={`ig-${it.id}`} name="ig" rows={5} defaultValue={copy.instagram_caption || ""} disabled={locked} maxLength={2200} className="field" /></div>
                    <div><label className="label" htmlFor={`fb-${it.id}`}>Facebook post (blank = same as Instagram)</label><textarea id={`fb-${it.id}`} name="fb" rows={5} defaultValue={copy.facebook_post && copy.facebook_post !== copy.instagram_caption ? copy.facebook_post : ""} disabled={locked} className="field" /></div>
                  </div>
                  {ad && (ad.primary_text || ad.headline) && (
                    <div className="rounded-[10px] bg-paper p-3 text-sm ring-1 ring-line">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Meta ad copy (for boosting / Ads Manager)</p>
                      <p className="mt-1"><span className="text-ink-3">Primary text:</span> {ad.primary_text}</p>
                      <p><span className="text-ink-3">Headline:</span> {ad.headline}</p>
                      <p><span className="text-ink-3">Description:</span> {ad.description}</p>
                    </div>
                  )}
                  {!locked && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div><label className="label" htmlFor={`d-${it.id}`}>Date</label><input id={`d-${it.id}`} name="day" type="date" defaultValue={day} className="field py-1.5" /></div>
                      <div><label className="label" htmlFor={`t-${it.id}`}>Time</label><input id={`t-${it.id}`} name="time" type="time" defaultValue={time} className="field py-1.5" /></div>
                      <SubmitButton className="btn btn-ghost" pending="Saving">Save</SubmitButton>
                      {it.status === "ready_draft" && <SubmitButton name="schedule" value="1" pending="Scheduling">Save and schedule</SubmitButton>}
                    </div>
                  )}
                </form>
                {!locked && (
                  <div className="grid gap-3 md:col-start-2">
                    <div className="flex flex-wrap gap-2">
                      {it.status !== "awaiting_approval" && copy.instagram_caption && !busy(it) && <form action={adminReadySendReview}><input type="hidden" name="itemId" value={it.id} /><SubmitButton className="btn btn-ghost" pending="Sending">Send to client for review</SubmitButton></form>}
                      {it.status !== "ready_draft" && <form action={adminReadyUnschedule}><input type="hidden" name="itemId" value={it.id} /><SubmitButton className="btn btn-ghost" pending="Saving">{it.status === "awaiting_approval" ? "Take back from review" : "Unschedule"}</SubmitButton></form>}
                      {versions > 0 && !busy(it) && <form action={adminReadyUndo}><input type="hidden" name="itemId" value={it.id} /><SubmitButton className="btn btn-ghost" pending="Restoring">Undo last change ({versions} earlier version{versions === 1 ? "" : "s"})</SubmitButton></form>}
                      <form action={adminReadyDelete}><input type="hidden" name="itemId" value={it.id} /><SubmitButton className="btn btn-ghost" pending="Deleting">Delete</SubmitButton></form>
                    </div>
                    <details className="rounded-[10px] bg-paper p-3 ring-1 ring-line" open={!!it.pendingNote}>
                      <summary className="cursor-pointer text-sm font-semibold">Change this {it.type === "reel" ? "reel" : slides.length > 1 ? "carousel" : "post"}: remake with a prompt, replace the file, or rewrite captions</summary>
                      <form action={adminReadyRemake} className="mt-3 grid gap-2">
                        <input type="hidden" name="itemId" value={it.id} />
                        <label className="label" htmlFor={`rp-${it.id}`}>{it.type === "reel" ? "What should change in this video?" : "What should change? (Gemini image)"}</label>
                        <textarea id={`rp-${it.id}`} name="prompt" rows={3} required minLength={4} defaultValue={it.pendingNote || ""} className="field" placeholder={it.type === "reel" ? "e.g. Remove the man in the blue shirt (see the reference image) and his name title; keep everything else as it is" : "e.g. Make the headline say “Same team. Same look.” and change the polo colour to navy"} />
                        <div className="flex flex-wrap items-end gap-3 text-sm">
                          <div><label className="label" htmlFor={`rm-${it.id}`}>How</label>
                            <select id={`rm-${it.id}`} name="mode" className="field py-1.5">
                              {it.type === "reel" ? (<>
                                <option value="video_edit">Edit this video: change only the parts the prompt is about (keeps the rest and the audio)</option>
                                <option value="video_frame">New 8-second video starting from the current video’s first frame</option>
                                <option value="video_new">New start image from the prompt, then video</option>
                              </>) : (<>
                                <option value="edit">Edit the current image (keep the rest)</option>
                                <option value="new">New image in the same style</option>
                                <option value="video_new">Turn it into a reel (Veo 3.1)</option>
                              </>)}
                            </select></div>
                          <div><label className="label" htmlFor={`rr-${it.id}`}>Reference images (optional: a screenshot of the person, frame or product)</label><input id={`rr-${it.id}`} name="refs" type="file" multiple accept="image/jpeg,image/png,image/webp" className="field py-1.5" /></div>
                          {slides.length > 1 && <div><label className="label" htmlFor={`rs-${it.id}`}>Slide</label><input id={`rs-${it.id}`} name="slide" type="number" min={1} max={slides.length} defaultValue={1} className="field w-20 py-1.5" /></div>}
                          <div><label className="label" htmlFor={`sec-${it.id}`}>Video length (new videos)</label><select id={`sec-${it.id}`} name="seconds" defaultValue="8" className="field py-1.5"><option value="4">4 s</option><option value="6">6 s</option><option value="8">8 s</option></select></div>
                          <label className="flex items-center gap-1.5"><input type="checkbox" name="audio" value="1" />Video with natural sound</label>
                          <label className="flex items-center gap-1.5"><input type="checkbox" name="logo" value="1" />Add the client’s logo (new images)</label>
                          <label className="flex items-center gap-1.5"><input type="checkbox" name="recaption" value="1" />Rewrite captions after</label>
                        </div>
                        <div><SubmitButton pending="Starting" disabled={busy(it)}>Remake</SubmitButton> <span className="text-xs text-ink-3">Runs even while AI generation is paused. Image about $0.10, new video about $0.80 for 8 s; “Edit this video” costs about $0.10 per second it re-films. You can undo it.</span></div>
                      </form>
                      <form action={adminReadyReplace} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                        <input type="hidden" name="itemId" value={it.id} />
                        <div><label className="label" htmlFor={`rf-${it.id}`}>Or replace with new file(s) from the designer (several images = carousel)</label><input id={`rf-${it.id}`} name="files" type="file" multiple required accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="field" /></div>
                        <SubmitButton className="btn btn-ghost" pending="Uploading">Replace</SubmitButton>
                      </form>
                      <form action={adminReadyWriteCopy} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                        <input type="hidden" name="itemId" value={it.id} />
                        <div className="min-w-[16rem] flex-1"><label className="label" htmlFor={`cn-${it.id}`}>Rewrite captions with AI (optional instruction)</label><input id={`cn-${it.id}`} name="note" className="field" placeholder="e.g. Mention free logo mock-up, keep it shorter" /></div>
                        <SubmitButton className="btn btn-ghost" pending="Writing (≈15 s)">Rewrite captions</SubmitButton>
                      </form>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
