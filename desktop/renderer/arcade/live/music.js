/* Lingo Live — synthesized soundtrack (Web Audio, no files): lobby groove, a "thinking" theme for questions,
   gong, drumroll and fanfare. Silent whenever sound effects are switched off.
   The question theme is a game-show style loop that builds while the clock runs: bass and kick first, then a
   marimba arpeggio, then claps and a hook, and in the last seconds a hurry layer with a rising whoosh. A filter
   opens as time passes, and each question gets its own key and groove so a quiz never sounds like one long loop. */
import { audioOut, setMusicActive } from "../audio.js";

let bus = null;        // { ctx, gain, filter }
let timer = null;      // scheduler interval
let tension = 0;       // 0 normal, 1 hurry (last seconds)
let buildup = 0;       // 0 → 1 across the question's time
let variant = 0;       // which key / groove the question theme uses

function getBus() {
  const a = audioOut();
  if (!a) return null;
  if (!bus || bus.ctx !== a.ctx) {
    const gain = a.ctx.createGain();
    gain.gain.value = 0.0001;
    const filter = a.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    filter.Q.value = 0.7;
    gain.connect(filter);
    filter.connect(a.out);
    bus = { ctx: a.ctx, gain, filter };
  }
  bus.noise = a.noise;
  bus.light = a.quality === "light";
  return bus;
}

function note(b, freq, t, { dur = 0.12, type = "triangle", gain = 0.12, slide = 0 } = {}) {
  const o = b.ctx.createOscillator();
  const g = b.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(b.gain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A wooden mallet (marimba-ish): sine body plus a quick 4th-harmonic click. */
function mallet(b, freq, t, gain = 0.07, dur = 0.22) {
  note(b, freq, t, { dur, type: "sine", gain });
  if (!b.light) note(b, freq * 4, t, { dur: 0.03, type: "sine", gain: gain * 0.35 });
}

/** A punchy kick: a sine that drops in pitch. */
function kick(b, t, gain = 0.32) {
  const o = b.ctx.createOscillator();
  const g = b.ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g);
  g.connect(b.gain);
  o.start(t);
  o.stop(t + 0.22);
}

function noiseHit(b, t, { gain = 0.05, dur = 0.04, type = "highpass", freq = 6000, q = 0.7 } = {}) {
  // One shared noise buffer (audio.js), a random slice per hit.
  if (!b.noise) return;
  const src = b.ctx.createBufferSource();
  src.buffer = b.noise;
  const f = b.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(b.gain);
  src.start(t, Math.random() * (b.noise.duration - dur - 0.05), dur + 0.02);
}
function hat(b, t, gain = 0.05, dur = 0.04) {
  if (b.light && gain < 0.04) return; // light quality keeps only the strong hats
  noiseHit(b, t, { gain, dur });
}
const clap = (b, t, gain = 0.09) => { noiseHit(b, t, { gain, dur: 0.13, type: "bandpass", freq: 1500, q: 0.9 }); if (!b.light) noiseHit(b, t + 0.012, { gain: gain * 0.6, dur: 0.1, type: "bandpass", freq: 2200, q: 1.2 }); };

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/* Question themes: 4-bar progressions (bass root, chord as semitones above it) and a 2-bar hook (scale steps).
   All original; minor keys with a bright lift, like a game show's "thinking" music. */
const THEMES = [
  { bpm: 120, roots: [45, 41, 48, 43], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], hook: [12, null, 15, 14, 12, null, 10, null, 12, null, 7, null, 10, 12, null, null] },
  { bpm: 126, roots: [50, 46, 41, 48], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], hook: [7, null, 10, null, 12, 10, 7, null, 5, null, 7, null, 3, null, 5, null] },
  { bpm: 116, roots: [40, 48, 43, 50], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], hook: [12, 11, 12, null, 15, null, 12, null, 19, null, 17, 15, 12, null, null, null] },
  { bpm: 122, roots: [43, 39, 46, 41], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], hook: [7, null, 7, 10, null, 12, null, 10, 7, null, 5, null, 7, null, null, null] },
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 1]; // index into chord tones (3 = octave)
const BASS_STEPS = new Set([0, 3, 6, 8, 11, 14]);           // syncopated groove

