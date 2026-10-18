/* Vocab Master — the sound palette. Every sound is a small synth recipe (no audio files).
   The engine (audio.js) renders each recipe once into an AudioBuffer, so playing a sound later
   costs one buffer source, even on a weak classroom PC. Recipes also run live as a fallback.

   Palette: soft mallets and glass bells in C major / pentatonic, airy noise for motion,
   warm low knocks instead of harsh buzzes. Interface sounds stay short (<150 ms) and quiet. */

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// Note names → MIDI, e.g. N.C5 = 72.
export const N = {};
["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"].forEach((name, i) => {
  for (let o = 2; o <= 8; o++) N[`${name}${o}`] = 12 * (o + 1) + i;
});

const noiseCache = new WeakMap();
/** Two seconds of white noise per context, shared by every noise voice. */
export function noiseBuffer(c) {
  let buf = noiseCache.get(c);
  if (!buf) {
    const len = Math.floor(c.sampleRate * 2);
    buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    noiseCache.set(c, buf);
  }
  return buf;
}

/** Voice kit bound to a context, an output node and a start time. All times are seconds from t0. */
export function kit(c, out, t0) {
  const env = (g, t, { attack = 0.004, dur = 0.2, gain = 0.2, hold = 0 }) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (hold) g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + hold + 0.01, dur));
  };
  const filter = (type, f, q = 0.7) => {
    const n = c.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    return n;
  };
  return {
    /** A plain oscillator note. slide = end frequency (exponential glide). lp = low-pass cutoff. */
    tone({ f, at = 0, dur = 0.15, type = "sine", gain = 0.15, attack = 0.004, hold = 0, slide = 0, lp = 0, detune = 0 }) {
      const t = t0 + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (detune) o.detune.value = detune;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      env(g, t, { attack, dur, gain, hold });
      let head = o;
      if (lp) { const fl = filter("lowpass", lp); o.connect(fl); head = fl; }
      head.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.03);
    },
    /** A glassy FM bell: the modulator's index decays faster than the note, so it starts bright and mellows. */
    bell({ f, at = 0, dur = 0.6, gain = 0.12, ratio = 3.01, index = 1.6, attack = 0.002 }) {
      const t = t0 + at;
      const car = c.createOscillator();
      const mod = c.createOscillator();
      const mg = c.createGain();
      const g = c.createGain();
      car.frequency.value = f;
      mod.frequency.value = f * ratio;
      mg.gain.setValueAtTime(f * index, t);
      mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + dur * 0.6);
      mod.connect(mg);
      mg.connect(car.frequency);
      env(g, t, { attack, dur, gain });
      car.connect(g);
      g.connect(out);
      car.start(t); mod.start(t);
      car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
    },
    /** A soft mallet (marimba-ish): sine plus a quick 4th-harmonic tick. */
    mallet({ f, at = 0, dur = 0.35, gain = 0.14 }) {
      this.tone({ f, at, dur, type: "sine", gain, attack: 0.002 });
      this.tone({ f: f * 4, at, dur: 0.05, type: "sine", gain: gain * 0.35, attack: 0.001 });
      this.tone({ f: f * 2, at, dur: dur * 0.5, type: "triangle", gain: gain * 0.25, attack: 0.002 });
    },
    /** Filtered noise. sweep = end cutoff for a whoosh. */
    noise({ at = 0, dur = 0.1, gain = 0.05, type = "bandpass", f = 2000, q = 0.8, sweep = 0, attack = 0.003, hold = 0 }) {
      const t = t0 + at;
      const src = c.createBufferSource();
      const buf = noiseBuffer(c);
      src.buffer = buf;
      const fl = filter(type, f, q);
      if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
      const g = c.createGain();
      env(g, t, { attack, dur, gain, hold });
      src.connect(fl);
      fl.connect(g);
      g.connect(out);
      const offset = (Math.abs(Math.sin(t * 977 + f)) * (buf.duration - dur - 0.1)) || 0;
      src.start(t, Math.max(0, offset), dur + 0.05);
    },
    /** A warm knock: a sine whose pitch drops fast (a soft kick / wood thump). */
    thump({ f = 160, to = 60, at = 0, dur = 0.16, gain = 0.2 }) {
      this.tone({ f, slide: to, at, dur, type: "sine", gain, attack: 0.002 });
    },
  };
}

