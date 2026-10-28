"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startRenewal, finishRenewal } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";
import type { Plan } from "@/db/schema";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function RenewForm({ plans, current, live, label }: { plans: Plan[]; current: string; live: boolean; label: string }) {
  const [state, action] = useActionState(startRenewal, undefined);
  const [plan, setPlan] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const o = state?.order;
    if (!o) return;
    const open = () => new window.Razorpay!({
      key: o.key, amount: o.amount, currency: "INR", order_id: o.id, name: "BrandMint AI", description: "Monthly content plan",
      prefill: { name: o.name, email: o.email }, theme: { color: "#13221D" },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const res = await finishRenewal(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature);
        if ("error" in res && res.error) setErr(res.error); else router.push("/app/billing?renewed=1");
      },
    }).open();
    if (window.Razorpay) open();
    else { const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = open; s.onerror = () => setErr("The payment window couldn’t load."); document.body.appendChild(s); }
  }, [state?.order, router]);
  return (
    <form action={action} className="space-y-4">
      <div className="divide-y divide-line overflow-hidden rounded-[12px] bg-white ring-1 ring-line" role="radiogroup" aria-label="Plan for the next period">
        {plans.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-center gap-4 px-4 py-3 ${plan === p.id ? "bg-mint-wash/60" : "hover:bg-sheet"}`}>
            <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} className="size-4 accent-[#1F9D74]" />
            <span className="flex-1"><span className="font-semibold">{p.name}</span> <span className="tnum text-sm text-ink-2">· {p.posts} posts + {p.reels} reels</span></span>
            <span className="tnum font-semibold">{inr(p.priceInr)}</span>
          </label>
        ))}
      </div>
      <FormError message={state?.error || err} />
      <SubmitButton className="btn btn-primary" pending="Opening payment">{label}{live ? "" : " (demo, no charge)"}</SubmitButton>
    </form>
  );
}
