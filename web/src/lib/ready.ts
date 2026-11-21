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


// ---------------------------------------------------------------- auto-plan (content strategy for a batch)
export type Kind = "post" | "carousel" | "reel";
/** Best default times (India): reels in the evening scroll, carousels at lunch (saves), single posts mid-morning. */
export const KIND_TIME: Record<Kind, string> = { reel: "19:00", carousel: "13:00", post: "10:30" };
const SECOND_TIME: Record<Kind, string> = { reel: "20:30", carousel: "17:30", post: "18:30" };

/**
 * Orders a batch so formats alternate (no two reels or two carousels in a row when avoidable; a reel
 * opens the plan because reels reach new people) and spreads it evenly over `days` days from `startDay`,
 * one item a day when it fits, two otherwise. Returns, for each input index, its date.
 */
export function autoPlan(kinds: Kind[], startDay: string, days = 30): { order: number[]; when: Date[] } {
  const queues: Record<Kind, number[]> = { reel: [], carousel: [], post: [] };
  kinds.forEach((k, i) => queues[k].push(i));
  const total = kinds.length;
  const order: number[] = [];
  let prev: Kind | null = null;
  for (let n = 0; n < total; n++) {
    // pick the format most "behind" its fair share, avoiding a repeat when possible
    const share = (k: Kind) => (kinds.filter((x) => x === k).length / total) * (n + 1) - order.filter((i) => kinds[i] === k).length;
    const avail = (["reel", "carousel", "post"] as Kind[]).filter((k) => queues[k].length);
    const pick = (n === 0 && queues.reel.length ? "reel" : null)
      ?? avail.filter((k) => k !== prev).sort((a, b) => share(b) - share(a))[0]
      ?? avail[0];
    order.push(queues[pick].shift()!);
    prev = pick;
  }
  // dates: spread over the window; two per day only if needed
  const span = Math.max(1, days);
  const perDay = Math.ceil(total / span);
  const startIst = istDate(/^\d{4}-\d{2}-\d{2}$/.test(startDay) ? startDay : istParts(new Date(Date.now() + 86400e3)).day, "00:00")!;
  const earliest = Date.now() + 30 * 60_000;
  const used = new Map<string, number>();
  const when: Date[] = new Array(total);
  order.forEach((idx, pos) => {
    let dayOffset = Math.floor((Math.floor(pos / perDay) * span) / Math.ceil(total / perDay)); // even gaps between posting days
    for (let guard = 0; guard < 400; guard++, dayOffset++) {
      const ymd = istParts(new Date(startIst.getTime() + dayOffset * 86400e3)).day;
      const count = used.get(ymd) || 0;
      if (count >= perDay) continue;
      const k = kinds[idx];
      const d = istDate(ymd, count === 0 ? KIND_TIME[k] : SECOND_TIME[k])!;
      if (d.getTime() < earliest) continue;
      used.set(ymd, count + 1);
      when[idx] = d;
      break;
    }
  });
  return { order, when };
}

/** A readable title for any content item (generated ones have on-image text; ready-made ones use their caption's first line). */
export function itemTitle(copyJson: string | null, briefJson: string) {
  const copy = copyJson ? JSON.parse(copyJson) : {};
  const brief = JSON.parse(briefJson || "{}");
  const first = String(copy.instagram_caption || "").split("\n").map((l: string) => l.trim()).find((l: string) => l && !l.startsWith("#"));
  return copy.on_image_text || copy.cover_text || brief.topic || first || brief.file || "Untitled";
}
