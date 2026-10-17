/* Quiz Show — four-option questions with a countdown, streaks and a 50:50 lifeline per team. */
import { buildDetectiveQuestions } from "../deck.js";

const LETTERS = ["A", "B", "C", "D"];
const TIME = 20;

export default {
  id: "quiz",
  title: "Quiz Show",
  emoji: "🏆",
  description: "Game-show questions on meaning, gaps and word families — beat the clock, build a streak.",
  tags: ["Teams", "Meaning", "Fast"],
  minWords: 4,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, teams } = ctx;
    const questions = buildDetectiveQuestions(ctx.deck, Math.min(10, ctx.deck.length));
    let q = 0;
    let answered = false;
    let timerOn = localStorage.getItem("vm_quiz_timer") !== "off";
    let left = TIME;
    let tick = null;
    let streak = 0;
    let correct = 0;
    const lifelines = new Map(); // team index → used
    const timers = [];

    function render() {
      const item = questions[q];
      answered = false;
      left = TIME;
      const team = teams.active();
      const teamIdx = teams.teams.indexOf(team);
      ctx.setProgress(`Question <b>${q + 1}</b> / ${questions.length}${streak > 1 ? ` · 🔥 ${streak} streak` : ""}`);
      stage.innerHTML = `
        <div class="qz">
          <div class="qz-top">
            ${teams.solo ? `<span></span>` : `<div class="turn-banner" style="--team:${team.color}">Question for ${team.emoji} ${esc(team.name)}</div>`}
            <div class="qz-tools">
              <button type="button" class="arc-btn ghost sm" data-fifty ${lifelines.get(teamIdx) ? "disabled" : ""}>${svg("scissors", "i-sm")}50 : 50</button>
              <button type="button" class="arc-btn ghost sm" data-timer>${svg("timer", "i-sm")}${timerOn ? "Timer on" : "Timer off"}</button>
            </div>
          </div>
          <div class="qz-card">
            <div class="qz-ring${timerOn ? "" : " off"}" id="qzRing"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="prog" cx="22" cy="22" r="19"/></svg><b id="qzLeft">${TIME}</b></div>
            <span class="qz-kind">${esc(item.kindLabel)}</span>
            ${item.speakOnly
              ? `<button type="button" class="qz-listen" data-hear>${svg("volume", "i-lg")}<span>Play the word</span></button>`
              : `<div class="qz-prompt" ${item.promptLang ? `lang="${item.promptLang}"` : ""}>${esc(item.prompt)}</div>`}
            ${item.clue ? `<div class="qz-clue">${esc(item.clue)}</div>` : ""}
          </div>
          <div class="qz-options">
            ${item.options.map((o, k) => `<button type="button" class="qz-opt o${k}" data-opt="${esc(o)}" style="animation-delay:${80 + k * 60}ms"><span class="qz-letter">${LETTERS[k]}</span><span class="qz-text">${esc(o)}</span></button>`).join("")}
          </div>
          <div class="qz-foot" id="qzFoot"></div>
        </div>`;
      if (item.speakOnly) timers.push(setTimeout(() => speak(item.answer, { force: true }), 400));
      startTimer();
    }

    function startTimer() {
      clearInterval(tick);
      const ring = stage.querySelector("#qzRing .prog");
      const set = () => {
        const frac = left / TIME;
        ring.style.strokeDashoffset = String(119.4 * (1 - frac));
        stage.querySelector("#qzLeft").textContent = left;
        stage.querySelector("#qzRing").classList.toggle("warn", left <= 5);
      };
      set();
      if (!timerOn) return;
      tick = setInterval(() => {
        left--;
        set();
        if (left <= 5 && left > 0) sfx.tick();
        if (left <= 0) {
          clearInterval(tick);
          answer(null);
        }
      }, 1000);
    }

    function answer(choice) {
      if (answered) return;
      answered = true;
      clearInterval(tick);
      const item = questions[q];
      const right = choice != null && choice.toLowerCase() === item.answer.toLowerCase();
      stage.querySelectorAll(".qz-opt").forEach((b) => {
        const isAns = b.dataset.opt.toLowerCase() === item.answer.toLowerCase();
        b.disabled = true;
        b.classList.toggle("right", isAns);
        b.classList.toggle("wrong", !isAns && b.dataset.opt === choice);
        b.classList.toggle("dim", !isAns && b.dataset.opt !== choice);
      });
      const foot = stage.querySelector("#qzFoot");
      const w = item.target;
      if (right) {
        correct++;
        streak++;
        const pts = 10 + (timerOn ? Math.ceil(left / 4) : 0) + (streak >= 3 ? 5 : 0);
        sfx.correct();
        teams.award(pts, { from: stage.querySelector(".qz-opt.right") });
        if (streak >= 3) ctx.confetti({ count: 90, originY: 0.55 });
      } else {
        streak = 0;
        choice == null ? sfx.buzzer() : sfx.wrong();
      }
      speak(item.answer);
      foot.innerHTML = `
        <div class="qz-explain ${right ? "ok" : "no"}">
          <span class="qz-verdict">${right ? "Correct!" : choice == null ? "Time's up!" : "Not quite!"}</span>
          <span><b>${esc(w.english)}</b>${w.type ? ` <i>${esc(w.type)}</i>` : ""}${w.greek ? ` — <span lang="el">${esc(w.greek)}</span>` : ""}${w.collocation && w.collocation.toLowerCase() !== w.english.toLowerCase() ? ` · “${esc(w.collocation)}”` : ""}</span>
        </div>
        <button type="button" class="arc-btn primary" data-next>${q + 1 < questions.length ? "Next question" : "See results"}${svg("arrow-right", "i-sm")}<kbd>Enter</kbd></button>`;
      document.activeElement?.blur?.();
    }

    function next() {
      teams.nextTurn();
      q++;
      if (q >= questions.length) {
        ctx.finish({ title: "Quiz complete!", stats: [{ value: `${correct}/${questions.length}`, label: "correct" }] });
        return;
      }
      sfx.whoosh();
      render();
    }

    function fifty() {
      const teamIdx = teams.teams.indexOf(teams.active());
      if (answered || lifelines.get(teamIdx)) return;
      lifelines.set(teamIdx, true);
      const item = questions[q];
      const wrong = [...stage.querySelectorAll(".qz-opt")].filter((b) => b.dataset.opt.toLowerCase() !== item.answer.toLowerCase());
      wrong.sort(() => Math.random() - 0.5).slice(0, 2).forEach((b) => { b.disabled = true; b.classList.add("gone"); });
      stage.querySelector("[data-fifty]").disabled = true;
      sfx.pop();
    }

    stage.addEventListener("click", (e) => {
      const o = e.target.closest("[data-opt]");
      if (o && !o.disabled) { answer(o.dataset.opt); return; }
      if (e.target.closest("[data-next]")) next();
      if (e.target.closest("[data-fifty]")) fifty();
      if (e.target.closest("[data-hear]")) speak(questions[q].answer, { force: true });
      if (e.target.closest("[data-timer]")) {
        timerOn = !timerOn;
        localStorage.setItem("vm_quiz_timer", timerOn ? "on" : "off");
        const b = stage.querySelector("[data-timer]");
        b.innerHTML = `${svg("timer", "i-sm")}${timerOn ? "Timer on" : "Timer off"}`;
        stage.querySelector("#qzRing").classList.toggle("off", !timerOn);
        if (!answered) { if (timerOn) startTimer(); else clearInterval(tick); }
      }
    });

    if (!questions.length) {
      stage.innerHTML = `<div class="arc-empty">Add at least four words to play the Quiz Show.</div>`;
      return {};
    }
    render();

    return {
      onKey(e) {
        const k = e.key.toLowerCase();
        const idx = ["1", "2", "3", "4"].indexOf(k) >= 0 ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
        if (!answered && idx >= 0) {
          const b = stage.querySelectorAll(".qz-opt")[idx];
          if (b && !b.disabled) answer(b.dataset.opt);
        } else if (answered && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
          e.preventDefault();
          next();
        }
      },
      destroy() { clearInterval(tick); timers.forEach(clearTimeout); },
    };
  },
};
