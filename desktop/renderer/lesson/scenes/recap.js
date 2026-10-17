/* Recap — a parade of the words we learnt, a badge for the class, and exit-ticket questions. */
import { pop, rise, award, float } from "../motion.js";

export default {
  type: "recap",
  label: "Recap",
  icon: "🏅",
  mount(ctx, scene) {
    ctx.setBackdrop(scene.backdrop || ctx.lesson.setting);
    const ids = [...ctx.words.keys()];
    let floats = [];
    let alive = true;

    return {
      steps: 2 + ((scene.exitTicket || []).length ? 1 : 0),
      async enter(i) {
        const live = ctx.live();
        floats.forEach((t) => t.kill?.());
        floats = [];
        ctx.clearBubble();
        if (i === 0) {
          ctx.mascot.place("left");
          ctx.mascot.setPose("talk");
          ctx.ui.innerHTML = `<div class="rc-parade">${ids.map((id) => {
            const w = ctx.words.get(id);
            return `<button type="button" class="rc-word" data-id="${id}"><span>${ctx.picFit(w.emoji, 84)}</span><b>${ctx.esc(w.english)}</b></button>`;
          }).join("")}</div>`;
          pop(ctx.ui.querySelectorAll(".rc-word"), { stagger: 0.09 });
          ctx.ui.querySelectorAll(".rc-word").forEach((b) => b.addEventListener("click", () => ctx.sayWord(ctx.words.get(b.dataset.id))));
          for (const l of scene.lines || []) { if (!alive || !live()) break; await ctx.speakBubble(l, { sceneId: scene.id }); }
          return { auto: true };
        }
        if (i === 1) {
          ctx.mascot.place("left");
          ctx.mascot.setPose("cheer");
          const b = scene.badge || { emoji: "🏅", name: "Word Star" };
          ctx.ui.innerHTML = `
            <div class="rc-badge">
              <div class="rc-medal"><span>${ctx.esc(b.emoji)}</span></div>
              <h2>${ctx.esc(b.name)}</h2>
              <p>${ctx.stars()} ⭐ earned in this lesson</p>
            </div>`;
          award(ctx.ui.querySelector(".rc-medal"));
          rise(ctx.ui.querySelectorAll(".rc-badge h2, .rc-badge p"), { delay: 0.8 });
          ctx.sfx.win();
          ctx.confetti({ count: 240, originY: 0.3 });
          setTimeout(() => alive && ctx.confetti({ count: 120, originX: 0.2, originY: 0.5 }), 500);
          setTimeout(() => alive && ctx.confetti({ count: 120, originX: 0.8, originY: 0.5 }), 800);
          return { auto: false };
        }
        ctx.mascot.place("corner");
        ctx.mascot.setPose("think");
        const qs = scene.exitTicket || [];
        ctx.ui.innerHTML = `<div class="rc-exit"><h2>🎟️ Exit ticket</h2>${qs.map((q, k) => `<div class="rc-q"><span>${k + 1}</span><p>${ctx.karaoke(q.text)}</p></div>`).join("")}</div>`;
        rise(ctx.ui.querySelectorAll(".rc-q"), { stagger: 0.2 });
        const els = ctx.ui.querySelectorAll(".rc-q p");
        for (let k = 0; k < qs.length; k++) { if (!alive || !live()) break; await ctx.say(qs[k], { sceneId: scene.id, el: els[k] }); await ctx.wait(400); }
        return { auto: false };
      },
      destroy() { alive = false; floats.forEach((t) => t.kill?.()); },
    };
  },
};
