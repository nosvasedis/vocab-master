/* Speak — pair-work speaking: a prompt with sentence frames, a visible partner timer, then a model answer. */
import { pop, rise } from "../motion.js";

export default {
  type: "speak",
  label: "Speaking",
  icon: "🗣️",
  mount(ctx, scene) {
    ctx.setBackdrop(scene.backdrop || ctx.lesson.setting);
    let timer = null;
    let left = scene.timerSec || 60;
    let running = false;
    const frames = (scene.frames || []).map((f) => ctx.esc(f).replace(/_{2,}/g, '<span class="sp-blank">&nbsp;</span>'));

    function render(stepIdx) {
      ctx.ui.innerHTML = `
        <div class="sp">
          <div class="sp-head"><span class="sp-pair">${scene.partner === false ? "🙋" : "👫"}</span><p class="sp-prompt">${ctx.karaoke(scene.prompt.text, { props: scene.prompt.props || [] })}</p></div>
          <div class="sp-frames">${frames.map((f) => `<div class="sp-frame">${f}</div>`).join("")}</div>
          ${stepIdx >= 1 ? `<div class="sp-timer"><div class="sp-clock"><b>${fmt(left)}</b><span>${running ? "Talk with your partner" : "Paused"}</span></div><div class="sp-bar"><i style="width:${(left / (scene.timerSec || 60)) * 100}%"></i></div><button type="button" class="ls-btn ghost sp-toggle">${running ? "⏸ Pause" : "▶ Start"}</button></div>` : ""}
          ${stepIdx >= 2 && scene.model ? `<div class="sp-model"><span>⭐ Example answer</span><p>${ctx.karaoke(scene.model.text, { props: scene.model.props || [] })}</p></div>` : ""}
        </div>`;
      ctx.ui.querySelector(".sp-toggle")?.addEventListener("click", () => (running ? pause() : start()));
    }

    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    function tick() {
      left -= 1;
      const clock = ctx.ui.querySelector(".sp-clock b");
      const bar = ctx.ui.querySelector(".sp-bar i");
      if (clock) clock.textContent = fmt(Math.max(0, left));
      if (bar) bar.style.width = `${(Math.max(0, left) / (scene.timerSec || 60)) * 100}%`;
      if (left <= 5 && left > 0) ctx.sfx.tick();
      if (left <= 0) { pause(); ctx.sfx.buzzer(); ctx.mascot.setPose("cheer"); }
    }
    function start() { if (left <= 0) left = scene.timerSec || 60; running = true; clearInterval(timer); timer = setInterval(tick, 1000); render(1); }
    function pause() { running = false; clearInterval(timer); timer = null; const t = ctx.ui.querySelector(".sp-toggle"); if (t) t.textContent = "▶ Start"; const s = ctx.ui.querySelector(".sp-clock span"); if (s) s.textContent = "Paused"; }

    return {
      steps: scene.model ? 3 : 2,
      async enter(i) {
        ctx.mascot.place("corner");
        ctx.clearBubble();
        if (i === 0) {
          pause();
          left = scene.timerSec || 60;
          render(0);
          ctx.mascot.setPose("talk");
          rise(ctx.ui.querySelector(".sp-head"), { y: -30 });
          pop(ctx.ui.querySelectorAll(".sp-frame"), { delay: 0.4, stagger: 0.15 });
          await ctx.say(scene.prompt, { sceneId: scene.id, el: ctx.ui.querySelector(".sp-prompt") });
          return { auto: false };
        }
        if (i === 1) {
          start();
          rise(ctx.ui.querySelector(".sp-timer"), { y: 30 });
          return { auto: false };
        }
        pause();
        render(2);
        ctx.mascot.setPose("point");
        const m = ctx.ui.querySelector(".sp-model");
        pop(m, { scale: 0.7 });
        await ctx.say(scene.model, { sceneId: scene.id, el: m.querySelector("p") });
        return { auto: false };
      },
      destroy() { clearInterval(timer); },
    };
  },
};
