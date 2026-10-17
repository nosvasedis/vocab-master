/* Lesson stage — a fixed 1920×1080 canvas scaled to any projector, with layered, illustrated backdrops.
   Backdrops are drawn procedurally (sky, hills, props) and replaced by AI illustrations from the unit's
   art pack when available (artUrl(key) → URL | null). */
import { drift, float } from "./motion.js";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/* Palette + props per backdrop key (keys match schema.BACKDROPS). Props: [emoji, x%, y%, size px, layer]. */
const SCENES = {
  home: { sky: ["#ffe7d1", "#ffd0e1"], ground: "#f6c89f", hill: "#f3b58b", sun: true, props: [["🏠", 18, 52, 260, "mid"], ["🪴", 78, 70, 140, "near"], ["🛋️", 64, 74, 170, "near"], ["🖼️", 42, 30, 110, "far"]] },
  school: { sky: ["#cfe9ff", "#e8f6ff"], ground: "#9bd48a", hill: "#7fc46c", sun: true, clouds: true, props: [["🏫", 22, 50, 300, "mid"], ["🚸", 76, 66, 130, "near"], ["🌳", 88, 52, 220, "mid"], ["🎒", 60, 78, 120, "near"]] },
  classroom: { sky: ["#fff4d6", "#ffe9b8"], ground: "#d9b38c", hill: "#caa078", props: [["🧑‍🏫", 16, 62, 190, "mid"], ["📚", 82, 70, 140, "near"], ["✏️", 70, 80, 100, "near"], ["🗺️", 46, 28, 140, "far"]] },
  park: { sky: ["#bfe6ff", "#e6f7ff"], ground: "#8fd17a", hill: "#6fbf5d", sun: true, clouds: true, props: [["🌳", 12, 50, 280, "mid"], ["🌳", 86, 46, 300, "mid"], ["🌷", 30, 80, 90, "near"], ["🦆", 66, 78, 100, "near"], ["🪁", 58, 20, 120, "far"]] },
  city: { sky: ["#b9d4ff", "#f0e2ff"], ground: "#a7adbb", hill: "#8f96a8", clouds: true, props: [["🏢", 12, 44, 300, "mid"], ["🏬", 34, 48, 240, "far"], ["🏙️", 72, 46, 300, "far"], ["🚌", 62, 76, 170, "near"], ["🚦", 88, 66, 130, "near"]] },
  street: { sky: ["#c8e3ff", "#fff1d9"], ground: "#b6b9c4", hill: "#9ea2b0", sun: true, props: [["🏪", 16, 52, 240, "mid"], ["🏘️", 70, 48, 260, "far"], ["🚲", 50, 78, 130, "near"], ["🚦", 88, 64, 120, "near"]] },
  beach: { sky: ["#9fdcff", "#fff3c4"], ground: "#ffe1a6", hill: "#4cc3e8", sun: true, clouds: true, props: [["🏖️", 20, 64, 200, "mid"], ["🌴", 84, 48, 280, "mid"], ["🐚", 60, 82, 80, "near"], ["⛵", 46, 46, 120, "far"]] },
  forest: { sky: ["#c9f0d8", "#eafbe9"], ground: "#5fae5a", hill: "#3f8f45", props: [["🌲", 8, 44, 300, "mid"], ["🌲", 26, 40, 240, "far"], ["🌲", 82, 42, 320, "mid"], ["🍄", 64, 80, 100, "near"], ["🦊", 44, 78, 120, "near"]] },
  farm: { sky: ["#c4ecff", "#fff8d6"], ground: "#a8d672", hill: "#8cc456", sun: true, clouds: true, props: [["🏡", 16, 52, 240, "mid"], ["🚜", 70, 72, 170, "near"], ["🐄", 46, 74, 150, "near"], ["🌾", 88, 76, 120, "near"]] },
  kitchen: { sky: ["#fff1e0", "#ffe0d0"], ground: "#e7c9a8", hill: "#dcb48d", props: [["🍳", 18, 70, 140, "near"], ["🥕", 80, 74, 110, "near"], ["🫖", 64, 66, 120, "mid"], ["🪟", 44, 28, 150, "far"]] },
  shop: { sky: ["#ffe9f2", "#fff6d8"], ground: "#e9cfb5", hill: "#dbb994", props: [["🏪", 18, 50, 260, "mid"], ["🍎", 70, 72, 100, "near"], ["🛒", 84, 74, 140, "near"], ["🧺", 54, 78, 110, "near"]] },
  space: { sky: ["#1c1450", "#4a2a8a"], ground: "#3a2a6e", hill: "#2a1d55", stars: true, props: [["🪐", 18, 26, 220, "far"], ["🚀", 76, 40, 200, "mid"], ["🌙", 88, 14, 140, "far"], ["👾", 56, 76, 110, "near"]] },
  stage: { sky: ["#3b1c4d", "#7a2d5c"], ground: "#5a2a3e", hill: "#46203a", stars: true, props: [["🎭", 16, 30, 180, "far"], ["🎤", 80, 66, 150, "near"], ["💡", 50, 12, 110, "far"]] },
  village: { sky: ["#cdeaff", "#fff0d8"], ground: "#9ccf7c", hill: "#7fbb62", sun: true, clouds: true, props: [["🏡", 14, 52, 230, "mid"], ["⛪", 40, 42, 220, "far"], ["🏘️", 74, 48, 260, "mid"], ["🐑", 58, 78, 110, "near"]] },
  garden: { sky: ["#d6f2ff", "#f6ffe6"], ground: "#92d27a", hill: "#73bf5c", sun: true, props: [["🌻", 14, 64, 180, "near"], ["🌷", 30, 78, 100, "near"], ["🦋", 60, 32, 100, "far"], ["🏡", 80, 50, 230, "mid"]] },
  playground: { sky: ["#bfe7ff", "#fff3d1"], ground: "#9fd57f", hill: "#82c463", sun: true, clouds: true, props: [["🛝", 18, 60, 220, "mid"], ["⚽", 60, 80, 90, "near"], ["🌳", 86, 48, 260, "mid"], ["🎈", 40, 22, 110, "far"]] },
};

