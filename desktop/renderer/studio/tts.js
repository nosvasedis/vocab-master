/* Vocab Master — read new listening scripts and dictations aloud with the computer's voices (browser).
 * The recorded word clips can't say new sentences, so tests and dictations use speechSynthesis:
 * one English voice per speaker (alternating female / male where the system has both), slower for
 * younger classes, with pauses and repeats. No cost, works offline with the system voices. */

const FEMALE = /zira|hazel|susan|libby|sonia|jenny|aria|samantha|karen|moira|tessa|serena|female|catherine|emma|natasha|clara|ava|allison|kate|amy|olivia|maisie/i;
const MALE = /david|george|mark|ryan|guy|daniel|alex|male|james|thomas|oliver|arthur|brian|eric|christopher|liam|william/i;
const GIRL_NAMES = /^(mia|anna|eleni|maria|sophie|sofia|emma|lily|lucy|kate|katie|amy|grandma|mum|mom|mrs|miss|ms|aunt|lena|zoe|olivia|ella|chloe|sara|sarah|helen|nina|daisy|enitan)\b/i;
const BOY_NAMES = /^(tom|leo|nick|ben|sam|jack|max|alex|dad|grandpa|mr|uncle|dimitris|george|nikos|peter|paul|tim|timmy|bob|harry|leon|kostas)\b/i;

let cache = null;
export function voicesReady(timeout = 1500) {
  if (cache) return Promise.resolve(cache);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  return new Promise((resolve) => {
    const done = () => {
      const all = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
      if (all.length) cache = all;
      resolve(all);
    };
    if (window.speechSynthesis.getVoices().length) { done(); return; }
    window.speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
    setTimeout(done, timeout);
  });
}

const rank = (v) => (/en[-_]gb/i.test(v.lang) ? 0 : /en[-_](us|ie|au)/i.test(v.lang) ? 1 : 2) + (/natural|online|neural/i.test(v.name) ? -0.5 : 0);

/** speaker → SpeechSynthesisVoice, different voices for different speakers where possible. */
export function assignVoices(speakers, voices) {
  const sorted = [...voices].sort((a, b) => rank(a) - rank(b));
  const female = sorted.filter((v) => FEMALE.test(v.name));
  const male = sorted.filter((v) => MALE.test(v.name));
  const used = new Set();
  const map = {};
  const take = (pool) => pool.find((v) => !used.has(v.name)) || pool[0];
  for (const sp of [...new Set(speakers)]) {
    const want = GIRL_NAMES.test(sp) ? female : BOY_NAMES.test(sp) ? male : Object.keys(map).length % 2 ? male : female;
    const v = take(want.length ? want : sorted) || sorted[0] || null;
    if (v) used.add(v.name);
    map[sp] = v;
  }
  return map;
}

/** Speaking rate for a class level (younger = slower). */
export const RATE = { A_SENIOR: 0.78, B_SENIOR: 0.84, C_SENIOR: 0.9, D_SENIOR: 0.95, E_SENIOR: 1 };

function say(text, voice, rate) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(text).replace(/_{2,}/g, " blank "));
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-GB";
    u.rate = rate;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, 2500 + String(text).length * 120 / rate);
    window.speechSynthesis.speak(u);
  });
}
const wait = (ms, ctl) => new Promise((r) => { const t = setTimeout(r, ms); ctl.timers.push(t); });

/**
 * Play lines [{ speaker, text }] `plays` times. Returns a controller { stop(), done }.
 * onLine(index, play) highlights the current line; onEnd() fires once at the end.
 */
export function playScript(lines, { plays = 2, rate = 0.9, gapMs = 450, betweenPlaysMs = 2500, onLine, onEnd } = {}) {
  const ctl = { stopped: false, timers: [] };
  ctl.stop = () => {
    ctl.stopped = true;
    ctl.timers.forEach(clearTimeout);
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  };
  ctl.done = (async () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { onEnd?.(); return; }
    const voices = assignVoices(lines.map((l) => l.speaker || "Narrator"), await voicesReady());
    window.speechSynthesis.cancel();
    for (let p = 0; p < plays && !ctl.stopped; p++) {
      for (let i = 0; i < lines.length && !ctl.stopped; i++) {
        onLine?.(i, p);
        await say(lines[i].text, voices[lines[i].speaker || "Narrator"], rate);
        if (!ctl.stopped) await wait(gapMs, ctl);
      }
      if (p < plays - 1 && !ctl.stopped) await wait(betweenPlaysMs, ctl);
    }
    onLine?.(-1, -1);
    onEnd?.();
  })();
  return ctl;
}

/**
 * Dictation read-aloud: each sentence `repeats` times, slowly, with a writing pause that grows with its length.
 * punctuation: say "comma" / "full stop" / "question mark" on the slow reading.
 */
export function readDictation(sentences, { repeats = 2, rate = 0.85, punctuation = false, onLine, onEnd } = {}) {
  const spoken = (s) => (punctuation ? s.replace(/,/g, ", comma,").replace(/\?\s*$/, ", question mark.").replace(/\.\s*$/, ", full stop.").replace(/!\s*$/, ", exclamation mark.") : s);
  const lines = [];
  sentences.forEach((s, i) => {
    for (let r = 0; r < repeats; r++) lines.push({ i, text: r === 0 ? s : spoken(s), slow: r > 0 });
  });
  const ctl = { stopped: false, timers: [] };
  ctl.stop = () => { ctl.stopped = true; ctl.timers.forEach(clearTimeout); try { window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  ctl.done = (async () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { onEnd?.(); return; }
    const [voice] = Object.values(assignVoices(["Teacher"], await voicesReady()));
    window.speechSynthesis.cancel();
    for (const l of lines) {
      if (ctl.stopped) break;
      onLine?.(l.i);
      await say(l.text, voice, l.slow ? rate * 0.82 : rate);
      const words = l.text.split(/\s+/).length;
      if (!ctl.stopped) await wait(l.slow ? 900 + words * 650 : 1200, ctl);
    }
    onLine?.(-1);
    onEnd?.();
  })();
  return ctl;
}
