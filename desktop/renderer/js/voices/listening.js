/* Vocab Master — listening voices for tests and read-aloud dictations.
 * Engines (studio/voice-cast.js): natural (Kokoro on this computer, free) · studio (Gemini, the teacher's key)
 * · computer (speechSynthesis). The teacher picks one in Settings or on the listening bar; studio falls back to
 * natural without a Gemini key, and anything that fails falls back to the computer voices so a lesson never stops.
 * Every spoken clip is kept in IndexedDB, so a track made at home plays at once in class (and offline).
 * Same player API as studio/tts.js: playScript / readDictation return { stop(), done }. */
import { prefs, savePrefs } from "../state.js";
import { getApiKey } from "../bridge.js";
import { castVoices, engineOf, naturalSpeed, spokenText, withPunctuation, clipKey, KOKORO_VOICES, GEMINI_VOICES } from "../../studio/voice-cast.js";
import { dialogueRequests, singleRequest, replyAudio, studioError, STUDIO_USD_PER_SECOND } from "../../studio/gemini-voice.js";
import { decodeWav, encodeWav, pcm16ToFloat, resample, trimSilence, level, pauseAfter, renderTrack, dictationTrack, dictationPause, RATE } from "../../studio/audio-track.js";
import { playScript as playComputer, readDictation as readComputer, RATE as COMPUTER_RATE } from "../../studio/tts.js";

const MODEL_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx";
export const NATURAL_DOWNLOAD_MB = 92;

/* ── Which engine ─────────────────────────────────────────────────── */
export const naturalSupported = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && typeof indexedDB !== "undefined";
export const studioAvailable = () => !!getApiKey("gemini");

/** The engine the teacher chose. */
export const chosenEngine = () => engineOf(prefs.listeningVoices);
export function setEngine(id) { prefs.listeningVoices = engineOf(id); savePrefs(); }

/** The engine that will actually speak (studio needs a Gemini key; natural needs WebAssembly). */
export function activeEngine(choice = chosenEngine()) {
  if (choice === "studio" && !studioAvailable()) return naturalSupported() ? "natural" : "computer";
  if (choice === "natural" && !naturalSupported()) return "computer";
  return choice;
}

/** Is the natural-voice model already on this computer? */
export async function naturalDownloaded() {
  if (naturalState.ready) return true;
  try { return !!(await (await caches.open("transformers-cache")).match(MODEL_URL)); } catch { return false; }
}

