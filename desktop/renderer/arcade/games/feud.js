/* Top Answers — a Family-Feud-style board. "Name an animal on a farm…": six hidden answers, ranked by how likely
   children are to say them (boards per unit in lessons/feud.json, built by scripts/lessons/build-feud.mjs — about a
   dozen per unit, in many styles, so every game is different).
   The teacher types what the class says (or taps a tile they heard); a match flips the tile with its picture (or its
   emoji icon when the picture isn't drawn yet) and recorded word. A game is six boards; the last rounds are worth
   double and triple. Teams: the team that's up builds the round's bank, three strikes and the next team may steal it.
   Players: each answer scores for the child who said it, and turns go round after every guess. */
import { CPP_WORDBANK } from "../../coursebook-data.js";
import { stem } from "../../lesson/schema.js";
import { picForWord } from "../../js/pics.js";
import { shuffle } from "../deck.js";

const byId = new Map(CPP_WORDBANK.map((w) => [w.id, w]));
const ROUNDS = 6;
let feudData = null;
async function loadBoards() {
  if (!feudData) feudData = fetch("./lessons/feud.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { boards: {} })).catch(() => ({ boards: {} }));
  return feudData;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
/** Does what the class said match an answer (its text, an alternative, or the same word in another form)? */
export function matchAnswer(said, answers, revealed = new Set()) {
  const s = norm(said);
  if (!s) return -1;
  const sStem = s.split(" ").map(stem).join(" ");
  return answers.findIndex((a, i) => !revealed.has(i) && [a.text, ...(a.alts || [])].some((x) => {
    const n = norm(x);
    return n === s || n.split(" ").map(stem).join(" ") === sStem || (n.length > 3 && (s === `${n}s` || s === `${n}es`));
  }));
}

/** Point multiplier of round `i` of `total`: the last round counts triple, the one before double (short games: last double). */
export function roundMultiplier(i, total) {
  if (total >= 4) return i === total - 1 ? 3 : i >= total - 2 ? 2 : 1;
  return i === total - 1 && total > 1 ? 2 : 1;
}

/** Candidate boards for a deck, best first: the unit(s) whose words the deck uses most (shuffled), then boards from the
 *  same book that share deck words, then everything else. The game plays the first few. */
export function boardsForDeck(deck, data) {
  const all = data.boards || {};
  const english = new Set(deck.map((w) => w.english.toLowerCase()));
  const count = {};
  for (const w of CPP_WORDBANK) if (english.has(w.english.toLowerCase())) count[`${w.bookId}-U${w.unit}`] = (count[`${w.bookId}-U${w.unit}`] || 0) + 1;
  const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]).filter(([k]) => all[k]?.length);
  if (!ranked.length) return shuffle(Object.values(all).flat());
  const [best, top] = ranked[0];
  const own = new Set(ranked.filter(([, n], i) => i === 0 || n >= Math.max(3, top * 0.4)).map(([k]) => k));
  const fit = (b) => b.answers.filter((a) => english.has(a.text.toLowerCase())).length;
  const first = shuffle([...own].flatMap((k) => all[k]));
  // The best unit's own boards lead, so a unit-focused deck always opens on its unit.
  first.sort((a, b) => Number(b.id.startsWith(best)) - Number(a.id.startsWith(best)));
  const book = best.split("-")[0];
  const rest = shuffle(Object.entries(all).filter(([k]) => !own.has(k)).flatMap(([k, v]) => v.map((b) => ({ b, same: k.startsWith(`${book}-`) }))))
    .sort((x, y) => Number(y.same) - Number(x.same) || fit(y.b) - fit(x.b)).map((x) => x.b);
  return [...first, ...rest];
}

