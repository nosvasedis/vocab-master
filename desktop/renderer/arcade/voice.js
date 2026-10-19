/* Studio voice player — plays recorded Gemini TTS clips (assets/audio, later per-unit packs).
   Plugs into the lesson narrator (setClipPlayer) and the arcade's speak() (setSpeakDelegate),
   so every game and lesson uses the recorded voice when a clip exists and the system voice otherwise. */
import { createVoiceIndex } from "./voice-index.js";
import { setSpeakDelegate, audioSettings, sharedContext, setVoiceActive } from "./audio.js";
import { setClipPlayer } from "../lesson/narrator.js";

const BASE = "./assets/audio/";
let index = createVoiceIndex(null);
let ctx = null;
let gain = null;
let analyser = null;
let current = null; // { src, resolve }
const cache = new Map(); // key → AudioBuffer (small LRU)
const MAX_CACHE = 160;

function audioCtx() {
  // The app's one AudioContext (audio.js); effects dip while the voice talks.
  const c = sharedContext();
  if (!c) return null;
  if (ctx !== c) {
    ctx = c;
    gain = ctx.createGain();
    gain.gain.value = 1;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    gain.connect(analyser);
    analyser.connect(ctx.destination);
  }
  return ctx;
}

/* Clip bytes: bundled file → offline cache → R2 (then cached). Installers ship without clips. */
let remoteBase = "";
const CACHE_NAME = "vm-voice-v1";
async function clipBytes(f) {
  try { const res = await fetch(BASE + f); if (res.ok) return await res.arrayBuffer(); } catch { /* not bundled */ }
  if (!remoteBase) return null;
  const url = remoteBase + f;
  let store = null;
  try { store = await caches.open(CACHE_NAME); const hit = await store.match(url); if (hit) return await hit.arrayBuffer(); } catch { store = null; }
  const res = await fetch(url);
  if (!res.ok) return null;
  try { await store?.put(url, res.clone()); } catch { /* cache full or unavailable */ }
  return await res.arrayBuffer();
}

/** Download every clip for offline use. onProgress(done, total). Returns { done, total, failed }. */
export async function downloadAllForOffline(onProgress) {
  const files = [...new Set(Object.values(manifestEntries).map((e) => e.f))];
  let done = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < files.length) {
      const f = files[i++];
      try { if (!(await clipBytes(f))) failed++; } catch { failed++; }
      onProgress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { done, total: files.length, failed };
}

/** How many clips are already stored for offline use (bundled clips count as available). */
export async function offlineStatus() {
  const total = new Set(Object.values(manifestEntries).map((e) => e.f)).size;
  try { const store = await caches.open(CACHE_NAME); return { cached: (await store.keys()).length, total }; } catch { return { cached: 0, total }; }
}

let manifestEntries = {};

async function buffer(key) {
  if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return b; }
  const entry = index.get(key);
  if (!entry) return null;
  const c = audioCtx();
  if (!c) return null;
  const bytes = await clipBytes(entry.f);
  if (!bytes) return null;
  const buf = await c.decodeAudioData(bytes);
  cache.set(key, buf);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return buf;
}

export function stopVoice() {
  if (current) {
    try { current.src.stop(); } catch { /* already stopped */ }
    current.resolve({ played: false });
    current = null;
    setVoiceActive(false);
  }
}

/** Play a clip. Resolves { played, duration } when it ends (played:false if missing or interrupted). */
export async function playClip(key, { onLevel, onStart } = {}) {
  stopVoice();
  let buf;
  try { buf = await buffer(key); } catch { buf = null; }
  if (!buf) return { played: false };
  const c = audioCtx();
  return new Promise((resolve) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    const me = { src, resolve };
    current = me;
    let raf = 0;
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (current !== me) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 4));
      raf = requestAnimationFrame(tick);
    };
    src.onended = () => {
      cancelAnimationFrame(raf);
      onLevel?.(0);
      if (current === me) { current = null; setVoiceActive(false); resolve({ played: true, duration: buf.duration }); }
    };
    src.start();
    setVoiceActive(true);
    onStart?.(buf.duration);
    if (onLevel) tick();
  });
}

export function preload(keys) { keys.filter((k) => index.has(k)).slice(0, 40).forEach((k) => buffer(k).catch(() => {})); }
export const hasClip = (key) => index.has(key);
/** Is there a recorded clip for this exact text? (Lets a game stay silent rather than use the system voice.) */
export const hasVoiceFor = (text) => !!index.keyForText(text);
export const clipCount = () => index.size;

/** Load the manifest and wire the recorded voice into lessons and games. Safe to call when no audio exists. */
export async function initVoice() {
  // Bundled manifest first, then the published one (newer narration arrives without an app update).
  let manifest = { entries: {}, text: {} };
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" });
    if (res.ok) manifest = await res.json();
  } catch { /* no bundled manifest */ }
  try {
    const remote = await fetch("./assets/remote.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {}));
    remoteBase = remote.audioBase || "";
    if (remoteBase) {
      const res = await fetch(`${remoteBase}manifest.json`, { cache: "no-cache" });
      if (res.ok) {
        const m = await res.json();
        // Bundled entries win: an older remote manifest must never point a line at a superseded take.
        // R2 only adds lines this build doesn't ship.
        manifest = { ...manifest, entries: { ...m.entries, ...manifest.entries }, text: { ...m.text, ...manifest.text } };
      }
    }
  } catch { /* offline: bundled/cached clips still play */ }
  manifestEntries = manifest.entries || {};
  index = createVoiceIndex(manifest);
  setClipPlayer({ has: hasClip, playClip, stop: stopVoice });
  // speak() already stays silent when the voice is off (unless a line is forced), so a forced line
  // must still find its recording here — never the browser voice when a clip exists.
  setSpeakDelegate((text) => {
    const key = index.keyForText(text);
    if (!key) return false;
    playClip(key);
    return true;
  }, stopVoice);
  return index.size;
}
