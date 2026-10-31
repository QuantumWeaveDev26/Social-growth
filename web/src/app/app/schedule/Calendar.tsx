import Link from "next/link";
import { ChevronLeft, ChevronRight, Film } from "lucide-react";

export type CalEntry = {
  id: string;
  day: string; // IST yyyy-mm-dd
  time: string;
  title: string;
  thumb: string | null;
  reel: boolean;
  state: "review" | "scheduled" | "posted" | "failed";
  fb: "meta" | "brandmint" | "posted" | null;
  ig: "brandmint" | "posted" | null;
};

const STATE = {
  review: { label: "Needs your OK", bar: "bg-ink-3", card: "bg-white text-ink-2 ring-line opacity-80" },
  scheduled: { label: "Scheduled", bar: "bg-mint", card: "bg-mint-wash/60 text-ink ring-mint/30" },
  posted: { label: "Posted", bar: "bg-mint-deep", card: "bg-white text-ink ring-line" },
  failed: { label: "Needs attention", bar: "bg-red", card: "bg-red-wash text-ink ring-red/30" },
} as const;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function Calendar({ month, today, entries }: { month: string; today: string; entries: CalEntry[] }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const byDay = new Map<string, CalEntry[]>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) || []), e]);
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const counts = { scheduled: 0, posted: 0, review: 0, failed: 0 };
  entries.forEach((e) => counts[e.state]++);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href={`/app/schedule?month=${shift(month, -1)}`} className="btn btn-ghost px-2 py-1.5" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
          <h2 className="min-w-[10rem] text-center font-display text-[1.4rem] tracking-[-0.02em]" style={{ fontWeight: 800 }}>{label}</h2>
          <Link href={`/app/schedule?month=${shift(month, 1)}`} className="btn btn-ghost px-2 py-1.5" aria-label="Next month"><ChevronRight className="size-4" /></Link>
          {month !== today.slice(0, 7) && <Link href="/app/schedule" className="ml-2 text-sm font-medium text-ink-2 underline hover:text-ink">Today</Link>}
        </div>
        <ul className="tnum flex flex-wrap gap-4 text-sm text-ink-2">
          {(Object.keys(STATE) as Array<keyof typeof STATE>).map((k) => (
            <li key={k} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${STATE[k].bar}`} aria-hidden />{STATE[k].label} <span className="text-ink-3">{counts[k]}</span></li>
          ))}
        </ul>
      </div>

      <div className="mt-4 overflow-hidden rounded-[14px] bg-sheet ring-1 ring-line">
        <div className="grid grid-cols-7 border-b border-line bg-white text-xs font-semibold uppercase tracking-wide text-ink-3">
          {WEEKDAYS.map((d) => <div key={d} className="px-3 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const list = day ? byDay.get(day) || [] : [];
            const isToday = day === today;
            const past = !!day && day < today;
            return (
              <div key={i} className={`min-h-[132px] border-line p-1.5 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${day ? "" : "bg-[#f3f4f2]"} ${past ? "bg-[#f7f8f6]" : ""}`}>
                {day && (
                  <>
                    <p className={`tnum mb-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-ink text-white" : past ? "text-ink-3" : "text-ink-2"}`}>{Number(day.slice(8))}</p>
                    <ul className="space-y-1">
                      {list.slice(0, 3).map((e) => <EntryChip key={e.id} e={e} />)}
                    </ul>
                    {list.length > 3 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer px-1 text-xs font-semibold text-ink-2 hover:text-ink">+{list.length - 3} more</summary>
                        <ul className="mt-1 space-y-1">{list.slice(3).map((e) => <EntryChip key={e.id} e={e} />)}</ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-3">
        <span className="font-semibold text-ink-2">f</span> Facebook · <span className="font-semibold text-ink-2">ig</span> Instagram. A filled tag means it’s in Meta Business Suite’s schedule or already posted; an outlined tag means BrandMint posts it at that time.
      </p>
    </section>
  );
}

function Tag({ name, v }: { name: string; v: "meta" | "brandmint" | "posted" | null }) {
  if (!v) return null;
  const cls = v === "brandmint" ? "ring-1 ring-line-strong text-ink-2" : "bg-mint text-white";
  const title = v === "meta" ? "In Meta Business Suite schedule" : v === "posted" ? "Posted" : "BrandMint posts at this time";
  return <span title={`${name === "f" ? "Facebook" : "Instagram"}: ${title}`} className={`rounded-[4px] px-1 text-[10px] font-bold leading-4 ${cls}`}>{name}</span>;
}

function EntryChip({ e }: { e: CalEntry }) {
  const s = STATE[e.state];
  return (
    <li>
      <Link href={`/app/items/${e.id}`} title={`${e.time} · ${e.title} · ${s.label}`} className={`flex items-center gap-1.5 rounded-[8px] p-1 ring-1 transition-shadow hover:shadow-sm ${s.card}`}>
        {e.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.thumb} alt="" className="size-8 shrink-0 rounded-[5px] object-cover" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-[5px] bg-[#eef1ef] text-ink-3"><Film className="size-3.5" aria-hidden /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="tnum flex items-center gap-1 text-[11px] font-semibold leading-4">
            {e.time}{e.reel && <Film className="size-3 text-ink-3" aria-label="Reel" />}
            <span className="ml-auto flex gap-0.5"><Tag name="f" v={e.fb} /><Tag name="ig" v={e.ig} /></span>
          </span>
          <span className="block truncate text-[11px] leading-4">{e.title}</span>
        </span>
      </Link>
    </li>
  );
}
