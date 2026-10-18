/* ══════════════════════════════════════════════════════════════════
   Lesson player — full-screen, teacher-paced lesson on the projector.
   Space / → / PageDown = next step · ← / PageUp = back (presentation clickers work)
   R replay · G Greek · A autoplay · F full screen · Esc exit
   ══════════════════════════════════════════════════════════════════ */
import { sfx, audioSettings, configureAudio } from "../arcade/audio.js";
import { confetti, floatText } from "../arcade/fx.js";
import { maskWordInText } from "../arcade/deck.js";
import { audioKey } from "./schema.js";
import { createStage } from "./stage.js";
import { createMascot } from "./mascot.js";
import { narrate, stopAll, setNarration } from "./narrator.js";
import { setCalm, rise, pop, award } from "./motion.js";
import { createPopper, matchProps, splitToken } from "./wordpop.js";
import { onePicture } from "./wordmatch.js";
import { picForNoun } from "../js/pics.js";
import hook from "./scenes/hook.js";
import reveal from "./scenes/reveal.js";
import story from "./scenes/story.js";
import check from "./scenes/check.js";
import practice from "./scenes/practice.js";
import speak from "./scenes/speak.js";
import recap from "./scenes/recap.js";

const SCENES = { hook, reveal, story, check, practice, speak, recap };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const svg = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

let P = null; // the open player

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
function countEmoji(s) {
  const str = String(s || "").replace(/\s+/g, "");
  if (!str || str.startsWith("@")) return 1; // a picture-set token is one picture
  return segmenter ? [...segmenter.segment(str)].length : Math.max(1, Math.round([...str].length / 2));
}

export const isPlayerOpen = () => !!P;

/**
 * @param {{ lesson: object, words: Map, wordById: Function, deck: object[], picture: Function, bookLabel: string,
 *   prefs: object, onPrefs?: Function, onPlayGames?: Function, onClose?: Function, artUrl?: Function, calm?: boolean }} o
 */
