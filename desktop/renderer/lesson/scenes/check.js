/* Check — Kahoot-style questions on the projector. Each item has two steps: ask (think timer, the class
   answers by calling out or holding up A–D cards; the teacher can tap an option) and reveal (answer + why). */
import { pop, rise, shake, pulse } from "../motion.js";

const KIND_LABEL = { pickPicture: "Choose the picture", listen: "Listen and choose", gap: "Fill the gap", trueFalse: "True or false?", oddOneOut: "Odd one out" };
const SHAPES = ["▲", "◆", "●", "■"];
const THINK_SEC = 20;

export default {
  type: "check",
  label: "Check",
  icon: "✅",
  mount(ctx, scene) {
    const items = scene.items || [];
    ctx.setBackdrop(scene.backdrop || ctx.lesson.setting);
    let timer = null;
    let answered = {};
    let alive = true;

    const optionHtml = (it, o, k) => {
      const isWord = ["pickPicture", "listen"].includes(it.kind);
      const w = isWord ? ctx.words.get(o) || ctx.wordById(o) : null;
      const label = isWord ? (w ? w.english : o) : o;
      const pic = isWord && w ? ctx.pic(w.emoji || w.emojis || "") : "";
      const hideLabel = it.kind === "listen";
      return `<button type="button" class="ck-opt c${k}" data-k="${k}">
        <span class="ck-shape">${SHAPES[k]}</span>
        ${pic ? `<span class="ck-pic">${pic}</span>` : ""}
        ${hideLabel && pic ? "" : `<span class="ck-label">${ctx.esc(label)}</span>`}
        <span class="ck-key">${"ABCD"[k]}</span>
      </button>`;
    };

    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function startTimer(ring) {
      stopTimer();
      let left = THINK_SEC;
      const circ = 2 * Math.PI * 54;
      const draw = () => {
        ring.querySelector(".ck-ring-fg").style.strokeDashoffset = String(circ * (1 - left / THINK_SEC));
        ring.querySelector(".ck-ring-num").textContent = left > 0 ? String(left) : "⏰";
        ring.classList.toggle("warn", left <= 5);
      };
      draw();
      timer = setInterval(() => {
        left -= 1;
        draw();
        if (left <= 5 && left > 0) ctx.sfx.tick();
        if (left <= 0) { stopTimer(); ctx.sfx.buzzer(); pulse(ring, { repeat: 2 }); }
      }, 1000);
    }

    function render(idx, revealed) {
      const it = items[idx];
      const listenWord = it.kind === "listen" ? ctx.words.get(it.options[it.answer]) || ctx.wordById(it.options[it.answer]) : null;
      ctx.mascot.place("corner");
      ctx.clearBubble();
      ctx.ui.innerHTML = `
        <div class="ck ${revealed ? "revealed" : ""}">
          <div class="ck-head">
            <span class="ck-kind">${ctx.esc(KIND_LABEL[it.kind] || "Question")}</span>
            <span class="ck-count">${idx + 1} / ${items.length}</span>
            ${revealed ? "" : `<div class="ck-ring"><svg viewBox="0 0 120 120"><circle class="ck-ring-bg" cx="60" cy="60" r="54"/><circle class="ck-ring-fg" cx="60" cy="60" r="54" stroke-dasharray="${2 * Math.PI * 54}"/></svg><span class="ck-ring-num"></span></div>`}
          </div>
          <div class="ck-prompt">${it.kind === "listen" ? `<button type="button" class="ck-listen">🔊 <span>Listen!</span></button>` : `<p>${ctx.karaoke(it.prompt.text, { gaps: true })}</p>`}</div>
          <div class="ck-opts n${it.options.length}">${it.options.map((o, k) => optionHtml(it, o, k)).join("")}</div>
          <div class="ck-explain" hidden>${it.explain ? ctx.karaoke(it.explain.text) : ""}</div>
        </div>`;
      const opts = [...ctx.ui.querySelectorAll(".ck-opt")];
      ctx.ui.querySelector(".ck-listen")?.addEventListener("click", () => listenWord && ctx.sayWord(listenWord));
      opts.forEach((b) => b.addEventListener("click", () => choose(idx, Number(b.dataset.k))));
      return { it, opts, listenWord };
    }

    function choose(idx, k) {
      const it = items[idx];
      const b = ctx.ui.querySelector(`.ck-opt[data-k="${k}"]`);
      if (!b || ctx.ui.querySelector(".ck.revealed")) return;
      if (k === it.answer) {
        ctx.sfx.correct();
        if (!answered[idx]) { answered[idx] = true; ctx.addStar(b); }
        b.classList.add("right");
        pulse(b, { repeat: 1 });
        stopTimer();
        setTimeout(() => alive && ctx.next(), 900);
      } else {
        ctx.sfx.wrong();
        b.classList.add("wrong");
        shake(b);
      }
    }

    return {
      steps: items.length * 2,
      async enter(i) {
        const live = ctx.live();
        const idx = Math.floor(i / 2);
        const reveal = i % 2 === 1;
        const { it, opts, listenWord } = render(idx, reveal);
        if (!reveal) {
          ctx.mascot.setPose("think");
          rise(ctx.ui.querySelector(".ck-prompt"), { y: -30 });
          pop(opts, { stagger: 0.08, delay: 0.2 });
          startTimer(ctx.ui.querySelector(".ck-ring"));
          if (listenWord) { await ctx.wait(400); if (live()) await ctx.sayWord(listenWord); await ctx.wait(900); if (live()) await ctx.sayWord(listenWord); }
          else await ctx.say(it.prompt, { sceneId: scene.id, el: ctx.ui.querySelector(".ck-prompt p") });
          return { auto: false };
        }
        stopTimer();
        ctx.mascot.setPose("cheer");
        opts.forEach((b, k) => b.classList.add(k === it.answer ? "right" : "fade"));
        pop(opts[it.answer], { scale: 0.8 });
        ctx.confetti({ count: 70, originY: 0.45 });
        const ex = ctx.ui.querySelector(".ck-explain");
        if (it.explain) {
          ex.hidden = false;
          rise(ex, { y: 20 });
          await ctx.say(it.explain, { sceneId: scene.id, el: ex });
        }
        return { auto: true };
      },
      onKey(e) {
        const k = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()];
        if (k == null) return false;
        const idx = Number(ctx.ui.querySelector(".ck-count")?.textContent.split("/")[0]) - 1;
        if (idx >= 0) choose(idx, k);
        return true;
      },
      destroy() { alive = false; stopTimer(); },
    };
  },
};
