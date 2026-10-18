/* Lingo the owl — the lesson narrator. The drawing lives in lingo-art.js; this file brings him to life.
   Three layers, all transform-only so weak laptops keep up:
   - life: breathing, blinking, glances, small head tilts, tassel sway, wing flutters (off in calm motion);
   - pose: an expression (eyes, brows, wings, head) eased in on setPose, plus a short loop for some poses;
   - voice: level(v) opens the beak, with a few mouth shapes so speech doesn't look like one flap.
   Poses: idle, talk, wave, cheer, think, point, happy, surprised, proud, listening, encouraging. */
import { gsap, isCalm } from "./motion.js";
import { lingoSVG } from "./lingo-art.js";

/** Rig values for each pose. Wings: + lifts the left wing outward, − the right. lidU/lidL: 0 open … 1 closed; joy: 1 = smiling closed eyes. */
const BASE = {
  head: 0, headY: 0, browL: 0, browR: 0, browY: 0, lookX: 0, lookY: 0, iris: 1, joy: 0,
  lidU: 0.08, lidL: 0, cheeks: 0.6, tuftL: 0, tuftR: 0, wingL: 0, wingR: 0, mouth: 0, mouthW: 1, chest: 1,
};
export const POSES = {
  idle: {},
  talk: { head: -2, browY: -2, lidU: 0.04, wingR: -14 },
  wave: { head: 6, browY: -3, lidL: 0.25, cheeks: 1, wingR: -112, wingL: 8, mouth: 0.35 },
  cheer: { browY: -6, joy: 1, cheeks: 1, wingL: 118, wingR: -118, tuftL: -10, tuftR: 10, mouth: 0.75 },
  think: { head: 9, browL: 12, browR: -6, browY: -3, lookX: 7, lookY: -9, lidU: 0.3, wingL: -78, tuftR: 6 },
  point: { head: 5, browY: -4, lookX: 8, lookY: -4, lidU: 0, wingR: -105, mouth: 0.15 },
  happy: { head: -5, browY: -3, joy: 1, cheeks: 1, wingL: 18, wingR: -18, mouth: 0.3 },
  surprised: { browY: -9, browL: -6, browR: 6, lidU: 0, iris: 0.82, tuftL: -16, tuftR: 16, wingL: 38, wingR: -38, mouth: 0.7, mouthW: 0.7 },
  proud: { head: -6, headY: -4, browY: -4, joy: 1, cheeks: 1, wingL: -22, wingR: 22, mouth: 0.22, chest: 1.04 },
  listening: { head: -11, browL: -5, browY: -4, lookX: -5, lookY: -3, lidU: 0.02, wingL: 150, tuftL: -12 },
  encouraging: { head: 7, browL: -4, browR: 4, browY: -3, lidL: 0.35, cheeks: 0.95, wingR: -62, mouth: 0.22 },
};

/** Mouth shapes for speech: [height, width]. Picked fresh on each syllable. */
const VOWELS = [[1, 1], [0.8, 1.15], [1, 0.75], [0.6, 1.05], [0.9, 0.9]];

