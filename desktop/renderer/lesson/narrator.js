/* Narrator — speaks lesson lines and drives karaoke highlighting.
   Order of preference: a recorded studio clip for the line (Phase 1c voice packs), else the system voice.
   Character personas tweak pitch/rate so a grandmother and a child don't sound identical on system voices. */
import { speakAsync, stopSpeaking, audioSettings } from "../arcade/audio.js";

let clipPlayer = null; // { playClip(key, { onLevel }) → Promise<{ played, duration }>, stop(), has(key) } — set by voice.js
let token = 0;
// Lesson narration has its own switch (the lesson toolbar), independent of the arcade's "read words aloud".
let narrationOn = true;

export function setClipPlayer(player) { clipPlayer = player; }
export function setNarration(on) { narrationOn = !!on; if (!on) stopAll(); }
export const narrationEnabled = () => narrationOn;

/** Muted: still pace the line (karaoke + reading time) so bubbles don't flash past. */
function readSilently(my, spans, text, light) {
  const ms = Math.max(1600, 500 + String(text).length * 55);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const total = String(text).length || 1;
    const tick = () => {
      if (my !== token) return resolve();
      const elapsed = performance.now() - t0;
      if (spans.length) {
        const pos = (elapsed / ms) * total;
        let k = 0;
        while (k + 1 < spans.length && spans[k + 1].at <= pos) k++;
        light(k);
      }
      if (elapsed >= ms) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function personaVoice(persona = "") {
  const p = persona.toLowerCase();
  if (/grand|old|slow|elderly/.test(p)) return { pitch: 0.85, rate: 0.82 };
  if (/\b(boy|girl|child|kid|[5-9]-year|1[0-2]-year)/.test(p)) return { pitch: 1.35, rate: 0.95 };
  if (/\b(man|dad|father|uncle|grandpa)\b/.test(p)) return { pitch: 0.8, rate: 0.9 };
  if (/\b(woman|mum|mom|mother|aunt|teacher)\b/.test(p)) return { pitch: 1.1, rate: 0.9 };
  if (/owl|lingo|narrator/.test(p)) return { pitch: 1.05, rate: 0.9 };
  return { pitch: 1, rate: 0.92 };
}

/** Wrap each word of `text` in a span for karaoke. Returns the HTML. `mark(word)` may return a class. */
export function karaokeHtml(text, esc, mark = () => "") {
  let i = 0;
  return String(text).split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part) || !part) return part;
    const start = i;
    i += part.length;
    const cls = mark(part);
    return `<span class="kw${cls ? ` ${cls}` : ""}" data-c="${start}">${esc(part)}</span>`;
  }).join("");
}

/** Map char offsets to spans so onWord(charIndex) can light the right word. */
function indexSpans(el, text) {
  const spans = [...el.querySelectorAll(".kw")];
  let pos = 0;
  const words = text.split(/(\s+)/);
  const offsets = [];
  for (const w of words) { if (w && !/^\s+$/.test(w)) offsets.push(pos); pos += w.length; }
  return spans.map((s, k) => ({ el: s, at: offsets[k] ?? 0 }));
}

/**
 * Speak one line. `el` (optional) holds karaoke spans from karaokeHtml().
 * @returns {Promise<void>} resolves when the line has finished (or was interrupted).
 */
export async function narrate({ key, text, persona = "", el = null, onLevel = null }) {
  const my = ++token;
  stopAll(false);
  const spans = el ? indexSpans(el, text) : [];
  const light = (k) => spans.forEach((s, idx) => { s.el.classList.toggle("on", idx === k); s.el.classList.toggle("done", idx < k); });
  const finish = () => { if (my === token) spans.forEach((s) => { s.el.classList.remove("on"); s.el.classList.add("done"); }); };

  if (!narrationOn) { await readSilently(my, spans, text, light); finish(); return; }

  if (clipPlayer && key && clipPlayer.has(key)) {
    // Recorded clip: no word timing, so spread the highlight over the clip duration by character position.
    let timer = null;
    const res = await clipPlayer.playClip(key, {
      onLevel,
      onStart: (duration) => {
        if (!spans.length || !duration) return;
        const total = text.length || 1;
        const t0 = performance.now();
        const tick = () => {
          if (my !== token) return;
          const pos = ((performance.now() - t0) / (duration * 1000)) * total;
          let k = 0;
          while (k + 1 < spans.length && spans[k + 1].at <= pos) k++;
          light(k);
          if (pos < total) timer = requestAnimationFrame(tick);
        };
        tick();
      },
    });
    cancelAnimationFrame(timer);
    if (my !== token) return; // interrupted by the next line: don't fall back to the system voice
    if (res?.played) { finish(); return; }
  }

  const { pitch, rate } = personaVoice(persona);
  // System voices give no volume signal: flap the beak in a speech-like rhythm while speaking.
  let flap = null;
  if (onLevel) {
    let t = 0;
    flap = setInterval(() => { t += 1; onLevel(t % 4 === 0 ? 0.1 : 0.35 + Math.random() * 0.6); }, 95);
  }
  await speakAsync(text, {
    force: true,
    pitch,
    rate,
    onWord: (charIndex) => {
      if (my !== token || !spans.length) return;
      let k = 0;
      while (k + 1 < spans.length && spans[k + 1].at <= charIndex) k++;
      light(k);
    },
  });
  clearInterval(flap);
  if (onLevel) onLevel(0);
  finish();
}

/** Stop any speech. `bump` invalidates pending karaoke. */
export function stopAll(bump = true) {
  if (bump) token++;
  stopSpeaking();
  clipPlayer?.stop?.();
}
