import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { RotateCcw } from "lucide-react";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { retryJob } from "../actions";
import { AdminShell } from "../AdminShell";

export const metadata = { title: "Failed jobs" };
export const dynamic = "force-dynamic";

export default async function FailedJobs() {
  const admin = await requireAdmin();
  const jobs = db.select().from(schema.jobs).where(eq(schema.jobs.status, "failed")).orderBy(desc(schema.jobs.finishedAt)).limit(100).all();
  const names = new Map(db.select({ id: schema.customers.id, name: schema.customers.businessName }).from(schema.customers).all().map((c) => [c.id, c.name]));
  return (
    <AdminShell active="jobs" email={admin.email} badges={{ jobs: jobs.length }}>
      <div className="overflow-hidden rounded-[12px] bg-sheet ring-1 ring-line">
        <table className="tnum w-full text-left text-[0.88rem]">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3"><tr>{["Job", "Client", "Tries", "Created", "Error", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {!jobs.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-2">No failed jobs.</td></tr>}
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="px-4 py-2.5 font-mono text-xs">{j.type}</td>
                <td className="px-4 py-2.5">{j.customerId ? <Link href={`/admin/customers/${j.customerId}`} className="hover:underline">{names.get(j.customerId)}</Link> : "—"}</td>
                <td className="px-4 py-2.5">{j.attempts}</td>
                <td className="px-4 py-2.5 text-ink-2">{fmtDateTime(j.createdAt)}</td>
                <td className="max-w-[460px] truncate px-4 py-2.5 text-ink-2" title={j.error ?? ""}>{j.error}</td>
                <td className="px-4 py-2.5 text-right">
                  <form action={retryJob}><input type="hidden" name="jobId" value={j.id} /><button className="inline-flex items-center gap-1 text-sm font-medium text-mint-deep hover:underline"><RotateCcw className="size-3.5" aria-hidden />Retry</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
