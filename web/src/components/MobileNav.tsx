"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * Phone/tablet top bar with a slide-in menu. On large screens it renders nothing and the
 * normal sidebar shows instead. `bar` is what sits in the top bar, `children` is the menu.
 */
export function MobileNav({ bar, children, label = "Menu" }: { bar: React.ReactNode; children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-rail px-4 py-3 text-rail-text lg:hidden">
        <div className="min-w-0">{bar}</div>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-label={`Open ${label.toLowerCase()}`}
          className="-mr-1 rounded-[10px] p-2 text-white hover:bg-rail-2">
          <Menu className="size-6" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col overflow-y-auto bg-rail px-5 py-5 text-rail-text shadow-2xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="mb-2 self-end rounded-[10px] p-2 text-white hover:bg-rail-2">
              <X className="size-5" aria-hidden />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
