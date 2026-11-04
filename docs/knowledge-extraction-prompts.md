# Knowledge extraction prompts (custom GPTs → BrandMint knowledge bank)

How to use:
1. Open one of your custom GPTs (content marketing, lead generation, AI filmmaking, …).
2. Paste **Prompt 1**. When it stops, paste **Prompt 2** ("continue") until it says `=== END OF KNOWLEDGE BANK ===`.
3. Save each reply as a `.md` file named after the GPT, e.g. `kb-content-marketing.md`, `kb-lead-gen.md`, `kb-ai-filmmaking.md`.
4. Paste **Prompt 3** once at the end (quality check), and save that reply too.
5. Send all the files here. I'll merge them into the knowledge bank that every post and reel generation reads.

Repeat for each GPT. The same format from every GPT lets me merge them cleanly.

---

## Prompt 1: extract (paste as is)

```
You are helping me turn everything you know — your instructions, your knowledge files, and the frameworks, books and scripts you were built on — into a structured KNOWLEDGE BANK for an automated content system.

ABOUT THE SYSTEM THAT WILL USE THIS
- Product: BrandMint AI. It makes social media content for small businesses in India (cafés, restaurants, salons, clinics, gyms, boutiques, coaching centres, real estate agents, local services, D2C brands).
- Platforms: Instagram and Facebook.
- An AI writes everything automatically. Clients do NOT give us scripts or prompts. All we know is what they fill in at sign-up:
  business name · business type · city/area · website or Instagram · what they sell · who buys from them · why people pick them over others · current offers or launches · tone (e.g. warm and friendly, premium, bold, playful) · caption language (English, Hindi, Hinglish, Kannada, Tamil, Telugu …) · things never to say or show · brand colours · logo.
- What the AI produces each month:
  1. A MONTH PLAN: 8–12 image posts + 2–4 reels, spread across content pillars.
  2. IMAGE POSTS: one AI-generated image with a short headline on the image (max ~7 words) + a caption + hashtags + CTA.
  3. REELS: 30 seconds = 4 scenes (each scene is one AI-generated image with motion) + an AI voiceover + on-screen captions. So every reel script must be exactly: hook (0–3 s), 2 middle beats, ending with CTA (≈75–85 spoken words total).
- Goal for clients: real enquiries, walk-ins, WhatsApp messages and sales, not just likes.

WHAT I NEED FROM YOU
Write the knowledge bank in YOUR OWN WORDS as rules, frameworks, templates and original examples. Do NOT copy long passages from books or files; distil them into instructions an AI writer can follow. Where a framework comes from a known source, name the source in one line.

Use EXACTLY this structure and these headings, so files from different GPTs can be merged. Skip a section only if you genuinely have nothing for it (write "N/A").

=== FILE: 01-core-principles.md ===
- The 10–20 most important principles of content that sells for small businesses. One line each + one line "why".

=== FILE: 02-audience-and-offer.md ===
- How to work out the customer's real pain, desire, objections and buying trigger from the sign-up fields above.
- A step-by-step method the AI should follow BEFORE writing anything (inputs → outputs).
- How to sharpen a weak offer into a strong one (with 3 before/after examples).

=== FILE: 03-content-pillars-and-month-plan.md ===
- Recommended content pillars for small businesses and what % of the month each should take.
- Rules for sequencing a month (awareness → trust → offer), how often to sell, how to use festivals and Indian occasions.
- A month-plan template for 8 posts + 2 reels and for 12 posts + 4 reels.

=== FILE: 04-hooks.md ===
- Hook types (name, when to use, formula, 2 original examples each), at least 15 types.
- Rules for the first 3 seconds of a reel and the first line of a caption.
- Hooks that are banned/overused and why.

=== FILE: 05-reel-scripts.md ===
- 6–10 reel script frameworks that fit EXACTLY 4 scenes / 30 seconds / ~80 words. For each: name, goal (awareness/trust/offer/lead), when to use, the 4 beats with timing, and one complete original example for a specific Indian small business (VO line per scene + on-screen text per scene + what the scene image should show).
- Rules for voiceover writing (sentence length, pacing, words to avoid).

=== FILE: 06-image-posts.md ===
- 6–10 image post formats (e.g. offer card, myth vs fact, before/after, customer story, tip, behind the scenes). For each: goal, on-image headline formula (≤7 words), what the image should show, caption structure, CTA.
- One complete original example per format.

=== FILE: 07-captions-and-ctas.md ===
- Caption structures (short / medium / story), line-break rules, emoji rules, hashtag rules (how many, which kinds).
- CTA library grouped by goal (DM/WhatsApp, call, visit, book, buy, save/share), at least 25 CTAs.
- Rules for writing in Hinglish and regional languages if you know them.

=== FILE: 08-lead-generation.md ===
- How organic posts and reels should generate leads (WhatsApp, DMs, calls, forms, walk-ins).
- Lead magnets and offers that work for local businesses, with examples by industry.
- How to write content that makes people message NOW.

=== FILE: 09-visual-and-filmmaking.md ===
- Rules for scroll-stopping visuals: composition, subject, colour, text placement, brand colour use.
- How to describe a scene for an AI image generator (a prompt template with slots), shot types, lighting, camera angles, motion ideas for a still-image reel.
- How to keep a consistent look across a month for one brand.
- What makes AI images look fake/cheap and how to avoid it.

=== FILE: 10-industry-playbooks.md ===
- For each industry: café/restaurant, salon/spa, clinic/dental, gym/fitness, boutique/fashion, coaching/education, real estate, home services, D2C product:
  top 5 pains/desires of their customers · 5 post ideas · 3 reel ideas · best CTA · what never to say (e.g. medical claims).

=== FILE: 11-quality-checklist.md ===
- A scoring rubric (0–10) the AI must use to check its own post or reel before showing it to the client, with the exact criteria and the minimum passing score.
- The 15 most common mistakes in AI-written social content and the fix for each.

=== FILE: 12-compliance.md ===
- Rules to stay within Meta advertising/community policies and Indian law for ads (health claims, before/after, prices, discounts, guarantees, testimonials).

FORMAT RULES
- Markdown. Each file starts with the "=== FILE: name ===" line exactly as above.
- Bullets and short lines, not essays. Templates in code blocks with {slots} in curly braces.
- All examples must be ORIGINAL and specific (real-sounding Indian business, city, product, price in ₹).
- If your reply gets long, stop at the end of a file and write "=== CONTINUE ===". I will say "continue".
- When everything is done, write "=== END OF KNOWLEDGE BANK ===".

Start with 01-core-principles.md.
```