/** What the game plays: ROUNDS boards — never the same prompt twice, no two in a row about the same thing. */
export function pickRounds(candidates, rounds = ROUNDS) {
  const picked = [];
  const seen = new Set();
  const pool = candidates.filter((b) => !seen.has(b.prompt.toLowerCase()) && seen.add(b.prompt.toLowerCase()));
  while (picked.length < rounds && pool.length) {
    const prev = picked[picked.length - 1];
    const i = Math.max(0, pool.findIndex((b) => !prev || !b.topic || b.topic !== prev.topic));
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

export default {
  id: "feud",
  title: "Top Answers",
  emoji: "📋",
  description: "“Name an animal on a farm…” — find the class's top answers on the board. Double and triple rounds, and three strikes lets the other team steal!",
  tags: ["Teams", "Speaking", "Show"],
  minWords: 3,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, teams } = ctx;
    let boards = [];
    let b = 0;
    let revealed = new Set();
    let hinted = new Set();
    let strikes = 0;
    let bank = 0;
    let stealing = false;
    let owner = null; // the team that built the bank
    let over = false;
    let found = 0;
    let scored = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const teamsMode = () => teams.mode === "teams" && teams.teams.length > 1;
    const mult = () => roundMultiplier(b, boards.length);

    const tilePic = (a) => {
      const w = a.wordId ? byId.get(a.wordId) : null;
      const t = picForWord(w?.english || a.text, w?.type || "n.", a.icon || "");
      return t ? ctx.pic(t) : a.icon ? `<span class="fd-emoji">${esc(a.icon)}</span>` : "";
    };
    const letters = (a) => {
      const t = a.text;
      return `${esc(t[0].toUpperCase())}${[...t.slice(1)].map((c) => (c === " " ? " &nbsp;" : " _")).join("")}`;
    };

    function render() {
      const board = boards[b];
      const m = mult();
      ctx.setProgress(`Round <b>${b + 1}</b> / ${boards.length} · ${found} found`);
      const half = Math.ceil(board.answers.length / 2);
      const slot = (a, i) => revealed.has(i)
        ? `<div class="fd-slot on${over && !a._said ? " late" : ""}" style="animation-delay:0ms"><span class="fd-n">${i + 1}</span><span class="fd-pic">${tilePic(a)}</span><b>${esc(a.text)}</b><span class="fd-pts">${a.points * m}</span></div>`
        : `<button type="button" class="fd-slot" data-slot="${i}" title="Tap if the class said this one"><span class="fd-n">${i + 1}</span>${hinted.has(i) ? `<span class="fd-hint">${letters(a)}</span>` : ""}</button>`;
      const who = teams.solo || over ? "" : `<div class="turn-banner" style="--team:${teams.active().color}"><span>${stealing ? "Steal!" : "Your answer:"}</span>${teams.turnHtml()}</div>`;
      const dots = boards.map((_, i) => `<i class="${i < b ? "done" : i === b ? "now" : ""}${roundMultiplier(i, boards.length) > 1 ? " big" : ""}"></i>`).join("");
      stage.innerHTML = `
        <div class="fd m${m}">
          <div class="fd-top">
            <div class="fd-rounds" title="Round ${b + 1} of ${boards.length}">${dots}</div>
            ${who}
            ${m > 1 ? `<div class="fd-mult">${m === 3 ? "TRIPLE" : "DOUBLE"} POINTS <b>×${m}</b></div>` : ""}
            ${teamsMode() ? `<div class="fd-bank"><span>Round points</span><b>${bank}</b></div>` : ""}
          </div>
          <div class="fd-marquee">
            <span class="fd-topic">${esc(board.topic || "📋")}</span>
            <h2 class="fd-prompt">${esc(board.prompt)}</h2>
            <span class="fd-survey">100 children surveyed</span>
          </div>
          <div class="fd-board">
            <div class="fd-col">${board.answers.slice(0, half).map((a, i) => slot(a, i)).join("")}</div>
            <div class="fd-col">${board.answers.slice(half).map((a, i) => slot(a, i + half)).join("")}</div>
          </div>
          <div class="fd-strikes">${[0, 1, 2].map((i) => `<span class="${i < strikes ? "on" : ""}">✕</span>`).join("")}</div>
          <div class="fd-controls" id="fdControls">
            ${over ? `<span class="fd-note">${esc(roundNote())}</span><button type="button" class="arc-btn primary" data-next>${b + 1 < boards.length ? "Next round" : "See the winners"}${svg("arrow-right", "i-sm")}<kbd>Enter</kbd></button>`
              : `<input id="fdSay" placeholder="${stealing ? "One guess to steal…" : "Type what they say, press Enter"}" autocomplete="off" spellcheck="false" maxlength="40">
                 <button type="button" class="arc-btn primary" data-check>Check<kbd>Enter</kbd></button>
                 <button type="button" class="arc-btn ghost" data-strike title="A wrong answer">✕ Strike</button>
                 <button type="button" class="arc-btn ghost" data-hint title="Show the first letter of the top answer left">💡 Hint</button>
                 <button type="button" class="arc-btn ghost" data-show title="Show the rest of the board">Reveal all</button>`}
          </div>
        </div>`;
      if (!over) setTimeout(() => stage.querySelector("#fdSay")?.focus(), 30);
    }

    let lastNote = "";
    const roundNote = () => lastNote;

    function bigX() {
      const x = document.createElement("div");
      x.className = "fd-x";
      x.textContent = "✕".repeat(Math.max(1, strikes));
      stage.appendChild(x);
      later(() => x.remove(), 1100);
    }

    function revealAnswer(i, { score = true } = {}) {
      const board = boards[b];
      if (revealed.has(i)) return;
      revealed.add(i);
      const a = board.answers[i];
      a._said = true;
      found++;
      sfx.correct();
      const w = a.wordId ? byId.get(a.wordId) : null;
      speak(w?.english || a.text);
      const pts = a.points * mult();
      if (score) {
        if (stealing) { stealWon(a); return; }
        scored += pts;
        if (teamsMode()) bank += pts;
        else teams.award(pts, { from: stage.querySelector(`[data-slot="${i}"]`) || stage.querySelector(".fd-prompt") });
        if (teams.mode === "players") teams.nextTurn(); // players: everyone gets a go
        else if (teamsMode()) teams.nextMember?.(); // teams: members take turns guessing
      }
      if (revealed.size >= board.answers.length) { endRound(teamsMode() ? `${teams.active().name} cleared the board! +${bank}` : "Board cleared!"); return; }
      render();
    }

    function strike() {
      sfx.buzzer();
      if (stealing) { stealLost(); return; }
      strikes++;
      bigX();
      if (teams.mode === "players") teams.nextTurn();
      else if (teamsMode() && strikes < 3) teams.nextMember?.();
      if (strikes >= 3) {
        if (teamsMode() && bank > 0) {
          // The next team may steal the round's points with one right answer.
          owner = teams.active();
          stealing = true;
          teams.nextTurn();
          later(render, 900);
          return;
        }
        later(() => endRound("Three strikes!"), 900);
        return;
      }
      later(render, 600);
    }

    function stealWon(a) {
      const thief = teams.active();
      teams.award(bank, { from: stage.querySelector(".fd-bank") });
      endRound(`${thief.name} stole it with “${a.text}”! +${bank}`);
    }

    function stealLost() {
      const idx = teams.teams.indexOf(owner);
      if (idx >= 0) teams.awardTo(idx, bank);
      endRound(`No steal — ${owner.name} keep ${bank} points.`);
    }

    function endRound(note) {
      if (teamsMode() && !stealing && bank > 0 && revealed.size >= boards[b].answers.length) teams.award(bank, { from: stage.querySelector(".fd-bank") });
      over = true;
      lastNote = note;
      boards[b].answers.forEach((_, i) => revealed.add(i)); // show every answer
      if (found) ctx.confetti({ count: mult() > 1 ? 130 : 70, originY: 0.35 });
      render();
    }

    function check() {
      const input = stage.querySelector("#fdSay");
      const said = input?.value || "";
      if (!said.trim()) return;
      const i = matchAnswer(said, boards[b].answers, revealed);
      if (i >= 0) revealAnswer(i);
      else strike();
    }

    /** 💡 Show the first letter and length of the top answer nobody has found yet. */
    function hint() {
      const i = boards[b].answers.findIndex((_, k) => !revealed.has(k) && !hinted.has(k));
      if (i < 0) return;
      hinted.add(i);
      sfx.whoosh();
      render();
    }

    function next() {
      if (!over) return;
      if (b + 1 >= boards.length) {
        ctx.finish({ title: "Top Answers!", stats: [{ value: String(found), label: "answers found" }, { value: String(boards.length), label: "rounds played" }] });
        return;
      }
      b++;
      revealed = new Set();
      hinted = new Set();
      strikes = 0;
      bank = 0;
      stealing = false;
      owner = null;
      over = false;
      teams.nextTurn(); // the next team / player opens the next board
      sfx.whoosh();
      render();
      if (mult() > 1) ctx.confetti?.({ count: 40, originY: 0.2 });
    }

    stage.addEventListener("click", (e) => {
      const s = e.target.closest("[data-slot]");
      if (s && !over) { revealAnswer(Number(s.dataset.slot)); return; }
      if (e.target.closest("[data-check]")) { check(); return; }
      if (e.target.closest("[data-strike]")) { strike(); return; }
      if (e.target.closest("[data-hint]")) { hint(); return; }
      if (e.target.closest("[data-show]")) { endRound(teamsMode() && bank ? `${teams.active().name} keep ${bank} points.` : "Here are all the answers."); if (teamsMode() && bank) teams.award(bank); return; }
      if (e.target.closest("[data-next]")) next();
    });
    stage.addEventListener("keydown", (e) => {
      if (e.target.id === "fdSay" && e.key === "Enter") { e.preventDefault(); check(); }
    });

    stage.innerHTML = `<div class="fd"><h2 class="fd-prompt">Loading the boards…</h2></div>`;
    loadBoards().then((data) => {
      // Deep copies: the game marks answers as said, and the cached file is shared between games.
      boards = pickRounds(boardsForDeck(ctx.fullDeck || ctx.deck, data)).map((x) => JSON.parse(JSON.stringify(x)));
      if (!boards.length) { stage.innerHTML = `<div class="fd"><h2 class="fd-prompt">No Top Answers boards yet — run scripts/lessons/build-feud.mjs.</h2></div>`; return; }
      render();
    });

    return {
      capturesLetters: true, // typing in the answer box must not toggle Greek
      onTurn() { if (!over && boards.length) render(); },
      onKey(e) {
        if (document.activeElement?.id === "fdSay") return; // typing an answer
        if (over && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) { e.preventDefault(); next(); }
        else if (!over && /^[1-8]$/.test(e.key)) { const i = Number(e.key) - 1; if (boards[b] && i < boards[b].answers.length) revealAnswer(i); }
      },
      destroy() { timers.forEach(clearTimeout); },
    };
  },
};
