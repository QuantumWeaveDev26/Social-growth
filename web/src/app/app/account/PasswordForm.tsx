"use client";
import { useActionState } from "react";
import { changePassword } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="max-w-[380px] space-y-4">
      {state?.ok && <p role="status" className="rounded-[10px] bg-mint-wash px-3 py-2 text-sm text-mint-deep">Password changed. Other devices are signed out.</p>}
      <FormError message={state?.error} />
      <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required className="field" /></div>
      <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required className="field" /><p className="hint">At least 8 characters.</p></div>
      <SubmitButton pending="Saving">Change password</SubmitButton>
    </form>
  );
}