/* ── Clip cache (IndexedDB, 16-bit WAV) ───────────────────────────── */
const memory = new Map();
let dbPromise = null;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const r = indexedDB.open("vm-voices", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("clips");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}
async function readClip(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const d = await db();
    const row = await new Promise((res) => { const q = d.transaction("clips").objectStore("clips").get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
    if (!row?.wav) return null;
    const { samples } = decodeWav(row.wav);
    memory.set(key, samples);
    return samples;
  } catch { return null; }
}
let puts = 0;
async function storeClip(key, samples) {
  memory.set(key, samples);
  try {
    const d = await db();
    d.transaction("clips", "readwrite").objectStore("clips").put({ wav: encodeWav(samples), at: Date.now() }, key);
    if (++puts % 40 === 0) pruneClips(d);
  } catch { /* no storage: still plays from memory */ }
}
/** Keep the newest ~1,500 clips (about 150 MB at most). */
function pruneClips(d) {
  const rows = [];
  const tx = d.transaction("clips", "readwrite");
  const store = tx.objectStore("clips");
  store.openCursor().onsuccess = (e) => {
    const c = e.target.result;
    if (c) { rows.push([c.key, c.value.at || 0]); c.continue(); return; }
    if (rows.length <= 1500) return;
    rows.sort((a, b) => a[1] - b[1]).slice(0, rows.length - 1200).forEach(([k]) => store.delete(k));
  };
}

/* ── Natural voices (Kokoro in a worker) ──────────────────────────── */
const naturalState = { worker: null, ready: false, loading: null, progress: 0, pending: new Map(), seq: 0, listeners: new Set() };
function naturalWorker() {
  if (naturalState.worker) return naturalState.worker;
  const w = new Worker(new URL("./kokoro-worker.js", import.meta.url), { type: "module" });
  w.onmessage = ({ data }) => {
    if (data.type === "progress") {
      naturalState.progress = data.total ? data.loaded / data.total : 0;
      naturalState.listeners.forEach((fn) => fn(naturalState.progress));
    } else if (data.type === "ready") {
      naturalState.ready = true;
      naturalState.resolveLoad?.();
    } else if (data.type === "audio") {
      const p = naturalState.pending.get(data.id);
      naturalState.pending.delete(data.id);
      p?.resolve(resample(data.samples, data.rate || RATE));
    } else if (data.type === "error") {
      const err = new Error(friendlyNaturalError(data.message));
      if (data.id != null) { naturalState.pending.get(data.id)?.reject(err); naturalState.pending.delete(data.id); return; }
      naturalState.rejectLoad?.(err);
      resetNatural(err);
    }
  };
  w.onerror = (e) => resetNatural(new Error(friendlyNaturalError(e.message || "The natural voices could not start.")));
  naturalState.worker = w;
  return w;
}
function resetNatural(err) {
  naturalState.pending.forEach((p) => p.reject(err));
  naturalState.pending.clear();
  try { naturalState.worker?.terminate(); } catch { /* ignore */ }
  Object.assign(naturalState, { worker: null, ready: false, loading: null });
}
function friendlyNaturalError(msg = "") {
  if (/fetch|network|Failed to load|ERR_|404|CORS/i.test(msg)) return "The natural voices could not be downloaded — check the internet connection (they need it once).";
  return `The natural voices could not start (${String(msg).slice(0, 120)}).`;
}

/** Load (and, the first time, download) the natural voices. onProgress(0..1) while downloading. */
export function prepareNatural(onProgress) {
  if (onProgress) naturalState.listeners.add(onProgress);
  const cleanup = () => onProgress && naturalState.listeners.delete(onProgress);
  if (naturalState.ready) { cleanup(); return Promise.resolve(); }
  naturalState.loading ||= new Promise((resolve, reject) => {
    naturalState.resolveLoad = resolve;
    naturalState.rejectLoad = reject;
    naturalWorker().postMessage({ type: "load" });
  });
  return naturalState.loading.finally(cleanup);
}

function naturalSpeak(text, voice, speed) {
  const id = ++naturalState.seq;
  return new Promise((resolve, reject) => {
    naturalState.pending.set(id, { resolve, reject });
    naturalWorker().postMessage({ type: "speak", id, text, voice, speed });
  });
}

/* ── Studio voices (Gemini) ───────────────────────────────────────── */
let studioRunning = 0;
const studioQueue = [];
async function studioSlot(fn) {
  if (studioRunning >= 2) await new Promise((r) => studioQueue.push(r));
  studioRunning++;
  try { return await fn(); } finally { studioRunning--; studioQueue.shift()?.(); }
}
function studioFetch(body) {
  return studioSlot(async () => {
    const key = getApiKey("gemini");
    if (!key) throw new Error("Add a Gemini key in Settings to use the studio voices.");
    const res = await fetch("/gemini/v1beta/interactions", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(studioError(res.status, text)), { status: res.status });
    let b64 = "";
    try { b64 = replyAudio(JSON.parse(text)); } catch { /* not JSON */ }
    if (!b64) throw new Error("Gemini sent no audio — try again.");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bin.startsWith("RIFF")) { const { samples, rate } = decodeWav(bytes); return resample(samples, rate); }
    return pcm16ToFloat(bytes);
  });
}

/** Rough studio cost for some text (≈13 characters a second of speech). */
export const studioCostFor = (chars) => (chars / 13) * STUDIO_USD_PER_SECOND;

