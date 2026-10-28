"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { and, gt, isNull } from "drizzle-orm";
import { limited, hit, clear } from "@/lib/ratelimit";
import { notify } from "@/lib/notify";
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
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const keys = [`login:${email}`, `login-ip:${ip}`];
  if (limited(keys[0], 5, 15 * 60_000) || limited(keys[1], 20, 15 * 60_000)) {
    return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  }
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    keys.forEach(hit);
    return { error: "That email and password don’t match. Check both and try again." };
  }
  clear(keys[0]);
  await createSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/app");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

export type ResetState = { error?: string; sent?: boolean } | undefined;

/** Always answers the same way, so it can't be used to discover which emails have accounts. */
export async function requestReset(_: ResetState, fd: FormData): Promise<ResetState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter the email you signed up with." };
  if (limited(`reset:${email}`, 3, 60 * 60_000)) return { sent: true };
  hit(`reset:${email}`);
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    db.insert(schema.passwordResets).values({ userId: user.id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) }).run();
    notify(null, {
      kind: "password_reset", email: true, link: `/reset?token=${token}`, cta: "Choose a new password",
      title: "Reset your BrandMint AI password",
      body: "Someone (hopefully you) asked to reset the password for this account. The link works for one hour and only once.\n\nIf it wasn’t you, ignore this email. Your password stays the same.",
    }, user.id);
  }
  return { sent: true };
}

export async function resetPassword(_: ResetState, fd: FormData): Promise<ResetState> {
  const token = String(fd.get("token") || "");
  const next = String(fd.get("password") || "");
  if (next.length < 8) return { error: "Use at least 8 characters." };
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db.select().from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.tokenHash, hash), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date()))).get();
  if (!row) return { error: "This reset link has expired or was already used. Ask for a new one." };
  const user = db.select().from(schema.users).where(eq(schema.users.id, row.userId)).get();
  if (!user) return { error: "Account not found." };
  db.update(schema.users).set({ passwordHash: await hashPassword(next), sessionVersion: user.sessionVersion + 1 }).where(eq(schema.users.id, user.id)).run();
  db.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, row.id)).run();
  clear(`login:${user.email}`);
  await createSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/app");
}
