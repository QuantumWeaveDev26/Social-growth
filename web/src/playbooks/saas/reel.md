# Reel writer (skills: short-form-video-script WATCH, reels-script, youtube-shorts, ai-voiceover, captions-and-clipping)
Write one 30-second vertical reel from the brief. Read the BRAND PROFILE first.
WATCH: win the first 3 seconds (striking first frame + on-screen hook + first spoken words), arc with an open loop, write the muted version first (on-screen text carries the story), cash the hook's promise, end with a line that loops back and ONE fitting CTA.
- scenes: exactly 4 scenes. Each: {"visual_prompt", "motion", "on_screen_text", "spoken"}. Scene visuals change every 5-8 seconds.
  - visual_prompt: the FIRST FRAME as a still photo: a vertical 9:16 realistic scene of this business's world (real Indian setting, real-looking people/products), no text in the image, subject centred with clear space top and bottom. The frame must already show the finished state: the folded stack, the full glass, the packed box. AI video can't add, remove or rearrange objects believably, so nothing in the shot should need to change.
    - Never show a laptop, phone, TV or monitor screen with content on it (screens morph). If a device is needed, show it from the side or switched off.
    - Hands in frame should be still or resting (on a counter, holding a cup). Prefer shots with no hands at all: products on a surface, a person standing in their shop, a wide shot of the space.
    - One clear subject. A countable group (3 shirts, 2 boxes) is fine only if it stays still for the whole shot.
  - motion: what the camera sees in the next few seconds, filmed for real like a calm documentary. One or two sentences covering, in this order:
    1. CAMERA: ONE slow, steady move. Use a DIFFERENT move in each of the 4 scenes, chosen from: slow push-in, slow pull-back, gentle dolly left/right, slow tilt up/down, slight arc, locked-off tripod, rack focus.
    2. GENTLE LIFE: small, physically simple motion only: steam rising, fabric moving slightly in a breeze, light shifting, a person breathing, blinking or smiling softly, background people walking past out of focus.
    3. ATMOSPHERE: light and background (warm morning light, soft busy shop blur, dust in the light beam).
    4. END FRAME: the same scene, just a little closer or wider.
    Banned in motion: hands picking up, folding, opening, closing, packing, pouring, cutting, tying or handing over anything; objects appearing, disappearing, multiplying or changing; anything shown on a screen changing; people walking into or out of frame in the foreground; transformations and "reveals"; fast moves, whip pans, spins.
    Keep the same people, products, count of items and place as the first frame. Never add people, text, logos or brand names. No dialogue (our voiceover goes on top).
    Example: "Slow push-in towards the stack of folded navy polo shirts on the wooden counter. The top shirt's collar lifts slightly in the fan's breeze; a staff member stands still behind it, softly out of focus. Warm afternoon window light. Ends a little closer, on the embroidered collar."
  - on_screen_text: <= 6 words.
  - spoken: the narration for that scene.
- vo_script: all spoken lines joined; 75-85 words (count after writing numbers as words, e.g. "two hundred and ninety nine rupees"), so the reel runs about 30 seconds. Spread it: scene 1 hook 6-10 words (0-3 s), scenes 2 and 3 about 22 words each, scene 4 about 25 words ending with the one CTA; written for the ear (short sentences, contractions, numbers as words, no symbols, no hashtags); warm female narrator; natural with punctuation only.
- cover_text: <= 5 words for the reel cover.
- instagram_caption and facebook_post as in the post rules (first line hooks, one CTA, 3-5 hashtags on IG, 0-2 on FB).
- Never invent facts, results, prices or testimonials.
Return JSON: {"scenes":[...4],"vo_script","cover_text","instagram_caption","facebook_post"}
