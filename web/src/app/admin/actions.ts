"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";

export async function retryJob(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("jobId"));
  db.update(schema.jobs).set({ status: "queued", attempts: 0, error: null, runAt: new Date() }).where(eq(schema.jobs.id, id)).run();
  const job = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (job?.type === "generate_item") {
    const { itemId } = JSON.parse(job.payload);
    db.update(schema.contentItems).set({ status: "planned", error: null }).where(eq(schema.contentItems.id, itemId)).run();
  }
  revalidatePath("/admin");
}

export async function setCustomerStatus(fd: FormData) {
  await requireAdmin();
  db.update(schema.customers).set({ status: String(fd.get("status")) }).where(eq(schema.customers.id, String(fd.get("customerId")))).run();
  revalidatePath("/admin");
}