export function openPlayer(o) {
  if (P) return;
  configureAudio(o.prefs || {});
  // Lessons always start with the voice on (the arcade's "read words aloud" pref is restored on close).
  const savedTts = audioSettings.tts;
  audioSettings.tts = true;
  setNarration(true);
  setCalm(o.calm);
  const { lesson } = o;
  const scenes = (lesson.scenes || []).filter((s) => SCENES[s.type]);

  const root = document.createElement("div");
  root.className = "lesson";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", `Lesson: ${lesson.title}`);
  root.innerHTML = `
    <header class="ls-top">
      <div class="ls-brand"><span class="ls-logo">🦉</span><span class="ls-brand-text"><b>${esc(lesson.title)}</b><small>${esc(o.bookLabel)} · ${lesson.section === "BQ" ? "Big Question" : `Part ${esc(lesson.section)}`}${lesson.status !== "approved" ? ` · <em class="ls-draft">${esc(lesson.status)}</em>` : ""}</small></span></div>
      <div class="ls-scene-chip" id="lsChip"></div>
      <div class="ls-stars" id="lsStars" title="Class stars">⭐ <b>0</b></div>
      <div class="ls-tools">
        <button type="button" class="ls-icon" data-t="greek" title="Show Greek (G)">ΕΛ</button>
        <button type="button" class="ls-icon" data-t="auto" title="Autoplay (A)">${svg("play")}</button>
        <button type="button" class="ls-icon" data-t="tts" title="Voice on/off">${svg("mic")}</button>
        <button type="button" class="ls-icon" data-t="sfx" title="Sound effects">${svg("volume")}</button>
        <button type="button" class="ls-icon" data-t="full" title="Full screen (F)">${svg("maximize")}</button>
        <button type="button" class="ls-close" data-t="close">${svg("x", "i-sm")}<span>Exit</span></button>
      </div>
    </header>
    <main class="ls-viewport" id="lsViewport"></main>
    <footer class="ls-bottom">
      <button type="button" class="ls-nav prev" data-t="prev" aria-label="Back">${svg("arrow-left")}</button>
      <div class="ls-map" id="lsMap"></div>
      <button type="button" class="ls-nav next" data-t="next" aria-label="Next">${svg("arrow-right")}<span>Next</span></button>
    </footer>`;
  document.getElementById("overlayRoot").appendChild(root);

  const viewport = root.querySelector("#lsViewport");
  const stage = createStage(viewport, { artUrl: o.artUrl || (() => null), esc, picture: (e) => o.picture(e) });
  stage.layers.actors.innerHTML = `<div class="ls-lingo" data-pos="hidden"></div><div class="ls-bubble" hidden></div>`;
  const mascotHost = stage.layers.actors.querySelector(".ls-lingo");
  const bubble = stage.layers.actors.querySelector(".ls-bubble");
  const m = createMascot(mascotHost);

  P = {
    o, root, stage, scenes, sceneIdx: 0, step: 0, current: null, stars: 0, auto: false, greek: false,
    keyCapture: null, seq: 0, finished: false, voice: true, savedTts,
  };

  // Focus-word matching for highlights.
  const focusTerms = [...o.words.values()].map((w) => ({ w, parts: w.english.toLowerCase().split(/\s+/) }));
  const markWord = (token) => {
    const t = token.toLowerCase().replace(/[^a-z'-]/g, "");
    if (!t) return null;
    for (const { w, parts } of focusTerms) {
      if (parts.length === 1 ? maskWordInText(t, w.english) : parts.some((p) => p.length > 2 && t.startsWith(p))) return w;
    }
    return null;
  };

  const ctx = {
    lesson,
    words: o.words,
    wordById: o.wordById,
    deck: o.deck,
    esc,
    svg,
    picture: o.picture,
    pic: (e) => o.picture(e || ""),
    /** Emoji picture sized so 1–5 emoji (e.g. "🎩🟰🎩") always fit a `base`-px box. */
    picFit(e, base = 200) {
      const n = countEmoji(e);
      const size = Math.round(base / Math.max(1, n === 1 ? 1 : n * 0.78));
      return `<span class="pf" style="font-size:${size}px">${o.picture(e || "") || esc(e || "")}</span>`;
    },
    bookLabel: o.bookLabel,
    ui: stage.layers.ui,
    sfx,
    /** Greek shown? (toolbar ΕΛ / G). Hidden by default. */
    greekOn: () => !!P?.greek,
    setBackdrop: (k) => stage.setBackdrop(k || lesson.setting || "park"),
    mascot: {
      el: mascotHost,
      place(pos) { mascotHost.dataset.pos = pos; bubble.dataset.pos = pos; },
      setPose: (p) => m.setPose(p),
      level: (v) => m.level(v),
    },
    /**
     * Karaoke HTML: every word a .kw span; focus words .fw (tappable); "____" drawn as a gap.
     * `props` ({emoji,label}): each mentioned thing gets its picture right after its word (.pw) and pops up
     * when the voice reaches it. `focusPics`: focus words pop their lesson picture too (story / warm-up / quiz).
     */
    karaoke(text, { gaps = false, props = [], focusPics = false } = {}) {
      const parts = String(text || "").split(/(\s+)/);
      const tokens = parts.filter((x) => x && !/^\s+$/.test(x));
      const matched = matchProps(tokens, props);
      const usedFocus = new Set();
      let focusAdded = 0;
      let t = -1;
      return parts.map((part) => {
        if (!part || /^\s+$/.test(part)) return part;
        t++;
        if (gaps && /_{2,}/.test(part)) return `<span class="kw gap">${esc(part.replace(/_{2,}/, "      ")).replace(/ /g, "&nbsp;")}</span>`;
        const w = markWord(part);
        const prop = matched.get(t);
        let pic = prop ? picForNoun(prop.label) || onePicture(prop.emoji) : "";
        // New words pop their picture too — only things (nouns), and never more than two pictures in a line.
        if (!pic && focusPics && w?.emoji && /^n|^n.|noun/i.test(String(w.type || "")) && !usedFocus.has(w.id) && matched.size + focusAdded < 2) { pic = w.emoji; focusAdded++; }
        if (pic && w) usedFocus.add(w.id);
        const cls = `kw${w ? " fw" : ""}${pic ? " pw" : ""}`;
        const data = `${w ? ` data-word="${esc(w.english)}"` : ""}${pic ? ` data-pop="${esc(pic)}"` : ""}`;
        if (!pic) return `<span class="${cls}"${data}>${esc(part)}</span>`;
        const { lead, core, trail } = splitToken(part);
        return `<span class="${cls}"${data}>${esc(lead)}${esc(core)}<span class="pw-pic" aria-hidden="true">${o.picture(pic) || esc(pic)}</span>${esc(trail)}</span>`;
      }).join("");
    },
    async say(line, { sceneId, key, el = null, who } = {}) {
      if (!line?.text) return;
      const speaker = who || line.who || "lingo";
      const persona = lesson.cast?.[speaker]?.persona || (speaker === "lingo" ? "owl narrator" : "");
      const lingo = speaker === "lingo";
      if (lingo) m.setPose("talk");
      await narrate({
        key: key || (sceneId ? audioKey(lesson.id, sceneId, line.id) : null),
        text: line.text,
        persona,
        el,
        onLevel: lingo ? (v) => m.level(v) : null,
      });
      if (lingo) m.level(0);
    },
    async speakBubble(line, { sceneId, props = [], focusPics = true } = {}) {
      bubble.hidden = false;
      bubble.innerHTML = `<p>${ctx.karaoke(line.text, { props: [...(line.props || []), ...props], focusPics })}</p>`;
      bubble.querySelectorAll(".fw").forEach((f) => f.addEventListener("click", () => ctx.sayWordText(f.dataset.word)));
      pop(bubble, { scale: 0.6 });
      await ctx.say(line, { sceneId, el: bubble.querySelector("p") });
    },
    clearBubble() { bubble.hidden = true; bubble.innerHTML = ""; },
    sayWord(w, { slow = false } = {}) {
      if (!w) return Promise.resolve();
      return narrate({ key: `w:${w.id}`, text: slow ? `${w.english}.` : w.english, persona: "owl narrator", onLevel: (v) => m.level(v) });
    },
    sayWordText(text) {
      const w = [...o.words.values()].find((x) => x.english.toLowerCase() === String(text).toLowerCase());
      return w ? ctx.sayWord(w) : narrate({ text });
    },
    stopVoice: () => stopAll(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    confetti: (opts) => confetti(root, opts),
    addStar(fromEl) {
      P.stars += 1;
      const s = root.querySelector("#lsStars");
      s.querySelector("b").textContent = String(P.stars);
      s.classList.remove("bump"); void s.offsetWidth; s.classList.add("bump");
      floatText(fromEl || s, "+1 ⭐", { color: "#ffd23f" });
      sfx.star();
    },
    stars: () => P.stars,
    /** Call at the start of a step: returns live() which turns false once the teacher moves on. */
    live() { const my = P.seq; return () => !!P && P.seq === my; },
    next: () => next(),
    setKeyCapture(fn) { P.keyCapture = fn; },
  };
  P.ctx = ctx;
  P.popper = createPopper({ stageEl: stage.el, picFit: ctx.picFit });
  P.popper.watch(stage.el);

  // Toolbar
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-t]")?.dataset.t;
    if (!t) return;
    if (t === "next") next();
    if (t === "prev") prev();
    if (t === "close") closePlayer();
    if (t === "full") { sfx.tap(); toggleFull(); }
    if (t === "greek") { sfx.tap(); toggleGreek(); }
    if (t === "auto") { sfx.tap(); toggleAuto(); }
    if (t === "tts") {
      P.voice = !P.voice;
      audioSettings.tts = P.voice;
      setNarration(P.voice);
      sfx.tap();
      syncTools();
    }
    if (t === "sfx") {
      audioSettings.sfx = !audioSettings.sfx;
      sfx.tap();
      o.onPrefs?.({ sfx: audioSettings.sfx, tts: P.savedTts });
      syncTools();
    }
  });
  root.querySelector("#lsMap").addEventListener("click", (e) => {
    const b = e.target.closest("[data-scene]");
    if (b) { sfx.whoosh(); goTo(Number(b.dataset.scene), 0); }
  });
  window.addEventListener("keydown", onKey, true);
  syncTools();
  renderMap();
  sfx.enter();
  goTo(0, 0);
}

