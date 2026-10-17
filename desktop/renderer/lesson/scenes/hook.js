/* Hook — Lingo flies in, talks the class into the topic, then asks a question for everyone to think about. */
import { rise, pop, flyIn } from "../motion.js";

export default {
  type: "hook",
  label: "Warm-up",
  icon: "👋",
  mount(ctx, scene) {
    const lines = scene.lines || [];
    const steps = lines.length + (scene.question ? 1 : 0);
    ctx.setBackdrop(scene.backdrop || ctx.lesson.setting);
    ctx.ui.innerHTML = `
      <div class="hk-title">
        <span class="hk-kicker">${ctx.esc(ctx.bookLabel)} · Big Question</span>
        <h1>${ctx.esc(ctx.lesson.bigQuestion || ctx.lesson.title)}</h1>
      </div>
      <div class="hk-question" hidden></div>`;
    const title = ctx.ui.querySelector(".hk-title");
    const q = ctx.ui.querySelector(".hk-question");
    let introduced = false;

    return {
      steps,
      async enter(i, dir) {
        if (i < lines.length) {
          q.hidden = true;
          title.hidden = false;
          ctx.mascot.place("left");
          if (!introduced || dir < 0) {
            introduced = true;
            flyIn(ctx.mascot.el, { dir: -1 });
            rise(title.children, { stagger: 0.12 });
            ctx.mascot.setPose("wave");
          } else ctx.mascot.setPose("talk");
          await ctx.speakBubble(lines[i], { sceneId: scene.id });
          return { auto: true };
        }
        title.hidden = true;
        q.hidden = false;
        ctx.clearBubble();
        ctx.mascot.place("left");
        ctx.mascot.setPose("think");
        q.innerHTML = `
          <span class="hk-q-emoji">🤔</span>
          <p class="hk-q-text">${ctx.esc(scene.question.text)}</p>
          <div class="hk-q-steps"><span>💭 Think</span><span>👫 Pair</span><span>🙋 Share</span></div>`;
        pop(q, { scale: 0.6 });
        rise(q.querySelectorAll(".hk-q-steps span"), { delay: 0.5, stagger: 0.15, y: 20 });
        await ctx.say(scene.question, { sceneId: scene.id, el: q.querySelector(".hk-q-text") });
        return { auto: false };
      },
      destroy() {},
    };
  },
};
