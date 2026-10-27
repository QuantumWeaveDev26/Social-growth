import Link from "next/link";
import { STATUS, type ItemStatus } from "@/lib/format";

export function Wordmark({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 font-display text-[1.15rem] font-800 tracking-[-0.02em] ${dark ? "text-white" : "text-ink"}`} style={{ fontWeight: 800 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2.5c4.6 2.7 7 6.2 7 10.2A7 7 0 0 1 12 21.5a7 7 0 0 1-7-8.8C5 8.7 7.4 5.2 12 2.5Z" fill="#1F9D74" />
        <path d="M12 7.5v13" stroke={dark ? "#13221D" : "#F4F6F5"} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 12.5l3.2-2.4M12 16l-3.2-2.4" stroke={dark ? "#13221D" : "#F4F6F5"} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      BrandMint<span className="text-mint">AI</span>
    </Link>
  );
}

export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status as ItemStatus] ?? STATUS.planned;
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

/** Grease-pencil tick drawn over an approved frame. */
export function ApproveMark({ draw = false, className = "" }: { draw?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={`approve-mark ${draw ? "draw" : ""} ${className}`} aria-hidden>
      <path d="M6 26c6 4 10 9 14 15 9-15 21-27 38-36" fill="none" stroke="#1F9D74" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[10px] bg-red-wash px-3 py-2 text-sm text-red">
      {message}
    </p>
  );
}
