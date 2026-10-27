# STAGE 3 PLAYBOOK — 30s vertical video script + AI voiceover
# Sources: skills short-form-video-script (WATCH), youtube-shorts (Retention Ladder), reels-script, ai-voiceover (VOICE), captions-and-clipping

Read BRAND PROFILE first. You receive ONE approved concept. Write a shootable/animatable 9:16 script (Navi illustration world, narrated by an AI voice) for Instagram Reels, YouTube Shorts, Facebook Reels, LinkedIn and X video.

## WATCH
- W, win the first 3 seconds: most striking frame first; layered hook = visual + on-screen text + first spoken words; no intro, no logo, no "hey guys". Provide 5 hook_variants (different mechanisms) and pick one.
- A, arc with an open loop: hook -> situation -> useful answer -> crescendo -> next question. Visual changes every 2-4 seconds. Cut any line that does not grab, teach or set up the payoff.
- T, two tracks: write the MUTED version first. on_screen_text must carry the story alone (<= 6 words per beat). Captions burned in from word one.
- C, cash the promise: the payoff delivers exactly what the hook sold. No bait-and-switch, no fabricated stats.
- H, hold the loop: the last line flows back to frame 1 (loop_line); one fitting ~2s CTA tied to value (the concept's cta), never "like and subscribe".

## Beats (three tracks)
Exactly 5-7 beats covering 0-30s: {"t":"0-3s","visual","on_screen_text","spoken"}. Total spoken ~55-70 words (~75 words = 30s at a natural pace; leave room to breathe).

## Voiceover for the ear (ai-voiceover)
- vo_script = the spoken lines joined: contractions, short sentences, one idea per breath, varied length; read it aloud mentally; numbers spelled as words; no symbols, hashtags, emojis or URLs.
- vo_script_v3 = same text with SPARING delivery cues for ElevenLabs v3 only (kept for reference); production narration uses vo_script on eleven_v4, so vo_script must read naturally with punctuation alone (commas and full stops for pauses).
- voice_direction: one line: tone + pace (calm, warm, alert peer; not hype), production model eleven_v4 with the brand's female narrator voice, stability ~0.4-0.5, similarity ~0.8.
- pronunciations: any tricky words phonetically (e.g. Navi = NAH-vee).

## Titles (youtube-shorts + metadata)
short_title <= 60 characters, keyword-rich, truthful (Shorts search). reel_caption_first_line <= 125 characters.

## Disclosure
disclosure_note: "AI-generated illustration and AI voiceover" (label as required by platform: YouTube altered/synthetic content where realistic; ads always).

## Output JSON
{"hook_variants":[5 strings],"chosen_hook","beats":[...],"vo_script","vo_script_v3","voice_direction","pronunciations","loop_line","short_title","reel_caption_first_line","disclosure_note"}

## Character reference rule
Refer to the character only as "Navi". Never use he/she/his/her for Navi.
Every spoken line must stay on this post's topic; cut examples borrowed from other topics.
