/* Vocab Master — listening tracks from spoken clips (pure; works in the browser and in Node tests).
 * A clip is { samples: Float32Array, rate }. A track is the clips in order with natural pauses,
 * played once or twice with a longer pause between, levelled to one loudness and saved as 16-bit WAV. */

export const RATE = 24000; // Kokoro and Gemini both speak at 24 kHz

/** Float32 mono → 16-bit PCM WAV bytes. */
export function encodeWav(samples, rate = RATE) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** 16-bit PCM WAV (mono or stereo) → { samples: Float32Array (mono), rate }. */
export function decodeWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
  let rate = RATE, channels = 1, bits = 16, off = 12;
  while (off + 8 <= u8.length) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === "fmt ") { channels = v.getUint16(off + 10, true); rate = v.getUint32(off + 12, true); bits = v.getUint16(off + 22, true); }
    if (id === "data") {
      if (bits !== 16) throw new Error(`Unsupported WAV (${bits}-bit)`);
      const len = Math.min(size, u8.length - off - 8);
      const frames = Math.floor(len / (2 * channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += v.getInt16(off + 8 + (i * channels + c) * 2, true);
        out[i] = sum / channels / 0x8000;
      }
      return { samples: out, rate };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data");
}

/** Raw little-endian 16-bit PCM (what Gemini sends without a header) → Float32. */
export function pcm16ToFloat(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out = new Float32Array(Math.floor(u8.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = v.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Linear resample (only used if an engine ever answers at another rate). */
export function resample(samples, from, to = RATE) {
  if (from === to) return samples;
  const out = new Float32Array(Math.round(samples.length * to / from));
  const k = from / to;
  for (let i = 0; i < out.length; i++) {
    const x = i * k, j = Math.floor(x), f = x - j;
    out[i] = (samples[j] || 0) * (1 - f) + (samples[j + 1] || 0) * f;
  }
  return out;
}

/** Cut leading / trailing near-silence (keeps a short tail so words don't clip). */
export function trimSilence(samples, rate = RATE, threshold = 0.006) {
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  const pad = Math.round(rate * 0.04);
  return samples.subarray(Math.max(0, a - pad), Math.min(samples.length, b + pad * 3));
}

/** Level a clip to a target loudness (RMS of the speech), never past a safe peak. */
export function level(samples, targetRms = 0.1, maxPeak = 0.92) {
  let sum = 0, n = 0, peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    if (a > 0.01) { sum += a * a; n++; }
  }
  if (!n || !peak) return samples;
  const gain = Math.min(targetRms / Math.sqrt(sum / n), maxPeak / peak, 8);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/** Pause after a line: longer after a question and at a change of speaker, never rushed. */
export function pauseAfter(line, next) {
  if (!next) return 0;
  const q = /\?\s*$/.test(line.text || "");
  const turn = (line.speaker || "") !== (next.speaker || "");
  return (turn ? 0.55 : 0.35) + (q ? 0.2 : 0);
}

/**
 * The track layout: [{ kind: "line", index, play, at, dur } | { kind: "gap", at, dur }], in seconds.
 * clipSeconds[i] = length of line i. plays = 1 or 2; betweenPlays = silence between the plays.
 */
export function trackLayout(lines, clipSeconds, { plays = 2, betweenPlays = 4, lead = 0.6, tail = 0.8 } = {}) {
  const out = [];
  let t = lead;
  for (let p = 0; p < plays; p++) {
    lines.forEach((line, i) => {
      out.push({ kind: "line", index: i, play: p, at: t, dur: clipSeconds[i] });
      t += clipSeconds[i] + pauseAfter(line, lines[i + 1]);
    });
    if (p < plays - 1) t += betweenPlays;
  }
  return { parts: out, seconds: t + tail };
}

/** Mix the clips into one Float32 track following trackLayout. clips[i] = Float32Array at `rate`. */
export function renderTrack(lines, clips, opts = {}) {
  const rate = opts.rate || RATE;
  const leveled = clips.map((c) => level(c));
  const layout = trackLayout(lines, leveled.map((c) => c.length / rate), opts);
  const out = new Float32Array(Math.ceil(layout.seconds * rate));
  for (const part of layout.parts) {
    const at = Math.round(part.at * rate);
    out.set(leveled[part.index].subarray(0, out.length - at), at);
  }
  return { samples: out, rate, layout };
}

/** "Track 1 · Listen and tick the picture.wav" → a safe file name. */
export const audioFileName = (title) => `${String(title || "Listening").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90)}.wav`;
