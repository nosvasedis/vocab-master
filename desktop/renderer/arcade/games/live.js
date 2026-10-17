/* Lingo Live — a Kahoot-style quiz show for the projector.
   Teams answer with shape cards (▲ ◆ ● ■) or 1–4 fingers; the teacher taps each team's emoji on the
   answer it chose, and faster answers earn more points. Lobby → 3-2-1 → (intro → question → reveal →
   leaderboard)× → podium. Rendered on a fixed 1600×900 canvas scaled to the screen, like the lessons.
   Phase 2b adds phones (Firebase) behind the same flow. */
import { buildLiveQuestions, SHAPES } from "../live/questions.js";
import { pointsFor, rankTeams } from "../live/scoring.js";
import { playMusic, stopMusic, setTension, stings } from "../live/music.js";
import { hasVoiceFor } from "../voice.js";

const W = 1600;
const H = 900;
const SHAPE_SVG = {
  tri: `<svg viewBox="0 0 100 100"><path d="M50 10 L92 86 H8 Z"/></svg>`,
  dia: `<svg viewBox="0 0 100 100"><path d="M50 6 L94 50 L50 94 L6 50 Z"/></svg>`,
  cir: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>`,
  sq: `<svg viewBox="0 0 100 100"><rect x="12" y="12" width="76" height="76" rx="8"/></svg>`,
};
const KEYS = ["A", "B", "C", "D"];
const KIND_ICON = { pic2word: "🖼️", word2pic: "🔎", gap: "✏️", listen: "👂", greek: "🇬🇷", truefalse: "⚖️" };

export default {
  id: "live",
  title: "Lingo Live",
  emoji: "🎯",
  featured: true,
  description: "A quiz show for the big screen: shapes, countdowns, speed points, a live leaderboard and a podium finale. Teams hold up answer cards — no phones needed.",
  tags: ["Teams", "Whole class", "Speed", "Show"],
  minWords: 4,
  create(ctx) {
    const { stage, esc, svg, sfx, teams } = ctx;
    const prefs = readPrefs();
    let questions = [];
    let qi = 0;
    let phase = "lobby";
    let answers = new Map();   // team index → { opt, ms }
    let shownAt = 0;
    let left = 0;
    let tick = null;
    let selTeam = 0;           // keyboard: which team the next A–D press is for
    let timers = [];
    let show = null;           // per-show stats
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearInterval(tick); tick = null; };
    const solo = () => teams.teams.length < 2;
    const T = () => teams.teams;

    // Speak only with the recorded voice (the system voice sounds wrong in a show); "listen" questions need sound regardless.
    const say = (text, { must = false } = {}) => { if (text && (hasVoiceFor(text) || must)) ctx.speak(text, { force: must }); };

    /* ── Canvas: fixed 1600×900, scaled to fit ─────────────────────── */
    stage.innerHTML = `<div class="lv-viewport"><div class="lv" id="lv"><div class="lv-bg" aria-hidden="true">${SHAPES.map((s, k) => `<i class="lv-float s-${s}" style="--k:${k}">${SHAPE_SVG[s]}</i>`).join("")}</div><div class="lv-screen" id="lvScreen"></div></div></div>`;
    const viewport = stage.querySelector(".lv-viewport");
    const canvas = stage.querySelector("#lv");
    const screen = stage.querySelector("#lvScreen");
    const fit = () => {
      const r = viewport.getBoundingClientRect();
      const k = Math.min(r.width / W, r.height / H) || 1;
      canvas.style.transform = `translate(-50%, -50%) scale(${k})`;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(viewport);
    fit();
    const set = (html, cls = "") => { screen.className = `lv-screen ${cls}`; screen.innerHTML = html; };
    const pic = (e) => (e ? ctx.pic(e) : "");

    /* ── Lobby ─────────────────────────────────────────────────────── */
    function lobby() {
      clearTimers();
      phase = "lobby";
      ctx.setProgress(`Lobby · ${ctx.fullDeck.length} words`);
      playMusic("lobby");
      const maxQ = Math.min(20, Math.max(5, ctx.fullDeck.length * 2));
      const counts = [5, 10, 15, 20].filter((n) => n <= maxQ);
      if (!counts.includes(prefs.count)) prefs.count = counts.includes(10) ? 10 : counts[counts.length - 1];
      set(`
        <div class="lv-lobby">
          <div class="lv-logo"><span class="lv-logo-mark">🎯</span><h1>Lingo <b>Live</b></h1><p>The vocabulary quiz show</p></div>
          <div class="lv-lobby-grid">
            <section class="lv-panel lv-teams-panel">
              <h3>${solo() ? "Playing as one class" : `${T().length} teams ready`}</h3>
              <div class="lv-team-cards">${T().map((t, i) => `<div class="lv-team-card" style="--team:${t.color};--d:${i}"><span>${t.emoji}</span><b>${esc(t.name)}</b><em>Ready!</em></div>`).join("")}</div>
              <p class="lv-note">Change teams and names on the games screen.</p>
            </section>
            <section class="lv-panel lv-how">
              <h3>How to answer</h3>
              <div class="lv-how-shapes">${SHAPES.map((s, k) => `<span class="lv-chip s-${s}">${SHAPE_SVG[s]}<b>${k + 1}</b></span>`).join("")}</div>
              <p>${solo() ? "Everyone points or shows <b>1–4 fingers</b>. Tap the answer the class chose." : "Each team holds up a shape card or shows <b>1–4 fingers</b>. Tap the team's emoji on the answer it chose — <b>the faster, the more points!</b>"}</p>
              <div class="lv-modes">
                <span class="lv-mode on">📺 Cards &amp; fingers</span>
                <span class="lv-mode soon" title="Phase 2b: students join on their phones with a PIN">📱 Phones · coming next</span>
              </div>
            </section>
          </div>
          <div class="lv-settings">
            <label>Questions <span class="arc-seg" data-set="count">${counts.map((n) => `<button type="button" data-v="${n}" class="${n === prefs.count ? "on" : ""}">${n}</button>`).join("")}</span></label>
            <label>Time <span class="arc-seg" data-set="time">${[10, 20, 30].map((n) => `<button type="button" data-v="${n}" class="${n === prefs.time ? "on" : ""}">${n}s</button>`).join("")}</span></label>
          </div>
          <button type="button" class="lv-start" data-start>${svg("play")}Start the show <kbd>Space</kbd></button>
        </div>`, "is-lobby");
    }

    /* ── 3-2-1 ─────────────────────────────────────────────────────── */
    function startShow() {
      questions = buildLiveQuestions(ctx.fullDeck, { count: prefs.count, greek: ctx.greek() });
      if (!questions.length) { set(`<div class="lv-empty">Lingo Live needs at least 4 words.</div>`); return; }
      show = { pts: T().map(() => 0), streak: T().map(() => 0), right: T().map(() => 0), prevOrder: T().map((_, i) => i) };
      qi = 0;
      stopMusic(0.4);
      phase = "countdown";
      let n = 3;
      const step = () => {
        if (n === 0) { stings.countdown(0); set(`<div class="lv-count go">GO!</div>`, "is-count"); later(() => intro(), 700); return; }
        stings.countdown(n);
        set(`<div class="lv-count" style="--n:${n}">${n}</div>`, "is-count");
        n--;
        later(step, 800);
      };
      step();
    }

    /* ── Question intro ────────────────────────────────────────────── */
    function intro() {
      clearTimers();
      phase = "intro";
      const q = questions[qi];
      ctx.setProgress(`Question <b>${qi + 1}</b> / ${questions.length}`);
      set(`
        <div class="lv-intro">
          <div class="lv-intro-num">Question ${qi + 1}<small> of ${questions.length}</small></div>
          <div class="lv-intro-kind"><span>${KIND_ICON[q.kind] || "❓"}</span>${esc(q.kindLabel)}</div>
          <div class="lv-intro-bar"><i></i></div>
        </div>`, "is-intro");
      sfx.whoosh();
      later(question, 1900);
    }

    /* ── Question ──────────────────────────────────────────────────── */
    function optionHtml(o, k, q) {
      const body = o.pic ? `<span class="lv-opt-pic">${pic(o.pic)}</span>` : `<span class="lv-opt-text">${esc(o.text)}</span>`;
      const dock = solo() ? "" : `<span class="lv-dock">${T().map((t, i) => `<button type="button" class="lv-dock-btn" data-team="${i}" data-opt="${k}" style="--team:${t.color}" aria-label="${esc(t.name)} chose ${KEYS[k]}">${t.emoji}</button>`).join("")}</span>`;
      return `<div class="lv-opt s-${SHAPES[k]}${q.options.length === 2 ? " tf" : ""}" data-opt-tile="${k}" style="--d:${k}">
        <span class="lv-shape">${SHAPE_SVG[SHAPES[k]]}</span>${body}<span class="lv-key">${k + 1}</span>${dock}</div>`;
    }

    function question() {
      clearTimers();
      phase = "question";
      answers = new Map();
      selTeam = 0;
      const q = questions[qi];
      const listen = q.kind === "listen";
      const bigPic = q.picture && !q.prompt?.includes("_____");
      set(`
        <div class="lv-q">
          <header class="lv-q-head">
            <span class="lv-q-num">${qi + 1} / ${questions.length}</span>
            <span class="lv-q-kind">${KIND_ICON[q.kind] || ""} ${esc(q.kindLabel)}</span>
            <button type="button" class="lv-reveal-btn" data-reveal>Reveal <kbd>Space</kbd></button>
          </header>
          <h2 class="lv-q-prompt${q.promptLang === "el" ? " el" : ""}${(q.prompt || "").length > 70 ? " long" : ""}" ${q.promptLang ? `lang="${q.promptLang}"` : ""}>${esc(q.prompt || "").replace(/_____/g, '<span class="lv-gap"></span>')}</h2>
          <div class="lv-q-mid">
            <div class="lv-timer" id="lvTimer"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="prog" cx="60" cy="60" r="52"/></svg><b id="lvLeft">${prefs.time}</b></div>
            <div class="lv-q-visual">${listen ? `<button type="button" class="lv-listen" data-hear>👂<span>Listen again</span></button>` : bigPic ? `<span class="lv-q-pic">${pic(q.picture)}</span>` : q.picture ? `<span class="lv-q-pic sm">${pic(q.picture)}</span>` : ""}</div>
            <div class="lv-q-side">${solo() ? "" : `<div class="lv-q-answered" id="lvAnswered"><b>0</b> / ${T().length} answered</div><div class="lv-pick" id="lvPick">${T().map((t, i) => `<span class="lv-pick-team${i === 0 ? " on" : ""}" data-pick="${i}" style="--team:${t.color}"><kbd>${i + 1}</kbd>${t.emoji}</span>`).join("")}</div>`}</div>
          </div>
          <div class="lv-timebar"><i id="lvBar"></i></div>
          <div class="lv-opts${q.options.length === 2 ? " two" : ""}" id="lvOpts">${q.options.map((o, k) => optionHtml(o, k, q)).join("")}</div>
        </div>`, "is-question");
      if (listen) later(() => say(q.sayPrompt, { must: true }), 350);
      else if (q.kind === "gap" && q.sayPrompt) { /* reading time is enough; the sentence is spoken at the reveal */ }
      // Options are live straight away; the clock starts now.
      shownAt = performance.now();
      left = prefs.time;
      playMusic("question");
      updateClock();
      tick = setInterval(() => {
        left--;
        updateClock();
        if (left <= 5 && left > 0) { setTension(true); sfx.tick(); }
        if (left <= 0) { clearInterval(tick); stings.gong(); reveal(); }
      }, 1000);
    }

    function updateClock() {
      const prog = screen.querySelector("#lvTimer .prog");
      if (!prog) return;
      prog.style.strokeDashoffset = String(326.7 * (1 - left / prefs.time));
      screen.querySelector("#lvLeft").textContent = Math.max(0, left);
      screen.querySelector("#lvTimer").classList.toggle("hurry", left <= 5);
      const bar = screen.querySelector("#lvBar");
      if (bar) bar.style.transform = `scaleX(${Math.max(0, left - 1) / prefs.time})`;
    }

    function record(team, opt) {
      if (phase !== "question") return;
      const q = questions[qi];
      if (opt < 0 || opt >= q.options.length) return;
      if (solo()) { answers.set(0, { opt, ms: performance.now() - shownAt }); stings.lock(); reveal(); return; }
      const prev = answers.get(team);
      answers.set(team, { opt, ms: prev && prev.opt === opt ? prev.ms : performance.now() - shownAt });
      stings.lock();
      screen.querySelectorAll(`.lv-dock-btn[data-team="${team}"]`).forEach((b) => b.classList.toggle("chosen", Number(b.dataset.opt) === opt));
      const n = screen.querySelector("#lvAnswered b");
      if (n) { n.textContent = answers.size; n.parentElement.classList.remove("bump"); void n.offsetWidth; n.parentElement.classList.add("bump"); }
      // Keyboard flow: move to the next team that hasn't answered.
      const nextFree = T().findIndex((_, i) => !answers.has(i));
      if (nextFree >= 0) pickTeam(nextFree);
      if (answers.size === T().length) later(reveal, 700);
    }

    function pickTeam(i) {
      selTeam = i;
      screen.querySelectorAll("[data-pick]").forEach((p) => p.classList.toggle("on", Number(p.dataset.pick) === i));
    }

    /* ── Reveal ────────────────────────────────────────────────────── */
    function reveal() {
      if (phase !== "question") return;
      clearTimers();
      phase = "reveal";
      stopMusic(0.25);
      setTension(false);
      const q = questions[qi];
      const limit = prefs.time * 1000;
      const results = T().map((t, i) => {
        const a = answers.get(i);
        const correct = !!a && a.opt === q.answer;
        show.streak[i] = correct ? show.streak[i] + 1 : 0;
        const pts = pointsFor({ correct, elapsedMs: a?.ms ?? limit, limitMs: limit, streak: show.streak[i] });
        if (correct) show.right[i]++;
        show.pts[i] += pts;
        return { i, t, a, correct, pts, streak: show.streak[i] };
      });
      const anyRight = results.some((r) => r.correct);
      anyRight ? sfx.correct() : sfx.wrong();
      screen.querySelectorAll("[data-opt-tile]").forEach((el) => {
        const k = Number(el.dataset.optTile);
        el.classList.add(k === q.answer ? "right" : "wrong");
      });
      screen.querySelector(".lv-reveal-btn")?.remove();
      screen.classList.add("revealed");
      const w = q.word;
      const ex = String(w.example || "");
      const exHtml = ex ? esc(ex).replace(new RegExp(`\\b(${w.english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)`, "i"), "<mark>$1</mark>") : "";
      const panel = document.createElement("div");
      panel.className = "lv-result";
      panel.innerHTML = `
        <div class="lv-learn">${w.emojis ? `<span class="lv-learn-pic">${pic(w.emojis.split(/\s+/)[0])}</span>` : ""}<div><b>${esc(w.english)}</b>${w.greek ? `<span class="gk" lang="el"> · ${esc(w.greek)}</span>` : ""}${exHtml ? `<p>${exHtml}</p>` : ""}</div></div>
        <div class="lv-scores">${results.map((r) => `
          <div class="lv-score ${r.correct ? "ok" : "no"}" style="--team:${r.t.color}">
            <span class="e">${r.t.emoji}</span>
            <span class="n">${solo() ? "Class" : esc(r.t.name)}</span>
            <b>${r.correct ? `+<span data-count="${r.pts}">0</span>` : r.a ? "✗" : "—"}</b>
            ${r.streak >= 2 ? `<em>🔥 ${r.streak}</em>` : ""}
          </div>`).join("")}</div>`;
      const lvq = screen.querySelector(".lv-q");
      lvq.appendChild(panel);
      lvq.insertAdjacentHTML("beforeend", `<button type="button" class="lv-next" data-next>${qi + 1 < questions.length ? (solo() ? "Next question" : "Leaderboard") : "Final results"} ${svg("arrow-right", "i-sm")}<kbd>Space</kbd></button>`);
      panel.querySelectorAll("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count)));
      results.forEach((r) => { if (r.pts) teams.awardTo(r.i, r.pts, { quiet: true }); });
      if (anyRight && results.every((r) => r.correct)) ctx.confetti({ count: 120, originY: 0.4 });
      later(() => say(q.sayAnswer), 450);
      if (ex) later(() => say(ex), 1700);
    }

    function countUp(el, to, ms = 900) {
      const t0 = performance.now();
      const stepFn = (now) => {
        const f = Math.min(1, (now - t0) / ms);
        el.textContent = Math.round(to * (1 - (1 - f) ** 3));
        if (f < 1 && el.isConnected) requestAnimationFrame(stepFn);
      };
      requestAnimationFrame(stepFn);
    }

    /* ── Leaderboard ───────────────────────────────────────────────── */
    function board() {
      clearTimers();
      phase = "board";
      if (solo()) { nextQuestion(); return; }
      const ranked = rankTeams(show.pts);
      const top = Math.max(1, ranked[0].score);
      const rowH = ranked.length <= 2 ? 150 : 120;
      set(`
        <div class="lv-board">
          <h2>Leaderboard</h2>
          <div class="lv-rows" style="height:${ranked.length * rowH}px">${ranked.map((r) => {
            const t = T()[r.index];
            const was = show.prevOrder.indexOf(r.index);
            return `<div class="lv-row" data-row="${r.index}" style="--h:${rowH - 20}px;--team:${t.color};--from:${was * rowH}px;--to:${ranked.indexOf(r) * rowH}px;--w:${Math.max(6, (r.score / top) * 100)}%">
              <span class="lv-rank">${r.rank}</span><span class="lv-row-e">${t.emoji}</span><span class="lv-row-n">${esc(t.name)}</span>
              <span class="lv-row-bar"><i></i></span><b class="lv-row-s" data-count="${r.score}">${r.score}</b>${show.streak[r.index] >= 2 ? `<em>🔥 ${show.streak[r.index]}</em>` : ""}</div>`;
          }).join("")}</div>
          ${ranked[0].score > 0 ? `<p class="lv-lead">${T()[ranked[0].index].emoji} <b>${esc(T()[ranked[0].index].name)}</b> ${ranked[1] && ranked[1].score === ranked[0].score ? "share the lead!" : "are in the lead!"}</p>` : ""}
          <button type="button" class="lv-next" data-next>Next question ${svg("arrow-right", "i-sm")}<kbd>Space</kbd></button>
        </div>`, "is-board");
      show.prevOrder = ranked.map((r) => r.index);
      sfx.points();
    }

    function nextQuestion() {
      qi++;
      if (qi >= questions.length) podium();
      else intro();
    }

    /* ── Podium ────────────────────────────────────────────────────── */
    function podium() {
      clearTimers();
      phase = "podium";
      stopMusic(0.2);
      ctx.setProgress(`Final results`);
      const ranked = rankTeams(show.pts);
      const total = questions.length;
      if (solo()) {
        const pct = Math.round((show.right[0] / total) * 100);
        const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : pct >= 30 ? 1 : 0;
        set(`
          <div class="lv-final solo">
            <h2>What a show!</h2>
            <div class="lv-stars">${[1, 2, 3].map((s) => `<span class="${s <= stars ? "on" : ""}" style="--d:${s}">★</span>`).join("")}</div>
            <p class="lv-big"><b data-count="${show.pts[0]}">0</b> points</p>
            <p class="lv-sub">${show.right[0]} of ${total} right · ${pct}%</p>
            ${finalButtons()}
          </div>`, "is-podium");
        screen.querySelectorAll("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count), 1600));
        stings.fanfare();
        later(() => ctx.confetti({ count: 260, originY: 0.3 }), 400);
        return;
      }
      // Places 2 – 1 – 3 on the stage; 4th (if any) listed below.
      const place = (n) => ranked[n] ? { ...ranked[n], t: T()[ranked[n].index] } : null;
      const p1 = place(0); const p2 = place(1); const p3 = place(2); const p4 = place(3);
      const col = (p, cls, h) => (p ? `<div class="lv-pod ${cls}" style="--team:${p.t.color};--h:${h}px"><span class="lv-pod-e">${p.t.emoji}</span><b class="lv-pod-n">${esc(p.t.name)}</b><span class="lv-pod-s">${p.score}</span><div class="lv-pod-block"><i>${p.rank}</i></div><small>${show.right[p.index]}/${total} right</small></div>` : `<div class="lv-pod empty"></div>`);
      set(`
        <div class="lv-final">
          <h2 class="lv-final-title">And the winner is…</h2>
          <div class="lv-podium">${col(p2, "second", 220)}${col(p1, "first", 320)}${p3 ? col(p3, "third", 150) : ""}</div>
          ${p4 ? `<p class="lv-fourth">${p4.t.emoji} ${esc(p4.t.name)} · ${p4.score} points</p>` : ""}
          ${finalButtons()}
        </div>`, "is-podium");
      const reveal = (sel, ms) => later(() => { screen.querySelector(sel)?.classList.add("up"); sfx.whoosh(); }, ms);
      if (p3) reveal(".lv-pod.third", 400);
      reveal(".lv-pod.second", 1400);
      later(() => stings.drumroll(1.8), 2200);
      later(() => {
        screen.querySelector(".lv-pod.first")?.classList.add("up");
        screen.querySelector(".lv-final-title").textContent = p2 && p1.score === p2.score ? "It's a tie!" : `${p1.t.name} win!`;
        stings.fanfare();
        ctx.confetti({ count: 300, originY: 0.3 });
        later(() => ctx.confetti({ count: 140, originX: 0.2, originY: 0.5 }), 500);
        later(() => ctx.confetti({ count: 140, originX: 0.8, originY: 0.5 }), 800);
        screen.querySelector(".lv-final-actions")?.classList.add("show");
      }, 4100);
    }

    const finalButtons = () => `<div class="lv-final-actions${solo() ? " show" : ""}">
      ${ctx.hub ? `<button type="button" class="lv-ghost" data-hub>${svg("grid", "i-sm")}All games</button>` : ""}
      <button type="button" class="lv-start sm" data-again>${svg("rotate", "i-sm")}Play again</button></div>`;

    /* ── Input ─────────────────────────────────────────────────────── */
    stage.addEventListener("click", (e) => {
      const seg = e.target.closest("[data-set] [data-v]");
      if (seg) {
        const key = seg.closest("[data-set]").dataset.set;
        prefs[key] = Number(seg.dataset.v);
        savePrefs(prefs);
        seg.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === seg));
        sfx.tap();
        return;
      }
      if (e.target.closest("[data-start]")) { startShow(); return; }
      const dock = e.target.closest(".lv-dock-btn");
      if (dock) { record(Number(dock.dataset.team), Number(dock.dataset.opt)); return; }
      const tile = e.target.closest("[data-opt-tile]");
      if (tile && solo()) { record(0, Number(tile.dataset.optTile)); return; }
      const pick = e.target.closest("[data-pick]");
      if (pick) { pickTeam(Number(pick.dataset.pick)); return; }
      if (e.target.closest("[data-hear]")) { say(questions[qi].sayPrompt, { must: true }); return; }
      if (e.target.closest("[data-reveal]")) { reveal(); return; }
      if (e.target.closest("[data-next]")) { phase === "reveal" ? board() : nextQuestion(); return; }
      if (e.target.closest("[data-again]")) { startShow(); return; }
      if (e.target.closest("[data-hub]")) ctx.hub?.();
    });

    lobby();

    return {
      onKey(e) {
        const k = e.key;
        if (k === " " || k === "Enter") {
          e.preventDefault();
          if (phase === "lobby") startShow();
          else if (phase === "question") reveal();
          else if (phase === "reveal") board();
          else if (phase === "board") nextQuestion();
          return;
        }
        if (phase !== "question") return;
        const letter = KEYS.indexOf(k.toUpperCase());
        if (solo()) {
          const n = /^[1-4]$/.test(k) ? Number(k) - 1 : letter;
          if (n >= 0) record(0, n);
          return;
        }
        if (/^[1-4]$/.test(k) && Number(k) <= T().length) pickTeam(Number(k) - 1);
        else if (letter >= 0) record(selTeam, letter);
      },
      onGreek(on) {
        // Greek questions only while Greek is on: rebuild the questions still to come.
        if (!questions.length || phase === "lobby" || phase === "podium") return;
        const keep = questions.slice(0, phase === "intro" ? qi : qi + 1);
        questions = [...keep, ...buildLiveQuestions(ctx.fullDeck, { count: questions.length - keep.length, greek: on })];
      },
      destroy() { clearTimers(); stopMusic(0.15); setTension(false); ro.disconnect(); },
    };
  },
};

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("vm_live_prefs") || "{}");
    return { count: [5, 10, 15, 20].includes(p.count) ? p.count : 10, time: [10, 20, 30].includes(p.time) ? p.time : 20 };
  } catch { return { count: 10, time: 20 }; }
}
function savePrefs(p) { try { localStorage.setItem("vm_live_prefs", JSON.stringify(p)); } catch { /* ignore */ } }