/* Patterns are 16 steps per bar. */
const SONGS = {
  // Bright, bouncy lobby loop: C – Am – F – G.
  lobby: {
    bpm: 104,
    bars: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]],
    step(b, t, s, bar) {
      const chord = this.bars[bar % 4];
      if (s % 4 === 0) note(b, hz(chord[0] - 12), t, { dur: 0.22, type: "sine", gain: 0.2 });
      if (s % 4 === 2) note(b, hz(chord[0]), t, { dur: 0.1, type: "triangle", gain: 0.07 });
      if (s === 4 || s === 12) chord.forEach((m) => note(b, hz(m + 12), t, { dur: 0.16, type: "triangle", gain: 0.045 }));
      if (!b.light && [0, 3, 6, 10, 13].includes(s)) note(b, hz(chord[(s >> 1) % 3] + 24), t, { dur: 0.09, type: "square", gain: 0.018 });
      if (s % 2 === 0) hat(b, t, s % 4 === 2 ? 0.05 : 0.025);
    },
  },
  // The thinking theme: layers join as the clock runs (see the header).
  question: {
    get bpm() { return THEMES[variant % THEMES.length].bpm; },
    step(b, t, s, bar) {
      const th = THEMES[variant % THEMES.length];
      const i = bar % 4;
      const root = th.roots[i];
      const tones = [...th.chords[i], 12];
      const level = tension ? 3 : buildup >= 0.55 ? 2 : buildup >= 0.2 ? 1 : 0;
      // Layer 0 — groove: kick, syncopated bass, soft hats.
      if (s === 0 || s === 8 || (level >= 2 && s === 10)) kick(b, t, level >= 2 ? 0.34 : 0.28);
      if (BASS_STEPS.has(s)) note(b, hz(root - 12 + (s === 14 ? 7 : 0)), t, { dur: 0.16, type: "triangle", gain: 0.16 });
      if (s % 2 === 0) hat(b, t, s % 4 === 2 ? 0.045 : 0.022);
      // Layer 1 — marimba arpeggio on every 16th (8ths on light machines).
      if (level >= 1 && (!b.light || s % 2 === 0)) mallet(b, hz(root + 12 + tones[ARP[s]]), t, s % 4 === 0 ? 0.075 : 0.05);
      // Layer 2 — claps on the backbeat, the hook every other bar, a soft pad at the top of the bar.
      if (level >= 2) {
        if (s === 4 || s === 12) clap(b, t);
        const h = th.hook[s];
        if (bar % 2 === 1 && h != null) mallet(b, hz(th.roots[0] + 12 + h), t, 0.085, 0.3);
        if (s === 0 && !b.light) th.chords[i].forEach((m) => note(b, hz(root + 12 + m), t, { dur: 0.9, type: "sine", gain: 0.022 }));
      }
      // Layer 3 — hurry: every-16th hats, pumping octave bass, a whoosh rising to the gong.
      if (level >= 3) {
        hat(b, t, 0.04 + 0.05 * (s / 16), 0.03);
        if (s % 2 === 1) note(b, hz(root), t, { dur: 0.07, type: "square", gain: 0.045 });
        if (!b.light) noiseHit(b, t, { gain: 0.012 + 0.03 * (s / 16), dur: 0.12, type: "bandpass", freq: 800 + 450 * s, q: 2 });
      }
    },
  },
};

/** Start a looping song ("lobby" | "question"). opts.variant picks the question's key and groove. */
export function playMusic(name, opts = {}) {
  stopMusic(0.05);
  const b = getBus();
  const song = SONGS[name];
  if (!b || !song) return;
  tension = 0;
  buildup = 0;
  variant = Number(opts.variant) || 0;
  setMusicActive(true);
  const now = b.ctx.currentTime;
  b.gain.gain.cancelScheduledValues(now);
  b.gain.gain.setValueAtTime(0.0001, now);
  b.gain.gain.exponentialRampToValueAtTime(0.55, now + 0.6);
  // The question theme starts muffled and opens up as time runs; the lobby is always open.
  b.filter.frequency.cancelScheduledValues(now);
  b.filter.frequency.setValueAtTime(name === "question" ? 1400 : 18000, now);
  const stepDur = 60 / song.bpm / 4;
  let next = now + 0.08;
  let step = 0;
  timer = setInterval(() => {
    const c = b.ctx;
    while (next < c.currentTime + 0.18) {
      try { song.step(b, next, step % 16, Math.floor(step / 16)); } catch { /* audio unavailable */ }
      next += stepDur;
      step++;
    }
  }, 40);
}

