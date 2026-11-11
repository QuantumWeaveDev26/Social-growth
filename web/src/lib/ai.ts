/**
 * AI gateway. All model calls go through the n8n Asset API, which holds the
 * OpenAI and ElevenLabs keys. Swap AI_GATEWAY_URL for direct provider calls later.
 */
const URL_ = () => process.env.AI_GATEWAY_URL || "";
const KEY = () => process.env.AI_GATEWAY_KEY || "";

async function gateway<T>(body: Record<string, unknown>, timeoutMs = 300_000): Promise<T> {
  if (!URL_()) throw new Error("AI_GATEWAY_URL is not set");
  const res = await fetch(URL_(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-qw-key": KEY() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`AI gateway returned non-JSON: ${text.slice(0, 200)}`);
  }
}

export type ChatUsage = { prompt_tokens?: number; completion_tokens?: number };

/** Chat completion that must return a JSON object. */
const parseJson = <T,>(raw: string): T => {
  const cleaned = raw.replace(/\s*—\s*/g, ", ");
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON");
    return JSON.parse(m[0]);
  }
};

/**
 * Chat that must return a JSON object. Google Gemini (billed to the Google Cloud credit) whenever Google is
 * configured. There is NO OpenAI fallback: a failed call is retried on Gemini (network blips, rate limits,
 * an unfinished or unparseable reply). OpenAI is used only if TEXT_ENGINE=openai is set on purpose.
 */
export async function chatJson<T = Record<string, unknown>>(system: string, user: string, opts: { model?: string; engine?: "gemini" | "openai" } = {}): Promise<{ data: T; costUsd: number; engine: string }> {
  const { veoConfigured } = await import("./veo");
  const engine = opts.engine || (process.env.TEXT_ENGINE === "openai" || !veoConfigured() ? "openai" : "gemini");
  if (engine === "openai") return { ...(await openaiJson<T>(system, user, opts)), engine: opts.model || process.env.AI_TEXT_MODEL || "gpt-5-mini" };
  const { geminiJson, GEMINI_TEXT_MODEL } = await import("./veo");
  let last: unknown;
  let cost = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const g = await geminiJson(system, user);
      cost += g.costUsd;
      return { data: parseJson<T>(g.text), costUsd: cost, engine: GEMINI_TEXT_MODEL };
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      // a wrong key, missing permission or bad request won't fix itself by waiting
      if (/\b(400|401|403|404)\b|PERMISSION_DENIED|UNAUTHENTICATED|isn't configured/i.test(msg) && !/429|RESOURCE_EXHAUSTED/i.test(msg)) break;
      console.error(`gemini attempt ${attempt} failed:`, msg.slice(0, 300));
      if (attempt < 4) await new Promise((r) => setTimeout(r, 4000 * attempt * attempt));
    }
  }
  throw new Error(`Gemini writing failed: ${last instanceof Error ? last.message : String(last)}`.slice(0, 600));
}

async function openaiJson<T>(system: string, user: string, opts: { model?: string } = {}): Promise<{ data: T; costUsd: number }> {
  const model = opts.model || process.env.AI_TEXT_MODEL || "gpt-5-mini";
  const request: Record<string, unknown> = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (/^(gpt-5|o\d)/.test(model)) request.max_completion_tokens = 30000;
  else request.temperature = 0.7;
  const r = await gateway<{ content: string | null; usage: ChatUsage | null; error: unknown }>({ type: "chat", request });
  if (!r.content) throw new Error("Model returned no content: " + JSON.stringify(r.error).slice(0, 300));
  const data = parseJson<T>(r.content);
  const u = r.usage || {};
  // approximate list prices per 1M tokens (gpt-5-mini: $0.25 in / $2 out; gpt-5: $1.25 / $10)
  const [pin, pout] = model.startsWith("gpt-5-mini") ? [0.25, 2] : [1.25, 10];
  const costUsd = ((u.prompt_tokens || 0) * pin + (u.completion_tokens || 0) * pout) / 1e6;
  return { data, costUsd };
}

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "4:5";

/**
 * One image. "4:5" is the ad/feed format (1080×1350): neither model offers 4:5 directly, so we make a
 * taller image (Imagen 3:4 at 2K, or OpenAI 1024×1536) and crop it to exactly 1080×1350.
 */
export async function generateImage(prompt: string, size: ImageSize = "1024x1024"): Promise<{ png: Buffer; costUsd: number }> {
  const raw = await rawImage(prompt, size);
  if (size !== "4:5") return raw;
  const sharp = (await import("sharp")).default;
  const png = await sharp(raw.png).resize(1080, 1350, { fit: "cover", position: "centre" }).png().toBuffer();
  return { png, costUsd: raw.costUsd };
}

async function rawImage(prompt: string, size: ImageSize): Promise<{ png: Buffer; costUsd: number }> {
  // Google only (billed to the Google Cloud credit), never falling back to OpenAI: Gemini image first,
  // then Imagen 4 while Google still serves it. OpenAI only if IMAGE_ENGINE=openai is set on purpose.
  const { veoConfigured, imagenImage, geminiImage } = await import("./veo");
  if (process.env.IMAGE_ENGINE !== "openai" && veoConfigured()) {
    const gAspect = size === "4:5" ? "4:5" : size === "1024x1536" ? "9:16" : size === "1536x1024" ? "16:9" : "1:1";
    const iAspect = size === "4:5" ? "3:4" : gAspect === "4:5" ? "3:4" : gAspect;
    const safer = `${prompt}\n\nKeep it a clean, brand-safe commercial photo: focus on the product, place and atmosphere; any people are adults shown naturally and modestly; no logos of other brands, no text other than the requested headline.`;
    const tries: Array<[string, () => Promise<{ png: Buffer; costUsd: number }>]> = [
      ["gemini image", () => geminiImage(prompt, gAspect)],
      ["gemini image (retry)", () => geminiImage(safer, gAspect)],
      ["imagen", () => imagenImage(safer, iAspect)],
    ];
    const errors: string[] = [];
    for (const [label, run] of tries) {
      try { return await run(); } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${label}: ${msg.slice(0, 200)}`);
        console.error(`${label} failed:`, msg.slice(0, 300));
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    throw new Error(`Google image generation failed. ${errors.join(" | ")}`.slice(0, 700));
  }
  const oaSize = size === "4:5" ? "1024x1536" : size;
  const r = await gateway<{ b64: string | null; error: unknown }>({ type: "image", prompt, size: oaSize, model: process.env.AI_IMAGE_MODEL || "gpt-image-1.5", quality: "high" });
  if (!r.b64) throw new Error("Image generation failed: " + JSON.stringify(r.error).slice(0, 300));
  // gpt-image-1.5 high quality list prices: $0.133 square, $0.200 tall/wide
  return { png: Buffer.from(r.b64, "base64"), costUsd: oaSize === "1024x1024" ? 0.133 : 0.2 };
}

export type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

export async function textToSpeech(text: string): Promise<{ mp3: Buffer; alignment: Alignment; costUsd: number }> {
  const r = await gateway<{ b64: string | null; alignment: Alignment | null }>({
    type: "tts",
    text,
    voice_id: process.env.TTS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL",
    model_id: process.env.TTS_MODEL || "eleven_v4",
  });
  if (!r.b64 || !r.alignment) throw new Error("Voice generation failed");
  return { mp3: Buffer.from(r.b64, "base64"), alignment: r.alignment, costUsd: (text.length / 1000) * 0.3 };
}
