#!/usr/bin/env node
/* Voice audition: designs a few custom voices and voices ~40 sample lines with candidate voices,
   then writes work/audition/index.html (+ mp3s) so the teacher can pick by ear.
   Cost ≈ $0.03–0.06 (recorded in the ledger). Re-running reuses clips already made.
   Usage: node scripts/audio/audition.mjs */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT, requireEnv } from "../lib/env.mjs";
import { synthesize, ledger } from "../lib/gemini-tts.mjs";

const OUT = path.join(ROOT, "work", "audition");
const STATE = path.join(OUT, "state.json");
fs.mkdirSync(OUT, { recursive: true });
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { designed: {}, clips: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

const FLASH = "gemini-3.8-flash-tts";
const LITE = "gemini-3.8-flash-lite-tts";

/* Designed voices — permanent traits only (age, timbre, accent, cadence); emotion goes in style. */
const DESIGNS = {
  lingo_f: { gender: "female", input: "A warm, playful primary-school English teacher in her early thirties with a clear, friendly Southern British accent, a bright smiling timbre, crisp articulation and an unhurried, child-friendly pace." },
  lingo_m: { gender: "male", input: "A kind, cheerful storyteller in his forties with a soft, clear Southern British accent, a warm rounded timbre, gentle wonder in his voice and a slow, very clear pace for young learners." },
  boy: { gender: "male", input: "A lively, curious nine-year-old British boy with a bright, clear young voice and natural childlike energy." },
  girl: { gender: "female", input: "A cheerful, confident ten-year-old British girl with a clear, sweet young voice and a quick, friendly way of speaking." },
  grandma: { gender: "female", input: "A warm, gentle British grandmother in her seventies with a soft, slightly slow voice, a kind smile in it and a light Northern English accent." },
};

async function design(key) {
  if (state.designed[key]) return state.designed[key];
  const d = DESIGNS[key];
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/voices", {
    method: "POST",
    headers: { "x-goog-api-key": requireEnv("GEMINI_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ store: true, voice: { model: FLASH, type: "prompted", display_name: `VocabMaster ${key}`, gender: d.gender, language_code: "en-GB", prompted: { input: d.input } } }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`voice design ${key}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const id = json.id || json.voice?.id || json.name;
  if (json.sample_audio?.data) toMp3(Buffer.from(json.sample_audio.data, "base64"), `design-${key}`);
  state.designed[key] = id;
  save();
  console.log(`  designed ${key} → ${id}`);
  return id;
}

function toMp3(wav, rawName) {
  const name = rawName.replace(/[^\w.-]+/g, "_");
  const wavFile = path.join(OUT, `${name}.wav`);
  const mp3File = path.join(OUT, `${name}.mp3`);
  fs.writeFileSync(wavFile, wav);
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", wavFile, "-codec:a", "libmp3lame", "-b:a", "64k", mp3File]);
  fs.rmSync(wavFile);
  return `${name}.mp3`;
}

async function clip(id, opts) {
  if (state.clips[id]) return state.clips[id];
  const r = await synthesize({ ...opts, job: `audition ${id}` });
  const file = toMp3(r.wav, id);
  state.clips[id] = { file, seconds: Number(r.seconds.toFixed(2)), usd: r.usd, label: opts.label, group: opts.group, voice: opts.voice || opts.turns?.map((t) => t.speaker).join(" + "), model: opts.model, style: opts.style || opts.turns?.map((t) => t.style).filter(Boolean).join(" / ") || "", text: opts.text || opts.turns?.map((t) => `${t.speaker}: ${t.text}`).join("\n") };
  save();
  process.stdout.write(".");
  return state.clips[id];
}

async function main() {
  console.log(`Gemini budget left: $${ledger.remaining("gemini").toFixed(3)}`);
  console.log("Designing voices…");
  const V = {};
  for (const k of Object.keys(DESIGNS)) {
    try { V[k] = await design(k); } catch (e) { console.log(`  ${e.message}`); }
  }

  const narratorLine = "Hello everyone! I'm Lingo, your owl teacher. Today we're going to open a big, exciting door... <short pause> the door to families!";
  const narrators = [
    ["lingo_f (designed)", V.lingo_f], ["lingo_m (designed)", V.lingo_m],
    ["Sulafat · warm", "Sulafat"], ["Achird · friendly", "Achird"], ["Aoede · breezy", "Aoede"], ["Laomedeia · upbeat", "Laomedeia"], ["Vindemiatrix · gentle", "Vindemiatrix"],
    ["en-gb-tutor-6 · teacher, Winchester", "en-gb-tutor-6"], ["en-gb-tutor-4 · teacher, Winchester", "en-gb-tutor-4"], ["en-gb-storyteller-2 · narrator, Winchester", "en-gb-storyteller-2"], ["en-gb-tutor-13 · clear, Winchester", "en-gb-tutor-13"],
  ].filter(([, v]) => v);

  console.log("\nNarrator candidates (Flash, empty style)");
  for (const [label, voice] of narrators) await clip(`n-${voice}`, { group: "1. Narrator voice for Lingo", label, model: FLASH, voice, text: narratorLine });
  if (V.lingo_f) await clip("n-lite-lingo_f", { group: "1. Narrator voice for Lingo", label: "lingo_f (designed) — on Flash-Lite (cheaper)", model: LITE, voice: V.lingo_f, text: narratorLine });

  console.log("\nSingle words");
  const wordVoices = [["lingo_f", V.lingo_f], ["Sulafat", "Sulafat"], ["en-gb-tutor-6", "en-gb-tutor-6"]].filter(([, v]) => v);
  const WORD_STYLE = "clear, warm teacher modelling a new word for young learners, slightly slow, natural falling intonation";
  for (const word of ["grandmother", "in common", "neighbour"]) {
    for (const [label, voice] of wordVoices) {
      await clip(`w-${word}-${label}-lite`, { group: "2. Single words (the hardest part)", label: `${label} · Flash-Lite · empty style`, model: LITE, voice, text: `${word}.` });
      await clip(`w-${word}-${label}-lite-style`, { group: "2. Single words (the hardest part)", label: `${label} · Flash-Lite · word style`, model: LITE, voice, text: `${word}.`, style: WORD_STYLE });
    }
    if (V.lingo_f) await clip(`w-${word}-lingo_f-flash-style`, { group: "2. Single words (the hardest part)", label: "lingo_f · Flash · word style", model: FLASH, voice: V.lingo_f, text: `${word}.`, style: WORD_STYLE });
  }

  console.log("\nSentences and feedback");
  const main = V.lingo_f || "Sulafat";
  await clip("s-example", { group: "3. Example sentence & feedback", label: "Example sentence (empty style)", model: LITE, voice: main, text: "My grandmother's name is Maria. She is seventy-eight years old." });
  await clip("s-explain", { group: "3. Example sentence & feedback", label: "Explanation after a quiz (style: encouraging)", model: LITE, voice: main, text: "Yes! A neighbour is a person who lives next door to you. Well done, everyone!", style: "encouraging and proud of the class, warm vocal smile" });
  await clip("s-question", { group: "3. Example sentence & feedback", label: "Question to the class (style: curious)", model: FLASH, voice: main, text: "So... who is in YOUR family? <short pause> Think about it for a moment.", style: "curious and inviting, leaning in" });

  console.log("\nStory dialogue");
  for (const [label, voice] of [["Puck · upbeat", "Puck"], ["Fenrir · excitable", "Fenrir"]]) {
    await clip(`d-boy-${voice}`, { group: "4. Story characters", label: `Timmy (child) — ${label}`, model: FLASH, voice, text: "This is my grandmother! She's my dad's mum, and she makes the best pancakes.", style: "an excited, proud young boy" });
  }
  for (const [label, voice] of [["Leda · youthful", "Leda"], ["Laomedeia · upbeat", "Laomedeia"]]) {
    await clip(`d-girl-${voice}`, { group: "4. Story characters", label: `Girl (child) — ${label}`, model: FLASH, voice, text: "Look! Our dogs are the same colour. Isn't that funny?", style: "a delighted, giggly young girl" });
  }
  if (V.grandma) await clip("d-gran-only", { group: "4. Story characters", label: "Grandma Rose (designed)", model: FLASH, voice: V.grandma, text: "<chuckle> Oh Timmy, you say that every Sunday! Come here and give me a hug.", style: "amused, loving" });
  if (V.boy && V.grandma) {
    await clip("d-boy", { group: "4. Story characters", label: "Timmy (designed boy)", model: FLASH, voice: V.boy, text: "This is my grandmother! She's my dad's mum, and she makes the best pancakes.", style: "proud and excited" });
    await clip("d-gran", { group: "4. Story characters", label: "Grandma Rose (designed)", model: FLASH, voice: V.grandma, text: "<chuckle> Oh Timmy, you say that every Sunday! Come here and give me a hug.", style: "amused, loving" });
  }
  if (V.girl) await clip("d-girl", { group: "4. Story characters", label: "Girl character (designed)", model: FLASH, voice: V.girl, text: "Look! Our dogs are the same colour. Isn't that funny?", style: "delighted, giggly" });
  await clip("d-convo", {
    group: "4. Story characters", label: "Two prebuilt voices in one conversational call (Leda + Gacrux)", model: FLASH,
    turns: [
      { speaker: "Timmy", text: "Grandma, do we have anything in common?", style: "curious" },
      { speaker: "Gran", text: "<laugh> Of course! |really?| We both love pancakes, and we both love you-know-who.", style: "warm, teasing" },
    ],
    speakers: [{ speaker: "Timmy", voice: "Leda" }, { speaker: "Gran", voice: "Gacrux" }],
  });

  console.log("\nGreek glosses");
  for (const [label, voice] of [["el-gr-tutor-6 (female)", "el-gr-tutor-6"], ["el-gr-assistant-5 (female narrator)", "el-gr-assistant-5"], ["el-gr-training-4 (male)", "el-gr-training-4"]]) {
    await clip(`g-${voice}`, { group: "5. Greek translation voice", label, model: LITE, voice, text: "οικογένεια. <short pause> γιαγιά. <short pause> γείτονας." });
  }

  writePage();
  console.log(`\nDone. Spent on Gemini so far: $${ledger.spent("gemini").toFixed(4)}. Open work/audition/index.html`);
}

/* The listening page — published as an Artifact (no html/head/body: the host wraps it). */
function writePage() {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const groups = {};
  for (const [id, c] of Object.entries(state.clips)) (groups[c.group] ||= []).push({ id, ...c });
  const designs = Object.keys(state.designed).filter((k) => fs.existsSync(path.join(OUT, `design-${k}.mp3`)));
  if (designs.length) groups["0. Designed voice previews (Google's own sample)"] = designs.map((k) => ({ id: `design-${k}`, file: `design-${k}.mp3`, label: `${k} (designed)`, model: "voice design preview", style: "", seconds: "", text: DESIGNS[k]?.input || "" }));
  const order = Object.keys(groups).sort();
  const card = (g, c) => `
      <article class="clip" data-group="${esc(g)}" data-label="${esc(c.label)}">
        <header><h3>${esc(c.label)}</h3><button type="button" class="pick" aria-pressed="false">Pick</button></header>
        <p class="meta">${esc(String(c.model).replace("gemini-3.8-", ""))}${c.style ? ` · style “${esc(c.style)}”` : ""}${c.seconds ? ` · ${c.seconds}s` : ""}</p>
        <audio controls preload="none" src="${esc(c.file)}"></audio>
        <p class="line">${esc(c.text)}</p>
      </article>`;
  const html = `<title>Lingo Voice Audition</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>
/* Layout: a casting sheet — one band per role, clips as audition cards, a sticky tally of picks. */
:root {
  --bg: #f5f3fb; --card: #ffffff; --ink: #1d1640; --mute: #5f5b85; --line: #e4e0f4;
  --owl: #5b3df5; --owl-soft: #ece8ff; --pick: #0f9d6b;
  --display: "Fredoka", "Baloo 2", system-ui, sans-serif; --body: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #12102a; --card: #1c1940; --ink: #f1efff; --mute: #aaa5d6; --line: #2e2a5c; --owl: #a594ff; --owl-soft: #2a2560; --pick: #3ddc9a; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #12102a; --card: #1c1940; --ink: #f1efff; --mute: #aaa5d6; --line: #2e2a5c; --owl: #a594ff; --owl-soft: #2a2560; --pick: #3ddc9a; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 16px/1.55 var(--body); }
.wrap { max-width: 1040px; margin: 0 auto; padding-block: 28px 120px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
h1 { font: 700 clamp(28px, 5vw, 40px)/1.1 var(--display); margin: 0; text-wrap: balance; }
.intro { max-width: 65ch; color: var(--mute); margin: 10px 0 0; }
.intro b { color: var(--ink); }
section { margin-top: 34px; }
h2 { font: 600 22px var(--display); margin: 0 0 12px; text-wrap: balance; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.clip { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.clip.on { border-color: var(--pick); box-shadow: 0 0 0 2px var(--pick) inset; }
.clip header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.clip h3 { font: 600 16px/1.3 var(--display); margin: 0; min-width: 0; }
.pick { flex: none; font: 700 13px var(--body); padding: 5px 12px; border-radius: 99px; border: 1.5px solid var(--owl); color: var(--owl); background: transparent; cursor: pointer; }
.pick[aria-pressed="true"] { background: var(--pick); border-color: var(--pick); color: var(--card); }
.pick:focus-visible { outline: 3px solid var(--owl); outline-offset: 2px; }
.meta { margin: 0; font-size: 13px; color: var(--mute); }
.line { margin: 0; font-size: 14px; color: var(--mute); white-space: pre-wrap; overflow-wrap: anywhere; }
audio { width: 100%; height: 38px; }
.tally { position: fixed; left: 0; right: 0; bottom: 0; background: var(--owl-soft); border-top: 1px solid var(--line);
  padding-block: 12px calc(12px + env(safe-area-inset-bottom, 0px)); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.tally-in { max-width: 1040px; margin: 0 auto; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.tally p { margin: 0; flex: 1; min-width: 0; font-size: 14px; }
.copy { font: 700 15px var(--body); padding: 10px 18px; border-radius: 12px; border: 0; background: var(--owl); color: var(--card); cursor: pointer; }
.copy:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
textarea { width: 100%; font: 13px/1.4 ui-monospace, Consolas, monospace; background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
</style>
<div class="wrap">
  <h1>🦉 Lingo voice audition</h1>
  <p class="intro">Every clip was made with Gemini 3.8 TTS, following its developer guide: the text is read exactly as written, each line gets its own style direction, and tags like a short pause add timing. <b>Pick one favourite in each section</b>, then press <b>Copy my choices</b> and paste the result into the chat. Use headphones or the classroom speakers if you can.</p>
  ${order.map((g) => `<section><h2>${esc(g.replace(/^\d+\.\s*/, ""))}</h2><div class="grid">${groups[g].map((c) => card(g, c)).join("")}</div></section>`).join("")}
</div>
<div class="tally"><div class="tally-in"><p id="tallyText">No picks yet.</p><button type="button" class="copy" id="copyBtn">Copy my choices</button></div>
<textarea id="copyFallback" rows="4" hidden aria-label="Your choices"></textarea></div>
<script>
(function () {
  var KEY = "lingo-audition-picks";
  var picks = {};
  try { picks = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { picks = {}; }
  var clips = Array.prototype.slice.call(document.querySelectorAll(".clip"));
  function render() {
    clips.forEach(function (c) {
      var on = picks[c.dataset.group] === c.dataset.label;
      c.classList.toggle("on", on);
      c.querySelector(".pick").setAttribute("aria-pressed", on ? "true" : "false");
      c.querySelector(".pick").textContent = on ? "Picked" : "Pick";
    });
    var keys = Object.keys(picks).sort();
    document.getElementById("tallyText").textContent = keys.length ? keys.length + " pick" + (keys.length > 1 ? "s" : "") + ": " + keys.map(function (k) { return picks[k]; }).join(" · ") : "No picks yet.";
  }
  clips.forEach(function (c) {
    c.querySelector(".pick").addEventListener("click", function () {
      var g = c.dataset.group;
      if (picks[g] === c.dataset.label) delete picks[g]; else picks[g] = c.dataset.label;
      try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) {}
      render();
    });
    c.querySelector("audio").addEventListener("play", function (ev) {
      document.querySelectorAll("audio").forEach(function (a) { if (a !== ev.target) a.pause(); });
    });
  });
  document.getElementById("copyBtn").addEventListener("click", function () {
    var text = "My voice picks:\\n" + Object.keys(picks).sort().map(function (k) { return "- " + k.replace(/^\\d+\\.\\s*/, "") + ": " + picks[k]; }).join("\\n");
    var ta = document.getElementById("copyFallback");
    function fallback() { ta.hidden = false; ta.value = text; ta.select(); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { document.getElementById("copyBtn").textContent = "Copied"; }, fallback);
    } else fallback();
  });
  render();
})();
</script>
`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
}

if (process.argv.includes("--page-only")) writePage();
else main().catch((e) => { console.error(e); process.exit(1); });

