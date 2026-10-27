import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { completeFacebookLogin } from "@/lib/meta";
import { seal } from "@/lib/crypto";
import { backUrl, savePage } from "@/lib/metaConnect";

/** Facebook Login for Business redirect. */
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL || "http://localhost:3000";
  const user = await currentUser();
  if (!user?.customerId) return NextResponse.redirect(`${base}/login`);
  const customer = db.select().from(schema.customers).where(eq(schema.customers.id, user.customerId)).get()!;
  const sp = req.nextUrl.searchParams;
  const jar = await cookies();
  const fail = (reason: string) => NextResponse.redirect(`${base}${backUrl(customer, `meta=${reason}`)}`);

  if (sp.get("error")) return fail("cancelled");
  const code = sp.get("code");
  if (!code || sp.get("state") !== jar.get("bm_meta_state")?.value) return fail("error");
  jar.delete("bm_meta_state");

  try {
    const { metaUserId, pages } = await completeFacebookLogin(code);
    if (pages.length === 0) return fail("no_pages");
    if (pages.length === 1) {
      savePage(customer.id, metaUserId, pages[0]);
      return NextResponse.redirect(`${base}${backUrl(customer, pages[0].igId ? "meta=connected" : "meta=no_instagram")}`);
    }
    db.delete(schema.metaPending).where(eq(schema.metaPending.customerId, customer.id)).run();
    const pending = db.insert(schema.metaPending).values({ customerId: customer.id, payload: seal(JSON.stringify({ metaUserId, pages })) }).returning().get();
    return NextResponse.redirect(`${base}/connect/meta?p=${pending.id}`);
  } catch (e) {
    console.error("meta callback", e);
    return fail("error");
  }
}
