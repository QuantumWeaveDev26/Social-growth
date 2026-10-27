"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormError } from "@/components/ui";

export function SignInForm() {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-5">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Welcome back</h1>
      <p className="text-ink-2">Sign in to review this month’s proof sheet.</p>
      <FormError message={state?.error} />
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="field" /></div>
      <SubmitButton className="btn btn-primary w-full py-3" pending="Signing in">Sign in</SubmitButton>
      <p className="text-sm text-ink-2">New to BrandMint AI? <Link href="/signup" className="font-semibold text-mint-deep underline">Start your month</Link></p>
    </form>
  );
}

export function SignUpForm({ plan }: { plan?: string }) {
  const [state, action] = useActionState(signUp, undefined);
  return (
    <form action={action} className="space-y-5">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]" style={{ fontWeight: 800 }}>Start your month</h1>
      <p className="text-ink-2">Takes about five minutes. You’ll see your brand profile before anything is made.</p>
      <FormError message={state?.error} />
      {plan && <input type="hidden" name="plan" value={plan} />}
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label" htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" required className="field" /></div>
        <div><label className="label" htmlFor="business">Business name</label><input id="business" name="business" autoComplete="organization" required className="field" /></div>
      </div>
      <div><label className="label" htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="field" /><p className="hint">At least 8 characters.</p></div>
      <SubmitButton className="btn btn-primary w-full py-3" pending="Creating your account">Create account</SubmitButton>
      <p className="text-sm text-ink-2">Already have an account? <Link href="/login" className="font-semibold text-mint-deep underline">Sign in</Link></p>
    </form>
  );
}
