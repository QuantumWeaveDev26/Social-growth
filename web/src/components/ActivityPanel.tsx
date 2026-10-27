"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Film, Image as ImageIcon, Fingerprint, CalendarRange, Send, Clock, PauseCircle } from "lucide-react";
import type { Activity, ActivityJob } from "@/lib/activity";

const POST_STEPS = ["Writing the caption and copy", "Editing and checking the copy", "Creating the image", "Adding the logo"];
const REEL_STEPS = ["Writing the caption and copy", "Editing and checking the copy", "Creating scene 1 of 4", "Creating scene 2 of 4", "Creating scene 3 of 4", "Creating scene 4 of 4", "Recording the voiceover", "Rendering the video"];
const OTHER_STEPS: Record<string, string[]> = {
  brand_profile: ["Reading your website", "Writing the brand profile"],
  plan_month: ["Choosing topics for the month"],
};

function stepIndex(j: ActivityJob) {
  const steps = j.kind === "generate_item" ? (j.itemType === "reel" ? REEL_STEPS : POST_STEPS) : OTHER_STEPS[j.kind] ?? [];
  const label = j.step === "Rewriting with the customer’s note" ? steps[0] : j.step;
  const i = steps.indexOf(label ?? "");
  return { i: Math.max(i, 0), n: steps.length || 1, known: i >= 0 };
}

const dur = (ms: number | null) => {
  if (ms == null) return "";
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};
const ago = (now: number, t: number) => {
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(t);
};
const when = (t: number) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(t);

function KindIcon({ j }: { j: Pick<ActivityJob, "kind" | "itemType"> }) {
  const c = "size-4 shrink-0 text-ink-3";
  if (j.kind === "brand_profile") return <Fingerprint className={c} aria-hidden />;
  if (j.kind === "plan_month") return <CalendarRange className={c} aria-hidden />;
  if (j.kind === "publish") return <Send className={c} aria-hidden />;
  return j.itemType === "reel" ? <Film className={c} aria-hidden /> : <ImageIcon className={c} aria-hidden />;
}

