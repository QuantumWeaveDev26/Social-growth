"use client";
import { useActionState } from "react";
import { addCreatorAction, approvePlaybookAction, studyAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

export function AddCreatorForm() {
  const [state, action] = useActionState(addCreatorAction, undefined);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-end">
      <div><label className="label" htmlFor="name">Creator name</label><input id="name" name="name" required placeholder="e.g. Vaibhav Sisinty" className="field" /></div>
      <div><label className="label" htmlFor="url">LinkedIn profile link (optional)</label><input id="url" name="url" type="url" placeholder="https://www.linkedin.com/in/…" className="field" /></div>
      <SubmitButton className="btn btn-primary" pending="Adding">Add creator</SubmitButton>
      <div className="md:col-span-3"><label className="label" htmlFor="notes">Why we’re studying them (optional)</label><input id="notes" name="notes" maxLength={500} placeholder="e.g. great storytelling hooks for founders" className="field" /></div>
      <div className="md:col-span-3"><FormError message={state?.error} /></div>
    </form>
  );
}

export function StudyForm({ id, max }: { id: string; max: number }) {
  const [state, action] = useActionState(studyAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="label" htmlFor="posts">Paste their posts here</label>
      <textarea id="posts" name="posts" rows={12} required maxLength={Math.round(max * 1.5)} className="field font-mono text-[0.8rem]"
        placeholder="Select all on their Activity → Posts page (Ctrl+A), copy (Ctrl+C) and paste here (Ctrl+V). Noise like 'Like · Comment · Repost' is fine." />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary" pending="Sending">Analyse posts</SubmitButton>
        <span className="text-sm text-ink-3">The pasted text is deleted once the analysis finishes. Only the patterns are kept.</span>
      </div>
      {state?.ok && <p role="status" className="text-sm text-mint-deep">{state.ok}</p>}
      <FormError message={state?.error} />
    </form>
  );
}

export function PlaybookForm({ markdown, hasExisting }: { markdown: string; hasExisting: boolean }) {
  const [state, action] = useActionState(approvePlaybookAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="markdown">Draft LinkedIn playbook. Read it, edit anything, then save it to the knowledge bank.</label>
      <textarea id="markdown" name="markdown" rows={18} defaultValue={markdown} className="field font-mono text-[0.8rem]" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-mint" name="mode" value="replace" pending="Saving">{hasExisting ? "Replace LinkedIn playbook" : "Save to knowledge bank"}</SubmitButton>
        {hasExisting && <SubmitButton className="btn btn-ghost" name="mode" value="append" pending="Saving">Add to existing playbook</SubmitButton>}
      </div>
      {state?.ok && <p role="status" className="text-sm text-mint-deep">{state.ok}</p>}
      <FormError message={state?.error} />
    </form>
  );
}
