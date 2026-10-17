/* Studio voice player — plays recorded Gemini TTS clips (assets/audio, later per-unit packs).
   Plugs into the lesson narrator (setClipPlayer) and the arcade's speak() (setSpeakDelegate),
   so every game and lesson uses the recorded voice when a clip exists and the system voice otherwise. */
import { createVoiceIndex } from "./voice-index.js";
import { setSpeakDelegate, audioSettings } from "./audio.js";
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
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    gain = ctx.createGain();
    gain.gain.value = 1;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    gain.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

async function buffer(key) {
  if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return b; }
  const entry = index.get(key);
  if (!entry) return null;
  const c = audioCtx();
  if (!c) return null;
  const res = await fetch(BASE + entry.f);
  if (!res.ok) return null;
  const buf = await c.decodeAudioData(await res.arrayBuffer());
  cache.set(key, buf);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return buf;
}

export function stopVoice() {
  if (current) {
    try { current.src.stop(); } catch { /* already stopped */ }
    current.resolve({ played: false });
    current = null;
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
      if (current === me) { current = null; resolve({ played: true, duration: buf.duration }); }
    };
    src.start();
    onStart?.(buf.duration);
    if (onLevel) tick();
  });
}

export function preload(keys) { keys.filter((k) => index.has(k)).slice(0, 40).forEach((k) => buffer(k).catch(() => {})); }
export const hasClip = (key) => index.has(key);
export const clipCount = () => index.size;

/** Load the manifest and wire the recorded voice into lessons and games. Safe to call when no audio exists. */
export async function initVoice() {
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" });
    if (res.ok) index = createVoiceIndex(await res.json());
  } catch { /* no recorded voice yet */ }
  setClipPlayer({ has: hasClip, playClip, stop: stopVoice });
  setSpeakDelegate((text) => {
    if (!audioSettings.tts) return false;
    const key = index.keyForText(text);
    if (!key) return false;
    playClip(key);
    return true;
  }, stopVoice);
  return index.size;
}
