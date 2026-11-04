"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { KB_SECTIONS, kbSet, splitUpload } from "@/lib/knowledge";

export type KbState = { ok?: string; error?: string } | undefined;

export async function saveSection(_: KbState, fd: FormData): Promise<KbState> {
  await requireAdmin();
  const id = String(fd.get("id"));
  if (!KB_SECTIONS.some((s) => s.id === id)) return { error: "Unknown section" };
  kbSet(id, String(fd.get("text") || ""));
  revalidatePath("/admin/knowledge");
  return { ok: "Saved. New posts and reels use it straight away." };
}

/** Upload one .md/.txt file with "=== SECTION: id ===" markers; fills every section it contains. */
export async function uploadKnowledge(_: KbState, fd: FormData): Promise<KbState> {
  await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a file." };
  if (file.size > 2_000_000) return { error: "File is over 2 MB." };
  const parts = splitUpload(await file.text());
  const ids = Object.keys(parts);
  if (!ids.length) return { error: "No \"=== SECTION: name ===\" markers found in that file." };
  for (const id of ids) kbSet(id, parts[id as keyof typeof parts]!);
  revalidatePath("/admin/knowledge");
  return { ok: `Updated ${ids.length} section${ids.length === 1 ? "" : "s"}: ${ids.join(", ")}.` };
}
