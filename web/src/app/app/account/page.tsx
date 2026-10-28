import { requireCustomer } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "Account" };

export default async function Account() {
  const { user } = await requireCustomer();
  return (
    <main className="px-12 pb-20 pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-[2.3rem] leading-none tracking-[-0.03em]" style={{ fontWeight: 800 }}>Account</h1>
        <p className="mt-3 text-ink-2">{user.name} · {user.email}</p>
      </header>
      <section className="grid max-w-[820px] grid-cols-[220px_1fr] gap-10 py-9">
        <div><h2 className="font-bold">Password</h2><p className="mt-1 text-sm text-ink-2">Changing it signs you out on every other device.</p></div>
        <PasswordForm />
      </section>
    </main>
  );
}
