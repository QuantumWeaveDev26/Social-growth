"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload } from "lucide-react";
import { choosePlan, confirmPayment, saveBusiness, saveBrandKit, confirmProfile } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import type { Plan } from "@/db/schema";

const H = ({ children }: { children: React.ReactNode }) => (
  <h1 className="font-display text-[2.4rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>{children}</h1>
);
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

export function PlanStep({ plans, current, live, paid }: { plans: Plan[]; current?: string; live: boolean; paid: boolean }) {
  const [state, action] = useActionState(choosePlan, undefined);
  const [selected, setSelected] = useState(current || "growth");
  const [payError, setPayError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const o = state?.order;
    if (!o) return;
    const open = () => {
      const rzp = new window.Razorpay!({
        key: o.key, amount: o.amount, currency: "INR", order_id: o.id, name: "BrandMint AI", description: "Monthly content plan",
        prefill: { name: o.name, email: o.email }, theme: { color: "#13221D" },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const res = await confirmPayment(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature);
          if ("error" in res && res.error) setPayError(res.error); else router.refresh();
        },
      });
      rzp.open();
    };
    if (window.Razorpay) open();
    else {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = open;
      s.onerror = () => setPayError("The payment window couldn’t load. Check your connection and try again.");
      document.body.appendChild(s);
    }
  }, [state?.order, router]);

  return (
    <form action={action}>
      <H>Choose your monthly plan</H>
      <p className="mt-3 text-ink-2">You can change plans at the end of any month. Prices include GST.</p>
      <div className="mt-8 divide-y divide-line overflow-hidden rounded-[14px] bg-sheet ring-1 ring-line" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-center gap-5 px-6 py-5 transition-colors ${selected === p.id ? "bg-mint-wash/60" : "hover:bg-white"}`}>
            <input type="radio" name="plan" value={p.id} checked={selected === p.id} onChange={() => setSelected(p.id)} className="size-4 accent-[#1F9D74]" />
            <span className="flex-1">
              <span className="block font-semibold">{p.name}</span>
              <span className="tnum block text-sm text-ink-2">{p.posts} posts + {p.reels} reels a month · {p.revisions} revisions per item{p.report ? " · monthly report" : ""}</span>
            </span>
            <span className="tnum font-display text-xl" style={{ fontWeight: 700 }}>{inr(p.priceInr)}</span>
          </label>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        <FormError message={state?.error || payError} />
        {!live && <p className="text-sm text-ink-3">Payments are in demo mode on this server. No card is charged.</p>}
        <SubmitButton className="btn btn-primary px-6 py-3" pending="Opening payment">
          {paid ? "Update plan and continue" : live ? "Pay and continue" : "Activate plan (demo) and continue"}
        </SubmitButton>
      </div>
    </form>
  );
}

type D = Record<string, string>;
export function BusinessStep({ name, website, d }: { name: string; website: string; d: D }) {
  const [state, action] = useActionState(saveBusiness, undefined);
  const T = ({ id, label, hint, rows = 3, ph, required }: { id: string; label: string; hint?: string; rows?: number; ph?: string; required?: boolean }) => (
    <div>
      <label className="label" htmlFor={id}>{label}{required && <span className="text-mint-deep"> *</span>}</label>
      <textarea id={id} name={id} rows={rows} defaultValue={d[id]} placeholder={ph} required={required} className="field resize-y" />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
  return (
    <form action={action} className="space-y-6">
      <div>
        <H>Tell us about the business</H>
        <p className="mt-3 max-w-[60ch] text-ink-2">Write it the way you’d explain it to a new staff member. Plain words are best. We’ll turn it into a brand profile you can check next.</p>
      </div>
      <FormError message={state?.error} />
      <div className="grid grid-cols-2 gap-5">
        <div><label className="label" htmlFor="businessName">Business name</label><input id="businessName" name="businessName" defaultValue={name} className="field" /></div>
        <div><label className="label" htmlFor="website">Website or Instagram link</label><input id="website" name="website" defaultValue={website} placeholder="yourbusiness.in" className="field" /><p className="hint">Optional. We read it to learn your products and wording.</p></div>
        <div><label className="label" htmlFor="category">What kind of business</label><input id="category" name="category" defaultValue={d.category} placeholder="Home bakery, dental clinic, boutique…" className="field" /></div>
        <div><label className="label" htmlFor="city">City or area you serve</label><input id="city" name="city" defaultValue={d.city} placeholder="Koramangala, Bengaluru" className="field" /></div>
      </div>
      <T id="offer" label="What do you sell?" required ph="Eggless cakes and cardamom buns, made to order. Delivery within 5 km." />
      <T id="audience" label="Who buys from you?" required ph="Working parents ordering for birthdays; offices ordering on Fridays." />
      <T id="different" label="Why do people pick you over others?" ph="Everything baked the same morning. No preservatives. Owner answers every DM." />
      <T id="offers_now" label="Offers or launches coming up" rows={2} ph="Diwali hampers from 1 Nov. 10% off first order." hint="Optional. We’ll keep offers to about one in five posts." />
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="tone">How should you sound?</label>
          <select id="tone" name="tone" defaultValue={d.tone || "warm"} className="field">
            <option value="warm">Warm and friendly</option>
            <option value="expert">Expert and reassuring</option>
            <option value="playful">Playful and bold</option>
            <option value="premium">Calm and premium</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="language">Language for captions</label>
          <select id="language" name="language" defaultValue={d.language || "english"} className="field">
            <option value="english">English</option>
            <option value="hinglish">English with some Hindi (Hinglish)</option>
            <option value="hindi">Hindi</option>
          </select>
        </div>
      </div>
      <T id="avoid" label="Anything we should never say or show?" rows={2} ph="No discount talk on wedding cakes. Don’t show staff faces." />
      <SubmitButton className="btn btn-primary px-6 py-3" pending="Saving">Save and continue</SubmitButton>
    </form>
  );
}

export function BrandKitStep({ logo, colours, times }: { logo: string | null; colours: string[]; times: string[] }) {
  const [state, action] = useActionState(saveBrandKit, undefined);
  const [preview, setPreview] = useState<string | null>(logo);
  const [c1, setC1] = useState(colours[0] || "#1F9D74");
  const [c2, setC2] = useState(colours[1] || "#13221D");
  return (
    <form action={action} className="space-y-8">
      <div>
        <H>Your brand kit</H>
        <p className="mt-3 text-ink-2">We place your logo on every post and use your colours for text on images and reels.</p>
      </div>
      <FormError message={state?.error} />
      <div className="grid grid-cols-[200px_1fr] gap-8 rounded-[14px] bg-sheet p-6 ring-1 ring-line">
        <label className="group grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-[12px] border border-dashed border-line-strong bg-white transition-colors hover:border-mint">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your logo" className="max-h-[80%] max-w-[80%] object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm text-ink-3 group-hover:text-mint-deep"><Upload className="size-5" aria-hidden />Upload logo</span>
          )}
          <input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
        </label>
        <div className="space-y-5">
          <div>
            <p className="label">Logo</p>
            <p className="text-sm text-ink-2">A PNG with a transparent background works best. Up to 5 MB.</p>
          </div>
          <div className="flex gap-6">
            {[["c1", "Main colour", c1, setC1], ["c2", "Second colour", c2, setC2]].map(([n, l, v, set]) => (
              <div key={n as string}>
                <label className="label" htmlFor={n as string}>{l as string}</label>
                <span className="flex items-center gap-2">
                  <input type="color" id={n as string} name={n as string} value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className="h-10 w-12 cursor-pointer rounded-[8px] border border-line-strong bg-white p-1" />
                  <span className="tnum font-mono text-sm text-ink-2">{(v as string).toUpperCase()}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <p className="label">Best times to post (IST)</p>
        <p className="mb-3 text-sm text-ink-2">We alternate between these. Most Indian audiences are active late morning and early evening.</p>
        <div className="flex gap-4">
          <input type="time" name="t1" defaultValue={times[0] || "10:00"} className="field w-36 tnum" aria-label="First posting time" />
          <input type="time" name="t2" defaultValue={times[1] || "18:30"} className="field w-36 tnum" aria-label="Second posting time" />
        </div>
      </div>
      <SubmitButton className="btn btn-primary px-6 py-3" pending="Saving">Save and continue</SubmitButton>
    </form>
  );
}

export function ProfileStep({ busy, failed, summary, profileMd, pillars }: { busy: boolean; failed: string | null; summary?: string; profileMd?: string; pillars: Array<{ name: string; why: string; share?: number }> }) {
  const [state, action] = useActionState(confirmProfile, undefined);
  const [fix, setFix] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  if (busy) {
    return (
      <section>
        <H>Writing your brand profile</H>
        <p className="mt-3 max-w-[60ch] text-ink-2">We’re reading your answers{summary ? " and corrections" : ""} and your website. This usually takes under a minute.</p>
        <div className="mt-8 space-y-3 rounded-[14px] bg-sheet p-6 ring-1 ring-line" aria-busy>
          <p className="flex items-center gap-2 text-sm font-medium text-ink-2"><Loader2 className="size-4 animate-spin" aria-hidden />Working on it</p>
          {[92, 78, 85, 60].map((w, i) => <div key={i} className="developing h-3 rounded-full" style={{ width: `${w}%` }} />)}
        </div>
      </section>
    );
  }
  if (failed && !summary) {
    return (
      <section>
        <H>We hit a snag</H>
        <p role="alert" className="mt-4 rounded-[10px] bg-red-wash px-3 py-2 text-sm text-red">The brand profile couldn’t be written: {failed.slice(0, 160)}</p>
        <p className="mt-4 text-ink-2">Go back to the brand kit step and save again to retry.</p>
      </section>
    );
  }
  return (
    <form action={action} className="space-y-7">
      <div>
        <H>Does this sound like you?</H>
        <p className="mt-3 max-w-[60ch] text-ink-2">Every post is written from this profile. Fix anything that’s off now and the whole month comes out closer.</p>
      </div>
      <p className="max-w-[68ch] text-[1.08rem] font-medium leading-relaxed text-ink">{summary}</p>
      <div>
        <p className="label">What you’ll post about</p>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {pillars.map((p) => (
            <li key={p.name} className="flex gap-6 py-3">
              <span className="w-48 shrink-0 font-semibold">{p.name}</span>
              <span className="flex-1 text-[0.93rem] text-ink-2">{p.why}</span>
              {p.share != null && <span className="tnum text-sm font-semibold text-ink-3">{Math.round(p.share <= 1 ? p.share * 100 : p.share)}%</span>}
            </li>
          ))}
        </ul>
      </div>
      <details className="rounded-[14px] bg-sheet p-6 ring-1 ring-line">
        <summary className="cursor-pointer font-semibold">Read the full profile</summary>
        <div className="mt-4"><Markdown text={profileMd || ""} /></div>
      </details>
      <div>
        <label className="label" htmlFor="corrections">Anything to correct?</label>
        <textarea id="corrections" name="corrections" rows={3} className="field" value={fix} onChange={(e) => setFix(e.target.value)} placeholder="We don’t do home delivery on Sundays. Sound less formal." />
        <p className="hint">Leave empty if it’s right. If you write something, we rewrite the profile with it.</p>
      </div>
      <FormError message={state?.error} />
      <div className="flex gap-3">
        {fix.trim() ? (
          <SubmitButton className="btn btn-primary px-6 py-3" pending="Sending corrections">Rewrite the profile with my corrections</SubmitButton>
        ) : (
          <SubmitButton className="btn btn-mint px-6 py-3" pending="Starting your month"><Check className="size-4" aria-hidden />Looks right, make my month</SubmitButton>
        )}
      </div>
    </form>
  );
}
