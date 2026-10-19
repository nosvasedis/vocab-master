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

/**
 * The rules of a Top Answers game, without any drawing (tested in Node). `turns` is the arcade's turn API (ctx.teams,
 * or players.js turnApi): mode, teams, active(), activeIndex(), award(), awardTo(), nextTurn(), nextMember(), passTo().
 *   • Whole class: every answer scores for the class.
 *   • Players: each answer scores for the child who said it; the turn moves on after every guess or strike.
 *   • Teams: the team that's up builds the round's bank, its members taking turns; three strikes and the next team
 *     may steal the bank with one guess. Each round is opened by the next team in turn, whoever stole the last one.
 * Every action returns what happened ({ kind, … }) so the game can draw it; `fx` options pass through to award().
 */
export function createFeudFlow(turns, boards) {
  const teamsMode = () => turns.mode === "teams" && turns.teams.length > 1;
  const s = {
    b: 0, revealed: new Set(), hinted: new Set(), strikes: 0, bank: 0, stealing: false, owner: -1, over: false,
    found: 0, note: "", opener: teamsMode() ? turns.activeIndex() : 0, said: new Set(),
  };
  const board = () => boards[s.b];
  const mult = () => roundMultiplier(s.b, boards.length);
  const teamName = (i) => turns.teams[i]?.name || "";
  function end(note) {
    s.over = true;
    s.note = note;
    board().answers.forEach((_, i) => s.revealed.add(i)); // show every answer
    return note;
  }
  return {
    state: s,
    teamsMode,
    mult,
    board,
    /** The class said answer `i` (typed or tapped). */
    found(i, fx = {}) {
      if (s.over || s.revealed.has(i) || !board().answers[i]) return null;
      s.revealed.add(i);
      s.said.add(`${s.b}:${i}`);
      s.found++;
      const pts = board().answers[i].points * mult();
      if (s.stealing) {
        const thief = turns.active();
        turns.award(s.bank, fx);
        turns.nextMember(); // the thief has had their go
        return { kind: "steal-won", pts: s.bank, note: end(`${thief.name} stole it with “${board().answers[i].text}”! +${s.bank}`) };
      }
      if (teamsMode()) s.bank += pts;
      else turns.award(pts, fx);
      if (turns.mode === "players") turns.nextTurn(); // players: everyone gets a go
      else if (teamsMode()) turns.nextMember(); // teams: members take turns guessing
      if (s.revealed.size >= board().answers.length) {
        if (teamsMode()) { const team = turns.active(); turns.award(s.bank, fx); return { kind: "cleared", pts, note: end(`${team.name} cleared the board! +${s.bank}`) }; }
        return { kind: "cleared", pts, note: end("Board cleared!") };
      }
      return { kind: "found", pts };
    },
    /** A wrong answer (✕). */
    strike() {
      if (s.over) return null;
      if (s.stealing) {
        turns.awardTo(s.owner, s.bank);
        turns.nextMember(); // the thief has had their go
        return { kind: "steal-lost", note: end(`No steal — ${teamName(s.owner)} keep ${s.bank} points.`) };
      }
      s.strikes++;
      if (turns.mode === "players") turns.nextTurn();
      else if (teamsMode() && s.strikes < 3) turns.nextMember();
      if (s.strikes < 3) return { kind: "strike", strikes: s.strikes };
      if (teamsMode() && s.bank > 0) {
        // The next team may steal the round's points with one right answer.
        s.owner = turns.activeIndex();
        s.stealing = true;
        turns.nextTurn();
        return { kind: "steal", strikes: s.strikes, thief: turns.active() };
      }
      if (teamsMode()) turns.nextMember(); // three strikes and nothing banked: that member has had their go too
      return { kind: "out", strikes: s.strikes, note: end("Three strikes!") };
    },
    /** 💡 Mark the top answer nobody has found (or been hinted) yet; returns its index or -1. */
    hint() {
      const i = board().answers.findIndex((_, k) => !s.revealed.has(k) && !s.hinted.has(k));
      if (i >= 0 && !s.over) s.hinted.add(i);
      return s.over ? -1 : i;
    },
    /** Show the rest of the board: a team keeps what it banked (or, mid-steal, the team that built it does). */
    revealAll(fx = {}) {
      if (s.over) return null;
      if (teamsMode() && s.bank > 0) {
        if (s.stealing) { turns.awardTo(s.owner, s.bank); return { kind: "revealed", note: end(`${teamName(s.owner)} keep ${s.bank} points.`) }; }
        const team = turns.active();
        turns.award(s.bank, fx);
        return { kind: "revealed", note: end(`${team.name} keep ${s.bank} points.`) };
      }
      return { kind: "revealed", note: end("Here are all the answers.") };
    },
    /** On to the next board ({ kind: "done" } after the last). Teams: the next team in turn opens it. */
    next() {
      if (!s.over) return null;
      if (s.b + 1 >= boards.length) return { kind: "done" };
      Object.assign(s, { b: s.b + 1, revealed: new Set(), hinted: new Set(), strikes: 0, bank: 0, stealing: false, owner: -1, over: false, note: "" });
      if (teamsMode()) {
        s.opener = (s.opener + 1) % turns.teams.length;
        turns.passTo(s.opener);
      }
      // Players: the turn already moved on after every guess, so whoever is up now opens the board.
      return { kind: "round", b: s.b, opener: teamsMode() ? turns.teams[s.opener] : null };
    },
    /** Was answer `i` of the current board said by the class (not just shown at the end)? */
    said: (i) => s.said.has(`${s.b}:${i}`),
  };
}

