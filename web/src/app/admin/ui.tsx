import { monthLabel } from "@/lib/format";
import type { ClientRow, Issue } from "@/lib/adminData";

export function IssueChips({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <span className="chip bg-mint-wash text-mint-deep">On track</span>;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {[...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1)).map((i) => (
        <span key={i.label} className={`chip whitespace-nowrap ${i.level === "red" ? "bg-red-wash text-red" : "bg-amber-wash text-amber-deep"}`}>{i.label}</span>
      ))}
    </span>
  );
}

/** This month's content as one stacked bar: posted · scheduled · waiting for OK · being made · failed. */
export function MonthBar({ m, quota }: { m: ClientRow["month"]; quota: number | null }) {
  const total = Math.max(m.total, quota ?? 0, 1);
  const parts = [
    { n: m.posted, cls: "bg-mint-deep", label: "posted" },
    { n: m.scheduled, cls: "bg-mint", label: "scheduled" },
    { n: m.review, cls: "bg-ink-3", label: "waiting for OK" },
    { n: m.making, cls: "bg-line-strong", label: "being made" },
    { n: m.failed, cls: "bg-red", label: "failed" },
  ];
  const title = parts.filter((p) => p.n).map((p) => `${p.n} ${p.label}`).join(" · ") || "Nothing planned this month";
  return (
    <div title={title} className="w-full min-w-[120px]">
      <div className="flex h-2 overflow-hidden rounded-full bg-[#eef1ef]">
        {parts.map((p) => p.n > 0 && <span key={p.label} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <p className="tnum mt-1 text-xs text-ink-3">
        {m.label && <span className="font-semibold text-ink-2">{monthLabel(m.label).split(" ")[0].slice(0, 3)}: </span>}{m.posted} posted · {m.scheduled} sched · {m.review} to approve{quota ? ` · of ${quota}` : ""}
      </p>
    </div>
  );
}

export const MONTH_LEGEND = [
  ["bg-mint-deep", "Posted"], ["bg-mint", "Scheduled"], ["bg-ink-3", "Waiting for client OK"], ["bg-line-strong", "Being made"], ["bg-red", "Failed"],
] as const;