export function createMascot(host) {
  const el = document.createElement("div");
  el.className = "lingo";
  el.dataset.pose = "idle";
  el.innerHTML = lingoSVG();
  host.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const $$ = (s) => [...el.querySelectorAll(s)];
  const R = {
    root: $(".lg-root"), breath: $(".lg-breath"), shadow: $(".lg-shadow"),
    headIdle: $(".lg-head-idle"), headTalk: $(".lg-head-talk"), head: $(".lg-head"),
    wingL: $(".lg-wing-l"), wingR: $(".lg-wing-r"), wingLIn: $(".lg-wing-l-in"), wingRIn: $(".lg-wing-r-in"),
    tuftL: $(".lg-tuft-l"), tuftR: $(".lg-tuft-r"), browL: $(".lg-brow-l"), browR: $(".lg-brow-r"),
    looks: $$(".lg-look"), opens: $$(".lg-eye-open"), joys: $$(".lg-eye-happy"), irises: $$(".lg-iris"), lids: $$(".lg-lid"), lows: $$(".lg-lid-low"), blinks: $$(".lg-blink"),
    cheeks: $(".lg-cheeks"), mouth: $(".lg-mouth"), beak: $(".lg-beak-low"), tassel: $(".lg-tassel"),
  };

  // Pivots in drawing coordinates (svgOrigin), not each shape's own box.
  const pivot = (els, x, y) => [].concat(els).forEach((e) => gsap.set(e, { svgOrigin: `${x} ${y}` }));
  pivot([R.root, R.breath], 120, 266);
  pivot([R.headIdle, R.headTalk, R.head], 120, 176);
  pivot([R.wingL, R.wingLIn], 66, 160);
  pivot([R.wingR, R.wingRIn], 174, 160);
  pivot(R.tuftL, 66, 58); pivot(R.tuftR, 174, 58);
  pivot(R.browL, 84, 72); pivot(R.browR, 156, 72);
  pivot(R.mouth, 120, 144);
  pivot(R.tassel, 172, 36);
  pivot(R.shadow, 120, 270);
  R.irises.forEach((e) => pivot(e, e.dataset.cx, e.dataset.cy));
  [...R.lids, ...R.lows, ...R.blinks].forEach((e) => pivot(e, e.dataset.ox, e.dataset.oy));
  gsap.set(R.blinks, { scaleY: 0 });

  const state = { ...BASE };
  let voice = 0;
  let vowel = VOWELS[0];

  /** Puts rig values onto the drawing — tweened (dur > 0) or set at once. */
  function apply(v, dur = 0, ease = "power2.out") {
    const go = (t, vars) => (dur ? gsap.to(t, { ...vars, duration: dur, ease, overwrite: "auto" }) : gsap.set(t, vars));
    go(R.head, { rotation: v.head, y: v.headY });
    go(R.browL, { rotation: v.browL, y: v.browY });
    go(R.browR, { rotation: v.browR, y: v.browY });
    go(R.irises, { x: v.lookX, y: v.lookY, scale: v.iris });
    go(R.lids, { scaleY: v.lidU });
    go(R.lows, { scaleY: v.lidL });
    go(R.cheeks, { opacity: v.cheeks });
    go(R.opens, { opacity: 1 - v.joy });
    go(R.joys, { opacity: v.joy });
    go(R.tuftL, { rotation: v.tuftL });
    go(R.tuftR, { rotation: v.tuftR });
    go(R.wingL, { rotation: v.wingL, ...(dur ? { ease: "back.out(1.6)" } : {}) });
    go(R.wingR, { rotation: v.wingR, ...(dur ? { ease: "back.out(1.6)" } : {}) });
    go(R.root, { scaleY: v.chest, scaleX: 2 - v.chest });
    mouthTo(dur ? 0.18 : 0);
  }

  /** The beak opens with whichever is wider: the pose's expression or the voice. */
  function mouthTo(dur = 0.07) {
    const open = Math.max(state.mouth, voice);
    const h = voice > state.mouth ? vowel[0] : 1;
    const w = voice > state.mouth ? vowel[1] : state.mouthW;
    const vars = { scaleY: Math.max(0.04, open * h), scaleX: 0.75 + 0.25 * w };
    if (dur) {
      gsap.to(R.mouth, { ...vars, duration: dur, ease: "power2.out", overwrite: true });
      gsap.to(R.beak, { y: open * h * 15, duration: dur, ease: "power2.out", overwrite: true });
      if (!isCalm()) gsap.to(R.headTalk, { rotation: voice * -2.2, y: voice * -2, duration: 0.18, overwrite: true });
    } else {
      gsap.set(R.mouth, vars);
      gsap.set(R.beak, { y: open * h * 15 });
    }
  }

  // ---- life: always-on small motions (not in calm motion) ----
  const life = [];
  const later = (s, fn) => { const d = gsap.delayedCall(s, fn); life.push(d); return d; };
  const rand = (a, b) => a + Math.random() * (b - a);
  let pose = "idle";
  if (!isCalm()) {
    life.push(gsap.to(R.breath, { scaleY: 1.022, scaleX: 0.99, duration: 2.4, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    life.push(gsap.to(R.shadow, { scaleX: 0.96, duration: 2.4, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    life.push(gsap.fromTo(R.tassel, { rotation: -5 }, { rotation: 6, duration: 1.9, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    const blink = () => {
      const tl = gsap.timeline().to(R.blinks, { scaleY: 1, duration: 0.07, ease: "power1.in" }).to(R.blinks, { scaleY: 0, duration: 0.13, ease: "power1.out" });
      if (Math.random() < 0.2) tl.to(R.blinks, { scaleY: 1, duration: 0.07 }, "+=0.08").to(R.blinks, { scaleY: 0, duration: 0.13 });
      later(rand(2, 5), blink);
    };
    later(rand(1, 3), blink);
    const glance = () => {
      if (!["think", "point", "listening"].includes(pose)) {
        gsap.to(R.looks, { x: rand(-5, 5), y: rand(-3, 3), duration: 0.22, ease: "power2.out" });
        later(rand(0.6, 1.4), () => gsap.to(R.looks, { x: 0, y: 0, duration: 0.3, ease: "power2.inOut" }));
      }
      later(rand(3, 6), glance);
    };
    later(rand(2, 4), glance);
    const tilt = () => { gsap.to(R.headIdle, { rotation: rand(-3.5, 3.5), duration: rand(1.2, 2), ease: "sine.inOut" }); later(rand(3.5, 6.5), tilt); };
    later(3.5, tilt);
    const flutter = () => {
      gsap.timeline().to([R.wingLIn, R.wingRIn], { rotation: (i) => (i ? -7 : 7), duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" });
      later(rand(6, 11), flutter);
    };
    later(5, flutter);
    const twitch = () => { gsap.to(Math.random() < 0.5 ? R.tuftL : R.tuftR, { rotation: `+=${rand(-8, 8)}`, duration: 0.12, yoyo: true, repeat: 1 }); later(rand(5, 9), twitch); };
    later(4, twitch);
  }

  // ---- pose loops: a short action that plays after the expression is eased in ----
  function poseLoop(p) {
    if (p === "wave") return gsap.timeline({ repeat: 3, delay: 0.25 }).to(R.wingR, { rotation: -134, duration: 0.2, ease: "sine.inOut" }).to(R.wingR, { rotation: -96, duration: 0.2, ease: "sine.inOut" })
      .eventCallback("onComplete", () => gsap.to(R.wingR, { rotation: POSES.wave.wingR, duration: 0.25 }));
    if (p === "cheer") return gsap.timeline({ repeat: -1, repeatDelay: 1.6, delay: 0.1 })
      .to(R.root, { y: -18, duration: 0.22, ease: "power2.out" }, 0).to(R.shadow, { scale: 0.75, opacity: 0.08, duration: 0.22 }, 0)
      .to([R.wingL, R.wingR], { rotation: (i) => (i ? -96 : 96), duration: 0.11, yoyo: true, repeat: 1 }, 0)
      .to(R.root, { y: 0, duration: 0.3, ease: "bounce.out" }).to(R.shadow, { scale: 1, opacity: 0.14, duration: 0.3 }, "<");
    if (p === "think") return gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 0.6 }).to(R.wingL, { rotation: POSES.think.wingL - 7, duration: 0.14, yoyo: true, repeat: 3, ease: "sine.inOut" })
      .to(R.head, { rotation: POSES.think.head + 3, duration: 0.8, yoyo: true, repeat: 1, ease: "sine.inOut" }, "<");
    if (p === "point") return gsap.timeline({ repeat: 2, delay: 0.4 }).to(R.wingR, { rotation: POSES.point.wingR - 10, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" }).to({}, { duration: 0.5 });
    if (p === "happy") return gsap.timeline({ delay: 0.05 }).to(R.root, { y: -8, duration: 0.18, ease: "power2.out" }).to(R.root, { y: 0, duration: 0.35, ease: "bounce.out" })
      .to(R.head, { rotation: 5, duration: 0.5, yoyo: true, repeat: 1, ease: "sine.inOut" }, "<");
    if (p === "surprised") return gsap.timeline().fromTo(R.root, { y: 0 }, { y: -10, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" })
      .fromTo([R.wingLIn, R.wingRIn], { rotation: 0 }, { rotation: (i) => (i ? -10 : 10), duration: 0.08, yoyo: true, repeat: 3 }, 0);
    if (p === "proud") return gsap.timeline({ repeat: -1, repeatDelay: 1.6 }).to(R.head, { rotation: -7, duration: 0.6, yoyo: true, repeat: 1, ease: "sine.inOut" });
    if (p === "listening") return gsap.timeline({ repeat: -1, repeatDelay: 1.4, delay: 0.5 }).to(R.head, { rotation: POSES.listening.head - 4, y: 3, duration: 0.3, yoyo: true, repeat: 1, ease: "sine.inOut" });
    if (p === "encouraging") return gsap.timeline({ repeat: -1, repeatDelay: 1.3, delay: 0.3 })
      .to(R.wingR, { rotation: POSES.encouraging.wingR - 16, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" })
      .to(R.head, { y: 4, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" }, "<");
    if (p === "talk") {
      // Explaining gestures between sentences: a wing lifts, both open, or a little nod.
      const tl = gsap.timeline({ repeat: -1 });
      const add = () => {
        const g = Math.floor(rand(0, 3));
        if (g === 0) tl.to(R.wingR, { rotation: rand(-55, -30), duration: 0.35, ease: "sine.inOut" }).to(R.wingR, { rotation: POSES.talk.wingR, duration: 0.45, ease: "sine.inOut" }, "+=0.5");
        else if (g === 1) tl.to([R.wingL, R.wingR], { rotation: (i) => (i ? -32 : 26), duration: 0.35, ease: "sine.inOut" }).to([R.wingL, R.wingR], { rotation: (i) => (i ? POSES.talk.wingR : 0), duration: 0.45 }, "+=0.4");
        else tl.to(R.head, { rotation: rand(-6, 4), duration: 0.5, ease: "sine.inOut" }).to(R.head, { rotation: POSES.talk.head, duration: 0.5, ease: "sine.inOut" }, "+=0.3");
        tl.to({}, { duration: rand(0.8, 1.8) });
      };
      for (let i = 0; i < 4; i++) add();
      return tl;
    }
    return null;
  }

  let poseTl = null;
  function setPose(next) {
    if (!POSES[next]) next = next === "speak" ? "talk" : "idle";
    if (next === pose) return;
    pose = next;
    el.dataset.pose = next;
    poseTl?.kill();
    poseTl = null;
    Object.assign(state, BASE, POSES[next]);
    if (isCalm()) { gsap.set(R.root, { y: 0 }); apply(state); return; }
    gsap.to(R.root, { y: 0, duration: 0.2, overwrite: "auto" });
    gsap.to([R.wingLIn, R.wingRIn], { rotation: 0, duration: 0.2 });
    apply(state, 0.42);
    poseTl = poseLoop(next);
  }

  apply(state);

  return {
    el,
    setPose,
    get pose() { return pose; },
    /** Voice level 0..1 → beak opening, with a new mouth shape on each syllable. */
    level(v) {
      const open = Math.min(1, Math.max(0, Number(v) || 0));
      if (open > 0.25 && voice <= 0.25) vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      voice = open;
      mouthTo(isCalm() ? 0 : 0.07);
    },
    destroy() { life.forEach((t) => t.kill?.()); poseTl?.kill(); gsap.killTweensOf(el.querySelectorAll("g, ellipse")); el.remove(); },
  };
}
