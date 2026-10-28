"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, icon, children, badge }: { href: string; exact?: boolean; icon: React.ReactNode; children: React.ReactNode; badge?: number }) {
  const path = usePathname();
  const active = exact ? path === href || path.startsWith("/app/items") : path.startsWith(href);
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[0.93rem] transition-colors ${active ? "bg-rail-2 font-semibold text-white" : "hover:bg-rail-2/60 hover:text-white"}`}>
      {icon}<span className="flex-1">{children}</span>
      {badge ? <span className="tnum min-w-5 rounded-full bg-mint px-1.5 text-center text-[0.72rem] font-bold leading-5 text-white" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
}
