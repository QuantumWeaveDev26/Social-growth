import { Wordmark } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_1fr]">
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 sm:py-8 lg:px-14 lg:py-10">
        <Wordmark />
        <div className="flex flex-1 items-center py-8">
          <div className="mx-auto w-full max-w-[400px] lg:mx-0">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-rail lg:block">
        <div className="absolute inset-0 grid grid-cols-3 gap-3 p-10 opacity-90">
          {["bakery", "cafe", "boutique", "dental", "fitness", "realty", "cafe", "bakery", "boutique"].map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={`/sample/${s}.jpg`} alt="" className="aspect-square w-full rounded-[8px] object-cover" style={{ filter: i % 4 === 1 ? "none" : "saturate(0.85) brightness(0.8)" }} />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-rail via-rail/95 to-transparent px-12 pb-12 pt-40">
          <p className="max-w-[28rem] font-display text-[1.9rem] leading-[1.15] text-white" style={{ fontWeight: 700 }}>
            Your whole month on one sheet. Nothing posts until you tick it.
          </p>
        </div>
      </div>
    </div>
  );
}
