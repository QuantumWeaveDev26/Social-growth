"use client";
import { useActionState } from "react";
import { saveSection, uploadKnowledge } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

export function UploadForm() {
  const [state, action] = useActionState(uploadKnowledge, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="file" name="file" accept=".md,.txt,text/markdown,text/plain" className="text-sm" />
      <SubmitButton className="btn btn-primary" pending="Uploading">Upload knowledge file</SubmitButton>
      {state?.ok && <p role="status" className="w-full text-sm text-mint-deep">{state.ok}</p>}
      <div className="w-full"><FormError message={state?.error} /></div>
    </form>
  );
}

export function SectionForm({ id, label, hint, text }: { id: string; label: string; hint: string; text: string }) {
  const [state, action] = useActionState(saveSection, undefined);
  return (
    <form action={action} className="rounded-[14px] bg-sheet p-5 ring-1 ring-line">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-bold">{label}</h2>
        <span className="tnum text-xs text-ink-3">{text.trim() ? `${text.trim().split(/\s+/).length.toLocaleString("en-IN")} words` : "empty"}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{hint}</p>
      <textarea name="text" defaultValue={text} rows={10} className="field mt-3 font-mono text-[0.8rem]" />
      <div className="mt-3 flex items-center gap-3">
        <SubmitButton className="btn btn-ghost" pending="Saving">Save section</SubmitButton>
        {state?.ok && <span role="status" className="text-sm text-mint-deep">{state.ok}</span>}
        <FormError message={state?.error} />
      </div>
    </form>
  );
}