export const backdropKeys = Object.keys(SCENES);

/** Create the scaled stage inside `host`. Returns { el, layers, setBackdrop(key), destroy }. */
export function createStage(host, { artUrl = () => null, esc, picture } = {}) {
  const el = document.createElement("div");
  el.className = "ls-stage";
  el.innerHTML = `
    <div class="ls-layer ls-sky"></div>
    <div class="ls-layer ls-art"></div>
    <div class="ls-layer ls-far"></div>
    <div class="ls-layer ls-hills"></div>
    <div class="ls-layer ls-mid"></div>
    <div class="ls-layer ls-near"></div>
    <div class="ls-layer ls-actors"></div>
    <div class="ls-layer ls-ui"></div>`;
  host.appendChild(el);
  const layers = Object.fromEntries(["sky", "art", "far", "hills", "mid", "near", "actors", "ui"].map((k) => [k, el.querySelector(`.ls-${k}`)]));
  let tweens = [];
  let current = null;

  const fit = () => {
    const r = host.getBoundingClientRect();
    const s = Math.min(r.width / STAGE_W, r.height / STAGE_H) || 1;
    el.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();

  const prop = ([emoji, x, y, size]) => `<span class="ls-prop" style="left:${x}%;top:${y}%;font-size:${size}px">${picture ? picture(emoji) || esc(emoji) : esc(emoji)}</span>`;

  function setBackdrop(key) {
    const scene = SCENES[key] || SCENES.park;
    if (current === key) return;
    current = key;
    tweens.forEach((t) => t.kill?.());
    tweens = [];
    el.dataset.backdrop = key;
    layers.sky.style.background = `linear-gradient(180deg, ${scene.sky[0]} 0%, ${scene.sky[1]} 70%)`;
    layers.sky.innerHTML = `${scene.sun ? `<span class="ls-sun"></span>` : ""}${scene.stars ? `<span class="ls-starfield"></span>` : ""}${scene.clouds ? `<span class="ls-cloud c1"></span><span class="ls-cloud c2"></span><span class="ls-cloud c3"></span>` : ""}`;
    layers.hills.innerHTML = `
      <svg viewBox="0 0 1920 520" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 250 C 320 120, 640 300, 960 200 S 1600 90, 1920 210 L1920 520 L0 520Z" fill="${scene.hill}" opacity="0.75"/>
        <path d="M0 340 C 400 250, 760 400, 1160 320 S 1700 260, 1920 330 L1920 520 L0 520Z" fill="${scene.ground}"/>
      </svg>`;
    const by = (layer) => scene.props.filter((p) => p[4] === layer).map(prop).join("");
    layers.far.innerHTML = by("far");
    layers.mid.innerHTML = by("mid");
    layers.near.innerHTML = by("near");
    const url = artUrl(key);
    layers.art.style.backgroundImage = url ? `url("${url}")` : "";
    el.classList.toggle("has-art", !!url);
    tweens.push(drift(layers.far, { x: 30, duration: 34 }), drift(layers.mid, { x: -24, duration: 26 }));
    tweens.push(float(layers.far.querySelectorAll(".ls-prop"), { amp: 10, duration: 3.4 }));
  }

  return {
    el,
    layers,
    setBackdrop,
    destroy() { tweens.forEach((t) => t.kill?.()); ro.disconnect(); el.remove(); },
  };
}
