import { eq } from "drizzle-orm";
import { planContents } from "@/lib/plans";
import { LayoutGrid, CalendarClock, Fingerprint, Store, Settings2, LogOut, Activity, Bell, Receipt, UserRound } from "lucide-react";
import { unreadCount } from "@/lib/notify";
import { daysLeft } from "@/lib/billing";
import { ActivityPill } from "@/components/ActivityPanel";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { Wordmark } from "@/components/ui";
import { NavLink } from "@/components/NavLink";
import { MobileNav } from "@/components/MobileNav";
import { signOut } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, customer } = await requireCustomer();
  const sub = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.customerId, customer.id)).get();
  const plan = sub && db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId)).get();
  const unread = unreadCount(customer.id);
  const left = daysLeft(sub?.periodEnd);
  const conn = db.select().from(schema.metaConnections).where(eq(schema.metaConnections.customerId, customer.id)).get();
  const menu = (
    <>
      <div className="rounded-[12px] bg-rail-2 px-4 py-3.5">
        <p className="truncate font-semibold text-white">{customer.businessName}</p>
        <p className="tnum mt-0.5 text-[0.8rem]">{plan ? `${plan.name} · ${planContents(plan)}` : "No plan"}</p>
      </div>
      <nav className="mt-6 space-y-1" aria-label="Studio">
        <NavLink href="/app" exact icon={<LayoutGrid className="size-[18px]" aria-hidden />}>Proof sheet</NavLink>
        <NavLink href="/app/schedule" icon={<CalendarClock className="size-[18px]" aria-hidden />}>Schedule</NavLink>
        <NavLink href="/app/activity" icon={<Activity className="size-[18px]" aria-hidden />}>Activity</NavLink>
        <NavLink href="/app/notifications" icon={<Bell className="size-[18px]" aria-hidden />} badge={unread}>Notifications</NavLink>
        <NavLink href="/app/brand" icon={<Fingerprint className="size-[18px]" aria-hidden />}>Brand profile</NavLink>
        <NavLink href="/app/business" icon={<Store className="size-[18px]" aria-hidden />}>Business details</NavLink>
        <NavLink href="/app/settings" icon={<Settings2 className="size-[18px]" aria-hidden />}>Connections</NavLink>
        <NavLink href="/app/billing" icon={<Receipt className="size-[18px]" aria-hidden />}>Billing</NavLink>
        <NavLink href="/app/account" icon={<UserRound className="size-[18px]" aria-hidden />}>Account</NavLink>
      </nav>
      <div className="mt-auto space-y-4 px-2 pt-8">
        <a href="/app/activity" className="block hover:text-white"><ActivityPill /></a>
        <p className="flex items-center gap-2 text-[0.8rem]">
          <span className={`size-2 shrink-0 rounded-full ${conn?.status === "connected" ? "bg-mint" : "bg-amber"}`} aria-hidden />
          <span className="min-w-0 break-words">{!conn ? "Instagram not connected" : conn.status !== "connected" ? "Connection needs renewing" : `Posting to ${conn.igUsername ? `@${conn.igUsername}` : conn.pageName}${conn.mode === "demo" ? " (demo)" : ""}`}</span>
        </p>
        <form action={signOut}>
          <button className="flex items-center gap-2 text-[0.85rem] hover:text-white"><LogOut className="size-4" aria-hidden />Sign out <span className="sr-only">{user.email}</span></button>
        </form>
      </div>
    </>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-rail px-5 py-7 text-rail-text lg:flex">
        <div className="mb-8 px-2"><Wordmark dark href="/app" /></div>
        {menu}
      </aside>
      <MobileNav bar={<Wordmark dark href="/app" />}>{menu}</MobileNav>
      <div className="min-w-0">
        {sub && (sub.status === "past_due" || left <= 0) && sub.provider !== "demo" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-amber-wash px-4 py-3 sm:px-8 lg:px-12 text-sm text-amber-deep">
            <span><span className="font-semibold">Your plan has ended.</span> New content is paused; approved posts still go out.</span>
            <a href="/app/billing" className="btn btn-primary py-1.5">Renew</a>
          </div>
        )}
        {conn?.status === "needs_reconnect" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-red-wash px-4 py-3 sm:px-8 lg:px-12 text-sm text-red">
            <span><span className="font-semibold">Facebook/Instagram needs reconnecting.</span> Scheduled posts are waiting and go out once you reconnect.</span>
            <a href="/app/settings" className="btn btn-primary py-1.5">Fix now</a>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
