import { eq } from "drizzle-orm";
import { LayoutGrid, Fingerprint, Settings2, LogOut, Activity } from "lucide-react";
import { ActivityPill } from "@/components/ActivityPanel";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { Wordmark } from "@/components/ui";
import { NavLink } from "@/components/NavLink";
import { signOut } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, customer } = await requireCustomer();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  return (
    <div className="grid min-h-dvh grid-cols-[248px_1fr]">
      <aside className="sticky top-0 flex h-dvh flex-col bg-rail px-5 py-7 text-rail-text">
        <div className="px-2"><Wordmark dark href="/app" /></div>
        <div className="mt-8 rounded-[12px] bg-rail-2 px-4 py-3.5">
          <p className="truncate font-semibold text-white">{customer.businessName}</p>
          <p className="tnum mt-0.5 text-[0.8rem]">{plan ? `${plan.name} · ${plan.posts} posts + ${plan.reels} reels` : "No plan"}</p>
        </div>
        <nav className="mt-6 space-y-1" aria-label="Studio">
          <NavLink href="/app" exact icon={<LayoutGrid className="size-[18px]" aria-hidden />}>Proof sheet</NavLink>
          <NavLink href="/app/activity" icon={<Activity className="size-[18px]" aria-hidden />}>Activity</NavLink>
          <NavLink href="/app/brand" icon={<Fingerprint className="size-[18px]" aria-hidden />}>Brand profile</NavLink>
          <NavLink href="/app/settings" icon={<Settings2 className="size-[18px]" aria-hidden />}>Accounts and plan</NavLink>
        </nav>
        <div className="mt-auto space-y-4 px-2">
          <a href="/app/activity" className="block hover:text-white"><ActivityPill /></a>
          <p className="flex items-center gap-2 text-[0.8rem]">
            <span className={`size-2 rounded-full ${conn?.status === "connected" ? "bg-mint" : "bg-amber"}`} aria-hidden />
            {!conn ? "Instagram not connected" : conn.status !== "connected" ? "Connection needs renewing" : `Posting to ${conn.igUsername ? `@${conn.igUsername}` : conn.pageName}${conn.mode === "demo" ? " (demo)" : ""}`}
          </p>
          <form action={signOut}>
            <button className="flex items-center gap-2 text-[0.85rem] hover:text-white"><LogOut className="size-4" aria-hidden />Sign out <span className="sr-only">{user.email}</span></button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        {conn?.status === "needs_reconnect" && (
          <div role="alert" className="flex items-center justify-between gap-6 bg-red-wash px-12 py-3 text-sm text-red">
            <span><span className="font-semibold">Facebook/Instagram needs reconnecting.</span> Scheduled posts are waiting and go out once you reconnect.</span>
            <a href="/app/settings" className="btn btn-primary py-1.5">Fix now</a>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
