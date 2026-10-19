/* Lingo Arcade — showtime: the big-screen moments every game shares.
   • titleCard   — a game's animated start screen (rays, bouncing title, how to play, who's playing) → resolves on Start
   • announce    — a full-stage swoosh between rounds and turns ("Round 2 · Tigers start!")
   • countdown   — 3 · 2 · 1 · Go!
   • turnToast   — a small banner that slides in when the turn changes
   • sparks      — a burst of stars and dots from an element (right answers, matches, points)
   • shake, pop  — quick feedback on an element
   Everything runs on CSS transforms/opacity and the Web Animations API (GPU-friendly) and is instant (or skipped)
   when the computer asks for reduced motion. No libraries, no network. */

export const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Letters that bounce in one after another (spaces kept). */
export const bouncy = (text, cls = "sx-l") => [...String(text)].map((ch, i) => (ch === " " ? `<span class="sx-sp"> </span>` : `<span class="${cls}" style="--i:${i}">${escHtml(ch)}</span>`)).join("");

/**
 * A game's start screen inside `host` (the arcade's main area). Resolves when the teacher presses Start (Space/Enter or
 * a click on the button). Returns { done: Promise, destroy() }.
 * @param {{ title: string, emoji: string, art?: string, color: string, color2?: string, tagline?: string,
 *   steps?: {icon:string, text:string}[], who?: string, kicker?: string, keys?: string, sfx?: object }} o
 */
export function titleCard(host, o) {
  const el = document.createElement("div");
  el.className = "sx-title";
  el.style.setProperty("--g1", o.color);
  el.style.setProperty("--g2", o.color2 || o.color);
  el.innerHTML = `
    <div class="sx-rays" aria-hidden="true"></div>
    <div class="sx-bits" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
    <div class="sx-inner">
      ${o.kicker ? `<div class="sx-kicker">${escHtml(o.kicker)}</div>` : ""}
      <div class="sx-badge"><span class="sx-ring"></span><span class="sx-art">${o.art || escHtml(o.emoji)}</span></div>
      <h1 class="sx-name" aria-label="${escHtml(o.title)}">${bouncy(o.title)}</h1>
      ${o.tagline ? `<p class="sx-tag">${escHtml(o.tagline)}</p>` : ""}
      ${o.steps?.length ? `<ol class="sx-steps">${o.steps.map((s, i) => `<li style="--i:${i}"><span class="sx-step-ic">${s.icon}</span><span>${escHtml(s.text)}</span></li>`).join("")}</ol>` : ""}
      ${o.who ? `<div class="sx-who">${o.who}</div>` : ""}
      <button type="button" class="sx-go" data-st-go><span>Let's play!</span><kbd>Space</kbd></button>
      ${o.keys ? `<p class="sx-keys">${o.keys}</p>` : ""}
    </div>`;
  host.appendChild(el);
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  let gone = false;
  const go = async () => {
    if (gone) return;
    gone = true;
    window.removeEventListener("keydown", onKey, true);
    o.sfx?.whoosh?.();
    el.classList.add("leaving");
    await wait(reducedMotion() ? 0 : 380);
    el.remove();
    resolve(true);
  };
  const onKey = (e) => {
    if (!el.isConnected) { window.removeEventListener("keydown", onKey, true); return; }
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); go(); }
  };
  window.addEventListener("keydown", onKey, true);
  el.querySelector("[data-st-go]").addEventListener("click", go);
  setTimeout(() => el.querySelector("[data-st-go]")?.focus({ preventScroll: true }), 50);
  o.sfx?.intro?.();
  return { done, el, destroy() { gone = true; window.removeEventListener("keydown", onKey, true); el.remove(); resolve(false); } };
}

/**
 * A full-stage swoosh card: a colour band sweeps across with a kicker, a big title and a line under it, then leaves.
 * Click to skip. Resolves when it has gone.
 * @param {HTMLElement} host
 * @param {{ kicker?: string, title: string, sub?: string, icon?: string, color?: string, ms?: number, sfx?: object, big?: boolean }} o
 */
