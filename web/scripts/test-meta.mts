// Offline checks for Meta callback verification and token encryption.
process.env.META_APP_SECRET = "s3cret";
const crypto = await import("node:crypto");
const { parseSignedRequest } = await import("../src/lib/meta.ts");
const { seal, open } = await import("../src/lib/crypto.ts");
const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "123" })).toString("base64url");
const sig = crypto.createHmac("sha256", "s3cret").update(payload).digest("base64url");
const ok = parseSignedRequest(`${sig}.${payload}`)?.user_id === "123";
const forged = parseSignedRequest(`abc.${payload}`) === null;
const x = seal("EAAG-token");
console.log({ signedRequestValid: ok, forgedRejected: forged, encryptRoundTrip: open(x) === "EAAG-token", storedLooksLike: x.slice(0, 14) + "…" });
