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
export async function chatJson<T = Record<string, unknown>>(system: string, user: string, opts: { model?: string } = {}): Promise<{ data: T; costUsd: number }> {
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
  const cleaned = r.content.replace(/\s*—\s*/g, ", ");
  let data: T;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON");
    data = JSON.parse(m[0]);
  }
  const u = r.usage || {};
  // approximate list prices per 1M tokens (gpt-5-mini: $0.25 in / $2 out; gpt-5: $1.25 / $10)
  const [pin, pout] = model.startsWith("gpt-5-mini") ? [0.25, 2] : [1.25, 10];
  const costUsd = ((u.prompt_tokens || 0) * pin + (u.completion_tokens || 0) * pout) / 1e6;
  return { data, costUsd };
}

export async function generateImage(prompt: string, size: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024"): Promise<{ png: Buffer; costUsd: number }> {
  const r = await gateway<{ b64: string | null; error: unknown }>({ type: "image", prompt, size, model: process.env.AI_IMAGE_MODEL || "gpt-image-1.5", quality: "high" });
  if (!r.b64) throw new Error("Image generation failed: " + JSON.stringify(r.error).slice(0, 300));
  return { png: Buffer.from(r.b64, "base64"), costUsd: size === "1024x1024" ? 0.13 : 0.2 };
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
