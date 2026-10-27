export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
export const TZ = "Asia/Kolkata";
export const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
export const fmtTime = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
export const fmtDateTime = (d: Date) => `${fmtDay(d)}, ${fmtTime(d)}`;
export const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 1));
};
export const currentMonth = () => {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
export const istDayKey = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

export type ItemStatus = "planned" | "generating" | "awaiting_approval" | "changes_requested" | "approved" | "scheduled" | "published" | "failed";
export const STATUS: Record<ItemStatus, { label: string; cls: string }> = {
  planned: { label: "Queued", cls: "bg-[#eef1ef] text-ink-2" },
  generating: { label: "Being made", cls: "bg-[#eef1ef] text-ink-2" },
  awaiting_approval: { label: "Needs your OK", cls: "bg-ink text-white" },
  changes_requested: { label: "Redoing", cls: "bg-amber-wash text-amber-deep" },
  approved: { label: "Approved", cls: "bg-mint-wash text-mint-deep" },
  scheduled: { label: "Scheduled", cls: "bg-mint-wash text-mint-deep" },
  published: { label: "Posted", cls: "bg-mint text-white" },
  failed: { label: "Needs attention", cls: "bg-red-wash text-red" },
};
