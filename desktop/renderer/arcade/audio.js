/* Vocab Master — sound engine (Web Audio, no files) and English text-to-speech.

   One AudioContext for the whole app (effects, Lingo Live music and the recorded voice).
   Sounds come from the recipes in sounds.js. After the first click or key press each recipe is
   rendered once, in idle time, into an AudioBuffer; from then on a sound is a single buffer
   source, which keeps weak classroom PCs glitch-free. Until a buffer is ready the recipe plays live.

   Built to be gentle on any machine:
   - "light" quality (auto on 2-core / 2 GB machines, or chosen in Settings) renders at 22 kHz,
     skips the reverb and the compressor, and allows fewer overlapping sounds;
   - repeated sounds are rate-limited, overlapping sounds are capped (oldest stops first);
   - effects dip under the voice so narration stays clear;
   - the context sleeps after 30 s of silence or when the window is hidden, and wakes on the next sound. */
import { SOUNDS, kit, noiseBuffer } from "./sounds.js";

const settings = { sfx: true, tts: true, ui: true, volume: 0.8, quality: "auto" };
let ctx = null;
let master = null;
let buses = null; // { sfx, ui, music }
let compressor = null;
let unlocked = false;

const buffers = new Map();       // name → AudioBuffer
const lastPlayed = new Map();    // name → ms
const live = [];                 // active sources, oldest first
let lastSound = 0;               // ms of the last sound (for sleeping)
let lastClaim = 0;               // ms of the last non-generic sound (see claimed())
let voiceActive = 0;
let musicActive = false;
let renderQuality = "";          // quality the cached buffers were rendered at

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const hasWindow = typeof window !== "undefined";

export function configureAudio({ sfx, tts, ui, volume, quality } = {}) {
  if (typeof sfx === "boolean") settings.sfx = sfx;
  if (typeof tts === "boolean") settings.tts = tts;
  if (typeof ui === "boolean") settings.ui = ui;
  if (Number.isFinite(volume)) settings.volume = Math.min(1, Math.max(0, volume));
  if (["auto", "high", "light"].includes(quality) && quality !== settings.quality) {
    settings.quality = quality;
    if (ctx) rebuildGraph();
  }
  applyVolume();
}
export const audioSettings = settings;

/** "high" or "light" — what the engine is actually using. */
export function audioQuality() {
  if (settings.quality !== "auto") return settings.quality;
  if (!hasWindow) return "high";
  const nav = window.navigator || {};
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  if (cores <= 2 || mem <= 2 || nav.connection?.saveData) return "light";
  return slowRender ? "light" : "high";
}
let slowRender = false;

/* ── Context and graph ───────────────────────────────────────────── */
// Game sounds must carry across a classroom from the projector speakers; interface sounds stay in the background.
const BUS_GAIN = { sfx: 1.8, ui: 0.9, music: 1 };

function create() {
  if (ctx || !hasWindow) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C({ latencyHint: "interactive" });
  } catch {
    try { ctx = new C(); } catch { return null; }
  }
  master = ctx.createGain();
  buses = { sfx: ctx.createGain(), ui: ctx.createGain(), music: ctx.createGain() };
  for (const k in buses) buses[k].gain.value = BUS_GAIN[k];
  Object.values(buses).forEach((b) => b.connect(master));
  rebuildGraph();
  applyVolume();
  return ctx;
}

function rebuildGraph() {
  try { master.disconnect(); } catch { /* not connected */ }
  try { compressor?.disconnect(); } catch { /* ignore */ }
  compressor = null;
  if (audioQuality() === "high") {
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    master.connect(compressor);
    compressor.connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }
  if (renderQuality && renderQuality !== audioQuality()) { buffers.clear(); renderQuality = ""; if (unlocked) warmUp(); }
}

function applyVolume() {
  if (!master) return;
  const v = settings.volume;
  try { master.gain.setTargetAtTime(v * v * 0.95 + (v > 0 ? 0.05 * v : 0), ctx.currentTime, 0.02); } catch { master.gain.value = v * v; }
}

function wake() {
  const c = create();
  if (!c) return null;
  if (c.state === "suspended" || c.state === "interrupted") c.resume().catch(() => {});
  lastSound = now();
  return c;
}

/** The shared context (also used by the recorded voice). Created on demand; null without Web Audio. */
export function sharedContext() { return wake(); }

/** The output for the Lingo Live music, or null when sound effects are off. */
export function audioOut() {
  if (!settings.sfx || settings.volume <= 0) return null;
  const c = wake();
  return c ? { ctx: c, out: buses.music, quality: audioQuality(), noise: noiseBuffer(c) } : null;
}
/** Music tells the engine when it is playing, so the context doesn't sleep under it. */
export function setMusicActive(on) { musicActive = !!on; if (on) wake(); }

/** The recorded voice / system voice tells the engine when it is talking: effects dip underneath. */
export function setVoiceActive(on) {
  voiceActive = Math.max(0, voiceActive + (on ? 1 : -1));
  if (!buses) return;
  const target = BUS_GAIN.sfx * (voiceActive ? 0.5 : 1);
  try { buses.sfx.gain.setTargetAtTime(target, ctx.currentTime, voiceActive ? 0.03 : 0.25); } catch { /* ignore */ }
  if (on) wake();
}

