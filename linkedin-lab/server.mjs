// LinkedIn Lab — a standalone test tool, separate from BrandMint.
// Proves the LinkedIn flow end to end before anything is added to the main app:
//   connect a LinkedIn account (OAuth 2.0, 3-legged) → see token expiry → list Company Pages you admin
//   → publish a text, image or video post as yourself or as a Page.
// No dependencies: Node 22 built-ins only. State (tokens) lives in $DATA_DIR/state.json.
//
// Docs followed (learn.microsoft.com/linkedin):
//   OAuth:   shared/authentication/authorization-code-flow  (tokens last 60 days)
//   OIDC:    consumer/integrations/self-serve/sign-in-with-linkedin-v2  (GET /v2/userinfo)
//   Posts:   marketing/community-management/shares/posts-api   (POST /rest/posts)
//   Images:  .../shares/images-api   (initializeUpload → upload → AVAILABLE)
//   Videos:  .../shares/videos-api   (initializeUpload → PUT parts, keep ETags → finalizeUpload → AVAILABLE)
//   Pages:   .../organizations/organization-access-control-by-role (GET /rest/organizationAcls?q=roleAssignee)

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const env = (k, d = "") => process.env[k] ?? d;
const PORT = Number(env("PORT", "8080"));
const BASE_URL = env("BASE_URL", `http://localhost:${PORT}`).replace(/\/$/, "");
const CLIENT_ID = env("LINKEDIN_CLIENT_ID");
const CLIENT_SECRET = env("LINKEDIN_CLIENT_SECRET");
const LI_VERSION = env("LINKEDIN_VERSION", "202610"); // YYYYMM; 202511 is sunset on 16 Nov 2026
// Company Page scopes only work once the Community Management API is approved for the app.
const PAGE_SCOPES = env("LINKEDIN_PAGE_SCOPES", ""); // e.g. "w_organization_social rw_organization_admin"
const LAB_PASSWORD = env("LAB_PASSWORD");
const SECRET = env("LAB_SECRET") || crypto.randomBytes(32).toString("hex");
const DATA_DIR = env("DATA_DIR", "./data");
const REDIRECT_URI = `${BASE_URL}/auth/linkedin/callback`;
const SCOPES = ["openid", "profile", "w_member_social", ...PAGE_SCOPES.split(/\s+/).filter(Boolean)].join(" ");

fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, "state.json");
const load = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { accounts: {}, log: [] }; } };
const save = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });

// ---------- tiny auth for the lab itself ----------
const sign = (v) => `${v}.${crypto.createHmac("sha256", SECRET).update(v).digest("base64url")}`;
const unsign = (s) => { const i = s?.lastIndexOf("."); if (!s || i < 0) return null; const v = s.slice(0, i); return sign(v) === s ? v : null; };
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const authed = (req) => !LAB_PASSWORD || unsign(cookies(req).lab) === "ok";
const secure = BASE_URL.startsWith("https") ? "; Secure" : "";

// ---------- LinkedIn calls ----------
const LI = "https://api.linkedin.com";
async function li(token, method, url, body, extra = {}) {
  const r = await fetch(url.startsWith("http") ? url : LI + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Linkedin-Version": LI_VERSION, "X-Restli-Protocol-Version": "2.0.0", ...(body ? { "Content-Type": "application/json" } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`LinkedIn ${method} ${url.split("?")[0]} → ${r.status}: ${text.slice(0, 400)}`);
  return { json, headers: r.headers };
}

async function exchangeCode(code) {
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Token exchange failed: ${JSON.stringify(j)}`);
  return j;
}

async function refresh(acc) {
  if (!acc.refreshToken) return acc;
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: acc.refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Refresh failed: ${JSON.stringify(j)} — reconnect the account`);
  Object.assign(acc, { accessToken: j.access_token, expiresAt: Date.now() + j.expires_in * 1000, refreshToken: j.refresh_token || acc.refreshToken });
  return acc;
}

