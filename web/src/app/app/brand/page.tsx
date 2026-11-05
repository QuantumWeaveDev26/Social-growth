import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { Markdown } from "@/components/Markdown";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDateTime } from "@/lib/format";
import { rebuildProfile } from "../actions";

export const metadata = { title: "Brand profile" };

export default async function Brand() {
  const { customer } = await requireCustomer();
  const profile = db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.customerId, customer.id)).orderBy(desc(schema.brandProfiles.version)).get();
  const busy = !!db.select().from(schema.jobs).where(and(eq(schema.jobs.customerId, customer.id), eq(schema.jobs.type, "brand_profile"), inArray(schema.jobs.status, ["queued", "running"]))).get();
  const pillars = profile ? (JSON.parse(profile.pillars) as Array<{ name: string; why: string; share?: number }>) : [];
  return (
    <main className="px-4 sm:px-8 lg:px-12 pb-20 pt-6 lg:pt-10">
      <AutoRefresh active={busy} />
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[1.85rem] sm:text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Brand profile</h1>
        <p className="tnum mt-3 text-ink-2">{profile ? `Version ${profile.version} · written ${fmtDateTime(profile.createdAt)}` : "Not written yet"}{busy ? " · rewriting now" : ""}</p>
      </header>
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <article className="min-w-0 max-w-[72ch]">
          {profile ? (
            <>
              <p className="max-w-[68ch] text-[1.08rem] font-medium leading-relaxed text-ink">{profile.summary}</p>
              <h2 className="mt-10 text-[1.02rem] font-bold">Content themes</h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {pillars.map((p) => (
                  <li key={p.name} className="flex flex-wrap gap-x-6 gap-y-1 py-3 sm:flex-nowrap">
                    <span className="min-w-0 flex-1 font-semibold sm:w-44 sm:flex-none sm:shrink-0">{p.name}</span>
                    <span className="order-last w-full text-[0.93rem] text-ink-2 sm:order-none sm:w-auto sm:flex-1">{p.why}</span>
                    {p.share != null && <span className="tnum text-sm font-semibold text-ink-3">{Math.round(p.share <= 1 ? p.share * 100 : p.share)}%</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-10"><Markdown text={profile.profileMd} /></div>
            </>
          ) : (
            <div className="space-y-3">{[90, 70, 80].map((w, i) => <div key={i} className="developing h-3 rounded-full" style={{ width: `${w}%` }} />)}</div>
          )}
        </article>
        <aside>
          <form action={rebuildProfile} className="sticky top-8 rounded-[14px] bg-sheet p-6 ring-1 ring-line">
            <h2 className="font-bold">Correct the profile</h2>
            <p className="mt-1 text-sm text-ink-2">New posts use the latest version. Posts you’ve already approved don’t change.</p>
            <label htmlFor="corrections" className="label mt-5">What’s wrong or missing?</label>
            <textarea id="corrections" name="corrections" rows={5} className="field" placeholder="We’ve added a second branch in HSR Layout. Stop mentioning free delivery." />
            <SubmitButton className="btn btn-primary mt-4 w-full" pending="Sending" disabled={busy}>{busy ? "Rewriting…" : "Rewrite the profile"}</SubmitButton>
          </form>
        </aside>
      </div>
    </main>
  );
}
