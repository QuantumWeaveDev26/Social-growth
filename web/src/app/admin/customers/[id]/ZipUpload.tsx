"use client";
/** Uploads a content zip with a progress bar (streams the file to /api/admin/ready-zip), then refreshes. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ZipUpload({ customerId, today, times, notes }: { customerId: string; today: string; times: string; notes: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ startDay: today, times, everyDays: "1", notes });

  function send() {
    const zip = file.current?.files?.[0];
    if (!zip) { setMsg("Choose a .zip first"); return; }
    const q = new URLSearchParams({ customerId, startDay: f.startDay, times: f.times, everyDays: f.everyDays, notes: f.notes });
    const x = new XMLHttpRequest();
    x.open("POST", `/api/admin/ready-zip?${q}`);
    x.setRequestHeader("Content-Type", "application/zip");
    x.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => {
      let r: { created?: number; error?: string } = {};
      try { r = JSON.parse(x.responseText); } catch { /* not JSON */ }
      setPct(null);
      if (x.status >= 200 && x.status < 300) { setMsg(`Added ${r.created} items. Captions are being written now (about 15 seconds each) and appear below as they finish.`); if (file.current) file.current.value = ""; router.refresh(); }
      else setMsg(r.error || `Upload failed (${x.status})`);
    };
    x.onerror = () => { setPct(null); setMsg("Upload failed: network error"); };
    setMsg(""); setPct(0);
    x.send(zip);
  }

  const busy = pct !== null;
  return (
    <div className="mt-5 grid gap-3 rounded-[12px] bg-paper p-4 ring-1 ring-line md:grid-cols-[1.4fr_1fr_1fr_0.7fr]">
      <div className="md:col-span-4">
        <p className="text-sm font-semibold">Upload a content zip (AI writes the captions)</p>
        <p className="mt-0.5 text-xs text-ink-3">Images become posts, <code>NAME_slide1.png</code>, <code>NAME_slide2.png</code>… become one carousel, .mp4 files become reels. Reels are spread between posts. The AI looks at each creative and writes the Instagram caption, Facebook post, hashtags and Meta ad copy.</p>
      </div>
      <div className="md:col-span-4"><input ref={file} type="file" accept=".zip,application/zip" className="field" disabled={busy} aria-label="Content zip" /></div>
      <div className="md:col-span-4">
        <label className="label" htmlFor="z-notes">Facts for the captions (WhatsApp, website, location, programmes, offers; only true facts)</label>
        <textarea id="z-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="field" placeholder="e.g. WhatsApp +91 9xxxxxxxxx · Yelahanka, Bengaluru · clay courts · coaching for ages 4+ and adults" />
      </div>
      <div><label className="label" htmlFor="z-day">Start date</label><input id="z-day" type="date" value={f.startDay} onChange={(e) => setF({ ...f, startDay: e.target.value })} className="field" /></div>
      <div><label className="label" htmlFor="z-times">Times each posting day</label><input id="z-times" value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} className="field" /></div>
      <div><label className="label" htmlFor="z-every">Every … days</label><input id="z-every" type="number" min={1} max={14} value={f.everyDays} onChange={(e) => setF({ ...f, everyDays: e.target.value })} className="field" /></div>
      <div className="flex items-end"><button type="button" onClick={send} disabled={busy} className="btn w-full">{busy ? `Uploading ${pct}%` : "Upload zip"}</button></div>
      {busy && <div className="h-2 overflow-hidden rounded-full bg-line md:col-span-4"><div className="h-full bg-mint-deep transition-all" style={{ width: `${pct}%` }} /></div>}
      {msg && <p className="text-sm text-ink-2 md:col-span-4">{msg}</p>}
    </div>
  );
}

/** Refreshes the page every few seconds while captions are being written. */
export function RefreshWhile({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => router.refresh(), 6000);
    return () => clearTimeout(t);
  });
  return null;
}
