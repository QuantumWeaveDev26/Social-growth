"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/db";
import { requireCustomer } from "@/lib/auth";
import { saveFile } from "@/lib/storage";

export type BizState = { ok?: string; error?: string } | undefined;
const FIELDS = ["products", "hours", "order_link", "show_more", "avoid", "offers_now", "whatsapp", "phone", "address"] as const;

export async function saveDetails(_: BizState, fd: FormData): Promise<BizState> {
  const { customer } = await requireCustomer();
  const d = JSON.parse(customer.details || "{}");
  for (const f of FIELDS) d[f] = String(fd.get(f) || "").trim().slice(0, 4000);
  db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, customer.id)).run();
  revalidatePath("/app/business");
  return { ok: "Saved. New posts and reels use these details." };
}

export async function addPhotos(_: BizState, fd: FormData): Promise<BizState> {
  const { customer } = await requireCustomer();
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one photo." };
  const d = JSON.parse(customer.details || "{}");
  const photos: string[] = Array.isArray(d.photos) ? d.photos : [];
  if (photos.length + files.length > 15) return { error: `You can keep up to 15 photos (you have ${photos.length}).` };
  for (const [i, f] of files.entries()) {
    if (f.size > 15_000_000) return { error: `${f.name} is over 15 MB.` };
    try {
      const jpg = await sharp(Buffer.from(await f.arrayBuffer())).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      photos.push(saveFile(`${customer.id}/photos/${Date.now()}-${i}.jpg`, jpg));
    } catch { return { error: `${f.name} isn't an image we can read.` }; }
  }
  d.photos = photos;
  db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, customer.id)).run();
  revalidatePath("/app/business");
  return { ok: `Added ${files.length} photo${files.length === 1 ? "" : "s"}.` };
}

export async function removePhoto(fd: FormData) {
  const { customer } = await requireCustomer();
  const d = JSON.parse(customer.details || "{}");
  d.photos = (Array.isArray(d.photos) ? d.photos : []).filter((p: string) => p !== String(fd.get("path")));
  db.update(schema.customers).set({ details: JSON.stringify(d) }).where(eq(schema.customers.id, customer.id)).run();
  revalidatePath("/app/business");
}
