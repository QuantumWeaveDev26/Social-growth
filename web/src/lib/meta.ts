/**
 * Meta connections and publishing.
 *
 * Two ways a customer can connect, both one click for them:
 *  1. Facebook Login for Business (default). One login returns every Facebook Page they manage, a Page
 *     access token for each, and the Instagram professional account linked to each Page. We store the
 *     chosen Page's id + token and its Instagram account id. Posts go to both Facebook and Instagram.
 *  2. Instagram Login (fallback for Instagram accounts with no Facebook Page). Returns the Instagram
 *     account id and a 60-day token that the worker refreshes. Posts go to Instagram only.
 *
 * With no app keys set, everything runs in demo mode.
 */
import crypto from "node:crypto";
import { schema } from "@/db";
import { open } from "./crypto";

const V = () => process.env.META_GRAPH_VERSION || "v23.0";
const FB_GRAPH = () => `https://graph.facebook.com/${V()}`;
const IG_GRAPH = () => `https://graph.instagram.com/${V()}`;
const appUrl = () => process.env.APP_URL || "http://localhost:3000";

export const metaLive = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
export const instagramLoginLive = () => Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);

export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management"];
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export class MetaError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) { super(message); }
  /** Token revoked, expired, password changed, or permission removed: the customer must reconnect. */
  get needsReconnect() { return this.code === 190 || this.code === 102 || this.code === 10 || this.code === 200; }
}

async function g<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const e = j.error || {};
    throw new MetaError(e.error_user_msg || e.message || `Meta returned ${res.status}`, e.code, e.error_subcode);
  }
  return j as T;
}

// ---------------------------------------------------------------- Facebook Login for Business
export const fbRedirect = () => `${appUrl()}/api/meta/callback`;

export function fbLoginUrl(state: string) {
  const q = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: fbRedirect(), state, response_type: "code" });
  if (process.env.META_LOGIN_CONFIG_ID) {
    // Facebook Login for Business configuration (permissions + token type are set in the App Dashboard)
    q.set("config_id", process.env.META_LOGIN_CONFIG_ID);
    q.set("override_default_response_type", "true");
  } else {
    q.set("scope", FB_SCOPES.join(","));
  }
  return `https://www.facebook.com/${V()}/dialog/oauth?${q}`;
}

export type FbPage = { id: string; name: string; token: string; igId: string | null; igUsername: string | null };

export async function completeFacebookLogin(code: string): Promise<{ metaUserId: string; pages: FbPage[] }> {
  const id = process.env.META_APP_ID!, secret = process.env.META_APP_SECRET!;
  const short = await g<{ access_token: string }>(`${FB_GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: fbRedirect(), code })}`);
  // long-lived user token -> Page tokens derived from it do not expire on a timer
  const long = await g<{ access_token: string }>(`${FB_GRAPH()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`);
  const me = await g<{ id: string }>(`${FB_GRAPH()}/me?fields=id&access_token=${long.access_token}`);
  const pages: FbPage[] = [];
  let next: string | undefined = `${FB_GRAPH()}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${long.access_token}`;
  while (next) {
    const r: { data: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }>; paging?: { next?: string } } = await g(next);
    for (const p of r.data) pages.push({ id: p.id, name: p.name, token: p.access_token, igId: p.instagram_business_account?.id ?? null, igUsername: p.instagram_business_account?.username ?? null });
    next = r.paging?.next;
  }
  return { metaUserId: me.id, pages };
}

// ---------------------------------------------------------------- Instagram Login (Instagram-only accounts)
export const igRedirect = () => `${appUrl()}/api/meta/instagram/callback`;

export function igLoginUrl(state: string) {
  const q = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, redirect_uri: igRedirect(), response_type: "code", scope: IG_SCOPES.join(","), state, enable_fb_login: "0" });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export async function completeInstagramLogin(code: string) {
  const body = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, client_secret: process.env.INSTAGRAM_APP_SECRET!, grant_type: "authorization_code", redirect_uri: igRedirect(), code });
  const short = await g<{ access_token: string; user_id: number | string }>("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  const long = await g<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET!, access_token: short.access_token })}`,
  );
  const me = await g<{ user_id?: string; id: string; username: string }>(`${IG_GRAPH()}/me?fields=user_id,username&access_token=${long.access_token}`);
  return { metaUserId: String(short.user_id), igUserId: me.user_id || me.id, igUsername: me.username, token: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000) };
}

