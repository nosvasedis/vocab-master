/* Story — illustrated comic panels. Characters step in, the narrator reads the caption, then each
   speech bubble is voiced with karaoke. Every thing the text mentions is on screen as a labelled prop,
   and a prop lights up while its word is being spoken ("show what you say"). */
import { pop, rise, flyIn } from "../motion.js";

/** Props whose label word appears in `text`. */
function propsIn(text, props) {
  const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
  const stem = (w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
  const set = new Set(words.map(stem));
  return props.map((p, i) => (String(p.label).toLowerCase().match(/[a-z]+/g) || []).some((w) => set.has(stem(w))) ? i : -1).filter((i) => i >= 0);
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
      const props = (p.props || []).slice(0, 8);
      ctx.setBackdrop(p.backdrop || ctx.lesson.setting);
      ctx.mascot.place("hidden");
      ctx.clearBubble();
      const chars = (p.characters || []).filter((c) => ctx.lesson.cast[c.who]);
      const slots = chars.length === 1 ? [50] : chars.length === 2 ? [30, 70] : [20, 50, 80];
      ctx.ui.innerHTML = `
        ${i === 0 && scene.title ? `<div class="st-title">📖 ${ctx.esc(scene.title)}</div>` : ""}
        <div class="st-page">${i + 1} / ${panels.length}</div>
        ${p.caption ? `<div class="st-caption">${ctx.karaoke(p.caption.text)}</div>` : ""}
        ${props.length ? `<div class="st-props n${props.length}">${props.map((pr, k) => `<figure class="st-prop" data-k="${k}">${ctx.picFit(pr.emoji, 120)}<figcaption>${ctx.esc(pr.label)}</figcaption></figure>`).join("")}</div>` : ""}
        <div class="st-cast">${chars.map((c, k) => {
          const cast = ctx.lesson.cast[c.who];
          return `<div class="st-actor" data-who="${ctx.esc(c.who)}" style="left:${slots[k]}%"><div class="st-actor-in">
            <div class="st-bubble" hidden></div>
            <span class="st-emoji">${ctx.picFit(cast.emoji || "🙂", 260)}</span>
            <span class="st-name">${ctx.esc(cast.name || c.who)}</span>
          </div></div>`;
        }).join("")}</div>`;
      ctx.ui.querySelectorAll(".fw").forEach((el) => el.addEventListener("click", () => ctx.sayWordText(el.dataset.word)));
      const actors = ctx.ui.querySelectorAll(".st-actor-in");
      if (dir >= 0) flyIn(actors, { dir: i % 2 ? 1 : -1, distance: 140 }); else pop(actors, { scale: 0.85 });
      const propEls = [...ctx.ui.querySelectorAll(".st-prop")];
      pop(propEls, { delay: 0.25, stagger: 0.08, scale: 0.6 });
      const light = (text) => {
        const on = new Set(propsIn(text, props));
        propEls.forEach((el, k) => el.classList.toggle("lit", on.has(k)));
      };
      const cap = ctx.ui.querySelector(".st-caption");
      if (cap) { rise(cap, { y: -24 }); light(p.caption.text); await ctx.say(p.caption, { sceneId: scene.id, el: cap }); }
      for (const line of p.speech || []) {
        if (!alive || !live()) return;
        const actor = ctx.ui.querySelector(`.st-actor[data-who="${CSS.escape(line.who || "")}"]`);
        ctx.ui.querySelectorAll(".st-bubble").forEach((b) => { b.hidden = true; });
        ctx.ui.querySelectorAll(".st-actor").forEach((a) => a.classList.toggle("talking", a === actor));
        let el = null;
        if (actor) {
          el = actor.querySelector(".st-bubble");
          el.innerHTML = ctx.karaoke(line.text);
          el.querySelectorAll(".fw").forEach((f) => f.addEventListener("click", () => ctx.sayWordText(f.dataset.word)));
          el.hidden = false;
          pop(el, { scale: 0.7 });
        }
        light(line.text);
        await ctx.say(line, { sceneId: scene.id, el, who: line.who });
        await ctx.wait(250);
      }
      if (!live()) return;
      propEls.forEach((el) => el.classList.remove("lit"));
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
