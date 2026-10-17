/* Reveal — each focus word gets its moment: picture pops in, letters bounce, the word is spoken,
   a child-friendly meaning and an example appear, then the class repeats it. Ends on a clickable word wall. */
import { pop, letters, rise, pulse, wave } from "../motion.js";

export default {
  type: "reveal",
  label: "New words",
  icon: "✨",
  mount(ctx, scene) {
    const ids = (scene.words || []).filter((id) => ctx.words.has(id));
    const greekMode = scene.greek || "after";
    ctx.setBackdrop(scene.backdrop || ctx.lesson.setting);
    let alive = true;

    const wall = () => {
      ctx.mascot.place("corner");
      ctx.mascot.setPose("cheer");
      ctx.clearBubble();
      ctx.ui.innerHTML = `
        <div class="rv-wall">
          <h2>Our new words</h2>
          <div class="rv-grid">${ids.map((id) => {
            const w = ctx.words.get(id);
            return `<button type="button" class="rv-tile" data-id="${id}"><span class="rv-tile-pic">${ctx.picFit(w.emoji, 110)}</span><b>${ctx.esc(w.english)}</b>${greekMode !== "never" ? `<span class="greek">${ctx.esc(w.greek || "")}</span>` : ""}</button>`;
          }).join("")}</div>
          <p class="rv-hint">Tap a word to hear it again</p>
        </div>`;
      pop(ctx.ui.querySelectorAll(".rv-tile"), { stagger: 0.05 });
      ctx.ui.querySelectorAll(".rv-tile").forEach((b) => b.addEventListener("click", () => {
        const w = ctx.words.get(b.dataset.id);
        pulse(b, { repeat: 1 });
        ctx.sayWord(w);
      }));
    };

    async function word(i) {
      const live = ctx.live();
      const w = ctx.words.get(ids[i]);
      const example = w.examples?.[0] || w.example || "";
      ctx.mascot.place("corner");
      ctx.mascot.setPose("point");
      ctx.clearBubble();
      ctx.ui.innerHTML = `
        <div class="rv-card">
          <div class="rv-pic">${ctx.picFit(w.emoji || "🔤", 290)}</div>
          <div class="rv-text">
            <div class="rv-count">${i + 1} / ${ids.length}</div>
            <h2 class="rv-word">${ctx.esc(w.english)}</h2>
            <div class="rv-meta"><span class="rv-type">${ctx.esc(typeName(w.type))}</span><button type="button" class="rv-say" aria-label="Hear it again">🔊</button></div>
            <p class="rv-def" hidden>${ctx.esc(w.kidDefinition || "")}</p>
            <p class="rv-ex" hidden></p>
            ${greekMode !== "never" && w.greek ? `<p class="greek rv-greek">${ctx.esc(w.greek)}${w.greekHint ? ` <small>· ${ctx.esc(w.greekHint)}</small>` : ""}</p>` : ""}
            <div class="rv-repeat" hidden>🗣️ Say it with me!</div>
          </div>
        </div>`;
      const $ = (s) => ctx.ui.querySelector(s);
      $(".rv-say").addEventListener("click", () => ctx.sayWord(w));
      pop($(".rv-pic"), { scale: 0.2 });
      letters($(".rv-word"), { delay: 0.25 });
      fitWord($(".rv-word"));
      await ctx.wait(700);
      if (!alive || !live()) return;
      await ctx.sayWord(w);
      if (!alive || !live()) return;
      await ctx.wait(1100); // a breather: let the word land before its meaning
      if (!alive || !live()) return;
      const def = $(".rv-def");
      if (!def) return;
      if (def.textContent) { def.hidden = false; rise(def, { y: 20 }); await ctx.say({ id: `def:${w.id}`, text: w.kidDefinition }, { key: `d:${ctx.lesson.id}:${w.id}`, el: null }); await ctx.wait(900); }
      if (!alive || !live()) return;
      const ex = $(".rv-ex");
      if (example) {
        ex.innerHTML = ctx.karaoke(example);
        ex.hidden = false;
        rise(ex, { y: 20 });
        await ctx.say({ id: w.id, text: example }, { key: w.examples?.[0] ? `lx:${ctx.lesson.id}:${w.id}:0` : `x:${w.id}`, el: ex });
      }
      if (!alive || !live()) return;
      // Greek stays hidden unless the teacher turns it on (ΕΛ button / G key).
      const rep = $(".rv-repeat");
      rep.hidden = false;
      pop(rep);
      pulse(rep, { repeat: 3 });
      await ctx.wait(900);
      if (!alive || !live()) return;
      // The word lights up in colour and ripples while the class says it together.
      const big = $(".rv-word");
      big.classList.add("say");
      fitWord(big);
      big.querySelectorAll(".ls-letter").forEach((l, k) => { l.style.color = SAY_COLORS[k % SAY_COLORS.length]; });
      wave(big);
      await ctx.sayWord(w, { slow: true });
      return { auto: true };
    }

    return {
      steps: ids.length + 1,
      async enter(i) {
        if (i < ids.length) return word(i);
        wall();
        return { auto: false };
      },
      destroy() { alive = false; },
    };
  },
};

/** Shrink the headword until every word fits on one line (phrases: at most two lines, breaking only at spaces). */
function fitWord(el) {
  if (!el?.parentElement) return;
  el.style.fontSize = "";
  const room = el.parentElement.clientWidth;
  const groups = [...el.querySelectorAll(".ls-wordgroup")];
  let size = parseFloat(getComputedStyle(el).fontSize) || 150;
  const fits = () => {
    const pad = parseFloat(getComputedStyle(el).paddingLeft) * 2 || 0;
    if (groups.some((g) => g.offsetWidth + pad > room)) return false;
    return new Set(groups.map((g) => g.offsetTop)).size <= 2;
  };
  while (size > 56 && !fits()) { size -= 6; el.style.fontSize = `${size}px`; }
}

const SAY_COLORS = ["#5b3df5", "#e8467c", "#f08c00", "#12a150", "#0ea5e9", "#a855f7"];

function typeName(t) {
  const m = { "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb", "phr.": "phrase", "prep.": "preposition", "phr. v.": "phrasal verb", "pron.": "pronoun", "conj.": "conjunction", "excl.": "exclamation" };
  return m[String(t || "").trim()] || String(t || "word");
}
