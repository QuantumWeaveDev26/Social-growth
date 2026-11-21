/**
 * POST /api/admin/ready-zip?customerId=…&startDay=YYYY-MM-DD&times=10:00,18:30&everyDays=1
 * Body: the raw .zip (streamed to disk, so big reel zips don't sit in memory).
 * Big zips come in pieces (&upload=<id>&part=i&parts=n): the proxy in front of the app cuts any request
 * that takes over ~60 s to send, so each piece is small; the zip is imported when the last piece arrives.
 * Creates draft items and starts writing captions in the background.
 */
import fs from "node:fs";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import path from "node:path";
import { importZip, saveUploadToTemp } from "@/lib/zipImport";
import { STORAGE_ROOT } from "@/lib/storage";
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

  // chunked upload: append this piece; only the last piece goes on to the import
  const upload = q.get("upload");
  let assembled: string | null = null;
  if (upload) {
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(upload)) return NextResponse.json({ error: "Bad upload id" }, { status: 400 });
    const part = Number(q.get("part")), parts = Number(q.get("parts"));
    const dir = path.join(STORAGE_ROOT, "_tmp");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${upload}.part`);
    if (part === 0) {
      fs.rmSync(target, { force: true });
      for (const f of fs.readdirSync(dir)) { const full = path.join(dir, f); try { if (Date.now() - fs.statSync(full).mtimeMs > 86400e3) fs.rmSync(full, { force: true }); } catch { /* gone */ } }
    } else if (!fs.existsSync(target)) return NextResponse.json({ error: "Upload expired: start again" }, { status: 409 });
    if (Number(q.get("offset") || 0) !== (fs.existsSync(target) ? fs.statSync(target).size : 0)) return NextResponse.json({ error: "Piece out of order", size: fs.existsSync(target) ? fs.statSync(target).size : 0 }, { status: 409 });
    fs.appendFileSync(target, Buffer.from(await req.arrayBuffer()));
    if (part < parts - 1) return NextResponse.json({ received: part + 1, size: fs.statSync(target).size });
    assembled = target;
  }

  // facts for the caption writer (WhatsApp, website, location, offers…) saved on the client
  const notes = (q.get("notes") || "").trim();
  if (notes) {
    const d = JSON.parse(c.details || "{}");
    d.caption_notes = notes.slice(0, 3000);
    db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, c.id)).run();
  }

  const file = assembled ?? await saveUploadToTemp(req.body);
  try {
    const ids = await importZip(customerId, file, {
      startDay: q.get("startDay") || "", mode: q.get("mode") === "manual" ? "manual" : "auto", days: Math.min(90, Math.max(7, Number(q.get("days") || 30))),
      times: parseTimes(q.get("times") || ""), everyDays: Number(q.get("everyDays") || 1), autoSchedule: q.get("autoSchedule") !== "0",
    });
    if (q.get("captions") !== "0") void writeReadyCopyAll(ids); // background: each item shows "Writing captions…" until done
    return NextResponse.json({ created: ids.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  } finally {
    fs.rmSync(file, { force: true });
  }
}
