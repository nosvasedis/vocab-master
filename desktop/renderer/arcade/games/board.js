/* Word Board — a Jeopardy-style board for the big screen. Columns are question kinds (pictures, gaps, spelling,
   listening, Greek → English), rows are points. Whoever is up (a team, a player or the class) picks a tile; harder
   rows are worth more, and one hidden tile is a ⭐ double. Spelling tiles are judged by the teacher. */
import { buildBoard, CATEGORIES } from "../board-questions.js";
import { typeName } from "../deck.js";

const LETTERS = ["A", "B", "C", "D"];
const TIME = 20;

export default {
  id: "board",
  title: "Word Board",
  emoji: "💯",
  description: "Pick a category and the points you dare — pictures, gaps, spelling and listening. Find the hidden double!",
  tags: ["Teams", "Players", "Strategy"],
  minWords: 6,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, teams, picText, fx } = ctx;
    const board = buildBoard(ctx.deck, { greek: ctx.greek() });
    const taken = board.rows.map(() => board.cats.map(() => null)); // { won, side } per tile
    let sel = { r: 0, c: 0 };
    let open = null; // { r, c, q, answered, right }
    let timerOn = localStorage.getItem("vm_board_timer") !== "off";
    let left = TIME;
    let tick = null;
    let right = 0;
    let asked = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const total = board.rows.length * board.cats.length;
    const sideIcon = (s) => teams.badge(s, { cls: "md" });
    const pointsOf = (r, c) => board.rows[r] * (board.double.r === r && board.double.c === c ? 2 : 1);

    function progress() {
      ctx.setProgress(`<b>${asked}</b> / ${total} tiles · ${right} right`);
    }

    let last = null; // the tile just played (it flips to its result on the board)
    function showBoard() {
      clearInterval(tick);
      open = null;
      progress();
      stage.innerHTML = `
        <div class="wb">
          <div class="wb-top">${teams.solo ? `<span class="turn-banner"><span>Choose a tile!</span></span>` : `<div class="turn-banner" style="--team:${teams.active().color}"><span>Choose a tile:</span>${teams.turnHtml()}</div>`}</div>
          <div class="wb-grid" style="--cols:${board.cats.length}">
            ${board.cats.map((k) => `<div class="wb-cat"><span>${CATEGORIES[k].icon}</span><b>${esc(CATEGORIES[k].label)}</b></div>`).join("")}
            ${board.rows.map((pts, r) => board.cats.map((_, c) => {
              const t = taken[r][c];
              if (t) return `<div class="wb-tile done${t.won ? " won" : ""}${last && last.r === r && last.c === c ? " just" : ""}" style="${t.side ? `--team:${t.side.color}` : ""}">${t.won ? (t.side && !teams.solo ? `<span class="wb-who">${sideIcon(t.side)}</span>` : "✓") : "✗"}</div>`;
              return `<button type="button" class="wb-tile${sel.r === r && sel.c === c ? " sel" : ""}${last ? " still" : ""}" data-r="${r}" data-c="${c}" style="animation-delay:${(r * board.cats.length + c) * 30}ms" aria-label="${esc(CATEGORIES[board.cats[c]].label)} for ${pts}">${pts}</button>`;
            }).join("")).join("")}
          </div>
          <p class="wb-hint">Click a tile — or use the arrow keys and Enter</p>
        </div>`;
    }

    function openTile(r, c) {
      if (taken[r][c] || open) return;
      const q = board.tiles[r][c];
      const dbl = board.double.r === r && board.double.c === c;
      open = { r, c, q, answered: false, revealed: false };
      sel = { r, c };
      sfx.flip();
      const from = stage.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.getBoundingClientRect();
      if (dbl) {
        sfx.star();
        ctx.confetti({ count: 80, originY: 0.4 });
        fx.announce({ kicker: "You found it!", title: "Double points!", sub: `<span>${pointsOf(r, c)} points for this one</span>`, icon: `<span class="sx-ann-emoji">⭐</span>`, color: "#f59e0b", big: true, ms: 1700 }).then(() => { if (open) { showQuestion(); zoomFrom(from); } });
      } else { showQuestion(); zoomFrom(from); }
    }

    /** The question grows out of the tile that was picked. */
    function zoomFrom(rect) {
      const q = stage.querySelector(".qz");
      if (!rect || !q?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const to = q.getBoundingClientRect();
      const sx = rect.width / to.width;
      const sy = rect.height / to.height;
      const dx = rect.left + rect.width / 2 - (to.left + to.width / 2);
      const dy = rect.top + rect.height / 2 - (to.top + to.height / 2);
      q.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4, borderRadius: "16px" }, { transform: "none", opacity: 1 }], { duration: 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    }

    function showQuestion() {
      const { r, c, q } = open;
      const pts = pointsOf(r, c);
      left = TIME;
      const team = teams.active();
      const head = `<div class="qz-top">
          ${teams.solo ? `<span></span>` : `<div class="turn-banner" style="--team:${team.color}"><span>Question for</span>${teams.turnHtml()}</div>`}
          <div class="qz-tools">
            <span class="wb-pts">${CATEGORIES[q.kind].icon} ${esc(CATEGORIES[q.kind].label)} · <b>${pts}</b></span>
            ${q.judged ? "" : `<button type="button" class="arc-btn ghost sm" data-timer>${svg("timer", "i-sm")}${timerOn ? "Timer on" : "Timer off"}</button>`}
          </div>
        </div>`;
      const visual = q.kind === "listen"
        ? `<button type="button" class="qz-listen" data-hear>${svg("volume", "i-lg")}<span>Play the word</span></button>`
        : `${q.prompt ? `<div class="qz-prompt" ${q.kind === "greek" ? 'lang="el"' : ""}>${esc(q.prompt)}</div>` : ""}${q.picture && picText(q.picture) ? `<div class="qz-clue${q.kind === "pic" || q.kind === "spell" ? " big" : ""}">${picText(q.picture)}</div>` : ""}${q.clue ? `<div class="qz-prompt" lang="el">${esc(q.clue)}</div>` : ""}`;
      if (q.judged) {
        stage.innerHTML = `
          <div class="qz">${head}
            <div class="qz-card"><span class="qz-kind">${esc(q.ask)}</span>${visual}
              <div class="wb-letters" id="wbLetters">${Array.from({ length: q.letters }, () => "<i></i>").join("")}</div>
            </div>
            <div class="qz-foot" id="qzFoot"><span class="wb-say">The class spells it out loud, letter by letter.</span><button type="button" class="arc-btn primary" data-reveal>Show the answer<kbd>Space</kbd></button></div>
          </div>`;
        return;
      }
      stage.innerHTML = `
        <div class="qz">${head}
          <div class="qz-card">
            <div class="qz-ring${timerOn ? "" : " off"}" id="qzRing"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="prog" cx="22" cy="22" r="19"/></svg><b id="qzLeft">${TIME}</b></div>
            <span class="qz-kind">${esc(q.ask)}</span>${visual}
          </div>
          <div class="qz-options">
            ${q.options.map((o, k) => `<button type="button" class="qz-opt o${k}" data-k="${k}" style="animation-delay:${80 + k * 60}ms"><span class="qz-letter">${LETTERS[k]}</span><span class="qz-text">${esc(o)}</span></button>`).join("")}
          </div>
          <div class="qz-foot" id="qzFoot"></div>
        </div>`;
      if (q.kind === "listen") later(() => speak(q.say, { force: true }), 400);
      startTimer();
    }

    function startTimer() {
      clearInterval(tick);
      const ring = stage.querySelector("#qzRing .prog");
      if (!ring) return;
      const set = () => {
        ring.style.strokeDashoffset = String(119.4 * (1 - left / TIME));
        stage.querySelector("#qzLeft").textContent = left;
        stage.querySelector("#qzRing").classList.toggle("warn", left <= 5);
      };
      set();
      if (!timerOn) return;
      tick = setInterval(() => {
        left--;
        set();
        if (left <= 5 && left > 0) sfx.tick();
        if (left <= 0) { clearInterval(tick); finishTile(false, null); }
      }, 1000);
    }

    /** Spelling: show the word letter by letter, then the teacher says whether the class got it. */
    function reveal() {
      if (!open || open.revealed) return;
      open.revealed = true;
      const box = stage.querySelector("#wbLetters");
      const word = open.q.answerText;
      box.innerHTML = [...word].map((ch, i) => `<i class="${ch === " " ? "gap" : "on"}" style="animation-delay:${i * 90}ms">${ch === " " ? "" : esc(ch)}</i>`).join("");
      speak(open.q.say);
      stage.querySelector("#qzFoot").innerHTML = `<span class="wb-say">Did they spell it right?</span>
        <button type="button" class="arc-btn learn" data-judge="0">${svg("x", "i-sm")}Not quite<kbd>N</kbd></button>
        <button type="button" class="arc-btn know" data-judge="1">${svg("check", "i-sm")}Correct!<kbd>Y</kbd></button>`;
    }

    function finishTile(ok, k) {
      if (!open || open.answered) return;
      open.answered = true;
      clearInterval(tick);
      const { r, c, q } = open;
      const pts = pointsOf(r, c);
      asked++;
      const side = teams.active();
      stage.querySelectorAll(".qz-opt").forEach((b) => {
        const i = Number(b.dataset.k);
        b.disabled = true;
        b.classList.toggle("right", i === q.answer);
        b.classList.toggle("wrong", i === k && i !== q.answer);
        b.classList.toggle("dim", i !== q.answer && i !== k);
      });
      if (ok) {
        right++;
        sfx.correct();
        fx.sparks(stage.querySelector(".qz-opt.right, .wb-letters"), { count: pts >= 300 ? 30 : 18, color: side.color });
        teams.award(pts, { from: stage.querySelector(".qz-opt.right, .wb-letters") });
        if (pts >= 400) ctx.confetti({ count: 90, originY: 0.55 });
      } else {
        k == null && !q.judged ? sfx.buzzer() : sfx.wrong();
        fx.shake(stage.querySelector(".qz-opt.wrong") || stage.querySelector(".qz-card"));
      }
      taken[r][c] = { won: ok, side: { color: side.color, emoji: side.emoji, name: side.name, shape: side.shape } };
      if (!q.judged) speak(q.say);
      const w = q.word;
      const final = asked >= total;
      stage.querySelector("#qzFoot").innerHTML = `
        <div class="qz-explain ${ok ? "ok" : "no"}">
          <span class="qz-verdict">${ok ? `+${pts}!` : k == null && !q.judged ? "Time's up!" : "Not quite!"}</span>
          <span><b>${esc(q.answerText || w.english)}</b>${w.type ? ` <i>${esc(typeName(w.type))}</i>` : ""}${w.greek ? `<span class="gk" lang="el"> — ${esc(w.greek)}</span>` : ""}</span>
        </div>
        <button type="button" class="arc-btn primary" data-next>${final ? "See the winners" : "Back to the board"}${svg("arrow-right", "i-sm")}<kbd>Enter</kbd></button>`;
      document.activeElement?.blur?.();
      progress();
    }

    function next() {
      if (!open?.answered) return;
      teams.nextTurn();
      if (asked >= total) {
        ctx.finish({ title: "Board cleared!", stats: [{ value: `${right}/${total}`, label: "right" }] });
        return;
      }
      // Move the keyboard selection to the next free tile.
      const free = [];
      board.rows.forEach((_, r) => board.cats.forEach((__, c) => { if (!taken[r][c]) free.push({ r, c }); }));
      last = { r: open.r, c: open.c };
      sel = free.find((t) => t.r === sel.r) || free[0] || sel;
      sfx.whoosh();
      showBoard();
    }

    stage.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-r]");
      if (tile && !open) { openTile(Number(tile.dataset.r), Number(tile.dataset.c)); return; }
      const opt = e.target.closest(".qz-opt");
      if (opt && open && !open.answered) { const k = Number(opt.dataset.k); finishTile(k === open.q.answer, k); return; }
      if (e.target.closest("[data-reveal]")) { reveal(); return; }
      const judge = e.target.closest("[data-judge]");
      if (judge) { finishTile(judge.dataset.judge === "1", null); return; }
      if (e.target.closest("[data-next]")) { next(); return; }
      if (e.target.closest("[data-hear]") && open) { speak(open.q.say, { force: true }); return; }
      const t = e.target.closest("[data-timer]");
      if (t) {
        timerOn = !timerOn;
        try { localStorage.setItem("vm_board_timer", timerOn ? "on" : "off"); } catch { /* ignore */ }
        t.innerHTML = `${svg("timer", "i-sm")}${timerOn ? "Timer on" : "Timer off"}`;
        stage.querySelector("#qzRing")?.classList.toggle("off", !timerOn);
        if (open && !open.answered) { if (timerOn) startTimer(); else clearInterval(tick); }
      }
    });

    showBoard();

    return {
      /** The teacher spun or picked someone else: update whose turn it is. */
      onTurn() {
        const b = stage.querySelector(".turn-banner");
        if (!b || teams.solo || open?.answered) return;
        b.style.setProperty("--team", teams.active().color);
        b.innerHTML = `<span>${open ? "Question for" : "Choose a tile:"}</span>${teams.turnHtml()}`;
      },
      onKey(e) {
        if (!open) {
          const R = board.rows.length;
          const C = board.cats.length;
          const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
          if (move) {
            e.preventDefault();
            sel = { r: (sel.r + move[0] + R) % R, c: (sel.c + move[1] + C) % C };
            stage.querySelectorAll(".wb-tile.sel").forEach((t) => t.classList.remove("sel"));
            stage.querySelector(`[data-r="${sel.r}"][data-c="${sel.c}"]`)?.classList.add("sel");
            sfx.tap();
          } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTile(sel.r, sel.c); }
          return;
        }
        if (open.answered) { if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); next(); } return; }
        if (open.q.judged) {
          if ((e.key === " " || e.key === "Enter") && !open.revealed) { e.preventDefault(); reveal(); }
          else if (open.revealed && /^[yn]$/i.test(e.key)) finishTile(/y/i.test(e.key), null);
          return;
        }
        const idx = "abcd".indexOf(e.key.toLowerCase());
        const num = "1234".indexOf(e.key);
        const k = idx >= 0 ? idx : num;
        if (k >= 0 && k < open.q.options.length) { e.preventDefault(); finishTile(k === open.q.answer, k); }
        if (e.key === "r" || e.key === "R") speak(open.q.say, { force: true });
      },
      destroy() { clearInterval(tick); timers.forEach(clearTimeout); },
    };
  },
};
