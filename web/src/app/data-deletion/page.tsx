import { Wordmark } from "@/components/ui";
export const metadata = { title: "Data deletion" };
export default async function DataDeletion({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <div className="min-h-dvh px-10 py-8">
      <Wordmark />
      <main className="mx-auto mt-14 max-w-[640px] space-y-4 leading-relaxed text-ink-2">
        <h1 className="font-display text-[2.2rem] tracking-[-0.03em] text-ink" style={{ fontWeight: 800 }}>Deleting your Meta data</h1>
        {code && <p className="rounded-[12px] bg-mint-wash px-4 py-3 text-mint-deep">Your request <span className="font-mono">{code}</span> is complete. We deleted the Facebook and Instagram access tokens and account IDs we held for you.</p>}
        <p>BrandMint AI stores only what it needs to post for you: your Facebook Page ID and name, your Instagram account ID and username, and an encrypted access token.</p>
        <p>To delete it: open BrandMint AI, go to Accounts and plan, and choose Disconnect. You can also remove BrandMint AI under Facebook Settings → Business integrations, or Instagram Settings → Apps and websites. Meta then tells us and we delete the data automatically.</p>
        <p>To delete your whole BrandMint AI account and the content we made, write to support@brandmintai.io from your account email.</p>
      </main>
    </div>
  );
}