function syncTools() {
  const r = P.root;
  r.querySelector('[data-t="greek"]').classList.toggle("on", P.greek);
  r.querySelector('[data-t="auto"]').classList.toggle("on", P.auto);
  r.querySelector('[data-t="tts"]').classList.toggle("off", !P.voice);
  r.querySelector('[data-t="tts"]').title = P.voice ? "Voice on — click to mute" : "Voice muted — click to turn on";
  r.querySelector('[data-t="greek"]').title = P.greek ? "Hide Greek (G)" : "Show Greek (G)";
  r.querySelector('[data-t="sfx"]').innerHTML = svg(audioSettings.sfx ? "volume" : "volume-off");
  r.querySelector('[data-t="sfx"]').classList.toggle("off", !audioSettings.sfx);
  r.classList.toggle("show-greek", P.greek);
}

function renderMap() {
  const map = P.root.querySelector("#lsMap");
  map.innerHTML = P.scenes.map((s, i) => {
    const def = SCENES[s.type];
    const state = P.finished || i < P.sceneIdx ? "done" : i === P.sceneIdx ? "on" : "";
    const steps = i === P.sceneIdx && P.current ? P.current.steps : 0;
    return `<button type="button" class="ls-pill ${state}" data-scene="${i}" title="${esc(def.label)}">
      <span class="ls-pill-ico">${def.icon}</span><span class="ls-pill-label">${esc(def.label)}</span>
      ${steps > 1 ? `<span class="ls-pill-steps">${Array.from({ length: Math.min(steps, 24) }, (_, k) => `<i class="${k < P.step ? "done" : k === P.step ? "on" : ""}"></i>`).join("")}</span>` : ""}
    </button>`;
  }).join("");
  const def = SCENES[P.scenes[P.sceneIdx]?.type];
  P.root.querySelector("#lsChip").innerHTML = P.finished ? "🎉 Finished" : def ? `${def.icon} ${esc(def.label)}` : "";
  P.root.querySelector('[data-t="prev"]').disabled = !P.finished && P.sceneIdx === 0 && P.step === 0;
  P.root.querySelector('[data-t="next"] span').textContent = P.finished ? "Done" : "Next";
}

