/* Voice a test's listening with the app's studio-voice requests (Gemini, through the spend ledger)
 * and save the finished track as a WAV to listen to. About $0.01 per track.
 *   node scripts/studio/try-voices.mjs [--doc work/studio/test-doc.json] [--part 1] [--dry-run]
 * The doc comes from `node scripts/studio/try-studio.mjs`. Output: work/studio/listening-<part>-studio.wav */
import fs from "node:fs";
import path from "node:path";
import { requireEnv, ROOT } from "../lib/env.mjs";
import { createLedger, geminiCost, PRICING } from "../lib/ledger.mjs";
import { castVoices } from "../../desktop/renderer/studio/voice-cast.js";
import { dialogueRequests, replyAudio, GEMINI_TTS_MODEL } from "../../desktop/renderer/studio/gemini-voice.js";
import { decodeWav, pcm16ToFloat, renderTrack, encodeWav, trimSilence, RATE } from "../../desktop/renderer/studio/audio-track.js";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const doc = JSON.parse(fs.readFileSync(path.resolve(ROOT, opt("doc", "work/studio/test-doc.json")), "utf8"));
const listening = doc.sections.filter((s) => s.skill === "listening" && s.script?.length);
const part = listening[Number(opt("part", 1)) - 1];
if (!part) throw new Error("No listening part in that doc.");
const cast = castVoices(part.script.map((l) => l.speaker), "studio");
const requests = dialogueRequests(part.script, cast, { levelId: doc.meta.classProfile });
console.log(`Part ${part.task}: ${part.script.length} lines, cast ${JSON.stringify(cast)}, ${requests.length} request(s).`);
if (args.includes("--dry-run")) { console.log(JSON.stringify(requests[0].body, null, 2).slice(0, 1500)); process.exit(0); }

const ledger = createLedger();
const clips = [];
for (const [i, r] of requests.entries()) {
  const chars = r.body.input[0].content.map((c) => c.text).join(" ").length;
  ledger.assertCanSpend("gemini", geminiCost(GEMINI_TTS_MODEL, { inTok: 400, outTok: (chars / 12) * PRICING.audioTokensPerSecond * 1.4 }), "studio voices try");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": requireEnv("GEMINI_API_KEY") },
    body: JSON.stringify(r.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  const bytes = Buffer.from(replyAudio(json), "base64");
  const isWav = bytes.toString("ascii", 0, 4) === "RIFF";
  const { samples } = isWav ? decodeWav(bytes) : { samples: pcm16ToFloat(bytes) };
  const seconds = samples.length / RATE;
  const u = json.usage || {};
  const outTok = u.output_tokens ?? u.total_output_tokens ?? Math.ceil(seconds * PRICING.audioTokensPerSecond);
  const usd = geminiCost(GEMINI_TTS_MODEL, { inTok: u.input_tokens ?? u.total_input_tokens ?? 0, outTok });
  ledger.record({ provider: "gemini", model: GEMINI_TTS_MODEL, inTok: u.input_tokens ?? 0, outTok, usd, job: "studio voices try" });
  console.log(`  request ${i + 1}: ${isWav ? "WAV" : "PCM"}, ${seconds.toFixed(1)} s, $${usd.toFixed(4)}`);
  clips.push(trimSilence(samples));
}
const segments = requests.map((r) => ({ speaker: part.script[r.lines.at(-1)].speaker, text: part.script[r.lines.at(-1)].text }));
const track = renderTrack(segments, clips, { plays: part.plays || 2 });
const out = path.join(ROOT, "work", "studio", `listening-${opt("part", 1)}-studio.wav`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodeWav(track.samples, track.rate));
console.log(`Saved ${path.relative(ROOT, out)} (${track.layout.seconds.toFixed(1)} s). Gemini left: $${ledger.remaining("gemini").toFixed(3)}`);
