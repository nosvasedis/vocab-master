/* Hot Seat — one student faces away; the team describes words without the forbidden ones. Timed rounds. */
import { buildTabooCard, shuffle, typeName } from "../deck.js";
import { teamPic, avatarPic } from "../../js/pics.js";

export default {
  id: "taboo",
  title: "Hot Seat",
  emoji: "🔥",
  description: "One student faces away from the board; the team describes words without saying the forbidden ones.",
  tags: ["Teams", "Speaking", "Timed"],
  minWords: 3,
  create(ctx) {
    const { stage, esc, svg, sfx, teams, pic } = ctx;
    let seconds = Number(localStorage.getItem("vm_taboo_secs") || 60);
    let queue = shuffle(ctx.deck);
    let card = null;
    let left = seconds;
    let tick = null;
    let paused = false;
    let round = { got: [], skipped: [] };
    let roundNo = 0;
    // Teams: two rounds each. Players: each child once in the hot seat (up to 12 rounds).
    const totalRounds = () => (teams.mode === "players" ? Math.min(12, teams.teams.length) : Math.max(1, teams.teams.length) * 2);
    const timers = [];

    function drawCard() {
      if (!queue.length) queue = shuffle(ctx.deck);
      card = buildTabooCard(queue.shift(), ctx.fullDeck);
    }

    function lobby() {
      clearInterval(tick);
      const team = teams.active();
      ctx.setProgress(`Round <b>${roundNo + 1}</b> / ${totalRounds()}`);
      stage.innerHTML = `
        <div class="ts-lobby">
          <div class="ts-seat" style="--team:${team.color}">
            <span class="ts-emoji">${teams.solo ? "🪑" : teams.player() ? avatarPic(teams.player().emoji) : teamPic(team.emoji)}</span>
            <h2>${teams.solo ? "Who's in the hot seat?" : teams.player() ? `${teams.turnHtml()}<span class="ts-up">you're in the hot seat!</span>` : `${esc(team.name)}, you're up!`}</h2>
            <p>${teams.player() ? `${esc(teams.player().name)} sits with their back to the board. ${teams.mode === "teams" ? "Their team" : "Everyone else"} describes each word — in English, without the forbidden words.` : "One student sits with their back to the board. Everyone else describes each word — in English, without the forbidden words."}</p>
          </div>
          <div class="ts-settings">
            <span class="ts-label">${svg("timer", "i-sm")}Round length</span>
            <div class="arc-seg" id="tsSecs">${[45, 60, 90, 120].map((s) => `<button type="button" data-secs="${s}" class="${s === seconds ? "on" : ""}">${s}s</button>`).join("")}</div>
          </div>
          <button type="button" class="arc-btn primary xl" data-start>${svg("play", "i-sm")}Start the clock <kbd>Space</kbd></button>
        </div>`;
    }

    function startRound() {
      round = { got: [], skipped: [] };
      left = seconds;
      paused = false;
      drawCard();
      renderPlay();
      sfx.whoosh();
      tick = setInterval(() => {
        if (paused) return;
        left--;
        updateClock();
        if (left <= 5 && left > 0) sfx.urgent();
        else if (left <= 15 && left > 5) sfx.tick();
        if (left <= 0) endRound();
      }, 1000);
    }

    function renderPlay() {
      const team = teams.active();
      stage.innerHTML = `
        <div class="ts-play" style="--team:${team.color}">
          <div class="ts-side">
            <div class="ts-clock" id="tsClock">
              <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="prog" cx="60" cy="60" r="52"/></svg>
              <b id="tsLeft">${left}</b><small>seconds</small>
            </div>
            <div class="ts-tally"><span>${svg("check", "i-sm")}<b id="tsGot">${round.got.length}</b> got</span><span>${svg("skip", "i-sm")}<b id="tsSkip">${round.skipped.length}</b> skipped</span></div>
            <button type="button" class="arc-btn ghost sm" data-pause>${svg(paused ? "play" : "pause", "i-sm")}${paused ? "Resume" : "Pause"}</button>
          </div>
          <div class="ts-card" id="tsCard">${cardInner()}</div>
          <div class="ts-buttons">
            <button type="button" class="arc-btn know xl" data-got>${svg("check")}Got it! <kbd>→</kbd></button>
            <button type="button" class="arc-btn learn" data-skip>${svg("skip", "i-sm")}Skip <kbd>←</kbd></button>
          </div>
        </div>`;
      updateClock();
    }

    function cardInner() {
      return `
        <span class="ts-describe">Describe…</span>
        <div class="ts-word">${esc(card.english)}</div>
        <div class="ts-sub">${card.type ? `<span>${esc(typeName(card.type))}</span>` : ""}${pic(card.emojis) ? `<span class="ts-pic">${pic(card.emojis)}</span>` : ""}
          ${card.greek ? `<span class="ts-greek gk" lang="el">${esc(card.greek)}</span>` : ""}</div>
        <div class="ts-forbid">
          <span class="ts-forbid-label">${svg("x", "i-xs")}Don't say</span>
          ${card.forbiddenWords.map((f) => `<span class="ts-no">${esc(f)}</span>`).join("")}
        </div>`;
    }

    function updateClock() {
      const prog = stage.querySelector("#tsClock .prog");
      if (!prog) return;
      prog.style.strokeDashoffset = String(326.7 * (1 - left / seconds));
      stage.querySelector("#tsLeft").textContent = left;
      const c = stage.querySelector("#tsClock");
      c.classList.toggle("warn", left <= 15);
      c.classList.toggle("danger", left <= 5);
    }

    function nextCard(kind) {
      if (!card || left <= 0 || paused) return;
      const el = stage.querySelector("#tsCard");
      if (kind === "got") {
        round.got.push(card.english);
        teams.award(1, { from: el });
        sfx.correct();
      } else {
        round.skipped.push(card.english);
        sfx.pop();
      }
      el.classList.add(kind === "got" ? "out-up" : "out-left");
      timers.push(setTimeout(() => {
        drawCard();
        el.className = "ts-card in";
        el.innerHTML = cardInner();
        stage.querySelector("#tsGot").textContent = round.got.length;
        stage.querySelector("#tsSkip").textContent = round.skipped.length;
      }, 220));
    }

    function endRound() {
      clearInterval(tick);
      sfx.buzzer();
      const team = teams.active();
      roundNo++;
      const last = roundNo >= totalRounds();
      stage.innerHTML = `
        <div class="ts-summary" style="--team:${team.color}">
          <h2>Time's up!</h2>
          <p class="ts-big"><b>${round.got.length}</b> ${round.got.length === 1 ? "word" : "words"} for ${esc(teams.solo ? "the class" : team.name)}</p>
          <div class="ts-lists">
            <div><h4>${svg("check", "i-sm")}Got it</h4>${round.got.map((w) => `<span class="ok">${esc(w)}</span>`).join("") || "<em>—</em>"}</div>
            <div><h4>${svg("skip", "i-sm")}Skipped</h4>${round.skipped.map((w) => `<span>${esc(w)}</span>`).join("") || "<em>—</em>"}</div>
          </div>
          <button type="button" class="arc-btn primary xl" data-continue>${last ? "See the winners" : teams.solo ? "Next round" : "Next team"}${svg("arrow-right", "i-sm")}</button>
        </div>`;
      if (round.got.length >= 3) ctx.confetti({ count: 100 });
      card = null;
    }

    function cont() {
      if (roundNo >= totalRounds()) { ctx.finish({ title: "Great describing!" }); return; }
      teams.nextTurn();
      lobby();
    }

    function togglePause() {
      if (!card) return;
      paused = !paused;
      renderPlay();
      stage.querySelector(".ts-play")?.classList.toggle("paused", paused);
    }

    stage.addEventListener("click", (e) => {
      const s = e.target.closest("[data-secs]");
      if (s) {
        seconds = Number(s.dataset.secs);
        localStorage.setItem("vm_taboo_secs", String(seconds));
        stage.querySelectorAll("[data-secs]").forEach((b) => b.classList.toggle("on", b === s));
        sfx.tap();
      }
      if (e.target.closest("[data-start]")) startRound();
      if (e.target.closest("[data-got]")) nextCard("got");
      if (e.target.closest("[data-skip]")) nextCard("skip");
      if (e.target.closest("[data-pause]")) togglePause();
      if (e.target.closest("[data-continue]")) cont();
    });

    lobby();

    return {
      onKey(e) {
        const inRound = !!card && !!stage.querySelector(".ts-play");
        if (inRound) {
          if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); nextCard("got"); }
          else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "s") { e.preventDefault(); nextCard("skip"); }
          else if (e.key === " ") { e.preventDefault(); togglePause(); }
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (stage.querySelector("[data-start]")) startRound();
          else if (stage.querySelector("[data-continue]")) cont();
        }
      },
      destroy() { clearInterval(tick); timers.forEach(clearTimeout); },
    };
  },
};
