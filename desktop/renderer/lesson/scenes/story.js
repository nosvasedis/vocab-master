/* Story — illustrated comic panels. Characters step in, the narrator reads the caption, then each
   speech bubble is voiced with karaoke. Every thing the text mentions is drawn right after its word and
   pops up when the voice reaches it ("show what you say", see lesson/wordpop.js).
   Characters stand on the ground at real-world heights: a child is shorter than a grown-up, a squirrel
   is small, a giant towers. Speech bubbles sit above the head, or beside it when the head is too high. */
import { pop, rise, flyIn } from "../motion.js";
import { figureBox } from "../../js/pics.js";

// Figure heights on the 1080-px stage, by the character's role (picture id "@c-timmy-child" → child).
const HEIGHTS = {
  child: 500, puppet: 480, elder: 600, adult: 640, giant: 780,
  donkey: 440, hound: 330, hare: 290, rooster: 250, squirrel: 210, chipmunk: 190, bee: 190, "bread-bun": 200,
};
const GROWN_UPS = ["teacher", "coach", "scientist", "tour-guide", "guide", "firefighter", "referee", "barber", "carpenter", "security-guard", "doctor", "ranger"];
const ROLES = [...Object.keys(HEIGHTS), ...GROWN_UPS].sort((a, b) => b.length - a.length);
// Visible figure width / picture width (people are slim; animals are wide).
const WIDTH = { donkey: 0.62, hound: 0.77, hare: 0.5, rooster: 0.62, squirrel: 0.6, chipmunk: 0.58, bee: 0.63, "bread-bun": 0.78, giant: 0.55 };
const FLOAT = { bee: 240 }; // flies above the ground
// Where the figure sits in its picture comes from manifest.figures (measured by import-pictures.mjs);
// typical values below are the fallback (the figure fills 77.5 % of the height, 11.5 % above the bottom).
const FIG = { top: 0.11, bottom: 0.885, width: null };
const EMOJI_H = 290; // characters still drawn as emoji (no picture)
const SLOTS = { 1: [50], 2: [30, 70], 3: [20, 50, 80], 4: [14, 38, 62, 86] };

/** Size of a cast member's figure in stage px — { h, w, img, foot, lift } — or null for an emoji character.
 *  img: picture size so the figure is h tall; foot: empty picture below the feet (pulled under the ground line). */
export function figureOf(emoji, box = figureBox(emoji)) {
  const m = /^@c-([a-z0-9-]+)$/.exec(String(emoji || "").trim());
  if (!m) return null;
  const role = ROLES.find((r) => m[1].endsWith(`-${r}`)) || "adult";
  const b = box || FIG;
  const h = HEIGHTS[role] ?? HEIGHTS.adult;
  const img = Math.round(h / Math.max(0.3, b.bottom - b.top));
  const w = Math.round((b.width ?? WIDTH[role] ?? 0.38) * img);
  return { role, h, img, w, foot: Math.round((1 - b.bottom) * img), lift: FLOAT[role] || 0 };
}

