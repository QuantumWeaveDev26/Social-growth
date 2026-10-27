import json, re, sys, shutil, os
U = "/mnt/user-data/uploads/content-auto/media"
rows = {r["post_id"]: r for r in json.load(open(f"{U}/posts_E110_E111.json"))}
def norm(w): return re.sub(r"[^a-z0-9']", "", w.lower())
for pid in sys.argv[1:]:
    r = rows[pid]
    a = json.load(open(f"{U}/{pid}/voice_alignment.json"))["alignment"]
    ch, st, en = a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]
    # group characters into words, dropping v3 audio tags like [warm]
    words, cur, in_tag = [], None, False
    for c, s, e in zip(ch, st, en):
        if c == "[": in_tag = True; continue
        if in_tag:
            if c == "]": in_tag = False
            continue
        if c.isspace():
            if cur and cur["text"].strip(): words.append(cur)
            cur = None; continue
        if cur is None: cur = {"text": "", "start": s, "end": e}
        cur["text"] += c; cur["end"] = e
    if cur and cur["text"].strip(): words.append(cur)
    words = [w for w in words if w["text"] not in ("...", "…")]
    captions = [{"text": (" " if i else "") + w["text"], "startMs": round(w["start"] * 1000), "endMs": round(w["end"] * 1000),
                 "timestampMs": round((w["start"] + w["end"]) * 500), "confidence": None} for i, w in enumerate(words)]
    # align beats to the spoken words
    beats_src = json.loads(r["video_beats"])
    nw = [norm(w["text"]) for w in words]; ptr = 0; beats = []
    for b in beats_src:
        key = [norm(x) for x in b["spoken"].split()[:3] if norm(x)]
        start = None
        for i in range(ptr, len(nw)):
            if nw[i:i + len(key)] == key: start = i; break
        if start is None:
            for i in range(ptr, len(nw)):
                if key and nw[i] == key[0]: start = i; break
        if start is None: continue
        beats.append({"startSec": 0 if not beats else words[start]["start"], "text": b["on_screen_text"]}); ptr = start + 1
    dur = words[-1]["end"]
    d = f"public/posts/{pid}"; os.makedirs(d, exist_ok=True)
    shutil.copy(f"{U}/{pid}/scene_9x16.png", d); shutil.copy(f"{U}/{pid}/voice.mp3", d)
    props = {"postId": pid, "sceneImage": f"posts/{pid}/scene_9x16.png", "audio": f"posts/{pid}/voice.mp3", "durationSec": dur,
             "headline": r["headline"], "cta": r["cta"], "beats": beats, "captions": captions,
             "producer": "Quantum Weave", "seriesLabel": "AI. NOW WHAT?"}
    json.dump(props, open(f"props_{pid}.json", "w"), indent=1)
    print(pid, f"{dur:.1f}s", len(words), "words", [(round(b['startSec'],1), b['text']) for b in beats])