function mountScene(idx) {
  P.current?.destroy?.();
  P.keyCapture = null;
  stopAll();
  P.ctx.clearBubble();
  P.ctx.ui.innerHTML = "";
  P.sceneIdx = idx;
  P.finished = false;
  const scene = P.scenes[idx];
  P.current = SCENES[scene.type].mount(P.ctx, scene);
}

async function goTo(sceneIdx, step, dir = 1) {
  if (!P) return;
  if (sceneIdx !== P.sceneIdx || !P.current || P.finished) mountScene(sceneIdx);
  P.step = Math.max(0, Math.min(step, P.current.steps - 1));
  P.keyCapture = null;
  stopAll();
  P.popper?.clear();
  renderMap();
  const seq = ++P.seq;
  let res;
  try { res = await P.current.enter(P.step, dir); } catch (e) { console.error(e); }
  if (!P || seq !== P.seq) return;
  if (P.auto && res?.auto) setTimeout(() => { if (P && seq === P.seq) next(); }, 1600);
}

function next() {
  if (!P) return;
  if (P.finished) { closePlayer(); return; }
  sfx.tap();
  if (P.step + 1 < P.current.steps) return goTo(P.sceneIdx, P.step + 1, 1);
  if (P.sceneIdx + 1 < P.scenes.length) { sfx.whoosh(); return goTo(P.sceneIdx + 1, 0, 1); }
  finish();
}

