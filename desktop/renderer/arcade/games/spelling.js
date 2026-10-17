/* Spell Bee — hear it, see the clue, build the word from letter tiles (or type it). */
import { shuffle, maskWordInText } from "../deck.js";

const isLetter = (ch) => /[a-z]/i.test(ch);

export default {
  id: "spelling",
  title: "Spell Bee",
  emoji: "🐝",
  description: "Listen, read the clue and build the word from jumbled letter tiles — or type it.",
  tags: ["Teams", "Spelling", "Listening"],
  minWords: 1,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, teams, pic } = ctx;
    const rounds = ctx.deck.slice(0, Math.min(10, ctx.deck.length));
    let r = 0;
    let slots = [];
    let tiles = [];
    let hints = 0;
    let misses = 0;
    let solved = false;
    let correctCount = 0;
    let timers = [];

    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

    function startRound() {
      const w = rounds[r];
      const chars = [...w.english];
      slots = chars.map((ch) => ({ ch, fixed: !isLetter(ch), value: isLetter(ch) ? "" : ch, tile: null, hinted: false }));
      let letters = chars.filter(isLetter).map((ch) => ch.toLowerCase());
      // Make sure the scramble isn't accidentally the answer.
      let mixed = shuffle(letters);
      for (let k = 0; k < 6 && letters.length > 2 && mixed.join("") === letters.join(""); k++) mixed = shuffle(letters);
      tiles = mixed.map((ch, id) => ({ id, ch, used: false }));
      hints = 0;
      misses = 0;
      solved = false;
      render();
      later(() => speak(w.english), 350);
    }

    function clueHtml(w) {
      const phrase = maskWordInText(w.collocation, w.english, "_____");
      return `
        ${pic(w.emojis) ? `<div class="sp-emoji">${pic(w.emojis)}</div>` : ""}
        ${w.greek ? `<div class="sp-greek" lang="el">${esc(w.greek)}</div>` : ""}
        ${phrase ? `<div class="sp-phrase">“${esc(phrase)}”</div>` : ""}
        <div class="sp-meta">${w.type ? `<span>${esc(w.type)}</span>` : ""}<span>${[...w.english].filter(isLetter).length} letters</span></div>`;
    }

    function render() {
      const w = rounds[r];
      ctx.setProgress(`Word <b>${r + 1}</b> / ${rounds.length} · ${correctCount} correct`);
      stage.innerHTML = `
        <div class="spell">
          ${teams.solo ? "" : `<div class="turn-banner" style="--team:${teams.active().color}">${teams.active().emoji} ${esc(teams.active().name)}, spell it!</div>`}
          <div class="sp-clue">
            ${clueHtml(w)}
            <button type="button" class="sp-hear" data-hear>${svg("volume")}<span>Hear it</span></button>
          </div>
          <div class="sp-slots" id="spSlots">${slotHtml()}</div>
          <div class="sp-tiles" id="spTiles">${tileHtml()}</div>
          <div class="sp-actions">
            <button type="button" class="arc-btn ghost" data-act="hint">${svg("bulb", "i-sm")}Hint</button>
            <button type="button" class="arc-btn ghost" data-act="clear">${svg("eraser", "i-sm")}Clear</button>
            <button type="button" class="arc-btn ghost" data-act="skip">${svg("skip", "i-sm")}Show answer</button>
          </div>
        </div>`;
    }

    const slotHtml = () => {
      // Group slots by word so long phrases wrap between words, never mid-word.
      const words = [];
      let cur = [];
      slots.forEach((s, k) => {
        if (s.ch === " ") { words.push(cur); cur = []; return; }
        cur.push([s, k]);
      });
      words.push(cur);
      return words.map((group) => `<span class="sp-wordgroup">${group.map(([s, k]) => `<span class="sp-slot${s.fixed ? " fixed" : ""}${s.value ? " filled" : ""}${s.hinted ? " hinted" : ""}" data-slot="${k}">${esc(s.value)}</span>`).join("")}</span>`).join("");
    };
    const tileHtml = () => tiles.map((t) => `<button type="button" class="sp-tile${t.used ? " used" : ""}" data-tile="${t.id}" ${t.used ? "disabled" : ""}>${esc(t.ch)}</button>`).join("");

    function refresh() {
      stage.querySelector("#spSlots").innerHTML = slotHtml();
      stage.querySelector("#spTiles").innerHTML = tileHtml();
    }

    const nextEmpty = () => slots.findIndex((s) => !s.fixed && !s.value);

    function place(tile) {
      if (solved || !tile || tile.used) return;
      const k = nextEmpty();
      if (k < 0) return;
      slots[k].value = tile.ch;
      slots[k].tile = tile.id;
      tile.used = true;
      sfx.tap();
      refresh();
      if (nextEmpty() < 0) check();
    }

    function typeLetter(ch) {
      const tile = tiles.find((t) => !t.used && t.ch === ch.toLowerCase());
      if (tile) place(tile);
      else {
        const box = stage.querySelector("#spTiles");
        box?.classList.remove("shake");
        void box?.offsetWidth;
        box?.classList.add("shake");
      }
    }

    function backspace() {
      if (solved) return;
      for (let k = slots.length - 1; k >= 0; k--) {
        const s = slots[k];
        if (!s.fixed && s.value && !s.hinted) {
          const t = tiles.find((x) => x.id === s.tile);
          if (t) t.used = false;
          s.value = "";
          s.tile = null;
          refresh();
          return;
        }
      }
    }

    function clearAll() {
      slots.forEach((s) => {
        if (!s.fixed && !s.hinted && s.value) {
          const t = tiles.find((x) => x.id === s.tile);
          if (t) t.used = false;
          s.value = "";
          s.tile = null;
        }
      });
      refresh();
    }

    function hint() {
      if (solved) return;
      // Fix the first wrong-or-empty letter with the right one.
      const k = slots.findIndex((s) => !s.fixed && s.value.toLowerCase() !== s.ch.toLowerCase());
      if (k < 0) return;
      const s = slots[k];
      if (s.value) {
        const t = tiles.find((x) => x.id === s.tile);
        if (t) t.used = false;
      }
      let tile = tiles.find((t) => !t.used && t.ch === s.ch.toLowerCase());
      if (!tile) {
        // The right letter is sitting in a later slot — take it back from there.
        const other = slots.findIndex((o, j) => j !== k && !o.fixed && !o.hinted && o.value.toLowerCase() === s.ch.toLowerCase());
        if (other >= 0) {
          tile = tiles.find((t) => t.id === slots[other].tile);
          slots[other].value = "";
          slots[other].tile = null;
        }
      }
      if (!tile) return;
      tile.used = true;
      s.value = tile.ch;
      s.tile = tile.id;
      s.hinted = true;
      hints++;
      sfx.pop();
      refresh();
      if (nextEmpty() < 0) check();
    }

    function check() {
      const w = rounds[r];
      const guess = slots.map((s) => s.value).join("").toLowerCase();
      const slotsEl = stage.querySelector("#spSlots");
      if (guess === w.english.toLowerCase()) {
        solved = true;
        correctCount++;
        slotsEl.classList.add("win");
        sfx.correct();
        const pts = Math.max(2, 10 - hints * 3 - misses * 2);
        teams.award(pts, { from: slotsEl });
        ctx.confetti({ count: 70, originY: 0.45 });
        speak(w.english);
        later(next, 1700);
      } else {
        misses++;
        sfx.wrong();
        slotsEl.classList.remove("lose");
        void slotsEl.offsetWidth;
        slotsEl.classList.add("lose");
        later(() => {
          slotsEl.classList.remove("lose");
          clearAll();
        }, 700);
      }
    }

    function reveal() {
      if (solved) return;
      solved = true;
      slots.forEach((s) => { s.value = s.ch; });
      tiles.forEach((t) => { t.used = true; });
      refresh();
      stage.querySelector("#spSlots").classList.add("revealed");
      sfx.buzzer();
      speak(rounds[r].english);
      later(next, 2200);
    }

    function next() {
      teams.nextTurn();
      r++;
      if (r >= rounds.length) {
        ctx.finish({
          title: "Spelling champions!",
          stats: [{ value: `${correctCount}/${rounds.length}`, label: "spelled right" }],
        });
        return;
      }
      sfx.whoosh();
      startRound();
    }

    stage.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tile]");
      if (t) { place(tiles.find((x) => x.id === Number(t.dataset.tile))); return; }
      const s = e.target.closest("[data-slot]");
      if (s && !solved) {
        // Tapping a filled slot sends its letter back.
        const slot = slots[Number(s.dataset.slot)];
        if (slot && !slot.fixed && slot.value && !slot.hinted) {
          const tile = tiles.find((x) => x.id === slot.tile);
          if (tile) tile.used = false;
          slot.value = "";
          slot.tile = null;
          refresh();
        }
        return;
      }
      if (e.target.closest("[data-hear]")) speak(rounds[r].english, { force: true, rate: 0.8 });
      const a = e.target.closest("[data-act]");
      if (a?.dataset.act === "hint") hint();
      if (a?.dataset.act === "clear") clearAll();
      if (a?.dataset.act === "skip") reveal();
    });

    startRound();

    return {
      onKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); typeLetter(e.key); }
        else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
        else if (e.key === "Enter" && solved) { e.preventDefault(); }
        else if (e.key === "?") hint();
        else if (e.key === " ") { e.preventDefault(); speak(rounds[r].english, { force: true, rate: 0.8 }); }
      },
      destroy() { timers.forEach(clearTimeout); },
    };
  },
};
