import Link from "next/link";
import { asc } from "drizzle-orm";
import { Check, ArrowRight, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { Wordmark, ApproveMark } from "@/components/ui";
import { inr } from "@/lib/format";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SHEET = [
  { img: "bakery", day: "Mon 2", label: "Cardamom buns are back", state: "ok" },
  { img: "cafe", day: "Wed 4", label: "Reel · How we pull a flat white", state: "ok", reel: true },
  { img: "boutique", day: "Fri 6", label: "Handloom, folded by hand", state: "change" },
  { img: "dental", day: "Sat 7", label: "Your first visit, explained", state: "wait" },
  { img: "fitness", day: "Tue 10", label: "Reel · Three moves for stiff backs", state: "wait", reel: true },
  { img: "realty", day: "Thu 12", label: "Light at 8am, every day", state: "wait" },
] as const;

const FAQ = [
  ["Do I need to write anything?", "No. You fill a short form about your business once. We read your website too. From that we write a brand profile you can correct, and every post comes from it."],
  ["Will anything go live without me seeing it?", "Never. Each post and reel waits on your proof sheet until you approve it. If you ask for changes, we remake it with your note and send it back."],
  ["How do you post to my accounts?", "You connect your Facebook Page and Instagram professional account through Meta’s own login. We only ask for publishing permissions, and you can disconnect at any time."],
  ["What if I don’t like the style?", "Tell us in one line on any post. Your notes shape the next version and the rest of the month. Each plan includes revisions per post."],
  ["Can I cancel?", "Yes. Plans are monthly. Cancel before your next cycle and nothing more is charged."],
];

export default async function Landing() {
  const plans = db.select().from(schema.plans).orderBy(asc(schema.plans.sort)).all();
  const user = await currentUser();
  return (
    <div className="bg-paper">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-6">
        <Wordmark />
        <nav className="flex items-center gap-7 text-[0.93rem] font-medium text-ink-2">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <a href="#faq" className="hover:text-ink">Questions</a>
          {user ? (
            <Link href={user.role === "admin" ? "/admin" : "/app"} className="btn btn-primary">Open your studio</Link>
          ) : (
            <>
              <Link href="/login" className="hover:text-ink">Sign in</Link>
              <Link href="/signup" className="btn btn-primary">Start your month</Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1240px] grid-cols-[1fr_1.08fr] items-center gap-16 px-8 pb-24 pt-14">
        <div>
          <h1 className="font-display text-[4.1rem] leading-[0.98] tracking-[-0.035em]" style={{ fontWeight: 800 }}>
            A month of posts,<br />made for your business.<br /><span className="text-mint-deep">You just tick.</span>
          </h1>
          <p className="mt-7 max-w-[34rem] text-[1.15rem] leading-relaxed text-ink-2">
            Tell us what you sell and who buys it. BrandMint AI writes, designs and schedules your Instagram and Facebook posts and reels. Every piece waits for your approval before it goes live.
          </p>
          <div className="mt-9 flex items-center gap-4">
            <Link href="/signup" className="btn btn-primary px-6 py-3 text-base">Start your month <ArrowRight className="size-4" /></Link>
            <a href="#pricing" className="btn btn-ghost px-5 py-3 text-base">See plans from {inr(plans[0]?.priceInr ?? 3999)}</a>
          </div>
          <p className="mt-6 text-sm text-ink-3">Monthly plans. Cancel any time. Posting runs through Meta’s official API.</p>
        </div>

        {/* The proof sheet: the product, shown as the product */}
        <div className="relative rounded-[18px] bg-sheet p-5 shadow-[var(--shadow-lift)] ring-1 ring-line">
          <div className="mb-4 flex items-baseline justify-between px-1">
            <span className="font-display text-lg" style={{ fontWeight: 700 }}>November proof sheet</span>
            <span className="tnum text-sm text-ink-3">2 approved · 1 redoing · 3 to review</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {SHEET.map((s, i) => (
              <figure key={i} className="group relative">
                <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#e7ece9]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/sample/${s.img}.jpg`} alt="" className={`size-full object-cover ${s.state === "ok" ? "" : s.state === "change" ? "saturate-[0.7]" : ""}`} />
                  {"reel" in s && <span className="chip absolute left-2 top-2 bg-ink/80 text-white">Reel</span>}
                  {s.state === "ok" && <ApproveMark className="absolute bottom-1 right-1 w-14 drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]" />}
                  {s.state === "change" && (
                    <span className="absolute inset-x-2 bottom-2 rounded-[6px] bg-amber-wash px-2 py-1 text-[0.72rem] font-semibold text-amber-deep">“Warmer light, show the weave”</span>
                  )}
                </div>
                <figcaption className="mt-1.5 px-0.5">
                  <span className="tnum block text-[0.72rem] font-semibold text-ink-3">{s.day}</span>
                  <span className="block truncate text-[0.82rem] font-medium">{s.label}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-sheet">
        <div className="mx-auto max-w-[1240px] px-8 py-24">
          <h2 className="max-w-[40rem] font-display text-[2.6rem] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 800 }}>
            From a short form to a posted month, without writing a caption.
          </h2>
          <ol className="mt-14 grid grid-cols-4 border-t border-ink">
            {[
              ["Tell us about the business", "What you sell, who buys, what makes you different, your offers. We also read your website."],
              ["Check your brand profile", "We write how your brand sounds and the themes it posts about. Correct anything that is off."],
              ["Approve the proof sheet", "Your month arrives as a contact sheet. Tick what you like. Leave a note on what you don’t, and we remake it."],
              ["We post on schedule", "Approved posts and reels go to your Instagram and Facebook at the times your audience is online."],
            ].map(([t, d], i) => (
              <li key={i} className={`pr-8 pt-6 ${i ? "border-l border-line pl-8" : ""}`}>
                <span className="tnum font-display text-sm text-mint-deep" style={{ fontWeight: 700 }}>Step {i + 1}</span>
                <h3 className="mt-2 text-[1.15rem] font-bold">{t}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-[1240px] px-8 py-24">
        <div className="flex items-end justify-between gap-10">
          <h2 className="max-w-[34rem] font-display text-[2.6rem] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 800 }}>
            Pick how much you want to post.
          </h2>
          <p className="max-w-[26rem] text-ink-2">Every plan includes strategy, design, captions, hashtags, scheduling and your approval step. Prices are per month, including GST.</p>
        </div>
        <div className="mt-12 grid grid-cols-3 overflow-hidden rounded-[16px] bg-sheet ring-1 ring-line">
          {plans.map((p, i) => {
            const featured = p.id === "growth";
            const features = JSON.parse(p.features) as string[];
            return (
              <div key={p.id} className={`flex flex-col p-8 ${i ? "border-l border-line" : ""} ${featured ? "bg-ink text-white" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl" style={{ fontWeight: 700 }}>{p.name}</h3>
                  {featured && <span className="chip bg-mint text-white">Most chosen</span>}
                </div>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="tnum font-display text-[2.8rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>{inr(p.priceInr)}</span>
                  <span className={featured ? "text-rail-text" : "text-ink-3"}>/month</span>
                </p>
                <p className={`tnum mt-3 font-semibold ${featured ? "text-white" : ""}`}>{p.posts} posts + {p.reels} reels</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[0.93rem]">
                  {features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className={`mt-0.5 size-4 shrink-0 ${featured ? "text-mint" : "text-mint-deep"}`} aria-hidden />
                      <span className={featured ? "text-rail-text" : "text-ink-2"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/signup?plan=${p.id}`} className={`btn mt-8 py-3 ${featured ? "btn-mint" : "btn-ghost"}`}>Choose {p.name}</Link>
              </div>
            );
          })}
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-sheet">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[1fr_1.6fr] gap-16 px-8 py-24">
          <h2 className="font-display text-[2.6rem] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 800 }}>Questions owners ask first.</h2>
          <dl className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[1.05rem] font-semibold">
                  {q}
                  <Plus className="ml-6 size-5 shrink-0 text-ink-3 transition-transform duration-300 group-open:rotate-45" aria-hidden />
                </summary>
                <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-2">{a}</p>
              </details>
            ))}
          </dl>
        </div>
      </section>

      <footer className="bg-rail text-rail-text">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-10 text-sm">
          <Wordmark dark />
          <span>Social media content for Indian small businesses · A Quantum Weave AI product</span>
        </div>
      </footer>
    </div>
  );
}
