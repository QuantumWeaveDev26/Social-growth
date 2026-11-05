"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestChanges, startPaidRemake, finishPaidRemake, clearChangeNote } from "../../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

const QUICK = ["Make the photo warmer and brighter", "Shorter caption", "Less salesy", "Show the product closer", "Different headline"];

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

export function ChangesForm({ itemId, freeLeft, freeTotal, resetsOn, price, kind, live, free = false, pendingNote = null }: {
  itemId: string; freeLeft: number; freeTotal: number; resetsOn: string; price: number; kind: "post" | "reel"; live: boolean; free?: boolean; pendingNote?: string | null;
}) {
  const paid = !free && freeLeft <= 0;
  const [state, action] = useActionState(paid ? startPaidRemake : requestChanges, undefined);
  const [text, setText] = useState(pendingNote || "");
  const what = kind === "reel" ? "video" : "image";
  const [payErr, setPayErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const priceLabel = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  useEffect(() => {
    const o = state?.order;
    if (!o) return;
    const open = () => new window.Razorpay!({
      key: o.key, amount: o.amount, currency: "INR", order_id: o.id, name: "BrandMint AI", description: o.label,
      prefill: { name: o.name, email: o.email }, theme: { color: "#13221D" },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setConfirming(true);
        const res = await finishPaidRemake(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature);
        setConfirming(false);
        if ("error" in res && res.error) setPayErr(res.error); else router.refresh();
      },
    }).open();
    if (window.Razorpay) open();
    else { const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = open; s.onerror = () => setPayErr("The payment window couldn’t load. Check your connection and try again."); document.body.appendChild(s); }
  }, [state?.order, router]);

  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      {pendingNote && !paid && (
        <div className="mb-4 rounded-[10px] bg-mint-wash px-3 py-2.5 text-sm text-mint-deep">
          <p className="font-semibold">Change noted for your next revision round</p>
          <p className="mt-0.5 text-ink-2">“{pendingNote}”</p>
          <p className="mt-1">Note changes on any other items too, then click <b>Submit revision round</b> on your proof sheet to send them all at once.</p>
          <button formAction={clearChangeNote} className="mt-1.5 text-sm font-semibold underline">Remove this note</button>
        </div>
      )}
      <label htmlFor="comment" className="label">{free ? "What should we do differently?" : pendingNote && !paid ? "Edit your note" : "Not quite right? Tell us what to change"}</label>
      <textarea id="comment" name="comment" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="field" placeholder="Use a photo of the shop front instead, and mention we open at 7am." />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setText((t) => (t ? `${t.replace(/\.?\s*$/, ".")} ${q}.` : `${q}.`))}
            className="rounded-full bg-white px-3 py-1 text-[0.8rem] text-ink-2 ring-1 ring-line transition-colors hover:text-ink hover:ring-ink-3">{q}</button>
        ))}
      </div>
      {paid && (
        <p className="mt-4 rounded-[10px] bg-amber-wash px-3 py-2 text-sm text-amber-deep">
          You’ve used your {freeTotal} revision round{freeTotal === 1 ? "" : "s"} this month. They reset on {resetsOn}. You can still change this {what} now for {priceLabel} (GST included), paid securely with Razorpay.
        </p>
      )}
      <div className="mt-4 flex items-center gap-4">
        <SubmitButton className="btn btn-amber" pending={paid ? "Opening payment" : "Sending"} disabled={text.trim().length < 4 || confirming}>
          {confirming ? "Confirming payment…" : paid ? `Pay ${priceLabel} and remake${live ? "" : " (demo)"}` : free ? "Try again with my note" : pendingNote ? "Update note" : "Add to revision round"}
        </SubmitButton>
        {!free && !paid && <span className="tnum text-sm text-ink-3">{freeLeft} of {freeTotal} revision round{freeTotal === 1 ? "" : "s"} left this month</span>}
      </div>
      <div className="mt-3"><FormError message={state?.error || payErr} /></div>
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
