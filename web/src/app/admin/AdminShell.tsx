import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { signOut } from "../(auth)/actions";

const TABS = [
  { id: "overview", href: "/admin", label: "Overview" },
  { id: "clients", href: "/admin/customers", label: "Clients" },
  { id: "activity", href: "/admin/activity", label: "Live activity" },
  { id: "jobs", href: "/admin/jobs", label: "Failed jobs" },
  { id: "knowledge", href: "/admin/knowledge", label: "Knowledge" },
] as const;

export function AdminShell({ active, email, badges = {}, children }: { active: (typeof TABS)[number]["id"] | null; email?: string; badges?: Partial<Record<(typeof TABS)[number]["id"], number>>; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-rail px-4 text-rail-text sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
          <div className="flex items-center gap-4"><Wordmark dark href="/admin" /><span className="hidden text-sm sm:inline">Operations</span></div>
          {email && <form action={signOut} className="text-sm"><span className="hidden sm:inline">{email} · </span><button className="underline hover:text-white">Sign out</button></form>}
        </div>
        <nav className="-mx-4 -mb-px flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Admin">
          {TABS.map((t) => {
            const on = t.id === active;
            const n = badges[t.id];
            return (
              <Link key={t.id} href={t.href} aria-current={on ? "page" : undefined}
                className={`flex items-center gap-2 shrink-0 whitespace-nowrap rounded-t-[10px] px-3 py-2.5 text-sm font-medium sm:px-4 transition-colors ${on ? "bg-paper text-ink" : "hover:bg-rail-2 hover:text-white"}`}>
                {t.label}
                {!!n && <span className={`tnum rounded-full px-1.5 text-xs font-bold ${t.id === "jobs" || t.id === "clients" ? "bg-red text-white" : "bg-mint text-white"}`}>{n}</span>}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="px-4 pb-20 pt-6 sm:px-8 lg:px-10 lg:pt-8">{children}</main>
    </div>
  );
}
