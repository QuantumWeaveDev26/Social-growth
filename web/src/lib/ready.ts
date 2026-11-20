/** Ready-made content helpers (see app/admin/customers/[id]/ready.ts). */
export const READY_PLAN = "ready";

/** "2026-11-25" + "18:30" in India time → Date. */
export function istDate(day: string, time: string) {
  const d = new Date(`${day}T${/^\d{2}:\d{2}$/.test(time) ? time : "10:00"}:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
}

/** Date → { day: "2026-11-25", time: "18:30" } in India time. */
export function istParts(d: Date) {
  const s = new Date(d.getTime() + 5.5 * 3600e3).toISOString();
  return { day: s.slice(0, 10), time: s.slice(11, 16) };
}
