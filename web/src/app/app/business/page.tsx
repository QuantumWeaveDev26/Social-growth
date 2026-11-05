import { requireCustomer } from "@/lib/auth";
import { mediaUrl } from "@/lib/storage";
import { DetailsForm, PhotoForm } from "./Forms";
import { removePhoto } from "./actions";

export const metadata = { title: "Business details" };
export const dynamic = "force-dynamic";

const CHECKS: [string, string][] = [["products", "Products and prices"], ["contact", "A way to reach you"], ["hours", "Opening hours"], ["photos", "At least 5 real photos"], ["show_more", "What to show more of"], ["avoid", "What never to say or show"]];

export default async function BusinessPage() {
  const { customer } = await requireCustomer();
  const d = JSON.parse(customer.details || "{}");
  const photos: string[] = Array.isArray(d.photos) ? d.photos : [];
  const has = (k: string) => k === "contact" ? !!(d.whatsapp || d.phone || d.address || d.order_link) : k === "photos" ? photos.length >= 5 : !!String(d[k] || "").trim();
  const done = CHECKS.filter(([k]) => has(k)).length;
  const pct = Math.round((done / CHECKS.length) * 100);
  return (
    <main className="px-4 sm:px-8 lg:px-12 pb-20 pt-6 lg:pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[1.85rem] sm:text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Business details</h1>
        <p className="mt-3 max-w-[70ch] text-ink-2">The more we know, the more your posts and reels sound and look like you. We never invent prices, offers or claims, so anything missing here simply stays out of your content.</p>
      </header>
      <div className="mt-8 grid max-w-[1100px] grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <section className="space-y-10">
          <DetailsForm d={d} />
          <div>
            <h2 className="font-bold">Real photos ({photos.length}/15)</h2>
            <p className="mt-1 text-sm text-ink-2">Your shop, products, team at work. We use them as reference so your content looks like your business, not a stock café.</p>
            <div className="mt-3"><PhotoForm /></div>
            {!!photos.length && (
              <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {photos.map((p) => (
                  <li key={p} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(p)!} alt="" className="aspect-square w-full rounded-[10px] object-cover ring-1 ring-line" />
                    <form action={removePhoto} className="absolute right-1 top-1"><input type="hidden" name="path" value={p} /><button className="rounded-full bg-white/90 px-2 text-xs font-semibold text-red ring-1 ring-line">Remove</button></form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <aside>
          <div className="sticky top-8 rounded-[14px] bg-sheet p-6 ring-1 ring-line">
            <p className="text-sm text-ink-2">Profile complete</p>
            <p className="tnum mt-1 font-display text-4xl" style={{ fontWeight: 800 }}>{pct}%</p>
            <div className="mt-3 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-mint" style={{ width: `${pct}%` }} /></div>
            <ul className="mt-5 space-y-2 text-sm">
              {CHECKS.map(([k, l]) => <li key={k} className={has(k) ? "text-ink" : "text-ink-3"}>{has(k) ? "✓" : "○"} {l}</li>)}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
