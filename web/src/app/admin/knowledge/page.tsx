import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "../AdminShell";
import { KB_SECTIONS, kbGet } from "@/lib/knowledge";
import { UploadForm, SectionForm } from "./Forms";

export const metadata = { title: "Knowledge" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  await requireAdmin();
  return (
    <AdminShell active="knowledge">
      <h1 className="font-display text-[2.2rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Knowledge bank</h1>
      <p className="mt-3 max-w-[75ch] text-ink-2">BrandMint’s private creative rules. Every brand profile, month plan, post, reel and edit reads the sections it needs. Stored only in this server’s database, never in the code repository.</p>
      <div className="mt-6 rounded-[14px] bg-sheet p-5 ring-1 ring-line">
        <p className="mb-3 text-sm text-ink-2">Upload a file with <code>=== SECTION: core ===</code>, <code>=== SECTION: reels ===</code> … markers to fill several sections at once.</p>
        <UploadForm />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {KB_SECTIONS.map((s) => <SectionForm key={s.id} id={s.id} label={s.label} hint={s.hint} text={kbGet(s.id)} />)}
      </div>
    </AdminShell>
  );
}