async function listPages(acc) {
  // Needs Community Management API access (rw_organization_admin). Returns [] without it.
  if (!PAGE_SCOPES) return [];
  const { json } = await li(acc.accessToken, "GET", "/rest/organizationAcls?q=roleAssignee&state=APPROVED");
  const out = [];
  for (const e of json?.elements || []) {
    const urn = e.organization || e.organizationTarget;
    if (!urn || !["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"].includes(e.role)) continue;
    let name = urn;
    try { const id = urn.split(":").pop(); name = (await li(acc.accessToken, "GET", `/rest/organizations/${id}`)).json?.localizedName || urn; } catch {}
    out.push({ urn, name, role: e.role });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitAvailable(token, kind, urn) {
  for (let i = 0; i < 120; i++) {
    const { json } = await li(token, "GET", `/rest/${kind}/${encodeURIComponent(urn)}`);
    if (json?.status === "AVAILABLE") return;
    if (json?.status === "PROCESSING_FAILED") throw new Error(`${kind} processing failed: ${json.processingFailureReason || "unknown"}`);
    await sleep(kind === "videos" ? 5000 : 2000);
  }
  throw new Error(`${kind} still not AVAILABLE after waiting`);
}

async function uploadImage(token, owner, buf) {
  const { json } = await li(token, "POST", "/rest/images?action=initializeUpload", { initializeUploadRequest: { owner } });
  const { uploadUrl, image } = json.value;
  const r = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: buf });
  if (!r.ok) throw new Error(`Image upload → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  await waitAvailable(token, "images", image);
  return image;
}

async function uploadVideo(token, owner, buf) {
  const { json } = await li(token, "POST", "/rest/videos?action=initializeUpload", { initializeUploadRequest: { owner, fileSizeBytes: buf.length, uploadCaptions: false, uploadThumbnail: false } });
  const { video, uploadInstructions, uploadToken } = json.value;
  const etags = [];
  for (const part of uploadInstructions) {
    const r = await fetch(part.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: buf.subarray(part.firstByte, part.lastByte + 1) });
    if (!r.ok) throw new Error(`Video part ${part.firstByte} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
    etags.push(r.headers.get("etag"));
  }
  await li(token, "POST", "/rest/videos?action=finalizeUpload", { finalizeUploadRequest: { video, uploadToken: uploadToken || "", uploadedPartIds: etags } });
  await waitAvailable(token, "videos", video);
  return video;
}

async function publish(acc, { author, text, kind, buf, alt, title }) {
  let content;
  if (kind === "image") content = { media: { id: await uploadImage(acc.accessToken, author, buf), ...(alt ? { altText: alt.slice(0, 4086) } : {}) } };
  if (kind === "video") content = { media: { id: await uploadVideo(acc.accessToken, author, buf), title: title || "Video" } };
  const body = {
    author, commentary: text, visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(content ? { content } : {}),
    lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
  };
  const { headers } = await li(acc.accessToken, "POST", "/rest/posts", body);
  return headers.get("x-restli-id");
}