export async function refreshInstagramToken(token: string) {
  const r = await g<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

// ---------------------------------------------------------------- health check
type Conn = typeof schema.metaConnections.$inferSelect;

/** Confirms the stored token still works. Throws MetaError on failure. */
export async function checkConnection(conn: Conn) {
  if (conn.mode === "demo") return { pageName: conn.pageName, igUsername: conn.igUsername };
  const token = open(conn.pageToken);
  if (!token) throw new MetaError("No token stored", 190);
  if (conn.kind === "instagram") {
    const me = await g<{ username: string }>(`${IG_GRAPH()}/me?fields=user_id,username&access_token=${token}`);
    return { pageName: null, igUsername: me.username };
  }
  const p = await g<{ name: string; instagram_business_account?: { id: string; username?: string } }>(
    `${FB_GRAPH()}/${conn.pageId}?fields=name,instagram_business_account{id,username}&access_token=${token}`,
  );
  return { pageName: p.name, igUsername: p.instagram_business_account?.username ?? conn.igUsername, igUserId: p.instagram_business_account?.id ?? null };
}

/** Which networks this connection posts to. */
export function platformsFor(conn: Conn): Array<"facebook" | "instagram"> {
  if (conn.kind === "instagram") return ["instagram"];
  return conn.igUserId ? ["facebook", "instagram"] : ["facebook"];
}

// ---------------------------------------------------------------- publishing
type Item = typeof schema.contentItems.$inferSelect;

export async function publishToMeta(conn: Conn | undefined, item: Item, copy: Record<string, unknown>, platform: "facebook" | "instagram") {
  if (!conn) throw new MetaError("Facebook and Instagram are not connected");
  if (conn.status === "needs_reconnect") throw new MetaError("The connection needs to be renewed. Reconnect in Accounts.", 190);
  if (conn.mode === "demo") {
    await new Promise((r) => setTimeout(r, 300));
    return `demo_${platform}_${item.id.slice(0, 8)}`;
  }
  const token = open(conn.pageToken)!;
  const media = `${appUrl()}/media/${item.mediaPath}`;
  const isReel = item.type === "reel";

  if (platform === "facebook") {
    const message = String(copy.facebook_post || "");
    if (isReel) {
      const r = await g<{ id: string }>(`${FB_GRAPH()}/${conn.pageId}/videos`, { method: "POST", body: new URLSearchParams({ file_url: media, description: message, access_token: token }) });
      return r.id;
    }
    const r = await g<{ id: string; post_id?: string }>(`${FB_GRAPH()}/${conn.pageId}/photos`, { method: "POST", body: new URLSearchParams({ url: media, caption: message, access_token: token }) });
    return r.post_id || r.id;
  }

  if (!conn.igUserId) throw new MetaError("No Instagram professional account is linked to this Facebook Page");
  const host = conn.kind === "instagram" ? IG_GRAPH() : FB_GRAPH();
  const caption = String(copy.instagram_caption || "");
  const params: Record<string, string> = isReel
    ? { media_type: "REELS", video_url: media, caption, share_to_feed: "true", access_token: token }
    : { image_url: media, caption, access_token: token };
  if (!isReel && copy.alt_text) params.alt_text = String(copy.alt_text);
  const container = await g<{ id: string }>(`${host}/${conn.igUserId}/media`, { method: "POST", body: new URLSearchParams(params) });
  for (let i = 0; i < 30; i++) {
    const st = await g<{ status_code: string }>(`${host}/${container.id}?fields=status_code&access_token=${token}`);
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new MetaError(`Instagram couldn’t process the ${isReel ? "video" : "image"} (${st.status_code})`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  const pub = await g<{ id: string }>(`${host}/${conn.igUserId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: container.id, access_token: token }) });
  return pub.id;
}

// ---------------------------------------------------------------- Facebook native scheduling
// Approved image posts are also handed to Meta's own scheduler, so customers see them in
// Meta Business Suite → Content → Scheduled. Instagram has no scheduling API for outside apps,
// so Instagram (and reels) are always published by our worker at the slot time.

/** Meta accepts scheduled Page posts between 10 minutes and ~30 days ahead; we stay inside that. */
export const FB_SCHEDULE_MIN_MS = 15 * 60_000;
export const FB_SCHEDULE_MAX_MS = 28 * 86400e3;

export const canScheduleOnFacebook = (conn: Conn | undefined, item: Item) =>
  !!conn && conn.mode !== "demo" && conn.kind !== "instagram" && conn.status === "connected" && !!conn.pageId && item.type === "post" && !!item.mediaPath;

/** Creates an unpublished, scheduled photo post on the Page. Returns the Page post id. */
export async function scheduleFacebookPost(conn: Conn, item: Item, copy: Record<string, unknown>) {
  const token = open(conn.pageToken)!;
  const r = await g<{ id: string; post_id?: string }>(`${FB_GRAPH()}/${conn.pageId}/photos`, {
    method: "POST",
    body: new URLSearchParams({
      url: `${appUrl()}/media/${item.mediaPath}`, caption: String(copy.facebook_post || ""),
      published: "false", scheduled_publish_time: String(Math.floor(item.slotAt.getTime() / 1000)), access_token: token,
    }),
  });
  return r.post_id || r.id;
}

/** True once Meta has published a scheduled post. */
export async function facebookPostIsPublished(conn: Conn, postId: string) {
  const token = open(conn.pageToken)!;
  const r = await g<{ is_published?: boolean }>(`${FB_GRAPH()}/${postId}?fields=is_published&access_token=${encodeURIComponent(token)}`);
  return r.is_published === true;
}

/** Removes a scheduled post from Meta. A post that's already gone counts as removed. */
export async function deleteFacebookPost(conn: Conn, postId: string) {
  const token = open(conn.pageToken)!;
  try {
    await g(`${FB_GRAPH()}/${postId}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" });
  } catch (e) {
    if (e instanceof MetaError && e.code === 100) return; // does not exist any more
    throw e;
  }
}

// ---------------------------------------------------------------- Meta callbacks (deauthorize, data deletion)
/** Verifies a signed_request from Meta with either app secret. Returns the payload or null. */
export function parseSignedRequest(signed: string | null): { user_id?: string; algorithm?: string } | null {
  if (!signed || !signed.includes(".")) return null;
  const [sig, payload] = signed.split(".", 2);
  for (const secret of [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET].filter(Boolean) as string[]) {
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(expected), b = Buffer.from(sig.replace(/=+$/, ""));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
    }
  }
  return null;
}
