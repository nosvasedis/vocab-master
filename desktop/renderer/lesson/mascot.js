/* Lingo the owl — the lesson narrator. Inline SVG so it can blink, flap, point and lip-sync
   (the lower beak opens with the voice level). Poses: idle, talk, wave, cheer, think, point. */
import { gsap, isCalm } from "./motion.js";

const SVG = `
<svg class="lingo-svg" viewBox="0 0 240 280" aria-hidden="true">
  <defs>
    <linearGradient id="lgBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b6cff"/><stop offset="1" stop-color="#5b3df5"/></linearGradient>
    <linearGradient id="lgBelly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4dc"/><stop offset="1" stop-color="#ffe0b0"/></linearGradient>
    <radialGradient id="lgCheek"><stop offset="0" stop-color="#ff8fb3" stop-opacity=".8"/><stop offset="1" stop-color="#ff8fb3" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="120" cy="268" rx="70" ry="10" fill="#000" opacity=".12" class="lg-shadow"/>
  <g class="lg-body">
    <path class="lg-tuft lg-tuft-l" d="M62 70 L48 22 L92 58Z" fill="#5b3df5"/>
    <path class="lg-tuft lg-tuft-r" d="M178 70 L192 22 L148 58Z" fill="#5b3df5"/>
    <ellipse cx="120" cy="150" rx="92" ry="110" fill="url(#lgBody)"/>
    <ellipse cx="120" cy="182" rx="58" ry="70" fill="url(#lgBelly)"/>
    <path d="M96 170 q8 8 16 0 M120 190 q8 8 16 0 M96 210 q8 8 16 0 M128 158 q8 8 16 0" stroke="#e9b87a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <g class="lg-wing lg-wing-l"><path d="M34 140 C 10 170, 18 220, 52 236 C 46 200, 48 170, 60 146Z" fill="#4a2fe0"/></g>
    <g class="lg-wing lg-wing-r"><path d="M206 140 C 230 170, 222 220, 188 236 C 194 200, 192 170, 180 146Z" fill="#4a2fe0"/></g>
    <g class="lg-eyes">
      <circle cx="86" cy="104" r="34" fill="#fff"/><circle cx="154" cy="104" r="34" fill="#fff"/>
      <g class="lg-pupils"><circle cx="90" cy="108" r="15" fill="#1d1640"/><circle cx="150" cy="108" r="15" fill="#1d1640"/>
        <circle cx="95" cy="102" r="5" fill="#fff"/><circle cx="155" cy="102" r="5" fill="#fff"/></g>
      <g class="lg-lids"><rect x="50" y="68" width="72" height="0" fill="#6b4cff" class="lg-lid"/><rect x="118" y="68" width="72" height="0" fill="#6b4cff" class="lg-lid"/></g>
    </g>
    <circle cx="66" cy="140" r="16" fill="url(#lgCheek)"/><circle cx="174" cy="140" r="16" fill="url(#lgCheek)"/>
    <path class="lg-beak-top" d="M106 128 L134 128 L120 146Z" fill="#ffb02e"/>
    <path class="lg-beak-low" d="M110 140 L130 140 L120 152Z" fill="#f08c00"/>
    <g class="lg-cap">
      <path d="M70 44 L120 24 L170 44 L120 64Z" fill="#1d1640"/>
      <rect x="98" y="46" width="44" height="16" rx="4" fill="#1d1640"/>
      <path class="lg-tassel" d="M168 44 L174 78" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/><circle cx="174" cy="80" r="6" fill="#ffd23f"/>
    </g>
  </g>
</svg>`;

export function createMascot(host) {
  const el = document.createElement("div");
  el.className = "lingo";
  el.innerHTML = SVG;
  host.appendChild(el);
  const body = el.querySelector(".lg-body");
  const beak = el.querySelector(".lg-beak-low");
  const wingL = el.querySelector(".lg-wing-l");
  const wingR = el.querySelector(".lg-wing-r");
  const pupils = el.querySelector(".lg-pupils");
  const lids = el.querySelectorAll(".lg-lid");
  gsap.set([wingL], { transformOrigin: "60px 146px" });
  gsap.set([wingR], { transformOrigin: "180px 146px" });
  gsap.set(beak, { transformOrigin: "120px 140px" });

  const tweens = [];
  if (!isCalm()) {
    tweens.push(gsap.to(body, { y: -8, duration: 1.8, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    const blink = () => gsap.timeline().to(lids, { attr: { height: 72 }, duration: 0.08 }).to(lids, { attr: { height: 0 }, duration: 0.12 });
    tweens.push(gsap.delayedCall(2.5, function loop() { blink(); tweens.push(gsap.delayedCall(2 + Math.random() * 3, loop)); }));
  }

  let pose = "idle";
  let poseTl = null;
  function setPose(next) {
    if (next === pose) return;
    pose = next;
    el.dataset.pose = next;
    poseTl?.kill();
    gsap.to([wingL, wingR], { rotate: 0, duration: 0.3 });
    gsap.to(pupils, { x: 0, y: 0, duration: 0.3 });
    if (isCalm()) return;
    if (next === "wave") poseTl = gsap.to(wingR, { rotate: -70, duration: 0.25, yoyo: true, repeat: 5, ease: "sine.inOut" });
    if (next === "cheer") poseTl = gsap.timeline({ repeat: 2 }).to([wingL], { rotate: 60, duration: 0.2 }, 0).to([wingR], { rotate: -60, duration: 0.2 }, 0).to(el, { y: -30, duration: 0.2 }, 0).to([wingL, wingR], { rotate: 0, duration: 0.2 }).to(el, { y: 0, duration: 0.25, ease: "bounce.out" }, "<");
    if (next === "think") poseTl = gsap.to(pupils, { x: 8, y: -10, duration: 0.4 });
    if (next === "point") poseTl = gsap.to(wingR, { rotate: -100, duration: 0.35, ease: "back.out(2)" });
  }

  return {
    el,
    setPose,
    /** Voice level 0..1 → beak opening. */
    level(v) { gsap.to(beak, { scaleY: 1 + Math.min(1, v) * 1.6, y: Math.min(1, v) * 6, duration: 0.08, overwrite: true }); },
    destroy() { tweens.forEach((t) => t.kill?.()); poseTl?.kill(); el.remove(); },
  };
}
