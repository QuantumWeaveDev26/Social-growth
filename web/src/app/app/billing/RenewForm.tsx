"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { demoRenew, setupAutopay, switchPlan, stopAutopay, confirmAutopay } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";
import type { Plan } from "@/db/schema";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

/** mode: setup = start auto-pay · switch = change plan from next charge · demo = free renewal on a demo server */
export function PlanForm({ plans, current, mode, label }: { plans: Plan[]; current: string; mode: "setup" | "switch" | "demo"; label: string }) {
  const fn = mode === "setup" ? setupAutopay : mode === "switch" ? switchPlan : demoRenew;
  const [state, action] = useActionState(fn, undefined);
  const [plan, setPlan] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const o = state?.checkout;
    if (!o) return;
    const open = () => new window.Razorpay!({
      key: o.key, subscription_id: o.subscriptionId, name: "BrandMint AI", description: o.plan,
      prefill: { name: o.name, email: o.email }, theme: { color: "#13221D" },
      handler: async (r: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
        const res = await confirmAutopay(r.razorpay_payment_id, r.razorpay_subscription_id, r.razorpay_signature);
        if ("error" in res && res.error) setErr(res.error); else router.push("/app/billing?autopay=1");
      },
    }).open();
    if (window.Razorpay) open();
    else { const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = open; s.onerror = () => setErr("The payment window couldn’t load."); document.body.appendChild(s); }
  }, [state?.checkout, router]);
  return (
    <form action={action} className="space-y-4">
      <div className="divide-y divide-line overflow-hidden rounded-[12px] bg-white ring-1 ring-line" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-center gap-4 px-4 py-3 ${plan === p.id ? "bg-mint-wash/60" : "hover:bg-sheet"}`}>
            <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} className="size-4 accent-[#1F9D74]" />
            <span className="flex-1"><span className="font-semibold">{p.name}</span> <span className="tnum text-sm text-ink-2">· {p.posts} images + {p.reels} videos</span></span>
            <span className="tnum font-semibold">{inr(p.priceInr)}<span className="text-xs font-normal text-ink-3">/mo</span></span>
          </label>
        ))}
      </div>
      {state?.ok && <p role="status" className="rounded-[10px] bg-mint-wash px-3 py-2 text-sm text-mint-deep">{state.ok}</p>}
      <FormError message={state?.error || err} />
      <SubmitButton className="btn btn-primary" pending={mode === "setup" ? "Opening payment" : "Saving"}>{label}</SubmitButton>
    </form>
  );
}

export function StopAutopay({ until }: { until: string }) {
  const [state, action] = useActionState(stopAutopay, undefined);
  const [sure, setSure] = useState(false);
  if (state?.ok) return <p role="status" className="text-sm text-ink-2">{state.ok}</p>;
  return (
    <form action={action} className="space-y-2">
      {!sure ? (
        <button type="button" onClick={() => setSure(true)} className="text-sm font-semibold text-red underline">Turn off auto-pay</button>
      ) : (
        <>
          <p className="text-sm text-ink-2">Your plan stays active until {until}. After that, new posts stop until you set up auto-pay again.</p>
          <div className="flex gap-3">
            <SubmitButton className="btn btn-ghost text-red" pending="Turning off">Yes, turn off</SubmitButton>
            <button type="button" onClick={() => setSure(false)} className="btn btn-ghost">Keep auto-pay</button>
          </div>
        </>
      )}
      <FormError message={state?.error} />
    </form>
  );
}
