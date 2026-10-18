/* Word pops — "show what you say" without boxes.
   A thing a line mentions is drawn right after its word as a small picture, so it is visible whenever the
   text is. When the voice reaches the word (karaoke adds .on), the picture lifts off the line, zooms up with
   a soft glow, holds while the word is heard, and flies back. Tapping a pictured word pops it again.
   Calm motion: the small picture just pulses. */
import { gsap } from "../vendor/gsap/index.js";
import { isCalm } from "./motion.js";
import { pickSpot } from "./wordmatch.js";
import { sfx } from "../arcade/audio.js";
export { matchProps, splitToken } from "./wordmatch.js";

const W = 1920;
const H = 1080;
const BIG = 230; // px on the 1920×1080 stage
const HURRY = 4; // how much faster a pop finishes when the voice has already reached the next pictured word

/**
 * The pop engine for one lesson player.
 * @param {{ stageEl: HTMLElement, picFit: (emoji:string, base:number)=>string }} o
 */
export function createPopper({ stageEl, picFit }) {
  const layer = document.createElement("div");
  layer.className = "ls-pops";
  layer.setAttribute("aria-hidden", "true");
  stageEl.appendChild(layer);
  let queue = [];
  let running = null;
  let observer = null;

  const toStage = (rect) => {
    const box = stageEl.getBoundingClientRect();
    const s = box.width / W || 1;
    return { x: (rect.left - box.left) / s, y: (rect.top - box.top) / s, w: rect.width / s, h: rect.height / s };
  };

  function run() {
    if (running || !queue.length) return;
    const span = queue.shift();
    const pic = span.querySelector(".pw-pic");
    if (!pic || !pic.isConnected) { run(); return; }
    sfx.wordPop(); // a faint bubble under the voice (effects dip while it talks)
    if (isCalm()) {
      pic.classList.remove("pulse");
      void pic.offsetWidth;
      pic.classList.add("pulse");
      const id = setTimeout(() => { running = null; run(); }, 500);
      running = { span, kill: () => clearTimeout(id) };
      return;
    }
    const r = toStage(pic.getBoundingClientRect());
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    // Zoom up next to the word, choosing the spot that hides the least: never quiz answers, faces or Lingo.
    const avoid = [...stageEl.querySelectorAll(".ck-opt, .st-hit, .st-bubble:not([hidden]), .ls-lingo, .rv-pic")].map((e) => toStage(e.getBoundingClientRect()));
    const { x: tx, y: ty } = pickSpot({ cx, cy, avoid, W, H });
    const big = document.createElement("div");
    big.className = "wp-big";
    big.innerHTML = `<span class="wp-glow"></span>${picFit(span.dataset.pop, BIG)}`;
    layer.appendChild(big);
    const start = Math.max(0.12, r.h / BIG);
    pic.classList.add("away");
    const hold = 0.95;
    running = gsap.timeline({
      onComplete: () => {
        big.remove();
        pic.classList.remove("away");
        pic.classList.remove("land");
        void pic.offsetWidth;
        pic.classList.add("land");
        running = null;
        run();
      },
    })
      .set(big, { x: cx, y: cy, xPercent: -50, yPercent: -50, scale: start, opacity: 1 })
      .to(big, { x: tx, y: ty, scale: 1, duration: 0.4, ease: "back.out(1.5)" })
      .to(big, { scale: 1.06, duration: hold / 2, yoyo: true, repeat: 1, ease: "sine.inOut" })
      .to(big, { x: cx, y: cy, scale: start, duration: 0.42, ease: "power2.in" });
    running.span = span;
  }

  // Keep up with fast speech: when the voice reaches a new pictured word, the current picture hurries home and
  // the new word pops next. Words the voice has already passed are dropped rather than popping seconds late.
  function popNow(span) {
    if (!span?.dataset?.pop || running?.span === span) return;
    queue = [span];
    if (running) running.timeScale?.(HURRY);
    else run();
  }

  return {
    /** Pop pictures as karaoke reaches their words, anywhere under `root`. */
    watch(root) {
      observer?.disconnect();
      observer = new MutationObserver((list) => {
        for (const m of list) {
          const el = m.target;
          if (el.classList?.contains("pw") && el.classList.contains("on") && !el.dataset.popped) {
            el.dataset.popped = "1";
            popNow(el);
          }
        }
      });
      observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });
      root.addEventListener("click", (e) => {
        const span = e.target.closest?.(".pw");
        if (span) popNow(span);
      });
    },
    popNow,
    /** Stop everything (step change, close). */
    clear() {
      queue = [];
      running?.kill();
      running = null;
      layer.innerHTML = "";
      stageEl.querySelectorAll(".pw-pic.away").forEach((p) => p.classList.remove("away"));
    },
    destroy() { observer?.disconnect(); this.clear(); layer.remove(); },
  };
}
