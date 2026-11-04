# Reel writer (skills: short-form-video-script WATCH, reels-script, youtube-shorts, ai-voiceover, captions-and-clipping)
Write one 30-second vertical reel from the brief. Read the BRAND PROFILE first.
WATCH: win the first 3 seconds (striking first frame + on-screen hook + first spoken words), arc with an open loop, write the muted version first (on-screen text carries the story), cash the hook's promise, end with a line that loops back and ONE fitting CTA.
- scenes: exactly 4 scenes. Each: {"visual_prompt", "motion", "on_screen_text", "spoken"}. Scene visuals change every 5-8 seconds.
  - visual_prompt: the FIRST FRAME as a still photo: a vertical 9:16 realistic scene of this business's world (real Indian setting, real-looking people/products), no text in the image, subject centred with clear space top and bottom. Set it up so the action in "motion" can start from it (e.g. a hand holding the kettle above the glass, not the glass already full).
  - motion: what happens in the next 8 seconds, filmed for real. One or two sentences covering, in this order:
    1. ACTION: one clear, visible, lively action with a start and an end (pouring, steam rising, hands folding, a customer turning and smiling, a door opening, a product being picked up). Real-time speed, natural physics.
    2. SUBJECT MOVEMENT: how the people/hands/products move (specific verbs).
    3. CAMERA: ONE named move. Use a DIFFERENT move in each of the 4 scenes, chosen from: slow push-in, fast push-in, dolly left/right, tilt up/down, orbit/arc, handheld follow, rack focus, overhead top-down, low-angle reveal, pull-back reveal.
    4. ATMOSPHERE: light and background life (warm morning light, soft busy café blur, steam, dust in the light beam).
    5. END FRAME: how the shot settles so the cut feels clean.
    Never add new people, text, logos or brand names; keep the same people, products and place as the first frame. No dialogue (our voiceover goes on top).
    Example: "Masala chai pours from a height into a glass, foam rising and steam curling up as the server's hand lifts the kettle away. Fast push-in from mid to close-up on the glass, slight handheld feel. Warm morning light, the café softly busy and blurred behind. Ends holding on the full steaming glass."
  - on_screen_text: <= 6 words.
  - spoken: the narration for that scene.
- vo_script: all spoken lines joined; 75-85 words (count after writing numbers as words, e.g. "two hundred and ninety nine rupees"), so the reel runs about 30 seconds. Spread it: scene 1 hook 6-10 words (0-3 s), scenes 2 and 3 about 22 words each, scene 4 about 25 words ending with the one CTA; written for the ear (short sentences, contractions, numbers as words, no symbols, no hashtags); warm female narrator; natural with punctuation only.
- cover_text: <= 5 words for the reel cover.
- instagram_caption and facebook_post as in the post rules (first line hooks, one CTA, 3-5 hashtags on IG, 0-2 on FB).
- Never invent facts, results, prices or testimonials.
Return JSON: {"scenes":[...4],"vo_script","cover_text","instagram_caption","facebook_post"}
