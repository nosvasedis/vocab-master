/* Story — illustrated comic panels. Characters bounce in, the narrator reads the caption, then each
   speech bubble is voiced with karaoke. Focus words glow and can be tapped to hear them. */
import { pop, rise, float, flyIn } from "../motion.js";

export default {
  type: "story",
  label: "Story",
  icon: "📖",
  mount(ctx, scene) {
    const panels = scene.panels || [];
    let floats = [];
    let alive = true;

    async function panel(i, dir) {
      const live = ctx.live();
      const p = panels[i];
      floats.forEach((t) => t.kill?.());
      floats = [];
      ctx.setBackdrop(p.backdrop || ctx.lesson.setting);
      ctx.mascot.place("hidden");
      ctx.clearBubble();
      const chars = (p.characters || []).filter((c) => ctx.lesson.cast[c.who]);
      const slots = chars.length === 1 ? [50] : chars.length === 2 ? [32, 68] : [22, 50, 78];
      ctx.ui.innerHTML = `
        ${i === 0 && scene.title ? `<div class="st-title">📖 ${ctx.esc(scene.title)}</div>` : ""}
        <div class="st-page">${i + 1} / ${panels.length}</div>
        ${p.caption ? `<div class="st-caption">${ctx.karaoke(p.caption.text)}</div>` : ""}
        <div class="st-cast">${chars.map((c, k) => {
          const cast = ctx.lesson.cast[c.who];
          return `<div class="st-actor" data-who="${ctx.esc(c.who)}" style="left:${slots[k]}%">
            <div class="st-bubble" hidden></div>
            <span class="st-emoji">${ctx.pic(cast.emoji || "🙂") || ctx.esc(cast.emoji || "🙂")}</span>
            <span class="st-name">${ctx.esc(cast.name || c.who)}</span>
          </div>`;
        }).join("")}</div>`;
      ctx.ui.querySelectorAll(".fw").forEach((el) => el.addEventListener("click", () => ctx.sayWordText(el.dataset.word)));
      const actors = ctx.ui.querySelectorAll(".st-actor");
      if (dir >= 0) flyIn(actors, { dir: i % 2 ? 1 : -1, distance: 300 }); else pop(actors);
      floats.push(float(ctx.ui.querySelectorAll(".st-emoji"), { amp: 10, duration: 2.2 }));
      const cap = ctx.ui.querySelector(".st-caption");
      if (cap) { rise(cap, { y: -30 }); await ctx.say(p.caption, { sceneId: scene.id, el: cap }); }
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
          pop(el, { scale: 0.5 });
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
      destroy() { alive = false; floats.forEach((t) => t.kill?.()); },
    };
  },
};
