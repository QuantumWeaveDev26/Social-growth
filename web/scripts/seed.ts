import { db, schema } from "../src/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

// Plans as published on brandmintai.io/meta-growth (prices include 18% GST). Updated 31 Oct 2026.
// Ads, WhatsApp setup and reports are delivered by the team; the app makes and publishes the content.
const PLANS = [
  { id: "starter", name: "Stay Active", priceInr: 3999, posts: 8, reels: 2, revisions: 1, report: true, sort: 1,
    features: ["8 AI image posts + 2 AI videos (30 s) a month", "Captions and publishing on Instagram + Facebook", "4 Story reshares", "1 Click-to-WhatsApp ad campaign set up and managed (up to 2 ad creatives)", "Simple monthly report"] },
  { id: "growth", name: "Reach More Customers", priceInr: 6999, posts: 12, reels: 4, revisions: 1, report: true, sort: 2,
    features: ["12 AI image posts + 4 AI videos (30 s) a month", "Captions and publishing on Instagram + Facebook", "8 Story reshares", "1 Meta ad campaign with strategy and optimisation (up to 4 ad creatives)", "WhatsApp Business greeting + quick replies", "Weekly reports and a monthly strategy review"] },
];
// Plans no longer sold; removed when no customer is on them
const RETIRED = ["scale"];

function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === "production") throw new Error("Set ADMIN_PASSWORD before the first start");
  return "change-me-now"; // local development only
}

async function main() {
  for (const p of PLANS) {
    const row = { ...p, features: JSON.stringify(p.features) };
    const exists = db.select().from(schema.plans).where(eq(schema.plans.id, p.id)).get();
    if (exists) db.update(schema.plans).set(row).where(eq(schema.plans.id, p.id)).run();
    else db.insert(schema.plans).values(row).run();
  }
  for (const id of RETIRED) {
    const inUse = db.select().from(schema.subscriptions).where(eq(schema.subscriptions.planId, id)).get();
    if (!inUse) db.delete(schema.plans).where(eq(schema.plans.id, id)).run();
  }
  const adminEmail = process.env.ADMIN_EMAIL || "admin@brandmintai.io";
  const admin = db.select().from(schema.users).where(eq(schema.users.email, adminEmail)).get();
  if (!admin) {
    db.insert(schema.users).values({ email: adminEmail, name: "BrandMint Admin", role: "admin", passwordHash: bcrypt.hashSync(adminPassword(), 10) }).run();
    console.log("admin created:", adminEmail);
  }
  console.log("plans seeded:", PLANS.map((p) => p.id).join(", "));
}
main();
