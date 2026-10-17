/* Flashcards — flip, swipe right "I know it", swipe left "Still learning". */
import { englishParts, typeName, maskWordInText } from "../deck.js";

export default {
  id: "flashcards",
  title: "Flashcards",
  emoji: "🃏",
  description: "Flip giant cards, say the word, then sort them into “know it” and “still learning”.",
  tags: ["Whole class", "Speaking", "Warm-up"],
  minWords: 1,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, pic } = ctx;
    let deck = ctx.deck;
    let i = 0;
    let flipped = false;
    // "english" = word first; "picture" = picture (and Greek, when it's on) first.
    let front = localStorage.getItem("vm_fc_front") === "english" ? "english" : localStorage.getItem("vm_fc_front") ? "picture" : "english";
    const status = new Map(); // english → "know" | "learn"

    stage.innerHTML = `
      <div class="fc">
        <div class="fc-bar">
          <div class="arc-seg sm" id="fcFront">
            <button type="button" data-front="english">English first</button>
            <button type="button" data-front="picture" id="fcPicFirst">Picture first</button>
          </div>
          <div class="fc-dots" id="fcDots"></div>
        </div>
        <div class="fc-arena">
          <button type="button" class="fc-nav prev" data-nav="-1" aria-label="Previous card">${svg("chevron-left")}</button>
          <div class="fc-stack" id="fcStack"></div>
          <button type="button" class="fc-nav next" data-nav="1" aria-label="Next card">${svg("chevron-right")}</button>
        </div>
        <div class="fc-actions">
          <button type="button" class="arc-btn learn" data-mark="learn">${svg("rotate", "i-sm")}Still learning <kbd>1</kbd></button>
          <button type="button" class="arc-btn ghost" data-flip>${svg("refresh", "i-sm")}Flip <kbd>Space</kbd></button>
          <button type="button" class="arc-btn know" data-mark="know">${svg("check", "i-sm")}I know it <kbd>2</kbd></button>
        </div>
      </div>`;

    const stack = stage.querySelector("#fcStack");

    const family = (w) => {
      const rows = [];
      if (w.synonyms) rows.push(["≈", englishParts(w.synonyms).join(", ")]);
      if (w.antonyms) rows.push(["≠", englishParts(w.antonyms).join(", ")]);
      if (w.derivatives) rows.push(["🌱", englishParts(w.derivatives).join(", ")]);
      return rows.filter((r) => r[1]);
    };

    function cardHtml(w) {
      const emoji = pic(w.emojis);
      const englishFace = `
        <div class="fc-face-inner">
          ${w.type ? `<span class="fc-pos">${esc(typeName(w.type))}</span>` : ""}
          <div class="fc-word">${esc(w.english)}</div>
          <button type="button" class="fc-say" data-say aria-label="Hear it">${svg("volume")}</button>
          <span class="fc-tap">Tap to flip</span>
        </div>`;
      const gap = maskWordInText(w.example, w.english, "_____") || maskWordInText(w.collocation, w.english, "_____");
      const pictureFace = `
        <div class="fc-face-inner">
          ${emoji ? `<div class="fc-emoji xl">${emoji}</div>` : ""}
          ${w.greek ? `<div class="fc-greek gk" lang="el">${esc(w.greek)}</div>` : ""}
          ${!emoji && gap ? `<div class="fc-gap">“${esc(gap)}”</div>` : ""}
          <span class="fc-tap">What's the English word?</span>
        </div>`;
      // A picture-first card needs something to show: a picture, a gapped sentence, or Greek when it's on.
      const canPicture = !!(emoji || gap || (ctx.greek() && w.greek));
      const fam = family(w);
      const back = `
        <div class="fc-face-inner back">
          <div class="fc-back-top">${emoji ? `<span class="fc-emoji sm">${emoji}</span>` : ""}${w.type ? `<span class="fc-pos">${esc(typeName(w.type))}</span>` : ""}</div>
          <div class="fc-word sm">${esc(w.english)}</div>
          ${w.greek ? `<div class="fc-greek sm gk" lang="el">${esc(w.greek)}</div>` : ""}
          ${w.collocation && w.collocation.toLowerCase() !== w.english.toLowerCase() ? `<div class="fc-phrase">“${esc(w.collocation)}”</div>` : ""}
          ${fam.length ? `<div class="fc-family">${fam.map(([s, t]) => `<span><b>${s}</b>${esc(t)}</span>`).join("")}</div>` : ""}
          <div class="fc-oracy">${svg("mic", "i-sm")}<span>${esc(w.oracyPrompt)}</span></div>
          <button type="button" class="fc-say" data-say aria-label="Hear it">${svg("volume")}</button>
        </div>`;
      return `<div class="fc-card" tabindex="0" aria-label="Flashcard ${i + 1} of ${deck.length}">
        <div class="fc-inner">
          <div class="fc-face fc-front">${front === "picture" && canPicture ? pictureFace : englishFace}</div>
          <div class="fc-face fc-back">${back}</div>
        </div>
        <div class="fc-stamp know">I KNOW IT</div>
        <div class="fc-stamp learn">PRACTISE</div>
      </div>`;
    }

    function renderDots() {
      stage.querySelector("#fcDots").innerHTML = deck.map((w, k) => `<span class="${status.get(w.english) || ""}${k === i ? " cur" : ""}"></span>`).join("");
      const known = [...status.values()].filter((s) => s === "know").length;
      ctx.setProgress(`<b>${i + 1}</b> / ${deck.length} · ${known} known`);
    }

    function render(dir = 0) {
      flipped = false;
      const w = deck[i];
      stack.innerHTML = cardHtml(w);
      const card = stack.querySelector(".fc-card");
      if (dir) card.classList.add(dir > 0 ? "in-right" : "in-left");
      wireCard(card);
      renderDots();
      stage.querySelectorAll("[data-front]").forEach((b) => b.classList.toggle("on", b.dataset.front === front));
      if (front === "english" || !stack.querySelector(".fc-greek, .fc-emoji.xl, .fc-gap")) speak(w.english);
    }

    function flip() {
      const card = stack.querySelector(".fc-card");
      if (!card) return;
      flipped = !flipped;
      card.classList.toggle("flipped", flipped);
      sfx.flip();
      if (flipped && front === "picture") speak(deck[i].english);
    }

    function go(delta) {
      const n = i + delta;
      if (n < 0 || n >= deck.length) return;
      i = n;
      sfx.whoosh();
      render(delta);
    }

    function mark(kind) {
      const card = stack.querySelector(".fc-card");
      if (!card || card.classList.contains("leaving")) return;
      status.set(deck[i].english, kind);
      kind === "know" ? sfx.correct() : sfx.pop();
      card.classList.add("leaving", kind === "know" ? "out-right" : "out-left");
      setTimeout(() => {
        const next = deck.findIndex((w, k) => k > i && !status.has(w.english));
        const wrap = deck.findIndex((w) => !status.has(w.english));
        if (next >= 0) { i = next; render(1); }
        else if (wrap >= 0) { i = wrap; render(1); }
        else finish();
      }, 320);
    }

    function finish() {
      const learn = deck.filter((w) => status.get(w.english) === "learn");
      const known = deck.length - learn.length;
      ctx.finish({
        title: known === deck.length ? "You know every word!" : "Deck complete!",
        subtitle: learn.length ? `Still learning: ${learn.map((w) => w.english).join(", ")}` : "Brilliant work — every card in the “know it” pile.",
        stats: [{ value: known, label: "known" }, { value: learn.length, label: "still learning" }],
        extraAction: learn.length ? {
          label: `Practise the ${learn.length} tricky ${learn.length === 1 ? "word" : "words"}`,
          run: () => {
            try { localStorage.setItem("vm_fc_retry", JSON.stringify(learn.map((w) => w.english))); } catch { /* ignore */ }
            ctx.restart();
          },
        } : null,
      });
    }

    // Swipe with pointer
    function wireCard(card) {
      let startX = 0;
      let dx = 0;
      let dragging = false;
      let moved = false;
      card.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-say]")) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        dx = 0;
        card.setPointerCapture(e.pointerId);
        card.classList.add("dragging");
      });
      card.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        dx = e.clientX - startX;
        if (Math.abs(dx) > 6) moved = true;
        card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        card.classList.toggle("hint-know", dx > 60);
        card.classList.toggle("hint-learn", dx < -60);
      });
      const end = () => {
        if (!dragging) return;
        dragging = false;
        card.classList.remove("dragging", "hint-know", "hint-learn");
        card.style.transform = "";
        if (dx > 120) mark("know");
        else if (dx < -120) mark("learn");
        else if (!moved) flip();
      };
      card.addEventListener("pointerup", end);
      card.addEventListener("pointercancel", end);
      card.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        speak(deck[i].english, { force: true });
      }));
    }

    stage.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) go(Number(nav.dataset.nav));
      const m = e.target.closest("[data-mark]");
      if (m) mark(m.dataset.mark);
      if (e.target.closest("[data-flip]")) flip();
      const f = e.target.closest("[data-front]");
      if (f && f.dataset.front !== front) {
        front = f.dataset.front;
        localStorage.setItem("vm_fc_front", front);
        render();
      }
    });

    // "Practise the tricky words" restarts with just those.
    try {
      const retry = JSON.parse(localStorage.getItem("vm_fc_retry") || "null");
      localStorage.removeItem("vm_fc_retry");
      if (Array.isArray(retry) && retry.length) {
        const set = new Set(retry);
        const sub = ctx.fullDeck.filter((w) => set.has(w.english));
        if (sub.length) deck = sub;
      }
    } catch { /* ignore */ }

    render();

    return {
      onKey(e) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        else if (e.key === "1") mark("learn");
        else if (e.key === "2") mark("know");
        else if (e.key.toLowerCase() === "s") speak(deck[i].english, { force: true });
      },
      onGreek() { render(); },
      destroy() {},
    };
  },
};
