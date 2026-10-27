import { db, schema } from "../src/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

// Plans as published on brandmintai.io/meta-growth (prices include 18% GST)
const PLANS = [
  { id: "starter", name: "Starter", priceInr: 3999, posts: 26, reels: 4, revisions: 2, report: false, sort: 1,
    features: ["Content calendar", "Designs and captions", "Publishing to Facebook + Instagram", "Approve or request changes on every post"] },
  { id: "growth", name: "Growth", priceInr: 6999, posts: 54, reels: 6, revisions: 2, report: true, sort: 2,
    features: ["Everything in Starter", "Content strategy", "Monthly performance report", "Priority regeneration"] },
  { id: "scale", name: "Scale", priceInr: 9999, posts: 82, reels: 8, revisions: 3, report: true, sort: 3,
    features: ["Everything in Growth", "Three revisions per item", "Two content pillars added on request", "Monthly strategy call"] },
];

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
  const adminEmail = process.env.ADMIN_EMAIL || "admin@brandmintai.io";
  const admin = db.select().from(schema.users).where(eq(schema.users.email, adminEmail)).get();
  if (!admin) {
    db.insert(schema.users).values({ email: adminEmail, name: "BrandMint Admin", role: "admin", passwordHash: bcrypt.hashSync(adminPassword(), 10) }).run();
    console.log("admin created:", adminEmail);
  }
  console.log("plans seeded:", PLANS.map((p) => p.id).join(", "));
}
main();
