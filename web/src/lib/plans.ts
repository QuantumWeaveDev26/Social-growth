import type { Plan } from "@/db/schema";
import { inr } from "./format";

/** "15 images + 2 videos" */
export const planContents = (p: Pick<Plan, "posts" | "reels">) => `${p.posts} images + ${p.reels} video${p.reels === 1 ? "" : "s"}`;
export const roundsLabel = (n: number) => `${n} revision round${n === 1 ? "" : "s"}`;
/** "1 campaign · ₹15,000 ad budget per campaign, paid to Meta" */
export const adsLine = (p: Pick<Plan, "campaigns" | "adBudgetInr">) =>
  p.campaigns ? `${p.campaigns} Meta ad campaign${p.campaigns === 1 ? "" : "s"} · suggested ad budget ${inr(p.adBudgetInr)} per campaign, paid by you to Meta` : "";
