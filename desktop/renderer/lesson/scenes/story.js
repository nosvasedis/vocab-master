/* Story — illustrated comic panels. Characters step in, the narrator reads the caption, then each
   speech bubble is voiced with karaoke. Every thing the text mentions is drawn right after its word and
   pops up when the voice reaches it ("show what you say", see lesson/wordpop.js). */
import { pop, rise, flyIn } from "../motion.js";

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
      const chars = (p.characters || []).filter((c) => ctx.lesson.cast[c.who]);
      const slots = chars.length === 1 ? [50] : chars.length === 2 ? [30, 70] : [20, 50, 80];
      ctx.ui.innerHTML = `
        ${i === 0 && scene.title ? `<div class="st-title">📖 ${ctx.esc(scene.title)}</div>` : ""}
        <div class="st-page">${i + 1} / ${panels.length}</div>
        ${p.caption ? `<div class="st-caption">${ctx.karaoke(p.caption.text, { props: lineProps(p.caption), focusPics: true })}</div>` : ""}
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
      const cap = ctx.ui.querySelector(".st-caption");
      if (cap) { rise(cap, { y: -24 }); await ctx.say(p.caption, { sceneId: scene.id, el: cap }); }
      for (const line of p.speech || []) {
        if (!alive || !live()) return;
        const actor = ctx.ui.querySelector(`.st-actor[data-who="${CSS.escape(line.who || "")}"]`);
        ctx.ui.querySelectorAll(".st-bubble").forEach((b) => { b.hidden = true; });
        ctx.ui.querySelectorAll(".st-actor").forEach((a) => a.classList.toggle("talking", a === actor));
        let el = null;
        if (actor) {
          el = actor.querySelector(".st-bubble");
          el.innerHTML = ctx.karaoke(line.text, { props: lineProps(line), focusPics: true });
          el.querySelectorAll(".fw").forEach((f) => f.addEventListener("click", () => ctx.sayWordText(f.dataset.word)));
          el.hidden = false;
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
