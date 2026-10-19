/* Vocab Master — Gemini "studio voices" requests (pure). Same Interactions API format as
 * scripts/lib/gemini-tts.mjs, which voiced all 8,650 lesson lines:
 *   - a dialogue of up to 2 speakers is ONE conversational request, so the turn-taking sounds real;
 *   - longer casts are split into runs of at most 2 speakers;
 *   - the delivery note goes in speech_metadata.style and is never read aloud.
 * The app sends these through /gemini/v1beta/interactions (proxy.js on the web, IPC on the desktop). */
import { spokenText, studioStyle } from "./voice-cast.js";

export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
/** USD per second of speech: $9 per 1M output tokens × 25 audio tokens a second (content/pricing.json). */
export const STUDIO_USD_PER_SECOND = (9 / 1e6) * 25;

const textItem = (text, { speaker = "", style = "" } = {}) => {
  const meta = { type: "speech_metadata" };
  if (speaker) meta.speaker = speaker;
  if (style) meta.style = style;
  return { type: "text", text, annotations: [meta] };
};

/** Split lines into runs with at most two speakers each (Gemini's conversational limit). */
export function speakerRuns(lines) {
  const runs = [];
  let cur = null;
  lines.forEach((line, index) => {
    const sp = line.speaker || "Narrator";
    if (!cur || (!cur.speakers.has(sp) && cur.speakers.size >= 2)) { cur = { speakers: new Set(), lines: [] }; runs.push(cur); }
    cur.speakers.add(sp);
    cur.lines.push({ ...line, index });
  });
  return runs.map((r) => ({ speakers: [...r.speakers], lines: r.lines }));
}

/** Request bodies for a script. cast: speaker → { voice, role }. Each body voices one run. */
export function dialogueRequests(lines, cast, { levelId = "" } = {}) {
  return speakerRuns(lines).map((run) => {
    const conversational = run.speakers.length > 1;
    const content = run.lines.map((l) => textItem(spokenText(l.text), { speaker: conversational ? l.speaker || "Narrator" : "", style: studioStyle(levelId, cast[l.speaker || "Narrator"]?.role) }));
    return {
      lines: run.lines.map((l) => l.index),
      body: {
        model: GEMINI_TTS_MODEL,
        input: [{ type: "user_input", content }],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: conversational
            ? { mode: "conversational", speakers: run.speakers.map((sp) => ({ speaker: sp, voice: cast[sp]?.voice || "Kore" })) }
            : [{ voice: cast[run.speakers[0]]?.voice || "Kore" }],
        },
      },
    };
  });
}

/** One sentence in one voice (read-aloud dictation). */
export function singleRequest(text, voice, { levelId = "", role = "reader", slow = false } = {}) {
  const style = `${studioStyle(levelId, role)}${slow ? " This is the dictation reading: slower, with short pauses between word groups." : ""}`;
  return {
    model: GEMINI_TTS_MODEL,
    input: [{ type: "user_input", content: [textItem(spokenText(text), { style })] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
  };
}

/** The base64 audio in an Interactions reply (WAV, or raw 24 kHz PCM), or "". */
export function replyAudio(json) {
  for (const s of json?.steps || []) {
    if (s.type !== "model_output") continue;
    for (const c of s.content || []) if (c.type === "audio" && c.data) return c.data;
  }
  return json?.output_audio?.data || json?.outputAudio?.data || "";
}

/** A friendly message for a failed studio-voice request. */
export function studioError(status, bodyText = "") {
  let detail = "";
  try { detail = JSON.parse(bodyText)?.error?.message || ""; } catch { detail = String(bodyText).slice(0, 160); }
  if (status === 401 || /API key not valid|API_KEY_INVALID/i.test(detail)) return "Google rejected the Gemini key. Check it in Settings.";
  if (status === 403) return `Google refused the studio voices (403)${detail ? `: ${detail}` : ""}.`;
  if (status === 429) return "The Gemini voice quota is used up for now (429). Natural voices are used instead.";
  if (status >= 500) return `Gemini voices are having trouble right now (${status}).`;
  return `Gemini voices error ${status}${detail ? `: ${detail}` : ""}`;
}
