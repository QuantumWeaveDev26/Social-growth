"use client";
import { useActionState, useState } from "react";
import { requestChanges } from "../../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

const QUICK = ["Make the photo warmer and brighter", "Shorter caption", "Less salesy", "Show the product closer", "Different headline"];

export function ChangesForm({ itemId, revLeft, free = false }: { itemId: string; revLeft: number; free?: boolean }) {
  const [state, action] = useActionState(requestChanges, undefined);
  const [text, setText] = useState("");
  const out = !free && revLeft <= 0;
  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor="comment" className="label">{free ? "What should we do differently?" : "Not quite right? Tell us what to change"}</label>
      <textarea id="comment" name="comment" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={out} className="field" placeholder="Use a photo of the shop front instead, and mention we open at 7am." />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" disabled={out} onClick={() => setText((t) => (t ? `${t.replace(/\.?\s*$/, ".")} ${q}.` : `${q}.`))}
            className="rounded-full bg-white px-3 py-1 text-[0.8rem] text-ink-2 ring-1 ring-line transition-colors hover:text-ink hover:ring-ink-3 disabled:opacity-50">{q}</button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <SubmitButton className="btn btn-amber" pending="Sending" disabled={out || text.trim().length < 4}>Remake with my note</SubmitButton>
        {!free && <span className="tnum text-sm text-ink-3">{out ? "No revisions left on this item" : `${revLeft} revision${revLeft === 1 ? "" : "s"} left`}</span>}
      </div>
      <div className="mt-3"><FormError message={state?.error} /></div>
    </form>
  );
}

export function PreviewTabs({ ig, fb }: { ig: React.ReactNode; fb: React.ReactNode }) {
  const [tab, setTab] = useState<"ig" | "fb">("ig");
  return (
    <div>
      <div role="tablist" aria-label="Preview" className="mb-4 inline-flex rounded-full bg-sheet p-1 ring-1 ring-line">
        {([["ig", "Instagram"], ["fb", "Facebook"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === k ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}>{l}</button>
        ))}
      </div>
      <div className="sticky top-6">{tab === "ig" ? ig : fb}</div>
    </div>
  );
}
