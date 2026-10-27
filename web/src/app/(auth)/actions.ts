"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession, hashPassword, checkPassword } from "@/lib/auth";

export type FormState = { error?: string } | undefined;

const SignUp = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  business: z.string().trim().min(2, "Enter your business name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters for the password"),
  plan: z.enum(["starter", "growth", "scale"]).optional().catch(undefined),
});

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = SignUp.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, business, email, password, plan } = parsed.data;
  if (db.select().from(schema.users).where(eq(schema.users.email, email)).get()) {
    return { error: "An account with this email already exists. Sign in instead." };
  }
  const customer = db.insert(schema.customers).values({ businessName: business, postingTimes: JSON.stringify(["10:00", "18:30"]) }).returning().get();
  const user = db.insert(schema.users).values({ email, name, passwordHash: await hashPassword(password), customerId: customer.id }).returning().get();
  await createSession(user.id);
  redirect(plan ? `/onboarding?plan=${plan}` : "/onboarding");
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await checkPassword(password, user.passwordHash))) return { error: "That email and password don’t match. Check both and try again." };
  await createSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/app");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