/* ── Segments: what gets spoken, cached clip by clip ──────────────── */
/** A script as speakable segments: one per line (natural) or one per run of ≤2 speakers (studio). */
export function scriptSegments(lines, engine, levelId = "") {
  const spoken = lines.map((l) => ({ speaker: l.speaker || "Narrator", text: spokenText(l.text) })).filter((l) => l.text);
  const cast = castVoices(spoken.map((l) => l.speaker), engine);
  if (engine === "studio") {
    return dialogueRequests(spoken, cast, { levelId }).map((r) => ({
      ...spoken[r.lines.at(-1)],
      lines: r.lines,
      key: clipKey("studio", r.body.generation_config.speech_config.speakers?.map((s) => s.voice).join("+") || r.body.generation_config.speech_config[0].voice, 1, JSON.stringify(r.body.input)),
      make: () => studioFetch(r.body),
    }));
  }
  const speed = naturalSpeed(levelId);
  return spoken.map((l, i) => ({
    ...l,
    lines: [i],
    key: clipKey("natural", cast[l.speaker].voice, speed, l.text),
    make: () => naturalSpeak(l.text, cast[l.speaker].voice, speed),
  }));
}

/** Dictation segments: for each sentence a natural reading, then the slow reading(s). */
export function dictationSegments(sentences, engine, { repeats = 2, levelId = "", punctuation = false } = {}) {
  const out = [];
  const reader = engine === "studio" ? GEMINI_VOICES.reader : KOKORO_VOICES.reader;
  sentences.forEach((s, i) => {
    for (let r = 0; r < repeats; r++) {
      const slow = r > 0;
      const text = spokenText(slow && punctuation ? withPunctuation(s) : s);
      const speed = naturalSpeed(levelId, slow);
      out.push({
        index: i, slow, text,
        key: clipKey(engine, reader, engine === "studio" ? (slow ? 0.9 : 1) : speed, `${levelId}|${text}`),
        make: engine === "studio"
          ? () => studioFetch(singleRequest(text, reader, { levelId, slow }))
          : () => naturalSpeak(text, reader, speed),
      });
    }
  });
  return out;
}

/** The clip for a segment: memory → IndexedDB → the engine (then stored). */
const inflight = new Map();
export function segmentClip(seg) {
  if (inflight.has(seg.key)) return inflight.get(seg.key);
  const p = (async () => {
    const cached = await readClip(seg.key);
    if (cached) return cached;
    const samples = trimSilence(await seg.make());
    await storeClip(seg.key, samples);
    return samples;
  })().finally(() => inflight.delete(seg.key));
  inflight.set(seg.key, p);
  return p;
}
/** Are all of a script's clips already made? */
export async function segmentsReady(segs) {
  for (const s of segs) if (!memory.has(s.key) && !(await readClip(s.key))) return false;
  return true;
}

/* ── Playing ─────────────────────────────────────────────────────── */
function controller() {
  const ctl = { stopped: false, timers: [], sources: [], ctx: null };
  ctl.stop = () => {
    ctl.stopped = true;
    ctl.timers.forEach(clearTimeout);
    ctl.sources.forEach((s) => { try { s.stop(); } catch { /* ended */ } });
    ctl.wake?.();
    try { ctl.ctx?.close(); } catch { /* ignore */ }
    ctl.inner?.stop();
  };
  return ctl;
}
const pause = (ms, ctl) => new Promise((r) => { const t = setTimeout(r, ms); ctl.timers.push(t); ctl.wake = r; });
function playSamples(samples, ctl) {
  if (ctl.stopped) return Promise.resolve();
  ctl.ctx ||= new AudioContext();
  const buf = ctl.ctx.createBuffer(1, samples.length, RATE);
  buf.copyToChannel(level(samples), 0);
  const src = ctl.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctl.ctx.destination);
  ctl.sources.push(src);
  return new Promise((resolve) => { src.onended = resolve; ctl.wake = resolve; src.start(); });
}
/** Tell the UI how many clips are ready, as they finish. */
function trackReady(promises, status) {
  let done = 0;
  promises.forEach((p) => p.then(() => status?.(++done), () => {}));
}

