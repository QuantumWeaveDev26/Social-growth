import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AtSign, AlertTriangle } from "lucide-react";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { open } from "@/lib/crypto";
import type { FbPage } from "@/lib/meta";
import { Wordmark } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { backUrl, savePage } from "@/lib/metaConnect";

export const metadata = { title: "Choose your Facebook Page" };
export const dynamic = "force-dynamic";

async function choose(fd: FormData) {
  "use server";
  const { customer } = await requireCustomer({ allowOnboarding: true });
  const pending = db.select().from(schema.metaPending).where(and(eq(schema.metaPending.id, String(fd.get("p"))), eq(schema.metaPending.customerId, customer.id))).get();
  if (!pending) redirect(backUrl(customer, "meta=error"));
  const { metaUserId, pages } = JSON.parse(open(pending.payload)!) as { metaUserId: string; pages: FbPage[] };
  const page = pages.find((x) => x.id === String(fd.get("page")));
  if (!page) redirect(`/connect/meta?p=${pending.id}`);
  savePage(customer.id, metaUserId, page);
  db.delete(schema.metaPending).where(eq(schema.metaPending.id, pending.id)).run();
  redirect(backUrl(customer, page.igId ? "meta=connected" : "meta=no_instagram"));
}

export default async function ChoosePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { customer } = await requireCustomer({ allowOnboarding: true });
  const { p } = await searchParams;
  const pending = p && db.select().from(schema.metaPending).where(and(eq(schema.metaPending.id, p), eq(schema.metaPending.customerId, customer.id))).get();
  if (!pending || Date.now() - pending.createdAt.getTime() > 30 * 60_000) notFound();
  const { pages } = JSON.parse(open(pending.payload)!) as { pages: FbPage[] };
  const sorted = [...pages].sort((a, b) => Number(!!b.igId) - Number(!!a.igId));
  return (
    <div className="min-h-dvh px-10 py-8">
      <Wordmark />
      <main className="mx-auto mt-14 max-w-[640px]">
        <h1 className="font-display text-[2.3rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Which Page is {customer.businessName}?</h1>
        <p className="mt-3 text-ink-2">You manage {pages.length} Facebook Pages. Pick the one we should post to. Its linked Instagram account is connected with it.</p>
        <form action={choose} className="mt-8">
          <input type="hidden" name="p" value={pending.id} />
          <fieldset className="divide-y divide-line overflow-hidden rounded-[14px] bg-sheet ring-1 ring-line">
            <legend className="sr-only">Facebook Page</legend>
            {sorted.map((pg, i) => (
              <label key={pg.id} className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-white has-[:checked]:bg-mint-wash/60">
                <input type="radio" name="page" value={pg.id} defaultChecked={i === 0} required className="size-4 accent-[#1F9D74]" />
                <span className="flex-1">
                  <span className="block font-semibold">{pg.name}</span>
                  {pg.igId ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-2"><AtSign className="size-3.5" aria-hidden />@{pg.igUsername} linked</span>
                  ) : (
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-amber-deep"><AlertTriangle className="size-3.5" aria-hidden />No Instagram linked. Facebook only.</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <SubmitButton className="btn btn-primary mt-6 px-6 py-3" pending="Connecting">Connect this Page</SubmitButton>
        </form>
      </main>
    </div>
  );
}