/* ── Rendering ───────────────────────────────────────────────────── */
let irCache = null;
function impulse(c) {
  const sr = c.sampleRate;
  if (irCache?.sampleRate === sr) return irCache;
  const len = Math.floor(sr * 0.9);
  const ir = c.createBuffer(1, len, sr);
  const d = ir.getChannelData(0);
  let seed = 98765;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = seed / 0x3fffffff - 1;
    d[i] = n * (1 - i / len) ** 3.2 * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
  }
  irCache = ir;
  return ir;
}

async function render(name) {
  const def = SOUNDS[name];
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!def || !Off) return null;
  const q = audioQuality();
  const sr = q === "light" ? 22050 : Math.min(48000, ctx?.sampleRate || 44100);
  const wet = q === "light" ? 0 : def.wet || 0;
  const len = Math.ceil(sr * (def.dur + (wet ? 0.7 : 0.05)));
  const off = new Off(1, len, sr);
  const dry = off.createGain();
  dry.connect(off.destination);
  if (wet) {
    const conv = off.createConvolver();
    conv.buffer = impulse(off);
    const wg = off.createGain();
    wg.gain.value = wet;
    dry.connect(conv);
    conv.connect(wg);
    wg.connect(off.destination);
  }
  def.play(kit(off, dry, 0));
  const t = now();
  const buf = await new Promise((resolve, reject) => {
    off.oncomplete = (e) => resolve(e.renderedBuffer);
    const p = off.startRendering();
    if (p?.then) p.then(resolve, reject);
  });
  // A machine that needs > 150 ms for a short offline render (about 5 ms on a normal PC) is struggling: go light.
  if (settings.quality === "auto" && q === "high" && now() - t > 150 && def.dur < 1) slowRender = true;
  return buf;
}

let warming = null;
/** Render every sound in idle time, interface sounds first. Safe to call repeatedly. */
export function warmUp() {
  if (warming || !ctx) return warming;
  const names = Object.keys(SOUNDS).sort((a, b) => (SOUNDS[a].bus === "ui" ? 0 : 1) - (SOUNDS[b].bus === "ui" ? 0 : 1));
  // Busy pages (animations) rarely go idle, so the timeout is short. Building a render graph is cheap on the
  // main thread and the rendering itself runs on the audio thread, so a few render side by side.
  const idle = () => new Promise((r) => (window.requestIdleCallback ? window.requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 30)));
  const q = audioQuality();
  const batch = q === "light" ? 2 : 4;
  warming = (async () => {
    const todo = names.filter((n) => !buffers.has(n));
    while (todo.length && audioQuality() === q) {
      await idle();
      await Promise.all(todo.splice(0, batch).map((name) => render(name)
        .then((b) => { if (b && audioQuality() === q) buffers.set(name, b); })
        .catch(() => { /* plays live instead */ })));
    }
    warming = null;
    renderQuality = q;
    if (audioQuality() !== q) rebuildGraph();
  })();
  return warming;
}

function unlock() {
  if (unlocked) return;
  const c = wake();
  if (!c) return;
  unlocked = true;
  warmUp();
}
if (hasWindow && typeof document !== "undefined") {
  const opts = { capture: true, passive: true };
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, unlock, opts));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setTimeout(sleepIfIdle(0), 1500);
  });
  setInterval(sleepIfIdle(30000), 10000);
}
function sleepIfIdle(ms) {
  return () => {
    if (!ctx || ctx.state !== "running" || musicActive || voiceActive || live.length) return;
    if (ms && now() - lastSound < ms) return;
    if (!ms && !document.hidden) return;
    ctx.suspend().catch(() => {});
  };
}

/* ── Playback ────────────────────────────────────────────────────── */
/** Did a specific (non-generic) sound play in the last `ms`? Lets the generic click sound stay quiet. */
export function claimed(ms = 60) { return now() - lastClaim < ms; }

/**
 * Play a named sound from the palette. Options: gain (0–2), rate (playback speed), generic (true for the
 * catch-all click sound, which never claims). Returns true when it played.
 */
export function play(name, { gain = 1, rate = 1, generic = false } = {}) {
  const def = SOUNDS[name];
  if (!def || settings.volume <= 0) return false;
  if (def.bus === "ui" ? !settings.ui : !settings.sfx) return false;
  const t = now();
  if (t - (lastPlayed.get(name) || 0) < (def.gap || 30)) return false;
  const c = wake();
  if (!c) return false;
  lastPlayed.set(name, t);
  if (!generic) lastClaim = t;
  const light = audioQuality() === "light";
  const maxVoices = light ? 4 : 10;
  try {
    const out = c.createGain();
    out.gain.value = gain;
    out.connect(buses[def.bus] || buses.sfx);
    const buf = buffers.get(name);
    const cents = def.vary ? (Math.random() * 2 - 1) * def.vary : 0;
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * 2 ** (cents / 1200);
      src.connect(out);
      src.start();
      track(src, out, buf.duration / src.playbackRate.value);
    } else {
      // Not rendered yet (or no offline rendering): play the recipe live.
      def.play(kit(c, out, c.currentTime + 0.005));
      track(null, out, def.dur + 0.1);
      if (unlocked && !warming) warmUp();
    }
    while (live.length > maxVoices) cutVoice(live[0]);
  } catch { return false; }
  return true;
}

