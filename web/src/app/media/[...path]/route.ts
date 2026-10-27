import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { STORAGE_ROOT } from "@/lib/storage";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".webp": "image/webp" };

/** Public media (Meta fetches published media from here). Paths are unguessable UUID trees. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.map(decodeURIComponent).join("/");
  const full = path.resolve(STORAGE_ROOT, rel);
  if (!full.startsWith(STORAGE_ROOT + path.sep) || !fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const stat = fs.statSync(full);
  const type = TYPES[path.extname(full).toLowerCase()] || "application/octet-stream";
  const range = req.headers.get("range");
  if (range && type.startsWith("video")) {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s);
    const end = e ? Number(e) : stat.size - 1;
    const stream = fs.createReadStream(full, { start, end });
    return new Response(stream as unknown as ReadableStream, { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) } });
  }
  return new Response(fs.readFileSync(full), { headers: { "Content-Type": type, "Content-Length": String(stat.size), "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" } });
}