export default {
  id: "feud",
  title: "Top Answers",
  emoji: "📋",
  description: "“Name an animal on a farm…” — find the class's top answers on the board. Double and triple rounds, and three strikes lets the other team steal!",
  tags: ["Teams", "Speaking", "Show"],
  minWords: 3,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, teams, fx } = ctx;
    let boards = [];
    let flow = null;
    let fresh = -1; // the tile that has just flipped (only it animates)
    let entering = true; // a new board: tiles slide in one by one
    let busy = false; // a round card is on screen
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

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
      const s = flow.state;
      const board = boards[s.b];
      const m = flow.mult();
      ctx.setProgress(`Round <b>${s.b + 1}</b> / ${boards.length} · ${s.found} found`);
      const half = Math.ceil(board.answers.length / 2);
      const slot = (a, i) => {
        const k = i < half ? i : i - half;
        if (s.revealed.has(i)) {
          return `<div class="fd-slot on${s.over && !flow.said(i) ? " late" : ""}${i === fresh ? " fresh" : ""}${entering ? " enter" : ""}" style="--i:${k}" data-on="${i}"><span class="fd-n">${i + 1}</span><span class="fd-pic">${tilePic(a)}</span><b>${esc(a.text)}</b><span class="fd-pts">${a.points * m}</span></div>`;
        }
        return `<button type="button" class="fd-slot${entering ? " enter" : ""}" style="--i:${k}" data-slot="${i}" title="Tap if the class said this one"><span class="fd-n">${i + 1}</span>${s.hinted.has(i) ? `<span class="fd-hint">${letters(a)}</span>` : ""}</button>`;
      };
      const who = teams.solo || s.over ? "" : `<div class="turn-banner${s.stealing ? " steal" : ""}" style="--team:${teams.active().color}"><span>${s.stealing ? "Steal!" : "Your answer:"}</span>${teams.turnHtml()}</div>`;
      const dots = boards.map((_, i) => `<i class="${i < s.b ? "done" : i === s.b ? "now" : ""}${roundMultiplier(i, boards.length) > 1 ? " big" : ""}"></i>`).join("");
      stage.innerHTML = `
        <div class="fd m${m}${s.stealing ? " stealing" : ""}">
          <div class="fd-top">
            <div class="fd-rounds" title="Round ${s.b + 1} of ${boards.length}">${dots}</div>
            ${who}
            ${m > 1 ? `<div class="fd-mult">${m === 3 ? "TRIPLE" : "DOUBLE"} POINTS <b>×${m}</b></div>` : ""}
            ${flow.teamsMode() ? `<div class="fd-bank"><span>Round points</span><b>${s.bank}</b></div>` : ""}
          </div>
          <div class="fd-marquee${entering ? " enter" : ""}">
            <span class="fd-topic">${esc(board.topic || "📋")}</span>
            <h2 class="fd-prompt">${esc(board.prompt)}</h2>
            <span class="fd-survey">100 children surveyed</span>
          </div>
          <div class="fd-board">
            <div class="fd-col">${board.answers.slice(0, half).map((a, i) => slot(a, i)).join("")}</div>
            <div class="fd-col">${board.answers.slice(half).map((a, i) => slot(a, i + half)).join("")}</div>
          </div>
          <div class="fd-strikes">${[0, 1, 2].map((i) => `<span class="${i < s.strikes ? "on" : ""}">✕</span>`).join("")}</div>
          <div class="fd-controls" id="fdControls">
            ${s.over ? `<span class="fd-note">${esc(s.note)}</span><button type="button" class="arc-btn primary" data-next>${s.b + 1 < boards.length ? "Next round" : "See the winners"}${svg("arrow-right", "i-sm")}<kbd>Enter</kbd></button>`
              : `<input id="fdSay" placeholder="${s.stealing ? "One guess to steal…" : "Type what they say, press Enter"}" autocomplete="off" spellcheck="false" maxlength="40">
                 <button type="button" class="arc-btn primary" data-check>Check<kbd>Enter</kbd></button>
                 <button type="button" class="arc-btn ghost" data-strike title="A wrong answer">✕ Strike</button>
                 <button type="button" class="arc-btn ghost" data-hint title="Show the first letter of the top answer left">💡 Hint</button>
                 <button type="button" class="arc-btn ghost" data-show title="Show the rest of the board">Reveal all</button>`}
          </div>
        </div>`;
      entering = false;
      if (!s.over && !busy) setTimeout(() => stage.querySelector("#fdSay")?.focus(), 30);
    }

    function bigX() {
      const x = document.createElement("div");
      x.className = "fd-x";
      x.textContent = "✕".repeat(Math.max(1, Math.min(3, flow.state.strikes)));
      stage.appendChild(x);
      fx.shake(stage.querySelector(".fd-board"), { strength: 16 });
      later(() => x.remove(), 1100);
    }

    /** The round is over: show every answer, the note, and celebrate what was found. */
    function roundOver(res) {
      fresh = -1;
      render();
      if (flow.state.found) ctx.confetti({ count: flow.mult() > 1 ? 130 : 70, originY: 0.35 });
      if (res.kind === "steal-won" || res.kind === "cleared") sfx.fanfare();
    }

    function reveal(i) {
      if (busy || !flow || flow.state.over) return;
      const a = boards[flow.state.b].answers[i];
      const from = stage.querySelector(`[data-slot="${i}"]`);
      const res = flow.found(i, { from: from || stage.querySelector(".fd-prompt") });
      if (!res) return;
      sfx.correct();
      const w = a.wordId ? byId.get(a.wordId) : null;
      speak(w?.english || a.text);
      fresh = i;
      if (res.kind === "found") render();
      else roundOver(res);
      fx.sparks(stage.querySelector(`[data-on="${i}"]`), { count: 22, color: "#fbbf24" });
      if (flow.teamsMode() && res.kind === "found") fx.pop(stage.querySelector(".fd-bank b"), { scale: 1.4 });
    }

    function strike() {
      if (busy || !flow || flow.state.over) return;
      const res = flow.strike();
      if (!res) return;
      sfx.buzzer();
      if (res.kind === "steal-lost") { roundOver(res); return; }
      bigX();
      if (res.kind === "steal") {
        busy = true;
        later(async () => {
          await fx.announce({ kicker: "Three strikes!", title: "Steal!", sub: `${teams.turnHtml()}<span>one guess to steal <b>${flow.state.bank}</b> points</span>`, icon: teams.badge(res.thief, { cls: "xl" }), color: res.thief.color, ms: 1900, big: true });
          busy = false;
          render();
        }, 800);
        return;
      }
      if (res.kind === "out") { later(() => roundOver(res), 900); return; }
      later(render, 600);
    }

    function hint() {
      if (busy || !flow || flow.hint() < 0) return;
      sfx.sparkle();
      render();
    }

    /** A round card ("Round 2 · Tigers start!"), then the new board slides in. */
    async function openRound() {
      const s = flow.state;
      const m = flow.mult();
      const opener = flow.teamsMode() ? teams.active() : null;
      const up = teams.mode === "players" ? teams.player() : null;
      busy = true;
      await fx.announce({
        kicker: `Round ${s.b + 1} of ${boards.length}`,
        title: m === 3 ? "Triple points!" : m === 2 ? "Double points!" : opener ? `${opener.name} start!` : up ? `${up.name} starts!` : "Survey says…",
        sub: `${m > 1 && (opener || up) ? `${teams.turnHtml()} <span>${opener ? "open" : "opens"} the board</span>` : ""}<span class="sx-ann-q">${esc(boards[s.b].prompt)}</span>`,
        icon: opener ? teams.badge(opener, { cls: "xl" }) : up ? teams.badge(up, { cls: "xl" }) : `<span class="sx-ann-emoji">${esc(boards[s.b].topic || "📋")}</span>`,
        color: m === 3 ? "#f472b6" : m === 2 ? "#38bdf8" : opener?.color || up?.color || "#fbbf24",
        big: m > 1,
        ms: m > 1 ? 1900 : 1500,
      });
      busy = false;
      entering = true;
      render();
      sfx.reveal();
      if (m > 1) ctx.confetti({ count: 50, originY: 0.2 });
    }

    function check() {
      const input = stage.querySelector("#fdSay");
      const said = input?.value || "";
      if (!said.trim() || !flow) return;
      const i = matchAnswer(said, boards[flow.state.b].answers, flow.state.revealed);
      if (i >= 0) reveal(i);
      else { if (input) input.value = ""; strike(); }
    }

    function revealAll() {
      if (busy || !flow) return;
      const res = flow.revealAll({ from: stage.querySelector(".fd-bank") });
      if (res) { sfx.reveal(); roundOver(res); }
    }

    function next() {
      if (busy || !flow) return;
      const res = flow.next();
      if (!res) return;
      if (res.kind === "done") {
        ctx.finish({ title: "Top Answers!", stats: [{ value: String(flow.state.found), label: "answers found" }, { value: String(boards.length), label: "rounds played" }] });
        return;
      }
      fresh = -1;
      openRound();
    }

    stage.addEventListener("click", (e) => {
      const s = e.target.closest("[data-slot]");
      if (s) { reveal(Number(s.dataset.slot)); return; }
      if (e.target.closest("[data-check]")) { check(); return; }
      if (e.target.closest("[data-strike]")) { strike(); return; }
      if (e.target.closest("[data-hint]")) { hint(); return; }
      if (e.target.closest("[data-show]")) { revealAll(); return; }
      if (e.target.closest("[data-next]")) next();
    });
    stage.addEventListener("keydown", (e) => {
      if (e.target.id === "fdSay" && e.key === "Enter") { e.preventDefault(); check(); }
    });

    stage.innerHTML = `<div class="fd"><h2 class="fd-prompt fd-loading">Loading the boards…</h2></div>`;
    loadBoards().then((data) => {
      // Deep copies: the cached file is shared between games.
      boards = pickRounds(boardsForDeck(ctx.fullDeck || ctx.deck, data)).map((x) => JSON.parse(JSON.stringify(x)));
      if (!boards.length) { stage.innerHTML = `<div class="fd"><h2 class="fd-prompt">No Top Answers boards yet — run scripts/lessons/build-feud.mjs.</h2></div>`; return; }
      flow = createFeudFlow(teams, boards);
      stage.innerHTML = `<div class="fd"></div>`;
      openRound();
    });

    return {
      capturesLetters: true, // typing in the answer box must not toggle Greek
      onTurn() { if (flow && !flow.state.over && !busy) render(); },
      onKey(e) {
        if (!flow || busy) return;
        if (document.activeElement?.id === "fdSay") return; // typing an answer
        if (flow.state.over && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) { e.preventDefault(); next(); }
        else if (!flow.state.over && /^[1-8]$/.test(e.key)) { const i = Number(e.key) - 1; if (i < boards[flow.state.b].answers.length) reveal(i); }
      },
      destroy() { timers.forEach(clearTimeout); },
    };
  },
};