function prev() {
  if (!P) return;
  if (P.finished) { const last = P.scenes.length - 1; mountScene(last); return goTo(last, P.current.steps - 1, -1); }
  if (P.step > 0) { sfx.tap(); return goTo(P.sceneIdx, P.step - 1, -1); }
  if (P.sceneIdx > 0) {
    sfx.back();
    mountScene(P.sceneIdx - 1);
    return goTo(P.sceneIdx, P.current.steps - 1, -1);
  }
}

function finish() {
  P.current?.destroy?.();
  P.current = null;
  P.finished = true;
  P.seq++;
  stopAll();
  P.popper?.clear();
  const { ctx, o } = P;
  ctx.clearBubble();
  ctx.mascot.place("left");
  ctx.mascot.setPose("cheer");
  ctx.setBackdrop(o.lesson.setting);
  ctx.ui.innerHTML = `
    <div class="ls-finish">
      <div class="ls-trophy">🏆</div>
      <h1>Lesson complete!</h1>
      <p>${ctx.words.size} new words · ${P.stars} ⭐ for the class</p>
      <div class="ls-finish-actions">
        <button type="button" class="ls-btn ghost" data-f="again">↺ Teach again</button>
        ${o.onPlayGames ? `<button type="button" class="ls-btn primary" data-f="games">🎮 More games with these words</button>` : ""}
        <button type="button" class="ls-btn ghost" data-f="close">Back to lessons</button>
      </div>
    </div>`;
  award(ctx.ui.querySelector(".ls-trophy"));
  rise(ctx.ui.querySelectorAll(".ls-finish h1, .ls-finish p, .ls-finish-actions"), { delay: 0.6, stagger: 0.12 });
  sfx.win();
  ctx.confetti({ count: 260, originY: 0.3 });
  ctx.ui.querySelector('[data-f="again"]').addEventListener("click", () => { P.stars = 0; P.root.querySelector("#lsStars b").textContent = "0"; goTo(0, 0); });
  ctx.ui.querySelector('[data-f="close"]').addEventListener("click", closePlayer);
  ctx.ui.querySelector('[data-f="games"]')?.addEventListener("click", () => { const cb = o.onPlayGames; closePlayer(); setTimeout(() => cb(), 280); });
  renderMap();
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else P.root.requestFullscreen?.().catch(() => {});
}
function toggleGreek() { P.greek = !P.greek; syncTools(); }
function toggleAuto() { P.auto = !P.auto; syncTools(); if (P.auto) next(); }

function replay() {
  if (P.finished || !P.current) return;
  goTo(P.sceneIdx, P.step, 0);
}

function onKey(e) {
  if (!P) return;
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (P.keyCapture) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); P.keyCapture = null; replay(); return; }
    if (e.key === "PageDown") { e.preventDefault(); e.stopPropagation(); P.keyCapture = null; next(); return; }
    P.keyCapture(e);
    e.stopPropagation();
    return;
  }
  const k = e.key;
  let handled = true;
  if (k === "Escape") closePlayer();
  else if (k === " " || k === "ArrowRight" || k === "PageDown" || k === "Enter") next();
  else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") prev();
  else if (k.toLowerCase() === "r") replay();
  else if (k.toLowerCase() === "g") toggleGreek();
  else if (k.toLowerCase() === "f") toggleFull();
  else if (k.toLowerCase() === "a" && P.current?.onKey?.(e) !== true) toggleAuto();
  else if (P.current?.onKey) handled = P.current.onKey(e);
  else handled = false;
  if (handled) { e.preventDefault(); e.stopPropagation(); }
}

export function closePlayer() {
  if (!P) return;
  const { root, stage, o } = P;
  P.current?.destroy?.();
  stopAll();
  P.popper?.destroy();
  sfx.exit();
  audioSettings.tts = P.savedTts;
  setNarration(true);
  window.removeEventListener("keydown", onKey, true);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  P = null;
  root.classList.add("closing");
  setTimeout(() => { stage.destroy(); root.remove(); }, 260);
  o.onClose?.();
}