export default {
  type: "story",
  label: "Story",
  icon: "📖",
  mount(ctx, scene) {
    const panels = scene.panels || [];
    let alive = true;

    async function panel(i, dir) {
      const live = ctx.live();
      const p = panels[i];
      const props = p.props || [];
      const lineProps = (line) => [...(line?.props || []), ...props];
      ctx.setBackdrop(p.backdrop || ctx.lesson.setting);
      ctx.mascot.place("hidden");
      ctx.clearBubble();
      const chars = (p.characters || []).filter((c) => ctx.lesson.cast[c.who]).slice(0, 4);
      const slots = SLOTS[chars.length] || [];
      const figs = chars.map((c) => figureOf(ctx.lesson.cast[c.who].emoji));
      ctx.ui.innerHTML = `
        ${i === 0 && scene.title ? `<div class="st-title">📖 ${ctx.esc(scene.title)}</div>` : ""}
        <div class="st-page">${i + 1} / ${panels.length}</div>
        ${p.caption ? `<div class="st-caption">${ctx.karaoke(p.caption.text, { props: lineProps(p.caption), focusPics: true })}</div>` : ""}
        <div class="st-cast">${chars.map((c, k) => {
          const cast = ctx.lesson.cast[c.who];
          const f = figs[k];
          const figure = f
            ? `<span class="st-emoji st-fig" style="--img:${f.img}px;--foot:${f.foot}px">${ctx.pic(cast.emoji)}<i class="st-hit" style="width:${f.w}px;height:${f.h}px"></i></span>`
            : `<span class="st-emoji">${ctx.picFit(cast.emoji || "🙂", 260)}<i class="st-hit"></i></span>`;
          // A flying character (a bee) floats above the ground together with its name tag.
          return `<div class="st-actor" data-who="${ctx.esc(c.who)}" style="left:${slots[k]}%${f?.lift ? `;bottom:${64 + f.lift}px` : ""}"><div class="st-actor-in">
            ${figure}
            <span class="st-name">${ctx.esc(cast.name || c.who)}</span>
          </div></div>`;
        }).join("")}
        ${chars.map((c) => `<div class="st-bubble" data-for="${ctx.esc(c.who)}" hidden></div>`).join("")}</div>`;
      ctx.ui.querySelectorAll(".fw").forEach((el) => el.addEventListener("click", () => ctx.sayWordText(el.dataset.word)));
      const actors = ctx.ui.querySelectorAll(".st-actor-in");
      if (dir >= 0) flyIn(actors, { dir: i % 2 ? 1 : -1, distance: 140 }); else pop(actors, { scale: 0.85 });
      const cap = ctx.ui.querySelector(".st-caption");

      /** Where everyone stands on the stage: centre x, head top, figure box (stage px). */
      function bodies() {
        const W = ctx.ui.clientWidth || 1920;
        const H = ctx.ui.clientHeight || 1080;
        return [...ctx.ui.querySelectorAll(".st-actor")].map((actor, k) => {
          const f = figs[k];
          const nameH = actor.querySelector(".st-name")?.offsetHeight || 54;
          const bottom = parseFloat(getComputedStyle(actor).bottom) || 64;
          const h = f ? f.h : EMOJI_H;
          const w = f ? f.w : 220;
          const cx = (slots[k] / 100) * W;
          const top = H - bottom - nameH - h; // bottom already includes a flyer's lift
          return { cx, top, h, w, box: { x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + h }, head: { x0: cx - w * 0.36, x1: cx + w * 0.36, y0: top, y1: top + Math.min(h * 0.3, 200) } };
        });
      }
      const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

      /** Put a speech bubble next to its speaker's head — above it, or beside it high or low — choosing the
       *  spot that stays on stage, clear of the caption, and covers nobody else's face (then body). */
      function placeBubble(el, k) {
        const W = ctx.ui.clientWidth || 1920;
        const H = ctx.ui.clientHeight || 1080;
        const all = bodies();
        const me = all[k];
        const ceiling = (cap ? cap.offsetTop + cap.offsetHeight : 120) + 16;
        el.classList.remove("up", "left", "right");
        el.style.left = "0px"; el.style.top = "0px";
        // Crowded panels get narrower (taller) bubbles so they fit between the characters.
        el.style.maxWidth = `${all.length >= 4 ? 540 : all.length === 3 ? 640 : 720}px`;
        const bw = el.offsetWidth; const bh = el.offsetHeight;
        const floor = H - 40;
        const gap = 34;
        const upY = me.top - gap - bh;
        // Above the head: centred, or slid left/right (the tail still points at the speaker).
        const cands = [me.cx - bw / 2, me.cx - 80, me.cx - bw + 80].map((x, n) => ({ side: "up", x, y: upY, slide: n > 0 }));
        for (const side of ["right", "left"]) {
          const x = side === "right" ? me.cx + me.w / 2 + gap : me.cx - me.w / 2 - gap - bw;
          for (const y of [me.top - 20, me.top + me.h * 0.22, me.top + me.h * 0.42]) cands.push({ side, x, y });
        }
        let best = null;
        for (const c of cands) {
          // Keep the bubble on the stage (a little sliding is fine, the tail follows).
          const x = Math.max(30, Math.min(W - bw - 30, c.x));
          const y = Math.max(ceiling, Math.min(floor - bh, c.y));
          const r = { x0: x, x1: x + bw, y0: y, y1: y + bh };
          let score = Math.abs(x - c.x) * 40 + Math.abs(y - c.y) * (c.side === "up" ? 400 : 4) + (c.slide ? 600 : 0);
          all.forEach((o, j) => { if (j !== k) score += overlap(r, o.head) * 6 + overlap(r, o.box); });
          score += overlap(r, me.head) * 8 + overlap(r, me.box) * 3; // never over the speaker (it would point at someone else)
          if (c.side !== "up") score += 2000; // above the head reads best when it fits
          if (!best || score < best.score) best = { ...c, x, y, score };
        }
        el.classList.add(best.side);
        if (best.side === "up") el.style.setProperty("--tail", `${Math.max(46, Math.min(bw - 46, me.cx - best.x))}px`);
        else el.style.setProperty("--tail-y", `${Math.max(36, Math.min(bh - 36, me.top + Math.min(me.h * 0.12, 90) - best.y))}px`);
        el.style.left = `${Math.round(best.x)}px`;
        el.style.top = `${Math.round(best.y)}px`;
      }

      if (cap) { rise(cap, { y: -24 }); await ctx.say(p.caption, { sceneId: scene.id, el: cap }); }
      for (const line of p.speech || []) {
        if (!alive || !live()) return;
        const k = chars.findIndex((c) => c.who === line.who);
        const actor = k >= 0 ? ctx.ui.querySelectorAll(".st-actor")[k] : null;
        ctx.ui.querySelectorAll(".st-bubble").forEach((b) => { b.hidden = true; });
        ctx.ui.querySelectorAll(".st-actor").forEach((a) => a.classList.toggle("talking", a === actor));
        let el = null;
        if (actor) {
          el = ctx.ui.querySelector(`.st-bubble[data-for="${CSS.escape(line.who)}"]`);
          el.innerHTML = ctx.karaoke(line.text, { props: lineProps(line), focusPics: true });
          el.querySelectorAll(".fw").forEach((fw) => fw.addEventListener("click", () => ctx.sayWordText(fw.dataset.word)));
          el.hidden = false;
          placeBubble(el, k);
          pop(el, { scale: 0.7 });
        }
        await ctx.say(line, { sceneId: scene.id, el, who: line.who });
        await ctx.wait(250);
      }
      if (!live()) return;
      ctx.ui.querySelectorAll(".st-actor").forEach((a) => a.classList.remove("talking"));
      return { auto: true };
    }

    return {
      steps: panels.length,
      enter: (i, dir) => panel(i, dir),
      destroy() { alive = false; },
    };
  },
};
