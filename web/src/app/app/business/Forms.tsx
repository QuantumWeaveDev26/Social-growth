"use client";
import { useActionState } from "react";
import { saveDetails, addPhotos } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

type D = Record<string, string>;
const T = ({ id, label, hint, ph, d, rows = 3 }: { id: string; label: string; hint?: string; ph?: string; d: D; rows?: number }) => (
  <div>
    <label className="label" htmlFor={id}>{label}</label>
    <textarea id={id} name={id} rows={rows} defaultValue={d[id]} placeholder={ph} className="field resize-y" />
    {hint && <p className="hint">{hint}</p>}
  </div>
);

export function DetailsForm({ d }: { d: D }) {
  const [state, action] = useActionState(saveDetails, undefined);
  return (
    <form action={action} className="space-y-5">
      <T id="products" d={d} rows={6} label="Products or services, with prices" ph={"Masala chai — ₹30\nBun maska — ₹60 (butter, grilled on tawa)\nBreakfast set — ₹180: 2 idli, vada, filter coffee"} hint="One per line: name, price, what's included. We only ever use prices you write here." />
      <div className="grid grid-cols-3 gap-4">
        <div><label className="label" htmlFor="whatsapp">WhatsApp</label><input id="whatsapp" name="whatsapp" defaultValue={d.whatsapp} className="field" /></div>
        <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" defaultValue={d.phone} className="field" /></div>
        <div><label className="label" htmlFor="address">Address or area</label><input id="address" name="address" defaultValue={d.address} className="field" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label" htmlFor="hours">Opening hours</label><input id="hours" name="hours" defaultValue={d.hours} placeholder="Mon–Sat 7 am – 10 pm" className="field" /></div>
        <div><label className="label" htmlFor="order_link">Order or booking link</label><input id="order_link" name="order_link" defaultValue={d.order_link} placeholder="Swiggy, Zomato, booking page…" className="field" /></div>
      </div>
      <T id="offers_now" d={d} rows={2} label="Offers or launches coming up" ph="Ginger-honey chai from 15 Nov. Buy 5 chais, get 1 free." />
      <T id="show_more" d={d} rows={2} label="Show more of…" ph="Fresh chai being poured, our samosas being made, the cosy corner seating" />
      <T id="avoid" d={d} rows={2} label="Never say or show…" ph="No health claims. Don't show customers' faces." />
      <div className="flex items-center gap-3">
        <SubmitButton className="btn btn-primary" pending="Saving">Save details</SubmitButton>
        {state?.ok && <span role="status" className="text-sm text-mint-deep">{state.ok}</span>}
        <FormError message={state?.error} />
      </div>
    </form>
  );
}

export function PhotoForm() {
  const [state, action] = useActionState(addPhotos, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="file" name="photos" accept="image/*" multiple className="text-sm" />
      <SubmitButton className="btn btn-ghost" pending="Uploading">Add photos</SubmitButton>
      {state?.ok && <span role="status" className="text-sm text-mint-deep">{state.ok}</span>}
      <div className="w-full"><FormError message={state?.error} /></div>
    </form>
  );
}
