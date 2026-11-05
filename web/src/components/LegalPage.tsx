import { Wordmark } from "@/components/ui";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-6 sm:px-10 sm:py-8">
      <Wordmark />
      <main className="mx-auto mt-8 max-w-[680px] break-words sm:mt-14 pb-20 leading-relaxed text-ink-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="font-display text-[1.8rem] sm:text-[2.2rem] tracking-[-0.03em] text-ink" style={{ fontWeight: 800 }}>{title}</h1>
        <p className="text-sm text-ink-3">Last updated {updated}</p>
        {children}
        <p className="mt-10 border-t border-line pt-6 text-sm">
          <a className="underline" href="/privacy">Privacy policy</a> · <a className="underline" href="/terms">Terms of service</a> · <a className="underline" href="/refunds">Cancellation and refunds</a> · <a className="underline" href="/data-deletion">Data deletion</a>
        </p>
      </main>
    </div>
  );
}
