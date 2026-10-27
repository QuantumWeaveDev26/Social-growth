import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { completeInstagramLogin } from "@/lib/meta";
import { backUrl, saveConnection } from "@/lib/metaConnect";

/** Instagram Login redirect (Instagram professional accounts without a Facebook Page). */
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL || "http://localhost:3000";
  const user = await currentUser();
  if (!user?.customerId) return NextResponse.redirect(`${base}/login`);
  const customer = db.select().from(schema.customers).where(eq(schema.customers.id, user.customerId)).get()!;
  const sp = req.nextUrl.searchParams;
  const jar = await cookies();
  const fail = (reason: string) => NextResponse.redirect(`${base}${backUrl(customer, `meta=${reason}`)}`);
  if (sp.get("error")) return fail("cancelled");
  const code = sp.get("code")?.replace(/#_$/, "");
  if (!code || sp.get("state") !== jar.get("bm_meta_state")?.value) return fail("error");
  jar.delete("bm_meta_state");
  try {
    const r = await completeInstagramLogin(code);
    saveConnection(customer.id, { mode: "live", kind: "instagram", metaUserId: r.metaUserId, igUserId: r.igUserId, igUsername: r.igUsername, token: r.token, tokenExpiresAt: r.expiresAt });
    return NextResponse.redirect(`${base}${backUrl(customer, "meta=connected")}`);
  } catch (e) {
    console.error("instagram callback", e);
    return fail("error");
  }
}