---

## Prompt 2: continue (paste whenever it stops)

```
continue — pick up exactly where you stopped, same structure, no repetition.
```

---

## Prompt 3: quality check (paste at the end)

```
Now review the whole knowledge bank you wrote, as a strict editor for an AI system that must write content WITHOUT any human input from the client.

1. List anything vague that an AI writer couldn't act on, and rewrite it as a concrete rule or template.
2. List any rules that contradict each other and say which one wins.
3. Check every reel script is 4 scenes, about 30 seconds and about 75–85 spoken words; fix any that aren't.
4. Add anything important from your instructions or knowledge files that you left out.
5. Give me a one-page "MASTER RULES" summary (=== FILE: 00-master-rules.md ===) with the 25 rules that matter most, ranked.

Output only the fixes and the new 00-master-rules.md file, using the same "=== FILE: ===" markers.
```

---

## Optional: prompts for specific GPT types

Add one of these lines at the very top of Prompt 1, depending on the GPT:

- **Content marketing / strategy GPT:**
  `Focus most on files 01, 02, 03, 07 and 11. Go deep on strategy and the month plan.`
- **Lead generation GPT:**
  `Focus most on files 02, 07 and 08. Go deep on offers, lead magnets and CTAs that make people message on WhatsApp.`
- **AI filmmaking / video GPT:**
  `Focus most on files 04, 05 and 09. Go deep on reel structure, scene descriptions, image-prompt templates and motion.`
- **Copywriting / hooks GPT:**
  `Focus most on files 04, 06 and 07. Give at least 30 hook types and 40 CTAs.`
