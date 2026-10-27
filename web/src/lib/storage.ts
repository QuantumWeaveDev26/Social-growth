import fs from "node:fs";
import path from "node:path";

/** Local file storage. Paths are stored relative (customerId/...). Swap for R2/S3 in production. */
export const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");

export function saveFile(rel: string, data: Buffer) {
  const full = path.join(STORAGE_ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return rel;
}

export function readFile(rel: string) {
  const full = path.join(STORAGE_ROOT, rel);
  if (!full.startsWith(STORAGE_ROOT)) throw new Error("bad path");
  return fs.readFileSync(full);
}

export function absPath(rel: string) {
  return path.join(STORAGE_ROOT, rel);
}

/** Public URL (served by /media). Meta fetches media from here when publishing. */
export function mediaUrl(rel: string | null | undefined) {
  if (!rel) return null;
  return `/media/${rel.split("/").map(encodeURIComponent).join("/")}`;
}
