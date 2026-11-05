import { db, schema } from "../src/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

// Plans: AI-Powered Meta Ads Agency packages, master report v2.0 (5 Nov 2026). Fees include GST.
// posts = AI image posts (4:5), reels = 30-second AI videos (9:16), revisions = revision rounds per month
// (one round = one batch of notes; after that, changes are paid per item, see src/lib/remakes.ts).
// campaigns / adBudgetInr: Meta ad campaigns the team sets up and manages, and the suggested budget per
// campaign, which the client pays directly to Meta from their own ad account.
const COMMON = ["Captions written and posted to Instagram + Facebook for you", "You approve every post before it goes out", "Ad budget paid by you directly to Meta"];
const PLANS = [
  { id: "starter", name: "Starter", priceInr: 9750, posts: 15, reels: 2, revisions: 1, campaigns: 1, adBudgetInr: 15000, report: false, sort: 1,
    features: ["15 AI ad images (4:5) a month", "2 AI video ads (30 s, vertical) a month", "1 Meta ad campaign set up and managed", "1 revision round a month", ...COMMON] },
  { id: "growth", name: "Growth", priceInr: 15870, posts: 25, reels: 4, revisions: 2, campaigns: 2, adBudgetInr: 21000, report: false, sort: 2,
    features: ["25 AI ad images (4:5) a month", "4 AI video ads (30 s, vertical) a month", "2 Meta ad campaigns set up and managed", "2 revision rounds a month", ...COMMON] },
  { id: "premium", name: "Premium", priceInr: 24950, posts: 40, reels: 6, revisions: 3, campaigns: 3, adBudgetInr: 30000, report: false, sort: 3,
    features: ["40 AI ad images (4:5) a month", "6 AI video ads (30 s, vertical) a month", "3 Meta ad campaigns set up and managed", "3 revision rounds a month", ...COMMON] },
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
