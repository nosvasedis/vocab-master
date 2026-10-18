/* Lingo Live — tiny synthesized soundtrack (Web Audio, no files): lobby groove, question pulse,
   gong, drumroll and fanfare. Silent whenever sound effects are switched off. */
import { audioOut, setMusicActive } from "../audio.js";

let bus = null;        // { ctx, gain }
let timer = null;      // scheduler interval
let tension = 0;       // 0 normal, 1 hurry (last seconds)

function getBus() {
  const a = audioOut();
  if (!a) return null;
  if (!bus || bus.ctx !== a.ctx) {
    const gain = a.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(a.out);
    bus = { ctx: a.ctx, gain };
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

function hat(b, t, gain = 0.05, dur = 0.04) {
  // One shared noise buffer (audio.js), a random slice per hit; light quality keeps only the strong hats.
  if (!b.noise || (b.light && gain < 0.04)) return;
  const src = b.ctx.createBufferSource();
  src.buffer = b.noise;
  const f = b.ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 6000;
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(b.gain);
  src.start(t, Math.random() * (b.noise.duration - dur - 0.05), dur + 0.02);
}

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

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
  // Driving question pulse; climbs a semitone in the last seconds.
  question: {
    bpm: 132,
    step(b, t, s, bar) {
      const lift = tension ? 1 : 0;
      const root = 45 + lift + (bar % 2 ? 3 : 0);
      if (s % 2 === 0) note(b, hz(root - 12), t, { dur: 0.1, type: "sawtooth", gain: 0.05 });
      if (s % 4 === 0) note(b, hz(root + 12), t, { dur: 0.06, type: "square", gain: 0.03 });
      if (s % 8 === 4) note(b, hz(root + 19), t, { dur: 0.08, type: "triangle", gain: 0.05 });
      hat(b, t, s % 2 ? 0.02 : 0.04, 0.03);
      if (tension && !b.light && s % 4 === 2) note(b, hz(root + 24), t, { dur: 0.05, type: "square", gain: 0.03 });
    },
  },
};

/** Start a looping song ("lobby" | "question"). */
export function playMusic(name) {
  stopMusic(0.05);
  const b = getBus();
  const song = SONGS[name];
  if (!b || !song) return;
  tension = 0;
  setMusicActive(true);
  const now = b.ctx.currentTime;
  b.gain.gain.cancelScheduledValues(now);
  b.gain.gain.setValueAtTime(0.0001, now);
  b.gain.gain.exponentialRampToValueAtTime(0.55, now + 0.6);
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

export function setTension(on) { tension = on ? 1 : 0; }

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
  lock() { oneShot((b, t) => { note(b, 880, t, { dur: 0.06, type: "square", gain: 0.05 }); note(b, 1320, t + 0.05, { dur: 0.08, type: "triangle", gain: 0.08 }); }); },
};
