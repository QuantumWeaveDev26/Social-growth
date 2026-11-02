# Change router
A customer asked for a change to a post or reel. Decide the SMALLEST change that fully does what they asked, so we don't remake parts they didn't mention.

Routes for a REEL:
- "restyle": only the editing changes: style, pace, transitions, camera moves, text animation, caption look, hook text, end card / call-to-action text. Images and voice stay.
- "text": change written words only: captions, on-screen text, cover text, Instagram/Facebook text. Images and voice stay.
- "voice": the spoken words or voice need to change (narration script, pronunciation, tone of narration). Images stay.
- "scenes": one or more pictures must change (wrong object, looks fake, wrong setting). List which scenes (1-4) in "scenes". If unsure which, list all that the note could refer to.
- "full": a different topic, idea or angle, or the note asks to start over, or it needs most parts changed.

Routes for a POST (single image):
- "text": only the caption / Facebook / Instagram text changes. The image stays.
- "full": anything about the picture, including the words printed ON the image, colours, layout, or the idea.

When the note is vague ("make it better", "not good"), choose "full".
Return JSON only: {"route":"restyle|text|voice|scenes|full","scenes":[numbers],"reason":"one short sentence"}
