import { requireCustomer } from "@/lib/auth";
import { getActivity } from "@/lib/activity";
import { ActivityPanel } from "@/components/ActivityPanel";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const { customer } = await requireCustomer();
  return (
    <main className="px-12 pb-20 pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Activity</h1>
        <p className="mt-3 text-ink-2">What’s being made for {customer.businessName} right now, what’s next, and what just finished. Updates live.</p>
      </header>
      <div className="mt-8"><ActivityPanel initial={getActivity(customer.id)} /></div>
    </main>
  );
}
