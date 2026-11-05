import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "../../AdminShell";
import { getCreator, getStudy, MAX_PASTE } from "@/lib/creators";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StudyForm } from "../Forms";
import { removeCreatorAction } from "../actions";

export const dynamic = "force-dynamic";

const when = (ms?: number) => (ms ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(ms) : "");

function activityUrl(url?: string) {
  const m = url?.match(/linkedin\.com\/(in|company)\/([^/?#]+)/i);
  if (!m) return null;
  return m[1].toLowerCase() === "in" ? `https://www.linkedin.com/in/${m[2]}/recent-activity/all/` : `https://www.linkedin.com/company/${m[2]}/posts/`;
}

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const c = getCreator(id);
  if (!c) notFound();
  const s = getStudy(id);
  const r = s?.report;
  const busy = !!s && ["queued", "running"].includes(s.status);
  const act = activityUrl(c.url);
  return (
    <AdminShell active="creators" email={admin.email}>
      <AutoRefresh active={busy} ms={5000} />
      <Link href="/admin/creators" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />All creators</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.85rem] leading-none tracking-[-0.03em] sm:text-[2.2rem]" style={{ fontWeight: 800 }}>{c.name}</h1>
          {c.notes && <p className="mt-2 text-ink-2">{c.notes}</p>}
        </div>
        <form action={removeCreatorAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-ghost text-sm">Remove creator</button></form>
      </div>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
          <h2 className="font-bold">{r ? "Update the study" : "Study their posts"}</h2>
          <div className="mt-3"><StudyForm id={c.id} max={MAX_PASTE} /></div>
        </div>
        <div className="rounded-[14px] bg-white p-5 ring-1 ring-line">
          <h2 className="font-bold">How to collect (2 minutes)</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-2">
            <li>{act ? <>Open <a href={act} target="_blank" rel="noreferrer" className="font-medium text-mint-deep underline">their posts page</a></> : <>Open their LinkedIn profile, then <b>Activity → Posts</b></>} in your normal browser, logged in as yourself.</li>
            <li>Scroll down until about 20–40 posts have loaded. Click <b>…see more</b> on long ones if you want the full text.</li>
            <li>Press <b>Ctrl+A</b>, then <b>Ctrl+C</b>.</li>
            <li>Paste into the box and click <b>Analyse posts</b>.</li>
          </ol>
          <p className="mt-3 text-xs text-ink-3">Please collect by hand. Bots or scrapers on LinkedIn break LinkedIn’s User Agreement and can get accounts restricted.</p>
        </div>
      </section>

      {s && s.status !== "done" && (
        <p className={`mt-6 rounded-[12px] px-5 py-4 text-sm ${s.status === "failed" ? "bg-red-wash text-red" : "bg-amber-wash text-amber-deep"}`}>
          {s.status === "failed" ? <>Analysis failed: {s.error} Paste the posts again to retry.</> : <>Analysing {s.chars?.toLocaleString("en-IN")} characters of posts… usually 1–2 minutes.</>}
        </p>
      )}

      {r && (
        <article className="mt-8 space-y-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
            <h2 className="text-lg font-bold">Study report</h2>
            <span className="tnum text-sm text-ink-3">{r.posts_analysed} posts · {when(s?.at)}{s?.engine ? ` · ${s.engine}` : ""}</span>
          </div>
          <p className="max-w-[75ch] text-[1.02rem] leading-relaxed">{r.summary}</p>
          {r.posting_rhythm && <p className="text-sm text-ink-2"><b>Rhythm:</b> {r.posting_rhythm}</p>}

          <Block title="Hook patterns">
            <ul className="divide-y divide-line">
              {r.hook_patterns.map((h, i) => (
                <li key={i} className="py-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">{h.name}</span>{h.share_pct != null && <span className="tnum text-xs text-ink-3">~{Math.round(h.share_pct)}% of posts</span>}</p>
                  <p className="mt-1 rounded-[8px] bg-white px-3 py-2 font-mono text-[0.85rem] ring-1 ring-line">{h.template}</p>
                  <p className="mt-1 text-sm text-ink-2">{h.why_it_works}</p>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Post structures">
            <ul className="space-y-3">{r.structures.map((x, i) => <li key={i}><p className="font-semibold">{x.name} <span className="font-normal text-ink-3">· {x.used_for}</span></p><p className="mt-1 whitespace-pre-line text-sm text-ink-2">{x.outline}</p></li>)}</ul>
          </Block>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Block title="Formatting">
              <dl className="space-y-1.5 text-sm">{Object.entries(r.formatting || {}).filter(([, v]) => v).map(([k, v]) => <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2"><dt className="capitalize text-ink-3">{k.replace(/_/g, " ")}</dt><dd>{v}</dd></div>)}</dl>
            </Block>
            <Block title="Topics">
              <ul className="space-y-1.5 text-sm">{r.topics.map((t, i) => <li key={i} className="flex justify-between gap-3"><span>{t.theme}</span>{t.share_pct != null && <span className="tnum text-ink-3">~{Math.round(t.share_pct)}%</span>}</li>)}</ul>
            </Block>
            <Block title="Calls to action">
              <ul className="space-y-1.5 text-sm">{r.ctas.map((x, i) => <li key={i}>{x.pattern}{x.how_often && <span className="text-ink-3"> · {x.how_often}</span>}</li>)}</ul>
            </Block>
            <Block title="Voice">
              <p className="text-sm">{r.voice?.tone}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{r.voice?.signature_moves?.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </Block>
          </div>

          {!!r.best_performers?.length && (
            <Block title="What performed best">
              <ul className="space-y-2 text-sm">{r.best_performers.map((b, i) => <li key={i}><b>{b.what}</b>: <span className="text-ink-2">{b.why}</span></li>)}</ul>
            </Block>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Block title="Use for small businesses" tone="mint">
              <ul className="list-disc space-y-1.5 pl-5 text-sm">{r.adapt_for_small_business.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </Block>
            <Block title="Don't copy" tone="red">
              <ul className="list-disc space-y-1.5 pl-5 text-sm">{r.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </Block>
          </div>
          <p className="text-sm text-ink-3">Next: go back to <Link href="/admin/creators" className="underline">All creators</Link> and click <b>Build playbook</b> to merge this into the LinkedIn playbook.</p>
        </article>
      )}
    </AdminShell>
  );
}

function Block({ title, tone, children }: { title: string; tone?: "mint" | "red"; children: React.ReactNode }) {
  const bg = tone === "mint" ? "bg-mint-wash/50" : tone === "red" ? "bg-red-wash/60" : "bg-sheet";
  return (
    <section className={`rounded-[14px] p-5 ring-1 ring-line ${bg}`}>
      <h3 className="mb-3 font-bold">{title}</h3>
      {children}
    </section>
  );
}
