import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Check } from "lucide-react";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { Wordmark } from "@/components/ui";
import { signOut } from "../(auth)/actions";
import { razorpayLive } from "@/lib/razorpay";
import { MetaConnect } from "@/components/MetaConnect";
import { mediaUrl } from "@/lib/storage";
import { generationHeldFor } from "@/lib/jobs";
import { PlanStep, BusinessStep, BrandKitStep, ProfileStep } from "./Steps";
import { afterMeta } from "./actions";

export const metadata = { title: "Set up your studio" };
export const dynamic = "force-dynamic";

const STEPS = ["Plan", "Your business", "Brand kit", "Connect accounts", "Brand profile"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ step?: string; plan?: string; meta?: string }> }) {
  const { customer, user } = await requireCustomer({ allowOnboarding: true });
  if (customer.status !== "onboarding") {
    const { redirect } = await import("next/navigation");
    redirect("/app");
  }
  const sp = await searchParams;
  const reached = Math.min(customer.onboardStep, 5);
  const step = Math.min(Math.max(Number(sp.step) || reached, 1), reached);
  const plans = db.select().from(schema.plans).orderBy(asc(schema.plans.sort)).all();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  const profile = db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.customerId, customer.id)).orderBy(desc(schema.brandProfiles.version)).get();
  const pendingProfile = db.select().from(schema.jobs).where(eq(schema.jobs.customerId, customer.id)).orderBy(desc(schema.jobs.createdAt)).all().find((j) => j.type === "brand_profile");
  const profileBusy = pendingProfile ? ["queued", "running"].includes(pendingProfile.status) : !profile;
  const details = JSON.parse(customer.details || "{}");
  const onHold = profileBusy && generationHeldFor(customer.id);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex flex-col bg-rail px-4 py-4 text-rail-text sm:px-8 lg:px-7 lg:py-8">
        <Wordmark dark />
        <p className="mt-4 text-sm lg:mt-10">Setting up <span className="font-semibold text-white">{customer.businessName}</span></p>
        <ol className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:mt-6 lg:block lg:space-y-1">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const done = n < reached;
            const current = n === step;
            const inner = (
              <span className={`flex items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-2 text-[0.88rem] lg:py-2.5 lg:text-[0.93rem] ${current ? "bg-rail-2 font-semibold text-white" : ""}`}>
                <span className={`grid size-6 place-items-center rounded-full text-xs font-bold tnum ${done ? "bg-mint text-white" : current ? "bg-white text-ink" : "ring-1 ring-rail-text/40"}`}>
                  {done ? <Check className="size-3.5" aria-hidden /> : n}
                </span>
                {s}
              </span>
            );
            return <li key={s} className="shrink-0">{n <= reached ? <Link href={`/onboarding?step=${n}`} className="block hover:text-white">{inner}</Link> : <span className="block opacity-60">{inner}</span>}</li>;
          })}
        </ol>
        <form action={signOut} className="mt-3 lg:mt-auto">
          <button className="text-sm text-rail-text underline hover:text-white">Sign out<span className="hidden lg:inline"> ({user.email})</span></button>
        </form>
      </aside>

      <main className="px-4 py-8 sm:px-8 lg:px-16 lg:py-14">
        <div className="max-w-[760px]">
          {step === 1 && <PlanStep plans={plans} current={sub?.status === "active" ? sub.planId : sp.plan} live={razorpayLive()} paid={sub?.status === "active"} />}
          {step === 2 && <BusinessStep name={customer.businessName} website={customer.websiteUrl ?? ""} d={details} />}
          {step === 3 && (
            <BrandKitStep
              logo={mediaUrl(customer.logoPath)}
              colours={JSON.parse(customer.brandColors || '["#1F9D74"]')}
              times={JSON.parse(customer.postingTimes || '["10:00","18:30"]')}
            />
          )}
          {step === 4 && (
            <section>
              <h1 className="font-display text-[2.4rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Connect Facebook and Instagram</h1>
              <p className="mt-3 max-w-[60ch] text-ink-2">You log in with Facebook and tick your business’s Page. We find the Instagram account linked to it automatically. No IDs or settings to copy. We only ask for permission to publish the posts you approve.</p>
              <div className="mt-8"><MetaConnect conn={conn} message={sp.meta} after={afterMeta} /></div>
              <form action={afterMeta} className="mt-5"><button className="text-sm text-ink-2 underline hover:text-ink">Do this later. Content will wait for approval anyway.</button></form>
            </section>
          )}
          {step === 5 && <ProfileStep busy={profileBusy} onHold={onHold} failed={pendingProfile?.status === "failed" ? pendingProfile.error : null} summary={profile?.summary} profileMd={profile?.profileMd} pillars={profile ? JSON.parse(profile.pillars) : []} />}
        </div>
      </main>
    </div>
  );
}
