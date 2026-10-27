import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseSignedRequest } from "@/lib/meta";

/** Meta's data deletion request callback. Deletes stored Meta tokens and account ids for that user. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const data = parseSignedRequest(String(form.get("signed_request") || ""));
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  db.delete(schema.metaConnections).where(eq(schema.metaConnections.metaUserId, String(data.user_id))).run();
  const code = crypto.createHash("sha256").update(`${data.user_id}:${Date.now()}`).digest("hex").slice(0, 16);
  const base = process.env.APP_URL || "http://localhost:3000";
  return NextResponse.json({ url: `${base}/data-deletion?code=${code}`, confirmation_code: code });
}
