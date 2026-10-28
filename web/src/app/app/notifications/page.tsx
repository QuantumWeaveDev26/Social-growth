import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Mail, Bell } from "lucide-react";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { SubmitButton } from "@/components/SubmitButton";
import { markAllRead } from "../actions";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const { customer } = await requireCustomer();
  const list = db.select().from(schema.notifications).where(eq(schema.notifications.customerId, customer.id)).orderBy(desc(schema.notifications.createdAt)).limit(100).all();
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <main className="px-12 pb-20 pt-10">
      <header className="flex items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Notifications</h1>
          <p className="tnum mt-3 text-ink-2">{unread ? `${unread} unread` : "You’re up to date"}</p>
        </div>
        {unread > 0 && <form action={markAllRead}><SubmitButton className="btn btn-ghost" pending="Marking">Mark all as read</SubmitButton></form>}
      </header>
      {list.length === 0 ? (
        <p className="mt-16 text-center text-ink-2">Nothing yet. We’ll tell you here when your month is ready, when posts need your OK, and if anything needs fixing.</p>
      ) : (
        <ol className="mt-4 max-w-[820px] divide-y divide-line">
          {list.map((n) => (
            <li key={n.id} className="flex gap-4 py-4">
              <span className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : n.kind === "connection_broken" || n.kind === "post_failed" || n.kind === "past_due" ? "bg-red" : "bg-mint"}`} aria-label={n.readAt ? undefined : "Unread"} />
              <div className="min-w-0 flex-1">
                <p className={`text-[0.98rem] ${n.readAt ? "font-medium" : "font-bold"}`}>{n.link ? <Link href={n.link} className="hover:text-mint-deep hover:underline">{n.title}</Link> : n.title}</p>
                <p className="mt-1 whitespace-pre-line text-[0.92rem] leading-relaxed text-ink-2">{n.body}</p>
                <p className="tnum mt-1.5 flex items-center gap-3 text-xs text-ink-3">
                  {fmtDateTime(n.createdAt)}
                  {n.emailStatus === "sent" && <span className="flex items-center gap-1"><Mail className="size-3" aria-hidden />Emailed</span>}
                  {n.emailStatus === "pending" && <span className="flex items-center gap-1"><Bell className="size-3" aria-hidden />Email sending</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
