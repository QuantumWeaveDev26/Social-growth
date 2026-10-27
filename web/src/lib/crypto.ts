import crypto from "node:crypto";

/** AES-256-GCM for secrets at rest (Meta tokens). Key comes from TOKEN_KEY, falling back to AUTH_SECRET. */
const key = () => crypto.createHash("sha256").update(process.env.TOKEN_KEY || process.env.AUTH_SECRET || "dev-secret").digest();

export function seal(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function open(sealed: string | null | undefined) {
  if (!sealed) return null;
  if (!sealed.startsWith("v1.")) return sealed; // legacy plain value
  const [, iv, tag, data] = sealed.split(".");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
