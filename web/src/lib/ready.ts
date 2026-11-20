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

/** "10:00, 18:30" → ["10:00","18:30"] (sorted, valid only; default two slots a day). */
export function parseTimes(raw: string) {
  const t = raw.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).map((x) => x.padStart(5, "0")).sort();
  return t.length ? t : ["10:00", "18:30"];
}

/** Spreads n items over the posting times, one slot each, starting at the first free slot after `from`. */
export function slots(n: number, startDay: string, times: string[], everyDays: number) {
  const out: Date[] = [];
  const earliest = Date.now() + 30 * 60_000;
  let day = new Date(`${startDay}T00:00:00+05:30`);
  if (isNaN(day.getTime())) day = new Date();
  for (let guard = 0; out.length < n && guard < 400; guard++) {
    const ymd = new Date(day.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
    for (const t of times) {
      const d = istDate(ymd, t);
      if (d && d.getTime() >= earliest && out.length < n) out.push(d);
    }
    day = new Date(day.getTime() + Math.max(1, everyDays) * 86400e3);
  }
  return out;
}

