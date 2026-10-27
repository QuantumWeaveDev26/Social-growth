import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const COOKIE = "bm_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = db.select().from(schema.users).where(eq(schema.users.id, String(payload.sub))).get();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/app");
  return user;
}

/** Signed-in owner with a customer record; sends unfinished accounts back to onboarding. */
export async function requireCustomer(opts: { allowOnboarding?: boolean } = {}) {
  const user = await requireUser();
  if (user.role === "admin" && !user.customerId) redirect("/admin");
  if (!user.customerId) redirect("/onboarding");
  const customer = db.select().from(schema.customers).where(eq(schema.customers.id, user.customerId)).get();
  if (!customer) redirect("/onboarding");
  if (!opts.allowOnboarding && customer.status === "onboarding") redirect("/onboarding");
  return { user, customer };
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);
