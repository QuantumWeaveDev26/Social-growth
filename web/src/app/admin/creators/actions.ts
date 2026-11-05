"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { addCreator, getCreator, MAX_PASTE, queueStudy, queueSynthesis, removeCreator } from "@/lib/creators";
import { kbGet, kbSet } from "@/lib/knowledge";

export type CsState = { ok?: string; error?: string } | undefined;

export async function addCreatorAction(_: CsState, fd: FormData): Promise<CsState> {
  await requireAdmin();
  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) return { error: "Enter the creator's name." };
  const url = String(fd.get("url") || "").trim();
  if (url && !/^https:\/\/(www\.)?linkedin\.com\//i.test(url)) return { error: "The profile link should start with https://www.linkedin.com/" };
  const c = addCreator(name, url, String(fd.get("notes") || ""));
  redirect(`/admin/creators/${c.id}`);
}

export async function studyAction(_: CsState, fd: FormData): Promise<CsState> {
  await requireAdmin();
  const id = String(fd.get("id"));
  if (!getCreator(id)) return { error: "Creator not found." };
  const text = String(fd.get("posts") || "");
  if (text.trim().length < 300) return { error: "Paste more text: at least 10 posts from their activity page." };
  if (text.length > MAX_PASTE * 1.5) return { error: `That's a lot of text. Paste about 40 posts at most (${MAX_PASTE.toLocaleString("en-IN")} characters).` };
  queueStudy(id, text);
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
  return { ok: "Analysing. This usually takes 1–2 minutes; the page updates by itself." };
}

export async function removeCreatorAction(fd: FormData) {
  await requireAdmin();
  removeCreator(String(fd.get("id")));
  revalidatePath("/admin/creators");
  redirect("/admin/creators");
}

export async function synthesisAction() {
  await requireAdmin();
  queueSynthesis();
  revalidatePath("/admin/creators");
}

/** Saves the (edited) playbook into the knowledge bank's LinkedIn section. */
export async function approvePlaybookAction(_: CsState, fd: FormData): Promise<CsState> {
  await requireAdmin();
  const text = String(fd.get("markdown") || "").trim();
  if (text.length < 200) return { error: "The playbook is empty." };
  const mode = String(fd.get("mode") || "replace");
  kbSet("linkedin", mode === "append" && kbGet("linkedin").trim() ? `${kbGet("linkedin").trim()}\n\n${text}` : text);
  revalidatePath("/admin/knowledge");
  revalidatePath("/admin/creators");
  return { ok: `Saved to Knowledge → LinkedIn playbook (${mode === "append" ? "added to" : "replaced"} the existing text).` };
}
