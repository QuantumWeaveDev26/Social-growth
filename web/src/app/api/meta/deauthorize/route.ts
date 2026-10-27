import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseSignedRequest } from "@/lib/meta";

/** Meta calls this when a customer removes the app from their Facebook/Instagram settings. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const data = parseSignedRequest(String(form.get("signed_request") || ""));
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  db.update(schema.metaConnections)
    .set({ status: "needs_reconnect", pageToken: null, lastError: "You removed BrandMint AI from your Meta account settings." })
    .where(eq(schema.metaConnections.metaUserId, String(data.user_id))).run();
  return NextResponse.json({ ok: true });
}
