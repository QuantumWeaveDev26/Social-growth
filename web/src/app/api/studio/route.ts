/**
 * Internal content studio relay: lets the BrandMint team's production tools call Veo and Gemini image models
 * on our Google Cloud project without holding the service-account key. Off unless STUDIO_KEY is set.
 * POST { target: "veo-3.1-generate-001:predictLongRunning", location?: "us-central1", body: {...} }
 * Header: x-studio-key: <STUDIO_KEY>
 */
import crypto from "node:crypto";
import { vertexModelCall } from "@/lib/veo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const key = process.env.STUDIO_KEY || "";
  const got = req.headers.get("x-studio-key") || "";
  if (key.length < 24 || got.length !== key.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key)))
    return Response.json({ error: "not allowed" }, { status: 403 });
  const { target, location, body } = await req.json().catch(() => ({}));
  try {
    const r = await vertexModelCall(String(target || ""), body, location ? String(location) : undefined);
    return Response.json(r.json, { status: r.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