export function announce(host, o) {
  if (!host?.isConnected) return Promise.resolve();
  host.querySelectorAll(".sx-ann").forEach((x) => x.remove());
  const el = document.createElement("div");
  el.className = `sx-ann${o.big ? " big" : ""}`;
  el.style.setProperty("--c", o.color || "#7b6bff");
  el.innerHTML = `<div class="sx-band"></div><div class="sx-ann-in">
    ${o.icon ? `<div class="sx-ann-icon">${o.icon}</div>` : ""}
    ${o.kicker ? `<div class="sx-ann-kick">${escHtml(o.kicker)}</div>` : ""}
    <div class="sx-ann-title">${bouncy(o.title, "sx-al")}</div>
    ${o.sub ? `<div class="sx-ann-sub">${o.sub}</div>` : ""}</div>`;
  host.appendChild(el);
  o.sfx?.swoosh?.();
  const hold = reducedMotion() ? Math.min(900, o.ms || 1300) : o.ms || 1500;
  return new Promise((resolve) => {
    let t = null;
    const leave = () => {
      clearTimeout(t);
      if (!el.isConnected) { resolve(); return; }
      el.classList.add("out");
      setTimeout(() => { el.remove(); resolve(); }, reducedMotion() ? 0 : 420);
    };
    el.addEventListener("click", leave, { once: true });
    t = setTimeout(leave, hold);
  });
}

/** 3 · 2 · 1 · Go! over `host`. Resolves after "Go!". */
export async function countdown(host, { from = 3, sfx = null, go = "Go!" } = {}) {
  const el = document.createElement("div");
  el.className = "sx-count";
  host.appendChild(el);
  const step = reducedMotion() ? 450 : 720;
  for (let n = from; n >= 1; n--) {
    if (!el.isConnected) return;
    el.innerHTML = `<b class="sx-num" style="--hue:${(n * 70) % 360}">${n}</b>`;
    sfx?.count?.();
    await wait(step);
  }
  if (!el.isConnected) return;
  el.innerHTML = `<b class="sx-num go">${escHtml(go)}</b>`;
  sfx?.go?.();
  await wait(reducedMotion() ? 250 : 520);
  el.remove();
}

/** A banner that slides down from the top of `host` for a moment: "Your turn · 🦊 Maria · Rockets". */
export function turnToast(host, { html, color = "#7b6bff", label = "Your turn" } = {}) {
  if (!host?.isConnected) return;
  host.querySelectorAll(".sx-toast").forEach((x) => x.remove());
  const el = document.createElement("div");
  el.className = "sx-toast";
  el.style.setProperty("--c", color);
  el.innerHTML = `<span class="sx-toast-k">${escHtml(label)}</span>${html}`;
  host.appendChild(el);
  setTimeout(() => el.remove(), reducedMotion() ? 1400 : 2100);
}

const SPARK_COLORS = ["#ffd23f", "#ff8a4c", "#34d399", "#38bdf8", "#c056f0", "#ff5e7a", "#ffffff"];
/** A burst of stars and dots from the middle of `from` (an element or {x,y} in page pixels). */
export function sparks(from, { count = 18, color = null, spread = 1, size = 1 } = {}) {
  if (!from || reducedMotion()) return;
  const r = from.getBoundingClientRect ? from.getBoundingClientRect() : { left: from.x, top: from.y, width: 0, height: 0 };
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const layer = document.createElement("div");
  layer.className = "sx-sparks";
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const s = document.createElement("i");
    const star = i % 3 === 0;
    s.className = star ? "sx-star" : "sx-dot";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.color = color && i % 2 ? color : SPARK_COLORS[i % SPARK_COLORS.length];
    s.style.fontSize = `${(star ? 16 + Math.random() * 14 : 6 + Math.random() * 7) * size}px`;
    if (star) s.textContent = "★";
    layer.appendChild(s);
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const d = (70 + Math.random() * 110) * spread * size;
    s.animate([
      { transform: "translate(-50%, -50%) scale(0.2) rotate(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d * 0.7}px), calc(-50% + ${Math.sin(a) * d * 0.7}px)) scale(1.1) rotate(${star ? 120 : 0}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 30}px)) scale(0.4) rotate(${star ? 200 : 0}deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 350, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" });
  }
  setTimeout(() => layer.remove(), 1200);
}

/** A quick head-shake (wrong answer). */
export function shake(el, { strength = 12 } = {}) {
  if (!el?.animate || reducedMotion()) return;
  el.animate([0, -1, 1, -0.8, 0.6, -0.3, 0].map((k) => ({ transform: `translateX(${k * strength}px)` })), { duration: 460, easing: "ease-out" });
}

/** A springy pop (something good happened to it). */
export function pop(el, { scale = 1.12 } = {}) {
  if (!el?.animate || reducedMotion()) return;
  el.animate([{ transform: "scale(1)" }, { transform: `scale(${scale})` }, { transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
}

/** Count a number up inside `el` (scores on end screens). */
export function countTo(el, to, { ms = 900, from = 0 } = {}) {
  if (!el) return;
  if (reducedMotion()) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
