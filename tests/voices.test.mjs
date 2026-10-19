/* Listening voices: casting, Gemini studio requests, and the WAV / track maths (pure parts). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { speakerRole, castVoices, naturalSpeed, studioStyle, spokenText, withPunctuation, clipKey, engineOf, ENGINES, KOKORO_VOICES, GEMINI_VOICES } from "../desktop/renderer/studio/voice-cast.js";
import { speakerRuns, dialogueRequests, singleRequest, replyAudio, studioError, GEMINI_TTS_MODEL, STUDIO_USD_PER_SECOND } from "../desktop/renderer/studio/gemini-voice.js";
import { encodeWav, decodeWav, pcm16ToFloat, resample, trimSilence, level, pauseAfter, trackLayout, renderTrack, audioFileName, RATE } from "../desktop/renderer/studio/audio-track.js";

const tone = (sec, amp = 0.3, rate = RATE) => Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin(i / 8));

test("speakers are cast by role, and nobody in a script shares a voice", () => {
  assert.equal(speakerRole("Mia"), "girl");
  assert.equal(speakerRole("Tom"), "boy");
  assert.equal(speakerRole("Mrs Brown"), "woman");
  assert.equal(speakerRole("Mr. Smith"), "man");
  assert.equal(speakerRole("Dad"), "man");
  assert.equal(speakerRole("Grandma"), "woman");
  assert.equal(speakerRole("Enitan"), "girl");
  assert.equal(speakerRole("Zorblax"), "");
  for (const engine of ["natural", "studio"]) {
    const cast = castVoices(["Mia", "Tom", "Anna", "Ben", "Mum", "Dad", "Teacher", "Kim"], engine);
    const voices = Object.values(cast).map((c) => c.voice);
    assert.equal(new Set(voices).size, voices.length, `${engine}: ${voices}`);
    const table = engine === "natural" ? KOKORO_VOICES : GEMINI_VOICES;
    assert.ok(table.girl.includes(cast.Mia.voice) && table.boy.includes(cast.Tom.voice) && table.man.includes(cast.Dad.voice));
  }
  // Unknown names alternate, so a two-person script still gets two different kinds of voice.
  const two = castVoices(["Kim", "Sam2"], "natural");
  assert.notEqual(two.Kim.voice, two["Sam2"].voice);
  assert.equal(castVoices(["Narrator"], "natural").Narrator.role, "reader");
});

test("speed, delivery notes and spoken text", () => {
  assert.ok(naturalSpeed("A_SENIOR") < naturalSpeed("E_SENIOR"));
  assert.ok(naturalSpeed("A_SENIOR", true) >= 0.78);
  assert.match(studioStyle("A_SENIOR", "girl"), /child.*slowly and very clearly/);
  assert.equal(spokenText("I have two ______ at home 🙂 (laughs)"), "I have two blank at home");
  assert.equal(withPunctuation("Yes, I do."), "Yes, comma, I do, full stop.");
  assert.notEqual(clipKey("natural", "af_heart", 0.9, "Hi."), clipKey("natural", "af_heart", 0.88, "Hi."));
  assert.equal(clipKey("natural", "af_heart", 0.9, "Hi."), clipKey("natural", "af_heart", 0.9, "Hi."));
  assert.equal(engineOf("nonsense"), "natural");
  assert.deepEqual(Object.keys(ENGINES), ["natural", "studio", "computer"]);
});

test("Gemini studio requests: one conversational request per run of two speakers", () => {
  const lines = [{ speaker: "Mia", text: "Hi!" }, { speaker: "Dad", text: "Hello." }, { speaker: "Mia", text: "Look ______!" }, { speaker: "Tom", text: "Wow." }, { speaker: "Mia", text: "Yes." }];
  const runs = speakerRuns(lines);
  assert.deepEqual(runs.map((r) => r.speakers), [["Mia", "Dad"], ["Tom", "Mia"]]);
  const cast = castVoices(lines.map((l) => l.speaker), "studio");
  const reqs = dialogueRequests(lines, cast, { levelId: "B_SENIOR" });
  assert.equal(reqs.length, 2);
  assert.deepEqual(reqs[0].lines, [0, 1, 2]);
  const body = reqs[0].body;
  assert.equal(body.model, GEMINI_TTS_MODEL);
  assert.equal(body.generation_config.speech_config.mode, "conversational");
  assert.deepEqual(body.generation_config.speech_config.speakers, [{ speaker: "Mia", voice: cast.Mia.voice }, { speaker: "Dad", voice: cast.Dad.voice }]);
  assert.equal(body.input[0].content[2].text, "Look blank!");
  assert.match(body.input[0].content[0].annotations[0].style, /British English/);
  // A monologue is a single-voice request.
  const mono = dialogueRequests([{ speaker: "Anna", text: "I went to the park." }], castVoices(["Anna"], "studio"), {});
  assert.ok(Array.isArray(mono[0].body.generation_config.speech_config));
  assert.equal(singleRequest("Hello.", "Kore", { slow: true }).generation_config.speech_config[0].voice, "Kore");
  assert.match(singleRequest("Hello.", "Kore", { slow: true }).input[0].content[0].annotations[0].style, /slower/);
  assert.equal(replyAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: "QUJD" }] }] }), "QUJD");
  assert.equal(replyAudio({}), "");
  assert.match(studioError(429, "{}"), /quota/);
  assert.ok(STUDIO_USD_PER_SECOND * 60 < 0.02, "a minute of studio speech costs under 2 cents");
});

test("WAV round trip, raw PCM, resampling, trimming and levelling", () => {
  const t = tone(0.5);
  const back = decodeWav(encodeWav(t));
  assert.equal(back.rate, RATE);
  assert.equal(back.samples.length, t.length);
  assert.ok(Math.abs(back.samples[100] - t[100]) < 1e-3);
  const pcm = new Uint8Array(4); new DataView(pcm.buffer).setInt16(0, 16384, true); new DataView(pcm.buffer).setInt16(2, -16384, true);
  assert.deepEqual([...pcm16ToFloat(pcm)], [0.5, -0.5]);
  assert.equal(resample(tone(1, 0.3, 48000), 48000).length, RATE);
  const padded = new Float32Array(RATE * 2); padded.set(t, RATE / 2);
  assert.ok(trimSilence(padded).length < t.length + RATE * 0.2);
  const quiet = level(tone(1, 0.02));
  const rms = Math.sqrt(quiet.reduce((s, x) => s + x * x, 0) / quiet.length);
  assert.ok(rms > 0.06 && rms < 0.12, `rms ${rms}`);
  assert.ok(Math.max(...level(tone(0.2, 0.99))) <= 0.93);
});

test("tracks: lines in order with pauses, the second play after a gap, saved as one WAV", () => {
  const lines = [{ speaker: "Mia", text: "Hi! Are you ready?" }, { speaker: "Tom", text: "Yes." }, { speaker: "Tom", text: "Let's go." }];
  assert.ok(pauseAfter(lines[0], lines[1]) > pauseAfter(lines[1], lines[2]), "a question and a new speaker get a longer pause");
  const { parts, seconds } = trackLayout(lines, [1, 0.5, 0.8], { plays: 2, betweenPlays: 4 });
  assert.equal(parts.length, 6);
  assert.deepEqual(parts.map((p) => p.index), [0, 1, 2, 0, 1, 2]);
  assert.ok(parts[3].at - (parts[2].at + 0.8) >= 4, "4 s between the plays");
  assert.ok(parts.every((p, i) => !i || p.at > parts[i - 1].at));
  const track = renderTrack(lines, [tone(1), tone(0.5), tone(0.8)], { plays: 2 });
  assert.equal(Math.ceil(seconds * RATE), track.samples.length);
  const wav = encodeWav(track.samples);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(audioFileName('Unit 4 Test: "Track" 1'), "Unit 4 Test Track 1.wav");
});

test("the natural voices ship with the app: Kokoro web bundle, its WebAssembly and the licences", () => {
  const dir = new URL("../desktop/renderer/vendor/kokoro/", import.meta.url);
  for (const f of ["kokoro.web.js", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm", "LICENSE-kokoro-js", "LICENSE-transformers-js"]) assert.ok(fs.existsSync(new URL(f, dir)), f);
  // The worker sets the thread count through the runtime settings the vendored bundle exports.
  assert.match(fs.readFileSync(new URL("kokoro.web.js", dir), "utf8").slice(-300), /Wg as transformersEnv/);
  const html = fs.readFileSync(new URL("../desktop/renderer/index.html", import.meta.url), "utf8");
  assert.match(html, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(html, /https:\/\/huggingface\.co https:\/\/\*\.huggingface\.co https:\/\/\*\.hf\.co/);
  const main = fs.readFileSync(new URL("../desktop/main.js", import.meta.url), "utf8");
  assert.match(main, /"cross-origin-embedder-policy": "credentialless"/);
  for (const f of ["../proxy.js", "../desktop/main.js"]) assert.match(fs.readFileSync(new URL(f, import.meta.url), "utf8"), /\|interactions\)\$\/\.test\(apiPath\)/, `${f} forwards studio-voice requests`);
});