/**
 * Play a listening script [{ speaker, text }] `plays` times.
 * opts: { plays, levelId, onLine(index, play), onEnd(), onStatus({ engine, phase: "download"|"prepare"|"play"|"fallback", progress, done, total, message }) }
 */
export function playScript(lines, opts = {}) {
  const { plays = 2, levelId = "", onLine, onEnd, onStatus } = opts;
  const ctl = controller();
  ctl.done = (async () => {
    let engine = activeEngine();
    const computer = (message) => {
      if (message) onStatus?.({ engine: "computer", phase: "fallback", message });
      ctl.inner = playComputer(lines, { plays, rate: COMPUTER_RATE[levelId] || 0.9, onLine, onEnd: () => {} });
      return ctl.inner.done;
    };
    try {
      if (engine === "computer") { onStatus?.({ engine, phase: "play" }); await computer(); return; }
      let segs = scriptSegments(lines, engine, levelId);
      if (engine === "natural" && !(await segmentsReady(segs))) {
        if (!(await naturalDownloaded())) onStatus?.({ engine, phase: "download", progress: 0 });
        await prepareNatural((p) => onStatus?.({ engine, phase: "download", progress: p }));
      }
      if (ctl.stopped) return;
      let clips = segs.map(segmentClip);
      onStatus?.({ engine, phase: "prepare", done: 0, total: segs.length });
      try { await clips[0]; } catch (e) {
        if (engine !== "studio" || !naturalSupported()) throw e;
        // Studio failed (quota, key, network): the free voices take over.
        onStatus?.({ engine: "natural", phase: "fallback", message: e.message });
        engine = "natural";
        await prepareNatural((p) => onStatus?.({ engine, phase: "download", progress: p }));
        segs = scriptSegments(lines, engine, levelId);
        clips = segs.map(segmentClip);
      }
      trackReady(clips, (done) => { if (done < segs.length) onStatus?.({ engine, phase: "prepare", done, total: segs.length }); });
      for (let p = 0; p < plays && !ctl.stopped; p++) {
        for (let i = 0; i < segs.length && !ctl.stopped; i++) {
          const samples = await clips[i];
          if (ctl.stopped) break;
          onStatus?.({ engine, phase: "play" });
          onLine?.(segs[i].lines[0], p);
          await playSamples(samples, ctl);
          if (!ctl.stopped && segs[i + 1]) await pause(pauseAfter(segs[i], segs[i + 1]) * 1000, ctl);
        }
        if (p < plays - 1 && !ctl.stopped) await pause(4000, ctl);
      }
    } catch (e) {
      if (!ctl.stopped) await computer(`${e.message} The computer voices read it instead.`);
    } finally {
      try { ctl.ctx?.close(); } catch { /* ignore */ }
      onLine?.(-1, -1);
      onEnd?.();
    }
  })();
  return ctl;
}

/**
 * Read-aloud dictation: each sentence once at a natural pace, then slowly (repeats − 1 times),
 * with a writing pause that grows with its length. Same options as studio/tts.js readDictation + levelId.
 */
