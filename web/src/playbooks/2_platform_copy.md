# STAGE 2 PLAYBOOK — Platform copy
# Sources: skills caption-writer (platforms, first-line, frameworks), facebook-strategy (REACH), linkedin-post-writer (+ avoiding-cringe), x-growth (SPARK), youtube-publishing-and-metadata, hashtag-strategy, cross-platform-repurposing

Read BRAND PROFILE first. You receive ONE approved post concept (question, headline, payoff, cta, answer, keyword). Write native copy for each platform from the same factual core. Never paste the same caption everywhere: adapt hook, length, hashtags and CTA to each platform. Exactly ONE CTA per platform, and it is the concept's cta (reworded only for grammar). No links, phone numbers, prices or placeholders anywhere.

## The first line is the whole game (caption-writer)
Draft 3 opening lines per platform in your head; keep the one that most makes a stranger need the next line, inside the preview cutoff. Never open with a greeting, a hashtag, "Happy Monday", or a description of the image. Do not give away the whole payoff in line one.

## instagram_caption (goal: saves + sends)
- Do NOT open by repeating the artwork headline or payoff (the image already shows them); open with the human moment or the keyword phrase.
- First line <= 125 characters: the human problem or the keyword phrase + tension.
- Body: the answer with the concrete detail, written so it is worth saving. Line breaks between beats.
- CTA on its own line (e.g. "Audit your inquiries.").
- 0-3 relevant hashtags on the final line. 45-80 words total.

## facebook_post (goal: meaningful comments + shares; FB feed is discovery + trust)
- First line <= 80 characters: a relatable situation from the audience's day.
- Conversational, warm, slightly more context than Instagram; natural keywords (FB's NLP reads captions).
- One genuine question that invites experience-sharing (not "Agree?"). 0-2 hashtags or none. 50-90 words.

## linkedin_post (goal: dwell + real comments)
- Hook line <= 140 characters that wins "...see more"; front-load tension; no "I'm excited to".
- Format for dwell: 1-2 line paragraphs, whitespace for readability (NOT broetry one-word lines).
- Body: the practical takeaway; a 3-4 step mini-checklist is welcome. A notch more professional register.
- Close: the CTA line, then one genuine discussion question relevant to their work.
- No engagement bait ("Agree?", "comment YES"), no fake vulnerability, no fabricated parable. 3-5 relevant hashtags at the end. 100-170 words.

## x_post (goal: replies + bookmarks; native, contestable)
- <= 260 characters. Lead with the strongest line; one idea; the answer compressed so it is bookmark-worthy; a slightly contestable framing is fine if true. 0-1 hashtag. No links.

## youtube_community_post (static image post)
- 35-65 words, standalone helpful text, plain; first ~100 characters carry the question/keyword; ends with the CTA. Optional: a one-line poll idea in poll_idea.

## gbp_update (Google Business Profile)
- 40-75 words. Only if the topic fits a training/digital-marketing services business; else gbp_relevant=false (still write it). Truthful local context ("in Bengaluru") only when relevant; no hashtags, no superlatives, no invented address/schedule/contact.

## hashtags (hashtag-strategy)
Specific > broad. Mix 1 topic tag + 1 audience tag (+1 niche). Never banned/spammy tags. Never #AI alone. Write hashtags in CamelCase (#CareerSwitch), never all-lowercase run-ons.

## Output JSON
{"instagram_caption","facebook_post","linkedin_post","x_post","youtube_community_post","poll_idea","gbp_update","gbp_relevant":bool}
