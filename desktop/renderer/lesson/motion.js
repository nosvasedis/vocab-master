/* Lesson motion — the only module that talks to GSAP. "Calm motion" (setting or prefers-reduced-motion)
   jumps every animation to its end state, so lessons stay usable for children who need less movement. */
import { gsap } from "../vendor/gsap/index.js";

let calm = false;
export function setCalm(on) {
  calm = !!on || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  gsap.globalTimeline.timeScale(1);
  return calm;
}
export const isCalm = () => calm;

const end = (els, vars) => { gsap.set(els, { ...vars, opacity: vars.opacity ?? 1, clearProps: "transform" }); return gsap.timeline(); };

/** Elements rise and fade in, optionally staggered. */
export function rise(els, { delay = 0, stagger = 0.08, y = 40, duration = 0.6 } = {}) {
  if (calm) return end(els, {});
  return gsap.fromTo(els, { opacity: 0, y }, { opacity: 1, y: 0, duration, delay, stagger, ease: "power3.out" });
}

/** Springy pop from small to full size. */
export function pop(els, { delay = 0, stagger = 0.06, scale = 0.3, duration = 0.7 } = {}) {
  if (calm) return end(els, {});
  return gsap.fromTo(els, { opacity: 0, scale }, { opacity: 1, scale: 1, duration, delay, stagger, ease: "back.out(1.8)" });
}

/** Fly in from one side (dir: -1 left, 1 right). */
export function flyIn(els, { dir = -1, delay = 0, distance = 200, duration = 0.7 } = {}) {
  if (calm) return end(els, {});
  return gsap.fromTo(els, { opacity: 0, x: distance * dir }, { opacity: 1, x: 0, duration, delay, ease: "power3.out", stagger: 0.12 });
}

export function fadeOut(els, { duration = 0.3 } = {}) {
  if (calm) { gsap.set(els, { opacity: 0 }); return Promise.resolve(); }
  return gsap.to(els, { opacity: 0, y: -20, duration, ease: "power2.in" }).then();
}

/** Letters of a word bounce in one after another. */
export function letters(el, { delay = 0 } = {}) {
  const text = el.textContent;
  el.innerHTML = [...text].map((c) => `<span class="ls-letter">${c === " " ? "&nbsp;" : c.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]))}</span>`).join("");
  const spans = el.querySelectorAll(".ls-letter");
  if (calm) return end(spans, {});
  return gsap.fromTo(spans, { opacity: 0, y: -60, scale: 0.4 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, delay, stagger: 0.045, ease: "back.out(3)" });
}

/** A one-off wave through a word already split by letters() — for "say it with me". */
export function wave(el, { duration = 0.32 } = {}) {
  const spans = el.querySelectorAll(".ls-letter");
  if (calm || !spans.length) return null;
  return gsap.fromTo(spans, { y: 0, scale: 1 }, { y: -26, scale: 1.12, duration, yoyo: true, repeat: 1, stagger: 0.06, ease: "sine.inOut" });
}

/** Gentle endless float (characters, props). Returns a killable tween. */
export function float(els, { amp = 12, duration = 2.6 } = {}) {
  if (calm) return { kill() {} };
  return gsap.to(els, { y: `-=${amp}`, duration, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: { each: 0.4, from: "random" } });
}

/** Slow parallax drift for backdrop layers. */
export function drift(el, { x = 40, duration = 30 } = {}) {
  if (calm) return { kill() {} };
  return gsap.to(el, { x, duration, yoyo: true, repeat: -1, ease: "sine.inOut" });
}

export function shake(el) {
  if (calm) return gsap.timeline();
  return gsap.fromTo(el, { x: 0 }, { x: 14, duration: 0.07, yoyo: true, repeat: 5, ease: "power1.inOut", clearProps: "x" });
}

export function pulse(el, { scale = 1.08, repeat = 2 } = {}) {
  if (calm) return gsap.timeline();
  return gsap.fromTo(el, { scale: 1 }, { scale, duration: 0.35, yoyo: true, repeat: repeat * 2 - 1, ease: "sine.inOut" });
}

/** Spin + grow (badges, trophies). */
export function award(el) {
  if (calm) return end(el, {});
  return gsap.fromTo(el, { opacity: 0, scale: 0, rotate: -540 }, { opacity: 1, scale: 1, rotate: 0, duration: 1.3, ease: "elastic.out(1, 0.55)" });
}

export function killAll(root) {
  if (root) gsap.killTweensOf(root.querySelectorAll("*"));
}

export { gsap };
