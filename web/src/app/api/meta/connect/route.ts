import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { fbLoginUrl, igLoginUrl, instagramLoginLive, metaLive } from "@/lib/meta";
import { backUrl, saveConnection } from "@/lib/metaConnect";

/** Starts a connection. ?via=instagram uses Instagram Login (Instagram-only accounts). */
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL || "http://localhost:3000";
  const user = await currentUser();
  if (!user?.customerId) return NextResponse.redirect(`${base}/login`);
  const customer = db.select().from(schema.customers).where(eq(schema.customers.id, user.customerId)).get()!;
  const via = req.nextUrl.searchParams.get("via") === "instagram" ? "instagram" : "facebook";
  const live = via === "instagram" ? instagramLoginLive() : metaLive();

  if (!live) {
    const handle = customer.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "yourbusiness";
    saveConnection(customer.id, {
      mode: "demo", kind: via, pageId: via === "facebook" ? `demo-${customer.id.slice(0, 8)}` : null,
      pageName: via === "facebook" ? customer.businessName : null, igUserId: `demo-ig-${customer.id.slice(0, 8)}`, igUsername: handle,
    });
    return NextResponse.redirect(`${base}${backUrl(customer)}`);
  }
  const state = `${via}.${crypto.randomBytes(16).toString("hex")}`;
  (await cookies()).set("bm_meta_state", state, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https"), maxAge: 900, path: "/" });
  return NextResponse.redirect(via === "instagram" ? igLoginUrl(state) : fbLoginUrl(state));
}