export function readDictation(sentences, opts = {}) {
  const { repeats = 2, levelId = "", punctuation = false, onLine, onEnd, onStatus } = opts;
  const ctl = controller();
  ctl.done = (async () => {
    let engine = activeEngine();
    const computer = (message) => {
      if (message) onStatus?.({ engine: "computer", phase: "fallback", message });
      ctl.inner = readComputer(sentences, { repeats, rate: COMPUTER_RATE[levelId] || 0.85, punctuation, onLine, onEnd: () => {} });
      return ctl.inner.done;
    };
    try {
      if (engine === "computer") { await computer(); return; }
      let segs = dictationSegments(sentences, engine, { repeats, levelId, punctuation });
      if (engine === "natural" && !(await segmentsReady(segs))) await prepareNatural((p) => onStatus?.({ engine, phase: "download", progress: p }));
      let clips = segs.map(segmentClip);
      onStatus?.({ engine, phase: "prepare", done: 0, total: segs.length });
      try { await clips[0]; } catch (e) {
        if (engine !== "studio" || !naturalSupported()) throw e;
        onStatus?.({ engine: "natural", phase: "fallback", message: e.message });
        engine = "natural";
        await prepareNatural((p) => onStatus?.({ engine, phase: "download", progress: p }));
        segs = dictationSegments(sentences, engine, { repeats, levelId, punctuation });
        clips = segs.map(segmentClip);
      }
      trackReady(clips, (done) => { if (done < segs.length) onStatus?.({ engine, phase: "prepare", done, total: segs.length }); });
      for (let i = 0; i < segs.length && !ctl.stopped; i++) {
        const samples = await clips[i];
        if (ctl.stopped) break;
        onStatus?.({ engine, phase: "play" });
        onLine?.(segs[i].index);
        await playSamples(samples, ctl);
        if (!ctl.stopped) await pause(dictationPause(segs[i]) * 1000, ctl); // the same timing as the audio file
      }
    } catch (e) {
      if (!ctl.stopped) await computer(`${e.message} The computer voices read it instead.`);
    } finally {
      try { ctl.ctx?.close(); } catch { /* ignore */ }
      onLine?.(-1);
      onEnd?.();
    }
  })();
  return ctl;
}

/* ── Audio files ─────────────────────────────────────────────────── */
/**
 * The whole listening as a WAV (played `plays` times, 4 s apart). The computer voices can't be recorded,
 * so a download always uses natural or studio voices. onStatus as in playScript.
 */
export async function scriptWav(lines, { plays = 2, levelId = "", onStatus } = {}) {
  const engine = activeEngine() === "studio" ? "studio" : "natural";
  if (engine === "natural") await prepareNatural((p) => onStatus?.({ engine, phase: "download", progress: p }));
  const segs = scriptSegments(lines, engine, levelId);
  let done = 0;
  onStatus?.({ engine, phase: "prepare", done, total: segs.length });
  const clips = await Promise.all(segs.map((s) => segmentClip(s).then((c) => { onStatus?.({ engine, phase: "prepare", done: ++done, total: segs.length }); return c; })));
  const track = renderTrack(segs, clips, { plays });
  return { blob: new Blob([encodeWav(track.samples, track.rate)], { type: "audio/wav" }), seconds: track.layout.seconds, engine };
}

/**
 * A read-aloud dictation as a WAV, read exactly as "Read it aloud" does (each sentence, then slowly, with time to
 * write). Natural or studio voices (the computer voices can't be recorded). onStatus as in readDictation.
 */
export async function dictationWav(sentences, { repeats = 2, levelId = "", punctuation = false, onStatus } = {}) {
  const engine = activeEngine() === "studio" ? "studio" : "natural";
  if (engine === "natural") await prepareNatural((p) => onStatus?.({ engine, phase: "download", progress: p }));
  const segs = dictationSegments(sentences, engine, { repeats, levelId, punctuation });
  let done = 0;
  onStatus?.({ engine, phase: "prepare", done, total: segs.length });
  const clips = await Promise.all(segs.map((s) => segmentClip(s).then((c) => { onStatus?.({ engine, phase: "prepare", done: ++done, total: segs.length }); return c; })));
  const track = dictationTrack(segs, clips);
  return { blob: new Blob([encodeWav(track.samples, track.rate)], { type: "audio/wav" }), seconds: track.seconds, engine };
}

/** Make a script's clips in the background (natural voices only, and only once they are downloaded). */
export async function warmScripts(scripts, levelId = "") {
  if (activeEngine() !== "natural" || !(await naturalDownloaded())) return;
  for (const lines of scripts) {
    for (const seg of scriptSegments(lines, "natural", levelId)) await segmentClip(seg).catch(() => {});
  }
}

/** A short sample in the chosen voices (Settings → Hear a sample). */
export function playSample(opts = {}) {
  return playScript([
    { speaker: "Mia", text: "Hi, Tom! Did you see the volcano film in class today?" },
    { speaker: "Tom", text: "Yes, I did! The hot lava came down the mountain. It was amazing." },
  ], { plays: 1, levelId: "B_SENIOR", ...opts });
}
