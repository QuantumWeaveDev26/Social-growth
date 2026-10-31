import { requireAdmin } from "@/lib/auth";
import { ActivityPanel } from "@/components/ActivityPanel";
import { getActivity } from "@/lib/activity";
import { AdminShell } from "../AdminShell";

export const metadata = { title: "Live activity" };
export const dynamic = "force-dynamic";

export default async function AdminActivity() {
  const admin = await requireAdmin();
  return (
    <AdminShell active="activity" email={admin.email}>
      <p className="mb-4 text-ink-2">What the background worker is making and posting for every client right now. Updates live.</p>
      <ActivityPanel initial={getActivity()} admin />
    </AdminShell>
  );
}
