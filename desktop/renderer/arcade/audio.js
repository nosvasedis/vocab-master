/* Lingo Arcade — synthesized sound effects (Web Audio, no files) and English text-to-speech. */

const settings = { sfx: true, tts: true };
let ctx = null;
let master = null;

export function configureAudio({ sfx, tts } = {}) {
  if (typeof sfx === "boolean") settings.sfx = sfx;
  if (typeof tts === "boolean") settings.tts = tts;
}
export const audioSettings = settings;

function ensure() {
  if (!settings.sfx) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, { at = 0, dur = 0.14, type = "sine", gain = 0.18, slide = 0, attack = 0.008 } = {}) {
  const c = ensure();
  if (!c) return;
  try {
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* audio unavailable */ }
}

function noise({ at = 0, dur = 0.08, gain = 0.06, freq = 2400 } = {}) {
  const c = ensure();
  if (!c) return;
  try {
    const t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  } catch { /* audio unavailable */ }
}

export const sfx = {
  tap() { tone(660, { dur: 0.05, type: "triangle", gain: 0.08 }); },
  flip() { noise({ dur: 0.07, gain: 0.07, freq: 3200 }); tone(520, { dur: 0.06, type: "triangle", gain: 0.05, slide: 160 }); },
  pop() { tone(880, { dur: 0.07, type: "sine", gain: 0.1, slide: 300 }); },
  correct() {
    [523.25, 659.25, 783.99].forEach((f, i) => tone(f, { at: i * 0.075, dur: 0.18, type: "triangle", gain: 0.16 }));
    tone(1046.5, { at: 0.22, dur: 0.35, type: "sine", gain: 0.14 });
  },
  wrong() {
    tone(196, { dur: 0.18, type: "square", gain: 0.06, slide: -30 });
    tone(164.8, { at: 0.13, dur: 0.26, type: "square", gain: 0.06, slide: -30 });
  },
  match() { [659.25, 987.77].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.2, type: "sine", gain: 0.15 })); },
  tick() { tone(1200, { dur: 0.035, type: "square", gain: 0.035 }); },
  urgent() { tone(1500, { dur: 0.06, type: "square", gain: 0.06 }); },
  whoosh() { noise({ dur: 0.22, gain: 0.05, freq: 900 }); },
  buzzer() { tone(140, { dur: 0.55, type: "sawtooth", gain: 0.07 }); tone(147, { dur: 0.55, type: "sawtooth", gain: 0.05 }); },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    const times = [0, 0.1, 0.2, 0.3, 0.45, 0.55, 0.68];
    notes.forEach((f, i) => tone(f, { at: times[i], dur: i === notes.length - 1 ? 0.6 : 0.2, type: "triangle", gain: 0.15 }));
  },
  points() { [880, 1174.7].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.12, type: "sine", gain: 0.1 })); },
};

let voice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const score = (v) => (/en[-_]GB/i.test(v.lang) ? 4 : /en[-_](US|AU|IE)/i.test(v.lang) ? 3 : /^en/i.test(v.lang) ? 2 : 0)
    + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|microsoft/i.test(v.name) ? 1 : 0);
  return voices.filter((v) => score(v) > 1).sort((a, b) => score(b) - score(a))[0] || null;
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

export function speak(text, { force = false, rate = 0.92 } = {}) {
  if (!force && !settings.tts) return;
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
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable */ }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