function track(src, out, seconds) {
  const v = { src, out, timer: 0 };
  v.timer = setTimeout(() => cutVoice(v, false), seconds * 1000 + 120);
  live.push(v);
}
function cutVoice(v, cut = true) {
  const i = live.indexOf(v);
  if (i >= 0) live.splice(i, 1);
  clearTimeout(v.timer);
  try {
    if (cut) {
      v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      setTimeout(() => { try { v.src?.stop(); v.out.disconnect(); } catch { /* done */ } }, 80);
    } else v.out.disconnect();
  } catch { /* already gone */ }
}

/** For the smoke test and debugging: how far warm-up got and what is playing. */
export function soundStats() {
  return { state: ctx?.state || "none", quality: audioQuality(), rendered: buffers.size, total: Object.keys(SOUNDS).length, playing: live.length, voice: voiceActive, music: musicActive };
}

/** Interface sounds for the app shell (Settings → "Interface sounds"). */
export const ui = new Proxy({}, { get: (_, name) => (opts) => play(String(name), opts) });

/** Game and lesson effects (Settings / toolbar → "Sound effects"). */
export const sfx = {
  tap: () => play("tap"),
  hover: () => play("hover"),
  flip: () => play("flip"),
  pop: () => play("pop"),
  wordPop: () => play("wordPop"),
  correct: () => play("correct"),
  wrong: () => play("wrong"),
  match: () => play("match"),
  tick: () => play("tick"),
  urgent: () => play("urgent"),
  whoosh: () => play("whoosh"),
  back: () => play("back"),
  buzzer: () => play("buzzer"),
  win: () => play("win"),
  points: () => play("points"),
  pointsDown: () => play("pointsDown"),
  star: () => play("star"),
  enter: () => play("enter"),
  exit: () => play("exit"),
};

/* ── Text-to-speech (system voice) ───────────────────────────────── */
let voice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const score = (v) => (/en[-_]GB/i.test(v.lang) ? 4 : /en[-_](US|AU|IE)/i.test(v.lang) ? 3 : /^en/i.test(v.lang) ? 2 : 0)
    + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|microsoft/i.test(v.name) ? 1 : 0);
  return voices.filter((v) => score(v) > 1).sort((a, b) => score(b) - score(a))[0] || null;
}
if (hasWindow && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

/* Recorded studio voice (voice.js) gets the first chance to say a line. */
let delegate = null;
let delegateStop = null;
export function setSpeakDelegate(fn, stop) { delegate = fn; delegateStop = stop; }

/** Duck the effects while a system-voice utterance is talking. */
function ducked(u) {
  let on = true;
  setVoiceActive(true);
  const off = () => { if (on) { on = false; setVoiceActive(false); } };
  u.addEventListener?.("end", off);
  u.addEventListener?.("error", off);
  setTimeout(off, 20000);
  return off;
}

export function speak(text, { force = false, rate = 0.92 } = {}) {
  if (!force && !settings.tts) return;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  if (delegate && delegate(String(text || ""))) return;
  delegateStop?.();
  if (!("speechSynthesis" in window)) return;
  const clean = String(text || "").replace(/_{2,}/g, " blank ").replace(/\s+/g, " ").trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    voice = voice || pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-GB";
    u.rate = rate;
    ducked(u);
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable */ }
}

/**
 * Speak and resolve when finished (or interrupted). onWord(charIndex) fires on word boundaries
 * where the voice supports them — used for karaoke highlighting in lessons.
 */
export function speakAsync(text, { force = false, rate = 0.92, pitch = 1, onWord } = {}) {
  return new Promise((resolve) => {
    if ((!force && !settings.tts) || !("speechSynthesis" in window)) return resolve({ spoken: false });
    const clean = String(text || "").replace(/_{2,}/g, " blank ").replace(/\s+/g, " ").trim();
    if (!clean) return resolve({ spoken: false });
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      voice = voice || pickVoice();
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-GB";
      u.rate = rate;
      u.pitch = pitch;
      const undock = ducked(u);
      let done = false;
      const finish = (spoken) => { if (!done) { done = true; undock(); resolve({ spoken }); } };
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      if (onWord) u.onboundary = (e) => { if (e.name === "word" || e.name === undefined) onWord(e.charIndex); };
      // Some engines never fire onend; resolve after a generous estimate.
      setTimeout(() => finish(true), 1500 + clean.length * 110 / rate);
      window.speechSynthesis.speak(u);
    } catch { resolve({ spoken: false }); }
  });
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  delegateStop?.();
}
