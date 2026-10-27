import json, re
U = "/mnt/user-data/uploads/content-auto/brandmint/day1"
import sys
a = json.load(open(sys.argv[1] if len(sys.argv) > 1 else f"{U}/voice.mp3.alignment.json"))
words, cur = [], None
for c, s, e in zip(a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]):
    if c.isspace():
        if cur: words.append(cur)
        cur = None; continue
    if cur is None: cur = {"text": "", "start": s, "end": e}
    cur["text"] += c; cur["end"] = e
if cur: words.append(cur)
norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())
nw = [norm(w["text"]) for w in words]
def at(phrase, after=0):
    k = [norm(x) for x in phrase.split()]
    for i in range(len(nw)):
        if nw[i:i+len(k)] == k and words[i]["start"] >= after: return words[i]["start"]
    raise SystemExit("not found: " + phrase)
dur = words[-1]["end"]
s2 = at("A new chatbot"); s3 = at("Start with an outcome"); s4 = at("Remove what is unnecessary"); s5 = at("Before buying another"); s6 = at("Which process would")
scenes = [
 {"startSec": 0, "title": "MORE AI TOOLS?", "kind": "image", "image": "bm/day1/shot1.png"},
 {"startSec": s2, "title": "TOOLS CAN'T FIX BROKEN HANDOFFS", "kind": "cards", "image": "bm/day1/shot1.png",
  "items": ["New enquiry|No owner", "Follow-up|Not sent", "Process|Unclear"],
  "itemTimes": [at("enquiry nobody"), at("follow-up nobody"), at("process nobody")]},
 {"startSec": s3, "title": "MAP THE WORKFLOW FIRST", "kind": "flow",
  "items": ["Enquiry arrives", "Acknowledged", "Assigned to an owner", "Followed up", "Outcome recorded"],
  "itemTimes": [s3 + 0.2, at("acknowledged,"), at("assigned,"), at("followed up."), at("Map those steps.")]},
 {"startSec": s4, "title": "SIMPLIFY → CONNECT → MEASURE", "kind": "chips", "image": "bm/day1/shot4.png",
  "items": ["Simplify", "Connect", "Measure"], "itemTimes": [s4 + 0.1, at("Then connect only"), at("measure the result.")]},
 {"startSec": s5, "title": "BETTER SYSTEMS. BETTER GROWTH.", "kind": "image", "image": "bm/day1/shot5.png"},
 {"startSec": s6, "title": "", "kind": "endcard"},
]
caps = [{"text": (" " if i else "") + w["text"], "startMs": round(w["start"]*1000), "endMs": round(w["end"]*1000), "timestampMs": None, "confidence": None} for i, w in enumerate(words)]
props = {"audio": "bm/day1/voice.mp3", "durationSec": dur, "scenes": scenes, "captions": caps, "brandName": "BrandMint AI", "endLine": "Which process would you fix first?"}
json.dump(props, open("props_bm_day1.json", "w"), indent=1)
print(f"{dur:.1f}s", [(round(s['startSec'],1), s['title']) for s in scenes])