export function ActivityPanel({ initial, admin = false, itemHref = (id: string) => `/app/items/${id}` }: { initial: Activity; admin?: boolean; itemHref?: (id: string) => string | null }) {
  const [a, setA] = useState(initial);
  const [tick, setTick] = useState(Date.now());
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/activity", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = (await r.json()) as Activity;
        if (alive) { setA(j); setStale(false); }
      } catch { if (alive) setStale(true); }
    };
    const poll = setInterval(load, 2500);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, []);

  const skew = tick - a.now; // keep timers moving between polls
  const link = (j: { itemId: string | null }, children: React.ReactNode) => {
    const href = j.itemId ? (admin ? null : itemHref(j.itemId)) : null;
    return href ? <Link href={href} className="hover:text-mint-deep hover:underline">{children}</Link> : children;
  };

  return (
    <div>
      {/* worker status */}
      <div className={`flex flex-wrap items-center justify-between gap-4 rounded-[14px] px-5 py-4 ${a.worker.online ? "bg-sheet ring-1 ring-line" : "bg-amber-wash"}`} role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="relative flex size-2.5">
            {a.worker.online && a.worker.active > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60 motion-reduce:animate-none" />}
            <span className={`relative inline-flex size-2.5 rounded-full ${a.worker.online ? "bg-mint" : "bg-amber"}`} />
          </span>
          {a.worker.online ? (
            <p className="text-[0.95rem]">
              <span className="font-semibold">Background worker is running</span>
              <span className="tnum text-ink-2"> · {a.worker.active} of {a.worker.concurrency} slots busy{admin && a.worker.host ? ` · ${a.worker.host}` : ""}</span>
            </p>
          ) : (
            <p className="text-[0.95rem] text-amber-deep">
              <span className="font-semibold">Background worker isn’t running.</span> Nothing new will be made or posted until it starts{admin ? " (npm run worker)" : ""}.
              {a.worker.lastBeat && <span className="tnum"> Last seen {ago(tick, a.worker.lastBeat)}.</span>}
            </p>
          )}
        </div>
        <p className="tnum text-sm text-ink-2">
          Today: <span className="font-semibold text-ink">{a.today.done}</span> made · <span className="font-semibold text-ink">{a.today.published}</span> posted
          {a.today.failed > 0 && <> · <span className="font-semibold text-red">{a.today.failed}</span> failed</>}
          {stale && <span className="ml-3 text-amber-deep">Reconnecting…</span>}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-10">
        <div className="min-w-0 space-y-9">
          <section aria-labelledby="now-h">
            <h2 id="now-h" className="flex items-baseline gap-2 text-[1.05rem] font-bold">Working on now <span className="tnum text-sm font-medium text-ink-3">{a.running.length}</span></h2>
            {a.running.length === 0 ? (
              <p className="mt-3 rounded-[12px] border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">
                {a.queuedTotal ? "Picking up the next job…" : "Nothing is being made right now."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {a.running.map((j) => {
                  const s = stepIndex(j);
                  const pct = ((s.i + 0.5) / s.n) * 100;
                  return (
                    <li key={j.id} className="rounded-[12px] bg-sheet px-4 py-3.5 ring-1 ring-line">
                      <div className="flex items-start gap-3">
                        <KindIcon j={j} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.93rem] font-semibold">{link(j, j.title)}</p>
                          {admin && j.customer && <p className="truncate text-xs text-ink-3">{j.customer}</p>}
                          <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
                            <Loader2 className="size-3.5 animate-spin text-mint-deep motion-reduce:animate-none" aria-hidden />
                            {j.step ?? "Starting"}
                            {s.known && s.n > 1 && <span className="tnum text-ink-3">· step {s.i + 1} of {s.n}</span>}
                          </p>
                        </div>
                        <span className="tnum text-sm text-ink-3" title="Time on this job">{dur(j.durationMs != null ? j.durationMs + skew : null)}</span>
                      </div>
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#e5ebe8]" aria-hidden>
                        <div className="h-full rounded-full bg-mint transition-[width] duration-700 ease-[var(--ease-out-expo)]" style={{ width: `${pct}%` }} />
                      </div>
                      {j.attempts > 1 && <p className="mt-2 text-xs text-amber-deep">Retry {j.attempts - 1}: the last attempt failed</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="q-h">
            <h2 id="q-h" className="flex items-baseline gap-2 text-[1.05rem] font-bold">Waiting in line <span className="tnum text-sm font-medium text-ink-3">{a.queuedTotal}</span></h2>
            {a.queued.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">The queue is empty.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line border-y border-line">
                {a.queued.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2.5 text-[0.9rem]">
                    <KindIcon j={j} />
                    <span className="min-w-0 flex-1 truncate">{j.title}{admin && j.customer && <span className="text-ink-3"> · {j.customer}</span>}</span>
                    {j.attempts > 0 ? <span className="chip bg-amber-wash text-amber-deep">Retrying</span> : <Clock className="size-3.5 text-ink-3" aria-label="Queued" />}
                  </li>
                ))}
              </ol>
            )}
            {a.queuedTotal > a.queued.length && <p className="tnum mt-2 text-sm text-ink-3">and {a.queuedTotal - a.queued.length} more</p>}
            {a.held > 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-2"><PauseCircle className="size-4 text-ink-3" aria-hidden /><span className="tnum">{a.held}</span> on hold for later</p>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-9">
          <section aria-labelledby="r-h">
            <h2 id="r-h" className="text-[1.05rem] font-bold">Recently finished</h2>
            {a.recent.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">Nothing has finished yet.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line border-y border-line">
                {a.recent.map((j) => (
                  <li key={j.id} className="py-2.5">
                    <div className="flex items-center gap-3 text-[0.9rem]">
                      {j.status === "done" ? <CheckCircle2 className="size-4 shrink-0 text-mint-deep" aria-label="Done" /> : <XCircle className="size-4 shrink-0 text-red" aria-label="Failed" />}
                      <span className="min-w-0 flex-1 truncate">{link(j, j.title)}{admin && j.customer && <span className="text-ink-3"> · {j.customer}</span>}</span>
                      <span className="tnum shrink-0 text-xs text-ink-3">{j.durationMs ? `${dur(j.durationMs)} · ` : ""}{ago(tick, j.at)}</span>
                    </div>
                    {j.status === "failed" && j.error && <p className="ml-7 mt-1 line-clamp-2 text-xs text-red">{j.error}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="u-h">
            <h2 id="u-h" className="text-[1.05rem] font-bold">Next to post</h2>
            {a.upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">Nothing is scheduled yet. Approved posts show up here.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line border-y border-line">
                {a.upcoming.map((u) => (
                  <li key={u.itemId} className="flex items-center gap-3 py-2.5 text-[0.9rem]">
                    <KindIcon j={{ kind: "generate_item", itemType: u.type }} />
                    <span className="min-w-0 flex-1 truncate">{link(u, u.title)}{admin && u.customer && <span className="text-ink-3"> · {u.customer}</span>}</span>
                    <span className="tnum shrink-0 text-xs text-ink-3">{when(u.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Compact live status for the sidebar. */
export function ActivityPill({ dark = true }: { dark?: boolean }) {
  const [s, setS] = useState<{ online: boolean; running: number; queued: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/activity", { cache: "no-store" });
        const j = (await r.json()) as Activity;
        if (alive) setS({ online: j.worker.online, running: j.running.length, queued: j.queuedTotal });
      } catch { /* keep last state */ }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!s) return null;
  const label = !s.online ? "Worker offline" : s.running ? `Making ${s.running} now${s.queued ? ` · ${s.queued} waiting` : ""}` : s.queued ? `${s.queued} waiting` : "All caught up";
  return (
    <span className={`tnum flex items-center gap-2 text-[0.8rem] ${dark ? "" : "text-ink-2"}`}>
      {s.online && s.running ? <Loader2 className="size-3.5 animate-spin text-mint motion-reduce:animate-none" aria-hidden /> : <span className={`size-2 rounded-full ${s.online ? "bg-mint" : "bg-amber"}`} aria-hidden />}
      {label}
    </span>
  );
}
