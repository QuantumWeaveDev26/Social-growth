import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

/** Live background-work snapshot. Admins see everything (or one customer with ?customer=); owners see their own business. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const scope = user.role === "admin" ? req.nextUrl.searchParams.get("customer") || undefined : user.customerId ?? "__none__";
  return NextResponse.json(getActivity(scope), { headers: { "Cache-Control": "no-store" } });
}