const arp = (k, notes, { step = 0.07, dur = 0.5, gain = 0.1, at = 0, bell = true } = {}) =>
  notes.forEach((m, i) => (bell ? k.bell({ f: hz(m), at: at + i * step, dur, gain }) : k.mallet({ f: hz(m), at: at + i * step, dur, gain })));

/**
 * name → { bus: "ui" | "sfx", dur (s), wet (reverb 0–1), gap (min ms between plays), vary (± cents), play(kit) }
 */
export const SOUNDS = {
  /* ── Interface ─────────────────────────────────────────────── */
  tapUi: { bus: "ui", dur: 0.06, wet: 0, gap: 35, vary: 60, play(k) {
    k.noise({ dur: 0.018, gain: 0.05, f: 3800, q: 1.2 });
    k.tone({ f: 1480, slide: 1180, dur: 0.035, gain: 0.035 });
  } },
  press: { bus: "ui", dur: 0.12, wet: 0.12, gap: 40, vary: 30, play(k) {
    k.noise({ dur: 0.02, gain: 0.04, f: 3000 });
    k.mallet({ f: hz(N.G5), dur: 0.11, gain: 0.06 });
  } },
  select: { bus: "ui", dur: 0.14, wet: 0.15, gap: 40, vary: 25, play(k) {
    k.bell({ f: hz(N.E6), dur: 0.12, gain: 0.04, index: 0.8 });
    k.noise({ dur: 0.015, gain: 0.025, f: 4500 });
  } },
  toggleOn: { bus: "ui", dur: 0.16, wet: 0.12, gap: 50, play(k) {
    k.mallet({ f: hz(N.G5), dur: 0.08, gain: 0.05 });
    k.mallet({ f: hz(N.D6), at: 0.055, dur: 0.1, gain: 0.055 });
  } },
  toggleOff: { bus: "ui", dur: 0.16, wet: 0.1, gap: 50, play(k) {
    k.mallet({ f: hz(N.D6), dur: 0.08, gain: 0.045 });
    k.mallet({ f: hz(N.G5), at: 0.055, dur: 0.1, gain: 0.045 });
  } },
  nav: { bus: "ui", dur: 0.22, wet: 0.2, gap: 80, vary: 20, play(k) {
    k.noise({ dur: 0.16, gain: 0.045, f: 700, sweep: 3200, q: 0.9, attack: 0.04 });
    k.bell({ f: hz(N.G6), at: 0.07, dur: 0.14, gain: 0.025, index: 0.6 });
  } },
  navBack: { bus: "ui", dur: 0.22, wet: 0.2, gap: 80, vary: 20, play(k) {
    k.noise({ dur: 0.16, gain: 0.045, f: 3200, sweep: 700, q: 0.9, attack: 0.04 });
    k.bell({ f: hz(N.D6), at: 0.07, dur: 0.14, gain: 0.025, index: 0.6 });
  } },
  open: { bus: "ui", dur: 0.3, wet: 0.25, gap: 120, play(k) {
    k.noise({ dur: 0.18, gain: 0.025, type: "lowpass", f: 500, sweep: 2600, attack: 0.05 });
    k.tone({ f: hz(N.G4), slide: hz(N.C5), dur: 0.16, gain: 0.04, type: "triangle", lp: 1800 });
    k.bell({ f: hz(N.C6), at: 0.08, dur: 0.22, gain: 0.035, index: 0.9 });
  } },
  close: { bus: "ui", dur: 0.2, wet: 0.15, gap: 100, play(k) {
    k.noise({ dur: 0.12, gain: 0.022, type: "lowpass", f: 2400, sweep: 400, attack: 0.02 });
    k.tone({ f: hz(N.E5), slide: hz(N.A4), dur: 0.12, gain: 0.035, type: "triangle", lp: 1600 });
  } },
  notify: { bus: "ui", dur: 0.45, wet: 0.3, gap: 200, play(k) {
    k.bell({ f: hz(N.A5), dur: 0.35, gain: 0.04, index: 1 });
    k.bell({ f: hz(N.E6), at: 0.09, dur: 0.35, gain: 0.035, index: 1 });
  } },
  success: { bus: "ui", dur: 0.6, wet: 0.3, gap: 200, play(k) {
    arp(k, [N.C6, N.E6, N.G6], { step: 0.05, dur: 0.4, gain: 0.045 });
    k.bell({ f: hz(N.C7), at: 0.15, dur: 0.45, gain: 0.03, index: 0.7 });
  } },
  warn: { bus: "ui", dur: 0.35, wet: 0.2, gap: 200, play(k) {
    k.mallet({ f: hz(N.E5), dur: 0.16, gain: 0.07 });
    k.mallet({ f: hz(N.C5), at: 0.11, dur: 0.22, gain: 0.07 });
  } },
  error: { bus: "ui", dur: 0.42, wet: 0.15, gap: 250, play(k) {
    k.thump({ f: 200, to: 90, dur: 0.18, gain: 0.12 });
    k.tone({ f: hz(N.Ds4), dur: 0.16, gain: 0.05, type: "triangle", lp: 1400 });
    k.tone({ f: hz(N.B3), at: 0.14, dur: 0.26, gain: 0.05, type: "triangle", lp: 1200 });
  } },
  add: { bus: "ui", dur: 0.2, wet: 0.15, gap: 50, vary: 40, play(k) {
    k.tone({ f: 520, slide: 900, dur: 0.07, gain: 0.05, type: "sine" });
    k.bell({ f: hz(N.A6), at: 0.05, dur: 0.12, gain: 0.025, index: 0.6 });
  } },
  remove: { bus: "ui", dur: 0.22, wet: 0.08, gap: 60, vary: 40, play(k) {
    k.noise({ dur: 0.09, gain: 0.04, f: 1200, sweep: 300, q: 1.4 });
    k.noise({ at: 0.04, dur: 0.07, gain: 0.03, f: 900, sweep: 250, q: 1.4 });
    k.thump({ f: 180, to: 80, at: 0.03, dur: 0.12, gain: 0.07 });
  } },
  pickup: { bus: "ui", dur: 0.1, wet: 0.05, gap: 60, play(k) {
    k.tone({ f: 420, slide: 700, dur: 0.06, gain: 0.045, type: "triangle", lp: 2000 });
  } },
  drop: { bus: "ui", dur: 0.14, wet: 0.08, gap: 60, play(k) {
    k.thump({ f: 320, to: 140, dur: 0.07, gain: 0.08 });
    k.noise({ dur: 0.02, gain: 0.03, f: 2600 });
  } },
  themeLight: { bus: "ui", dur: 0.5, wet: 0.3, gap: 150, play(k) {
    arp(k, [N.G5, N.C6, N.E6, N.G6], { step: 0.045, dur: 0.3, gain: 0.035 });
  } },
  themeDark: { bus: "ui", dur: 0.5, wet: 0.3, gap: 150, play(k) {
    arp(k, [N.E5, N.C5, N.A4, N.E4], { step: 0.05, dur: 0.32, gain: 0.04, bell: false });
  } },
  aiStart: { bus: "ui", dur: 0.6, wet: 0.35, gap: 400, play(k) {
    arp(k, [N.C6, N.D6, N.E6, N.G6, N.A6, N.C7], { step: 0.035, dur: 0.22, gain: 0.025 });
    k.noise({ dur: 0.3, gain: 0.012, type: "highpass", f: 6000, attack: 0.08 });
  } },
  aiDone: { bus: "ui", dur: 1.1, wet: 0.4, gap: 400, play(k) {
    [N.C6, N.G6, N.E6, N.C7].forEach((m, i) => k.bell({ f: hz(m), at: i * 0.07, dur: 0.75, gain: 0.04, index: 1.1 }));
    k.tone({ f: hz(N.C4), at: 0.0, dur: 0.6, gain: 0.04, type: "sine" });
    k.noise({ at: 0.18, dur: 0.4, gain: 0.01, type: "highpass", f: 7000, attack: 0.1 });
  } },
  launch: { bus: "ui", dur: 0.9, wet: 0.35, gap: 300, play(k) {
    k.noise({ dur: 0.35, gain: 0.04, f: 400, sweep: 4000, q: 0.8, attack: 0.12 });
    arp(k, [N.C5, N.E5, N.G5, N.C6, N.E6], { at: 0.12, step: 0.05, dur: 0.45, gain: 0.05, bell: false });
    k.bell({ f: hz(N.G6), at: 0.38, dur: 0.5, gain: 0.04 });
  } },
  print: { bus: "ui", dur: 0.4, wet: 0.05, gap: 300, play(k) {
    for (let i = 0; i < 4; i++) k.noise({ at: i * 0.07, dur: 0.05, gain: 0.03, f: 1800 + i * 200, q: 2 });
    k.mallet({ f: hz(N.C6), at: 0.3, dur: 0.12, gain: 0.04 });
  } },

  /* ── Games & lessons ───────────────────────────────────────── */
  tap: { bus: "sfx", dur: 0.08, wet: 0.08, gap: 35, vary: 50, play(k) {
    k.mallet({ f: hz(N.E6), dur: 0.06, gain: 0.06 });
  } },
  hover: { bus: "sfx", dur: 0.06, wet: 0.1, gap: 70, vary: 80, play(k) {
    k.bell({ f: hz(N.A6), dur: 0.05, gain: 0.015, index: 0.5 });
  } },
  flip: { bus: "sfx", dur: 0.14, wet: 0.08, gap: 50, vary: 60, play(k) {
    k.noise({ dur: 0.06, gain: 0.07, f: 3400, sweep: 1800, q: 1 });
    k.tone({ f: 500, slide: 760, dur: 0.06, type: "triangle", gain: 0.04, lp: 2400 });
  } },
  pop: { bus: "sfx", dur: 0.12, wet: 0.12, gap: 45, vary: 70, play(k) {
    k.tone({ f: 700, slide: 1300, dur: 0.06, type: "sine", gain: 0.1 });
    k.noise({ dur: 0.012, gain: 0.03, f: 5000 });
  } },
  wordPop: { bus: "sfx", dur: 0.2, wet: 0.25, gap: 140, vary: 90, play(k) {
    k.tone({ f: 620, slide: 1050, dur: 0.05, type: "sine", gain: 0.035 });
    k.bell({ f: hz(N.E7), at: 0.03, dur: 0.14, gain: 0.012, index: 0.5 });
  } },
  correct: { bus: "sfx", dur: 0.9, wet: 0.3, gap: 120, play(k) {
    arp(k, [N.C6, N.E6, N.G6], { step: 0.07, dur: 0.4, gain: 0.11, bell: false });
    k.bell({ f: hz(N.C7), at: 0.21, dur: 0.6, gain: 0.08 });
    k.noise({ at: 0.2, dur: 0.3, gain: 0.012, type: "highpass", f: 7000, attack: 0.05 });
  } },
  wrong: { bus: "sfx", dur: 0.5, wet: 0.12, gap: 150, play(k) {
    k.tone({ f: hz(N.Ds4), slide: hz(N.D4), dur: 0.16, type: "triangle", gain: 0.1, lp: 1600 });
    k.tone({ f: hz(N.As3), slide: hz(N.A3), at: 0.14, dur: 0.3, type: "triangle", gain: 0.1, lp: 1200 });
    k.thump({ f: 150, to: 70, at: 0.14, dur: 0.15, gain: 0.08 });
  } },
  match: { bus: "sfx", dur: 0.7, wet: 0.3, gap: 120, play(k) {
    k.bell({ f: hz(N.E6), dur: 0.4, gain: 0.1 });
    k.bell({ f: hz(N.B6), at: 0.08, dur: 0.5, gain: 0.09 });
    k.noise({ at: 0.08, dur: 0.25, gain: 0.01, type: "highpass", f: 8000, attack: 0.04 });
  } },
  tick: { bus: "sfx", dur: 0.06, wet: 0.05, gap: 50, play(k) {
    k.noise({ dur: 0.02, gain: 0.05, f: 2200, q: 4 });
    k.tone({ f: 1050, dur: 0.03, type: "sine", gain: 0.05 });
  } },
  urgent: { bus: "sfx", dur: 0.1, wet: 0.05, gap: 50, play(k) {
    k.noise({ dur: 0.025, gain: 0.07, f: 2800, q: 4 });
    k.tone({ f: 1480, dur: 0.05, type: "triangle", gain: 0.07 });
  } },
  whoosh: { bus: "sfx", dur: 0.32, wet: 0.2, gap: 90, vary: 40, play(k) {
    k.noise({ dur: 0.28, gain: 0.13, f: 500, sweep: 3000, q: 0.8, attack: 0.08 });
  } },
  back: { bus: "sfx", dur: 0.28, wet: 0.2, gap: 90, vary: 40, play(k) {
    k.noise({ dur: 0.24, gain: 0.11, f: 3000, sweep: 500, q: 0.8, attack: 0.06 });
  } },
  buzzer: { bus: "sfx", dur: 0.7, wet: 0.1, gap: 300, play(k) {
    k.tone({ f: 150, dur: 0.55, type: "sawtooth", gain: 0.06, lp: 900, hold: 0.35 });
    k.tone({ f: 151.5, dur: 0.55, type: "square", gain: 0.035, lp: 700, hold: 0.35 });
    k.thump({ f: 120, to: 50, dur: 0.25, gain: 0.12 });
  } },
  win: { bus: "sfx", dur: 1.8, wet: 0.35, gap: 500, play(k) {
    const seq = [[N.C5, 0], [N.E5, 0.1], [N.G5, 0.2], [N.C6, 0.3], [N.G5, 0.45], [N.C6, 0.55], [N.E6, 0.68]];
    seq.forEach(([m, at], i) => k.mallet({ f: hz(m), at, dur: i === seq.length - 1 ? 0.8 : 0.25, gain: 0.12 }));
    [N.C4, N.G4, N.E5].forEach((m) => k.tone({ f: hz(m), at: 0.68, dur: 1, type: "triangle", gain: 0.05, lp: 2200, attack: 0.02 }));
    [N.C7, N.E7, N.G7].forEach((m, i) => k.bell({ f: hz(m), at: 0.72 + i * 0.06, dur: 0.6, gain: 0.04 }));
  } },
  points: { bus: "sfx", dur: 0.45, wet: 0.2, gap: 70, play(k) {
    k.bell({ f: hz(N.B5), dur: 0.12, gain: 0.08, index: 1.2, ratio: 2 });
    k.bell({ f: hz(N.E6), at: 0.07, dur: 0.35, gain: 0.08, index: 1.2, ratio: 2 });
  } },
  pointsDown: { bus: "sfx", dur: 0.3, wet: 0.12, gap: 70, play(k) {
    k.mallet({ f: hz(N.E5), dur: 0.1, gain: 0.07 });
    k.mallet({ f: hz(N.B4), at: 0.07, dur: 0.18, gain: 0.06 });
  } },
  star: { bus: "sfx", dur: 0.7, wet: 0.35, gap: 120, play(k) {
    arp(k, [N.G6, N.C7, N.E7], { step: 0.05, dur: 0.45, gain: 0.05 });
    k.noise({ dur: 0.35, gain: 0.012, type: "highpass", f: 8000, attack: 0.03 });
  } },
  enter: { bus: "sfx", dur: 0.8, wet: 0.3, gap: 300, play(k) {
    k.noise({ dur: 0.3, gain: 0.04, f: 400, sweep: 3500, attack: 0.1 });
    arp(k, [N.G4, N.C5, N.E5, N.G5], { at: 0.12, step: 0.06, dur: 0.4, gain: 0.07, bell: false });
  } },
  exit: { bus: "sfx", dur: 0.5, wet: 0.2, gap: 300, play(k) {
    k.noise({ dur: 0.25, gain: 0.035, f: 3000, sweep: 400, attack: 0.04 });
    arp(k, [N.G5, N.E5, N.C5], { step: 0.06, dur: 0.25, gain: 0.05, bell: false });
  } },
};

export const SOUND_NAMES = Object.keys(SOUNDS);
