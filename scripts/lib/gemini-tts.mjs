/* Gemini 3.8 TTS client (Interactions API), following the 3.8 Flash TTS developer guide:
   - `text` is a verbatim transcript (only <tags> and |backchannels| are not read aloud);
   - delivery goes in the per-turn speech_metadata.style (leave it empty unless a line needs direction);
   - IPA in /slashes/ fixes pronunciation; up to 2 prebuilt speakers per conversational request.
   Every call is priced and recorded in the spend ledger; jobs are refused past the Gemini cap. */
import { requireEnv } from "./env.mjs";
import { createLedger, geminiCost, PRICING } from "./ledger.mjs";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const ledger = createLedger();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const textItem = (text, { style = "", speaker = "" } = {}) => {
  const meta = { type: "speech_metadata" };
  if (speaker) meta.speaker = speaker;
  if (style) meta.style = style;
  return { type: "text", text, annotations: [meta] };
};

/** WAV (RIFF, 16-bit PCM) → seconds. */
export function wavSeconds(buf) {
  try {
    const rate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    const bits = buf.readUInt16LE(34);
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === "data") return Math.min(size, buf.length - off - 8) / (rate * channels * (bits / 8));
      off += 8 + size;
    }
  } catch { /* fall through */ }
  return 0;
}

function extractAudio(json) {
  const steps = json.steps || [];
  let data = null;
  for (const s of steps) if (s.type === "model_output") for (const c of s.content || []) if (c.type === "audio" && c.data) data = c.data;
  data = data || json.output_audio?.data || json.outputAudio?.data;
  return data ? Buffer.from(data, "base64") : null;
}

function usageOf(json, seconds) {
  const u = json.usage || json.usage_metadata || json.usageMetadata || {};
  const inTok = u.input_tokens ?? u.total_input_tokens ?? u.promptTokenCount ?? u.prompt_tokens ?? 0;
  const outTok = u.output_tokens ?? u.total_output_tokens ?? u.candidatesTokenCount ?? 0;
  // If the API doesn't report audio tokens, bill by duration (25 tokens / second, as documented).
  return { inTok, outTok: outTok || Math.ceil(seconds * PRICING.audioTokensPerSecond), reported: !!outTok };
}

async function post(path, body) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "x-goog-api-key": requireEnv("GEMINI_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    last = new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 400)}`);
    last.status = res.status;
    if (res.status !== 429 && res.status < 500) throw last;
    await sleep(2000 * (attempt + 1) ** 2);
  }
  throw last;
}

/**
 * Synthesize speech.
 * @param {{ model: string, voice?: string, text?: string, style?: string,
 *   turns?: { speaker: string, text: string, style?: string }[], speakers?: { speaker: string, voice: string }[],
 *   job?: string, estimateSeconds?: number }} o
 * @returns {Promise<{ wav: Buffer, seconds: number, usd: number, raw: object }>}
 */
export async function synthesize({ model, voice, text, style = "", turns, speakers, job = "", estimateSeconds }) {
  const est = estimateSeconds ?? Math.max(1.5, ((text || turns?.map((t) => t.text).join(" ") || "").length / 13));
  ledger.assertCanSpend("gemini", geminiCost(model, { inTok: 200, outTok: est * PRICING.audioTokensPerSecond * 1.3, mode: "standard" }), job);
  const conversational = Array.isArray(turns) && turns.length;
  const body = {
    model,
    input: [{ type: "user_input", content: conversational ? turns.map((t) => textItem(t.text, { speaker: t.speaker, style: t.style })) : [textItem(text, { style })] }],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: conversational ? { mode: "conversational", speakers } : [{ voice }],
    },
  };
  const json = await post("/interactions", body);
  const wav = extractAudio(json);
  if (!wav) throw new Error(`No audio in response (keys: ${Object.keys(json).join(", ")})`);
  const seconds = wavSeconds(wav);
  const { inTok, outTok, reported } = usageOf(json, seconds);
  const usd = geminiCost(model, { inTok, outTok, mode: "standard" });
  ledger.record({ provider: "gemini", model, mode: "standard", inTok, outTok, usd, job: `${job}${reported ? "" : " (est)"}` });
  const raw = { ...json };
  delete raw.steps;
  delete raw.output_audio;
  return { wav, seconds, usd, raw };
}

/* Same Gemini 3.8 Flash TTS model through OpenRouter (/api/v1/audio/speech): studio voices only,
   no style field, raw 24 kHz PCM back. No Tier-1 daily cap. Measured ≈ $0.46 per hour of audio;
   we record a conservative $0.60/h estimate per clip in the ledger under "openrouter". */
export const OPENROUTER_TTS_VOICES = ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];
const OR_USD_PER_SEC = 0.6 / 3600;

function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function synthesizeOpenRouter({ voice, text, job = "", estimateSeconds = 4 }) {
  if (!OPENROUTER_TTS_VOICES.includes(voice)) throw new Error(`${voice} is not an OpenRouter studio voice`);
  ledger.assertCanSpend("openrouter", estimateSeconds * OR_USD_PER_SEC * 1.5, job);
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3.8-flash-tts", input: text, voice, response_format: "pcm" }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok) {
      const rate = Number((res.headers.get("content-type") || "").match(/rate=(\d+)/)?.[1] || 24000);
      const wav = pcmToWav(buf, rate);
      const seconds = buf.length / (rate * 2);
      const usd = seconds * OR_USD_PER_SEC;
      ledger.record({ provider: "openrouter", model: "google/gemini-3.8-flash-tts", inTok: 0, outTok: Math.ceil(seconds * 25), usd, job: `${job} (est)` });
      return { wav, seconds, usd };
    }
    last = new Error(`OpenRouter TTS HTTP ${res.status}: ${buf.toString().slice(0, 300)}`);
    if (res.status !== 429 && res.status < 500) throw last;
    await sleep(2000 * (attempt + 1) ** 2);
  }
  throw last;
}

/** GET /v1beta/voices with repeatable filters, e.g. { language_code: ["en-GB"], type: ["prebuilt"] }. */
export async function listVoices(filters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) for (const x of [].concat(v)) qs.append(k, x);
  const out = [];
  let token = "";
  do {
    if (token) qs.set("page_token", token);
    const res = await fetch(`${BASE}/voices?${qs}`, { headers: { "x-goog-api-key": requireEnv("GEMINI_API_KEY") } });
    const text = await res.text();
    if (!res.ok) throw new Error(`voices HTTP ${res.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    out.push(...(json.voices || []));
    token = json.next_page_token || json.nextPageToken || "";
  } while (token && out.length < 400);
  return out;
}
