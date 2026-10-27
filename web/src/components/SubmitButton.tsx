"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SubmitButton({ children, pending: pendingLabel, className = "btn btn-primary", name, value, disabled }: { children: React.ReactNode; pending?: string; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value} aria-busy={pending}>
      {pending ? (<><Loader2 className="size-4 animate-spin" aria-hidden /> {pendingLabel ?? "Working"}</>) : children}
    </button>
  );
}
