import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { schema } from "@/db";
import { metaLive, instagramLoginLive } from "@/lib/meta";
import { fmtDateTime } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";

type Conn = typeof schema.metaConnections.$inferSelect | undefined;

const MESSAGES: Record<string, { tone: "ok" | "warn" | "err"; text: string }> = {
  connected: { tone: "ok", text: "Connected. Approved posts will go out on schedule." },
  no_instagram: { tone: "warn", text: "Your Facebook Page is connected, but no Instagram account is linked to it, so posts go to Facebook only. Link Instagram to the Page (Instagram → Settings → Account type and tools → Sharing to other apps, or Meta Business Suite → Settings → Linked accounts), then choose Reconnect." },
  no_pages: { tone: "err", text: "Your Facebook login has no Pages we can use. Make sure you’re an admin of the business’s Facebook Page and that you ticked it when Facebook asked which Pages to share. Or connect with Instagram only." },
  cancelled: { tone: "warn", text: "The connection was cancelled. Nothing was changed." },
  error: { tone: "err", text: "Meta didn’t complete the connection. Try again. If it keeps failing, check that your Instagram is a Business or Creator account." },
};

/** The connect / status card used in onboarding and in Accounts and plan. */
export function MetaConnect({ conn, message, after, disconnect, check }: {
  conn: Conn; message?: string;
  after?: () => Promise<void>; disconnect?: () => Promise<void>; check?: () => Promise<void>;
}) {
  const live = metaLive();
  const igLive = instagramLoginLive();
  const msg = message ? MESSAGES[message] : null;
  const broken = conn?.status === "needs_reconnect";
  return (
    <div className="space-y-5">
      {msg && (
        <p role="status" className={`rounded-[10px] px-4 py-3 text-sm ${msg.tone === "ok" ? "bg-mint-wash text-mint-deep" : msg.tone === "warn" ? "bg-amber-wash text-amber-deep" : "bg-red-wash text-red"}`}>{msg.text}</p>
      )}

      {conn ? (
        <div className={`rounded-[14px] p-6 ${broken ? "bg-red-wash" : "bg-sheet ring-1 ring-line"}`}>
          <div className="flex items-start justify-between gap-6">
            <div className="flex gap-3">
              {broken ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-mint-deep" aria-hidden />}
              <div>
                <p className="font-semibold">{broken ? "Connection needs renewing" : `Connected${conn.mode === "demo" ? " (demo)" : ""}`}</p>
                <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-sm">
                  {conn.kind === "facebook" && <><dt className="text-ink-3">Facebook Page</dt><dd>{conn.pageName}</dd></>}
                  <dt className="text-ink-3">Instagram</dt><dd>{conn.igUsername ? `@${conn.igUsername}` : <span className="text-amber-deep">Not linked, Facebook only</span>}</dd>
                  <dt className="text-ink-3">Posts go to</dt><dd>{conn.kind === "instagram" ? "Instagram" : conn.igUserId ? "Facebook and Instagram" : "Facebook"}</dd>
                  {conn.mode === "live" && <><dt className="text-ink-3">Last checked</dt><dd className="tnum">{conn.lastCheckedAt ? fmtDateTime(conn.lastCheckedAt) : "Not yet"}</dd></>}
                </dl>
                {broken && <p className="mt-3 text-sm text-red">{conn.lastError || "Meta stopped accepting our access, usually after a password change or removed permission."} Scheduled posts are waiting and go out as soon as you reconnect.</p>}
                {conn.mode === "demo" && <p className="mt-3 text-sm text-ink-2">Demo connection: posts are marked as published but don’t go live.</p>}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {broken ? (
                <a href={`/api/meta/connect${conn.kind === "instagram" ? "?via=instagram" : ""}`} className="btn btn-primary">Reconnect</a>
              ) : after ? (
                <form action={after}><button className="btn btn-primary">Continue</button></form>
              ) : (
                <a href={`/api/meta/connect${conn.kind === "instagram" ? "?via=instagram" : ""}`} className="btn btn-ghost">Reconnect</a>
              )}
              {check && conn.mode === "live" && <form action={check}><SubmitButton className="btn btn-ghost" pending="Checking"><RefreshCw className="size-4" aria-hidden />Check now</SubmitButton></form>}
              {disconnect && <form action={disconnect}><SubmitButton className="btn btn-ghost text-red" pending="Disconnecting">Disconnect</SubmitButton></form>}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[14px] bg-sheet p-6 ring-1 ring-line">
          <p className="font-semibold">Before you click, check two things</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2 marker:text-mint">
            <li>Your Instagram is a <strong className="text-ink">Business or Creator</strong> account (Instagram → Settings → Account type and tools).</li>
            <li>It’s <strong className="text-ink">linked to your Facebook Page</strong>, and you’re an admin of that Page.</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <a href="/api/meta/connect" className="btn bg-[#1877F2] px-5 py-3 text-white hover:bg-[#1468d6]">Continue with Facebook</a>
            <span className="text-sm text-ink-2">Connects your Page and its Instagram in one go.</span>
          </div>
          <div className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            No Facebook Page? <a href="/api/meta/connect?via=instagram" className="font-semibold text-mint-deep underline">Connect Instagram only</a>. Posts then go to Instagram but not Facebook.
          </div>
          {(!live || !igLive) && (
            <p className="hint mt-4">
              {!live && !igLive ? "Meta app keys aren’t set on this server, so both buttons connect a demo account." : !live ? "Facebook app keys aren’t set, so “Continue with Facebook” connects a demo account." : "Instagram app keys aren’t set, so “Instagram only” connects a demo account."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
