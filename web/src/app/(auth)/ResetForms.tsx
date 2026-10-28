"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestReset, resetPassword } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

export function ForgotForm() {
  const [state, action] = useActionState(requestReset, undefined);
  if (state?.sent) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Check your email</h1>
        <p className="text-ink-2">If that email has a BrandMint AI account, a reset link is on its way. It works for one hour. Check spam if it doesn’t arrive in a few minutes.</p>
        <Link href="/login" className="font-semibold text-mint-deep underline">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Forgot your password?</h1>
      <p className="text-ink-2">Enter your account email and we’ll send a link to choose a new one.</p>
      <FormError message={state?.error} />
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
      <SubmitButton className="btn btn-primary w-full py-3" pending="Sending">Send reset link</SubmitButton>
      <p className="text-sm text-ink-2"><Link href="/login" className="font-semibold text-mint-deep underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-5">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Choose a new password</h1>
      <FormError message={state?.error} />
      <input type="hidden" name="token" value={token} />
      <div><label className="label" htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="field" /><p className="hint">At least 8 characters. This signs you out everywhere else.</p></div>
      <SubmitButton className="btn btn-primary w-full py-3" pending="Saving">Save and sign in</SubmitButton>
      {state?.error && <p className="text-sm"><Link href="/forgot" className="font-semibold text-mint-deep underline">Get a new link</Link></p>}
    </form>
  );
}