/** Hurry mode for the last seconds: the hurry layer joins and the filter opens fully. */
export function setTension(on) {
  tension = on ? 1 : 0;
  if (on) setBuildup(1);
}

/** How far through the question we are (0 → 1): more layers join, and the sound brightens. */
export function setBuildup(p) {
  buildup = Math.max(0, Math.min(1, Number(p) || 0));
  if (!bus) return;
  try {
    const now = bus.ctx.currentTime;
    bus.filter.frequency.cancelScheduledValues(now);
    bus.filter.frequency.setTargetAtTime(1400 * Math.pow(12, buildup), now, 0.4); // 1.4 kHz → ~17 kHz
  } catch { /* ignore */ }
}

export function stopMusic(fade = 0.35) {
  clearInterval(timer);
  timer = null;
  setMusicActive(false);
  if (!bus) return;
  try {
    const now = bus.ctx.currentTime;
    bus.gain.gain.cancelScheduledValues(now);
    bus.gain.gain.setValueAtTime(Math.max(0.0001, bus.gain.gain.value), now);
    bus.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  } catch { /* ignore */ }
}

/** One-shot effects use their own short-lived gain so they play even while music fades. */
function oneShot(fn) {
  const a = audioOut();
  if (!a) return;
  const g = a.ctx.createGain();
  g.gain.value = 0.7;
  g.connect(a.out);
  setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 4000);
  try { fn({ ctx: a.ctx, gain: g, noise: a.noise, light: a.quality === "light" }, a.ctx.currentTime + 0.02); } catch { /* ignore */ }
}

export const stings = {
  gong() { oneShot((b, t) => { [98, 147, 196.5, 293].forEach((f, i) => note(b, f, t, { dur: 1.6 - i * 0.2, type: "sine", gain: 0.16 - i * 0.03 })); hat(b, t, 0.08, 0.3); }); },
  countdown(n) { oneShot((b, t) => note(b, n > 0 ? 660 : 990, t, { dur: n > 0 ? 0.12 : 0.35, type: "triangle", gain: 0.2 })); },
  drumroll(sec = 2) {
    oneShot((b, t) => {
      for (let k = 0; k < sec * 22; k++) {
        const at = t + k / 22;
        note(b, 110 + Math.random() * 15, at, { dur: 0.05, type: "triangle", gain: 0.05 + 0.08 * (k / (sec * 22)) });
        if (!b.light || k % 2 === 0) hat(b, at, 0.04 + 0.04 * (k / (sec * 22)), 0.03);
      }
    });
  },
  fanfare() {
    oneShot((b, t) => {
      const seq = [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [67, 0.56], [72, 0.68], [76, 0.8]];
      seq.forEach(([m, at], i) => note(b, hz(m), t + at, { dur: i === seq.length - 1 ? 0.9 : 0.18, type: "triangle", gain: 0.16 }));
      [48, 55, 60].forEach((m) => note(b, hz(m), t + 0.8, { dur: 1.1, type: "sine", gain: 0.1 }));
    });
  },
  /** Everyone has answered (or time's up): a quick rising "ta-da" before the reveal. */
  allIn() {
    oneShot((b, t) => [67, 71, 74, 79].forEach((m, i) => mallet(b, hz(m), t + i * 0.07, 0.11, 0.35)));
  },
  lock() { oneShot((b, t) => { note(b, 880, t, { dur: 0.06, type: "square", gain: 0.05 }); note(b, 1320, t + 0.05, { dur: 0.08, type: "triangle", gain: 0.08 }); }); },
};
