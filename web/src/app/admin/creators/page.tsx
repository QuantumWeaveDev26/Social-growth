import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "../AdminShell";
import { getStudy, getSynthesis, listCreators } from "@/lib/creators";
import { kbGet } from "@/lib/knowledge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { AddCreatorForm, PlaybookForm } from "./Forms";
import { synthesisAction } from "./actions";

export const metadata = { title: "Creator study" };
export const dynamic = "force-dynamic";

const when = (ms?: number) => (ms ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(ms) : "");
const CHIP: Record<string, string> = { queued: "bg-sheet text-ink-2 ring-1 ring-line", running: "bg-amber-wash text-amber-deep", done: "bg-mint-wash text-mint-deep", failed: "bg-red-wash text-red" };
const LABEL: Record<string, string> = { queued: "Waiting", running: "Analysing", done: "Studied", failed: "Failed" };

export default async function CreatorsPage() {
  const admin = await requireAdmin();
  const creators = listCreators().map((c) => ({ c, s: getStudy(c.id) }));
  const synth = getSynthesis();
  const studied = creators.filter((x) => x.s?.status === "done").length;
  const busy = creators.some((x) => x.s && ["queued", "running"].includes(x.s.status)) || (!!synth && ["queued", "running"].includes(synth.status));
  return (
    <AdminShell active="creators" email={admin.email}>
      <AutoRefresh active={busy} ms={5000} />
      <h1 className="font-display text-[1.85rem] leading-none tracking-[-0.03em] sm:text-[2.2rem]" style={{ fontWeight: 800 }}>Creator study</h1>
      <p className="mt-3 max-w-[75ch] text-ink-2">
        Learn hooks, structures and formatting from LinkedIn creators we admire, then turn them into the LinkedIn playbook every LinkedIn post uses.
        You copy their posts in your own browser; BrandMint never visits LinkedIn itself. Their text is deleted after analysis, so only patterns are kept.
      </p>

      <section className="mt-8 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
        <h2 className="font-bold">Add a creator</h2>
        <div className="mt-3"><AddCreatorForm /></div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Creators <span className="tnum font-normal text-ink-3">{studied} of {creators.length} studied</span></h2>
        {creators.length === 0 ? (
          <p className="mt-3 text-ink-2">No creators yet. Add one above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[14px] bg-sheet ring-1 ring-line">
            {creators.map(({ c, s }) => (
              <li key={c.id}>
                <Link href={`/admin/creators/${c.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 hover:bg-white">
                  <span className="min-w-0">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-ink-3">{s?.status === "done" && s.report ? s.report.summary : c.notes || "Not studied yet"}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-ink-3">
                    {s && <span className={`chip ${CHIP[s.status]}`}>{LABEL[s.status]}</span>}
                    {s?.status === "done" && <span className="tnum">{s.report?.posts_analysed} posts · {when(s.at)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Combined LinkedIn playbook</h2>
            <p className="mt-1 text-sm text-ink-2">Merges every studied creator into one set of templates and rules for small-business LinkedIn posts.</p>
          </div>
          <form action={synthesisAction}>
            <SubmitButton className="btn btn-primary" pending="Starting" disabled={!studied || busy}>{synth?.markdown ? "Rebuild playbook" : "Build playbook"}</SubmitButton>
          </form>
        </div>
        {synth && synth.status !== "done" && (
          <p className={`mt-4 text-sm ${synth.status === "failed" ? "text-red" : "text-ink-2"}`}>
            {synth.status === "failed" ? `Last run failed: ${synth.error}` : "Building the playbook… usually 1–2 minutes."}
          </p>
        )}
        {synth?.markdown && (
          <div className="mt-5">
            <p className="mb-2 text-sm text-ink-3">Built {when(synth.at)} from {synth.creatorIds?.length ?? 0} creator{synth.creatorIds?.length === 1 ? "" : "s"}.</p>
            <PlaybookForm key={synth.at} markdown={synth.markdown} hasExisting={!!kbGet("linkedin").trim()} />
          </div>
        )}
      </section>
    </AdminShell>
  );
}
