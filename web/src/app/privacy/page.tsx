import { Wordmark } from "@/components/ui";
export const metadata = { title: "Privacy policy" };
export default function Privacy() {
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-bold text-ink">{children}</h2>;
  return (
    <div className="min-h-dvh px-10 py-8">
      <Wordmark />
      <main className="mx-auto mt-14 max-w-[680px] leading-relaxed text-ink-2">
        <h1 className="font-display text-[2.2rem] tracking-[-0.03em] text-ink" style={{ fontWeight: 800 }}>Privacy policy</h1>
        <p className="mt-3">BrandMint AI Private Limited (“we”) makes and schedules social media content for businesses. This page explains what we collect and why.</p>
        <H>What we collect</H>
        <p>Your name, email and password (stored as a one-way hash); the business details, logo and colours you give us; your plan and payment reference from Razorpay (we never see card numbers); and, when you connect Meta, your Facebook Page ID and name, Instagram account ID and username, and an access token.</p>
        <H>How we use Facebook and Instagram access</H>
        <p>Only to publish the posts and reels you approve, at the times you choose, and to check that the connection still works. We do not read your messages, followers or other content, and we never post anything you have not approved.</p>
        <H>AI processing</H>
        <p>Your business details are sent to AI providers (OpenAI for text and images, ElevenLabs for voice) to create your content. They are not used to identify you.</p>
        <H>Storage and security</H>
        <p>Access tokens are encrypted at rest. Data is kept while your account is active and deleted on request.</p>
        <H>Your choices</H>
        <p>Disconnect Meta at any time from Connections, or remove the app in your Facebook or Instagram settings. See <a className="font-semibold text-mint-deep underline" href="/data-deletion">data deletion</a>. Questions: support@brandmintai.io.</p>
        <p className="mt-8 text-sm"><a className="underline" href="/terms">Terms of service</a> · <a className="underline" href="/refunds">Cancellation and refunds</a></p>
      </main>
    </div>
  );
}