// LinkedIn "little text" commentary: these characters must be backslash-escaped or the text is cut/misread.
// (marketing/community-management/shares/little-text-format). Hashtags use the {hashtag|\#|Tag} template.
const escapeCommentary = (t) =>
  t.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`).replace(/\\#([\p{L}\p{N}]+)/gu, (_, tag) => `{hashtag|\\#|${tag}}`);

// ---------- pages ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const days = (ms) => Math.max(0, Math.round((ms - Date.now()) / 86400e3));
const layout = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LinkedIn Lab · BrandMint</title>
<style>
:root{--ink:#13221D;--mint:#1F9D74;--line:#dfe5e2;--paper:#f4f6f5}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--paper);color:var(--ink)}
main{max-width:760px;margin:0 auto;padding:24px 16px 60px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 8px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:12px}
.btn{display:inline-block;background:var(--ink);color:#fff;border:0;border-radius:10px;padding:10px 16px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.btn.mint{background:var(--mint)}.muted{color:#5b6b65;font-size:.9rem}label{display:block;font-weight:600;margin:12px 0 4px}
input,select,textarea{width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}
textarea{min-height:140px}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.ok{color:var(--mint);font-weight:600}.err{color:#b42318;font-weight:600;white-space:pre-wrap;word-break:break-word}
code{background:#eef1ef;padding:1px 5px;border-radius:5px;word-break:break-all}ul{padding-left:18px}
</style></head><body><main>${body}</main></body></html>`;

function home(st, msg = "") {
  const accs = Object.values(st.accounts);
  const setup = !CLIENT_ID || !CLIENT_SECRET;
  return layout(`
<h1>LinkedIn Lab</h1><p class="muted">Separate test tool. Connect a LinkedIn account, then post as yourself${PAGE_SCOPES ? " or as a Company Page you manage" : ""}.</p>
${msg}
${setup ? `<div class="card err">LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set.</div>` : ""}
<div class="card"><div class="row"><div><b>Redirect URL to register in the LinkedIn app (Auth tab)</b><br><code>${esc(REDIRECT_URI)}</code></div></div>
<p class="muted">Scopes requested: <code>${esc(SCOPES)}</code> · API version <code>${esc(LI_VERSION)}</code></p>
${setup ? "" : `<a class="btn" href="/auth/linkedin">Connect a LinkedIn account</a>`}</div>
<h2>Connected accounts</h2>
${accs.length ? accs.map((a) => `<div class="card"><div class="row"><div><b>${esc(a.name)}</b><br><span class="muted">${esc(a.personUrn)} · token ${days(a.expiresAt)} days left${a.refreshToken ? " · has refresh token" : " · no refresh token (reconnect before expiry)"}</span></div>
<form method="post" action="/disconnect"><input type="hidden" name="id" value="${esc(a.id)}"><button class="btn" style="background:#8a9a94">Remove</button></form></div>
${a.pages?.length ? `<p class="muted">Pages you can post to: ${a.pages.map((p) => `${esc(p.name)} (${esc(p.role)})`).join(", ")}</p>` : PAGE_SCOPES ? `<p class="muted">No Company Pages found where you are an Administrator or Content Administrator.</p>` : ""}</div>`).join("") : `<p class="muted">None yet.</p>`}
${accs.length ? postForm(accs) : ""}
<h2>Last results</h2>
${(st.log || []).slice(-10).reverse().map((l) => `<div class="card"><span class="muted">${esc(new Date(l.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</span><br>${l.ok ? `<span class="ok">Posted</span> ${esc(l.kind)} as ${esc(l.as)} → <code>${esc(l.id)}</code>` : `<span class="err">${esc(l.error)}</span>`}</div>`).join("") || `<p class="muted">Nothing posted yet.</p>`}`);
}

function postForm(accs) {
  const opts = accs.flatMap((a) => [`<option value="${esc(a.id)}|${esc(a.personUrn)}">${esc(a.name)} (personal profile)</option>`, ...(a.pages || []).map((p) => `<option value="${esc(a.id)}|${esc(p.urn)}">${esc(p.name)} (Company Page)</option>`)]).join("");
  return `<h2>Publish a test post</h2><div class="card">
<p class="muted">This really posts to LinkedIn, publicly. Use a test account or delete it afterwards.</p>
<form id="pf"><label for="as">Post as</label><select id="as" name="as">${opts}</select>
<label for="text">Text</label><textarea id="text" name="text" required placeholder="What should the post say?"></textarea>
<label for="file">Image (JPG/PNG/GIF) or video (MP4), optional</label><input id="file" type="file" accept="image/jpeg,image/png,image/gif,video/mp4">
<label for="alt">Image alt text / video title (optional)</label><input id="alt" name="alt" maxlength="200">
<p><button class="btn mint" id="go">Publish to LinkedIn</button> <span id="st" class="muted"></span></p></form></div>
<script>
document.getElementById('pf').onsubmit=async(e)=>{e.preventDefault();const b=document.getElementById('go'),st=document.getElementById('st');b.disabled=true;st.textContent='Publishing… videos can take a few minutes.';
const f=document.getElementById('file').files[0];const q=new URLSearchParams({as:document.getElementById('as').value,text:document.getElementById('text').value,alt:document.getElementById('alt').value,kind:f?(f.type.startsWith('video')?'video':'image'):'text'});
try{const r=await fetch('/api/post?'+q,{method:'POST',body:f||'',headers:{'Content-Type':f?f.type:'text/plain'}});const j=await r.json();st.textContent=j.ok?'Posted: '+j.id:'Failed: '+j.error;st.className=j.ok?'ok':'err';if(j.ok)setTimeout(()=>location.reload(),1500)}catch(err){st.textContent='Failed: '+err.message;st.className='err'}b.disabled=false};
</script>`;
}

const loginPage = (bad) => layout(`<h1>LinkedIn Lab</h1><div class="card"><form method="post" action="/login"><label for="pw">Lab password</label><input id="pw" name="pw" type="password" autocomplete="current-password" required>${bad ? `<p class="err">Wrong password.</p>` : ""}<p><button class="btn">Sign in</button></p></form></div>`);

// ---------- server ----------
const readBody = (req, max) => new Promise((res, rej) => { const parts = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > max) { rej(new Error("File too large for this test (max 200 MB)")); req.destroy(); } else parts.push(c); }); req.on("end", () => res(Buffer.concat(parts))); req.on("error", rej); });
const send = (res, code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", ...headers }); res.end(body); };
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { "Content-Type": "application/json" });
const redirect = (res, to, headers = {}) => send(res, 302, "", { Location: to, ...headers });

http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE_URL);
  try {
    if (u.pathname === "/health") return json(res, 200, { ok: true });
    if (u.pathname === "/login" && req.method === "POST") {
      const pw = new URLSearchParams((await readBody(req, 10_000)).toString()).get("pw") || "";
      const good = LAB_PASSWORD && crypto.timingSafeEqual(crypto.createHash("sha256").update(pw).digest(), crypto.createHash("sha256").update(LAB_PASSWORD).digest());
      return good ? redirect(res, "/", { "Set-Cookie": `lab=${encodeURIComponent(sign("ok"))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}` }) : send(res, 401, loginPage(true));
    }
    if (!authed(req)) return send(res, 200, loginPage(false));

    if (u.pathname === "/") return send(res, 200, home(load()));

    if (u.pathname === "/auth/linkedin") {
      const state = crypto.randomBytes(16).toString("hex");
      const q = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, state, scope: SCOPES });
      return redirect(res, `https://www.linkedin.com/oauth/v2/authorization?${q.toString().replace(/\+/g, "%20")}`, { "Set-Cookie": `li_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure}` });
    }

    if (u.pathname === "/auth/linkedin/callback") {
      const err = u.searchParams.get("error");
      if (err) return send(res, 400, home(load(), `<div class="card err">LinkedIn said: ${esc(err)} — ${esc(u.searchParams.get("error_description"))}</div>`));
      // state must match what we set, or this could be a forged callback (CSRF)
      if (!u.searchParams.get("state") || u.searchParams.get("state") !== cookies(req).li_state) return send(res, 401, home(load(), `<div class="card err">State check failed. Start the connection again.</div>`));
      const tok = await exchangeCode(u.searchParams.get("code"));
      const me = (await li(tok.access_token, "GET", "/v2/userinfo")).json;
      const acc = { id: me.sub, name: me.name || me.sub, personUrn: `urn:li:person:${me.sub}`, accessToken: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000, refreshToken: tok.refresh_token || null, scope: tok.scope, connectedAt: Date.now() };
      try { acc.pages = await listPages(acc); } catch (e) { acc.pages = []; acc.pagesError = e.message; }
      const st = load(); st.accounts[acc.id] = acc; save(st);
      return redirect(res, "/", { "Set-Cookie": `li_state=; Path=/; Max-Age=0${secure}` });
    }

    if (u.pathname === "/disconnect" && req.method === "POST") {
      const id = new URLSearchParams((await readBody(req, 10_000)).toString()).get("id");
      const st = load(); delete st.accounts[id]; save(st); return redirect(res, "/");
    }

    if (u.pathname === "/api/post" && req.method === "POST") {
      const [accId, author] = (u.searchParams.get("as") || "").split("|");
      const kind = u.searchParams.get("kind") || "text";
      const st = load(); const acc = st.accounts[accId];
      const entry = { at: Date.now(), kind, as: author };
      try {
        if (!acc) throw new Error("Account not found — connect it again");
        if (acc.expiresAt - Date.now() < 5 * 86400e3) await refresh(acc);
        if (acc.expiresAt < Date.now()) throw new Error("Token expired — connect the account again");
        if (author !== acc.personUrn && !(acc.pages || []).some((p) => p.urn === author)) throw new Error("You can't post as that author");
        const buf = kind === "text" ? null : await readBody(req, 200 * 1024 * 1024);
        if (kind !== "text" && !buf?.length) throw new Error("No file received");
        const text = escapeCommentary(u.searchParams.get("text") || "");
        if (!text.trim()) throw new Error("Write some text first");
        entry.id = await publish(acc, { author, text, kind, buf, alt: u.searchParams.get("alt"), title: u.searchParams.get("alt") });
        entry.ok = true;
      } catch (e) { entry.ok = false; entry.error = e.message; }
      st.log = [...(st.log || []), entry].slice(-50); save(st);
      return json(res, entry.ok ? 200 : 400, entry.ok ? { ok: true, id: entry.id } : { ok: false, error: entry.error });
    }

    send(res, 404, layout("<h1>Not found</h1>"));
  } catch (e) {
    console.error(e);
    send(res, 500, layout(`<h1>Something went wrong</h1><p class="err">${esc(e.message)}</p><p><a href="/">Back</a></p>`));
  }
}).listen(PORT, () => console.log(`LinkedIn Lab on ${BASE_URL} (port ${PORT}), version ${LI_VERSION}, scopes: ${SCOPES}`));
