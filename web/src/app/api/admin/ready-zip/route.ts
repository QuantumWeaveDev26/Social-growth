/**
 * POST /api/admin/ready-zip?customerId=…&startDay=YYYY-MM-DD&times=10:00,18:30&everyDays=1
 * Body: the raw .zip (streamed to disk, so big reel zips don't sit in memory).
 * Creates draft items and starts writing captions in the background.
 */
import fs from "node:fs";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { importZip, saveUploadToTemp } from "@/lib/zipImport";
import { writeReadyCopyAll } from "@/lib/readyCopy";
import { parseTimes } from "@/lib/ready";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const customerId = q.get("customerId") || "";
  const c = db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  if (!c) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });

  // facts for the caption writer (WhatsApp, website, location, offers…) saved on the client
  const notes = (q.get("notes") || "").trim();
  if (notes) {
    const d = JSON.parse(c.details || "{}");
    d.caption_notes = notes.slice(0, 3000);
    db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, c.id)).run();
  }

  const file = await saveUploadToTemp(req.body);
  try {
    const ids = await importZip(customerId, file, { startDay: q.get("startDay") || "", times: parseTimes(q.get("times") || ""), everyDays: Number(q.get("everyDays") || 1) });
    if (q.get("captions") !== "0") void writeReadyCopyAll(ids); // background: each item shows "Writing captions…" until done
    return NextResponse.json({ created: ids.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  } finally {
    fs.rmSync(file, { force: true });
  }
}
