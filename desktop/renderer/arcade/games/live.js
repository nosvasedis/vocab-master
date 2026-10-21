/* Lingo Live — a Kahoot-style quiz show for the projector.
   Teams answer with shape cards (▲ ◆ ● ■) or 1–4 fingers; the teacher taps each team's emoji on the
   answer it chose, and faster answers earn more points. Lobby → 3-2-1 → (intro → question → reveal →
   leaderboard)× → podium. Rendered on a fixed 1600×900 canvas scaled to the screen, like the lessons.
   Phones mode (Firebase, arcade/live/net.js): students join with a PIN/QR on vocab-master-live.web.app and
   answer on their phones; team points are the average of each team's players. */
import { buildLiveQuestions, SHAPES } from "../live/questions.js";
import { pointsFor, rankTeams, scorePhoneRound, assignTeams } from "../live/scoring.js";
import qrcode from "../../vendor/qrcode/qrcode.js";
import { playMusic, stopMusic, setTension, setBuildup, stings } from "../live/music.js";
import { hasVoiceFor } from "../voice.js";
import { avatarPic } from "../../js/pics.js";
import { facePic } from "../avatars.js";
import { newRecord, keepResults, listResults, saveResultsCsv, missedWords } from "../results.js";

// A team's mascot: one of the four team pictures, or any avatar the class chose for its crest.
const teamPic = (emoji) => facePic(emoji, { team: true });

const W = 1600;
const H = 900;
const SHAPE_SVG = {
  tri: `<svg viewBox="0 0 100 100"><path d="M50 10 L92 86 H8 Z"/></svg>`,
  dia: `<svg viewBox="0 0 100 100"><path d="M50 6 L94 50 L50 94 L6 50 Z"/></svg>`,
  cir: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>`,
  sq: `<svg viewBox="0 0 100 100"><rect x="12" y="12" width="76" height="76" rx="8"/></svg>`,
};
const KEYS = ["A", "B", "C", "D"];
const KIND_ICON = { pic2word: "🖼️", word2pic: "🔎", gap: "✏️", listen: "👂", greek: "🇬🇷", truefalse: "⚖️", odd: "🧩" };
// Firebase's free plan allows 100 connections at once (the host is one of them).
const PLAYER_LIMIT = 90;

export default {
  id: "live",
  title: "Lingo Live",
  emoji: "🎯",
  featured: true,
  description: "A quiz show for the big screen: shapes, countdowns, speed points, a live leaderboard and a podium finale. Teams hold up answer cards — or everyone plays on their phones with a PIN.",
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
    // Phones mode
    let net = null;            // room handle (arcade/live/net.js) when phones are on
    let netBusy = false;
    let netError = "";
    let players = {};          // uid → { name, avatar }
    let teamOf = {};           // uid → team index
    let pstats = {};           // uid → { total, streak, right }
    let liveAnswers = {};      // uid → { opt, at } for the open question
    let startedAt = 0;         // server time the open question started
    let showNo = 0;
    let offAnswers = null;
    let kickArm = null;
    let online = true;         // phones: the host's connection to Firebase
    let offConn = null;
    let known = {};            // uid → { name } for everyone who joined (kept when a phone drops, for the results)
    // A lesson's own check questions (opened from a lesson) or questions made from the words.
    const checks = ctx.checks?.length ? ctx.checks : null;
    let source = checks ? "lesson" : "words";
    let log = [];              // per question: { n, kind, prompt, answer, word, right, answered, of }
    let lastShow = null;       // the finished (or stopped) show, kept on this computer
    let pastOpen = false;
    const phones = () => !!net;
    const pids = () => Object.keys(players);
    const qkey = () => `s${showNo}q${qi}`;
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearInterval(tick); tick = null; };
    // Answer cards: teams answer together; individual players play as one class here (phones are per player).
    const solo = () => teams.groups.length < 2;
    const T = () => teams.groups;

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
        <div class="lv-lobby${prefs.mode === "phones" ? " compact" : ""}">
          <div class="lv-logo"><span class="lv-logo-mark">🎯</span><h1>Lingo <b>Live</b></h1><p>The vocabulary quiz show</p></div>
          <div class="lv-lobby-grid">
            ${prefs.mode === "phones" ? phonesPanel() : `<section class="lv-panel lv-teams-panel">
              <h3>${solo() ? "Playing as one class" : `${T().length} teams ready`}</h3>
              <div class="lv-team-cards">${T().map((t, i) => `<div class="lv-team-card" style="--team:${t.color};--d:${i}"><span>${teamPic(t.emoji)}</span><b>${esc(t.name)}</b><em>Ready!</em></div>`).join("")}</div>
              <p class="lv-note">Change teams and names on the games screen.</p>
            </section>`}
            <section class="lv-panel lv-how">
              <h3>How to answer</h3>
              <div class="lv-modes">
                <button type="button" class="lv-mode${prefs.mode !== "phones" ? " on" : ""}" data-mode="cards">📺 Cards &amp; fingers</button>
                <button type="button" class="lv-mode${prefs.mode === "phones" ? " on" : ""}" data-mode="phones">📱 Phones</button>
              </div>
              <div class="lv-how-shapes">${SHAPES.map((s, k) => `<span class="lv-chip s-${s}">${SHAPE_SVG[s]}<b>${k + 1}</b></span>`).join("")}</div>
              <p>${prefs.mode === "phones"
                ? `Students open <b>${esc(net?.shortUrl || "vocab-master-live.web.app")}</b> (or scan the code), type the PIN, pick a nickname and an animal. They tap the shape on their phone — <b>the faster, the more points!</b>${solo() ? "" : " Players are spread evenly across the teams."}`
                : solo() ? "Everyone points or shows <b>1–4 fingers</b>. Tap the answer the class chose." : "Each team holds up a shape card or shows <b>1–4 fingers</b>. Tap the team's emoji on the answer it chose — <b>the faster, the more points!</b>"}</p>
            </section>
          </div>
          <div class="lv-settings">
            ${checks ? `<label>Questions <span class="arc-seg" data-source>${[["lesson", `The lesson's ${checks.length}`], ["words", "From the words"]].map(([v, l]) => `<button type="button" data-src="${v}" class="${v === source ? "on" : ""}">${l}</button>`).join("")}</span></label>` : ""}
            ${source === "words" ? `<label>${checks ? "How many" : "Questions"} <span class="arc-seg" data-set="count">${counts.map((n) => `<button type="button" data-v="${n}" class="${n === prefs.count ? "on" : ""}">${n}</button>`).join("")}</span></label>` : ""}
            <label>Time <span class="arc-seg" data-set="time">${[10, 20, 30].map((n) => `<button type="button" data-v="${n}" class="${n === prefs.time ? "on" : ""}">${n}s</button>`).join("")}</span></label>
          </div>
          <button type="button" class="lv-start" data-start ${prefs.mode === "phones" && !pids().length ? "disabled" : ""}>${svg("play")}Start the show <kbd>Space</kbd></button>
          ${listResults().some((r) => r.game === "Lingo Live") ? `<button type="button" class="lv-past-btn" data-past>📄 Results of earlier shows</button>` : ""}
          ${pastOpen ? pastHtml() : ""}
        </div>`, "is-lobby");
      if (prefs.mode === "phones") { drawQr(); if (!net && !netBusy && !netError) startPhones(); }
    }

    /* ── Phones: room, PIN/QR, player wall ─────────────────────────── */
    function phonesPanel() {
      if (!net) {
        return `<section class="lv-panel lv-join">${netError
          ? `<h3>Phones are not available</h3><p class="lv-note big">${esc(netError)}</p><button type="button" class="lv-ghost" data-retry>Try again</button>`
          : `<h3>Opening the room…</h3><div class="lv-spin"></div>`}</section>`;
      }
      return `<section class="lv-panel lv-join">
        <div class="lv-join-top">
          <div class="lv-qr" id="lvQr" aria-label="QR code to join"></div>
          <div class="lv-join-text"><span>Join at</span><b class="lv-url">${esc(net.shortUrl)}</b><span>Game PIN</span><b class="lv-pin">${net.pin.slice(0, 3)} ${net.pin.slice(3)}</b></div>
        </div>
        <div class="lv-wall" id="lvWall">${wallHtml()}</div>
      </section>`;
    }

    function wallHtml() {
      const ids = pids();
      if (!ids.length) return `<p class="lv-note big">Waiting for players… 📱</p>`;
      const chip = (uid) => `<button type="button" class="lv-player${kickArm === uid ? " arm" : ""}" data-kick="${uid}" title="Tap twice to remove">${avatarPic(players[uid].avatar)} ${esc(players[uid].name)}${kickArm === uid ? " ✕" : ""}</button>`;
      const head = `<p class="lv-count-line"><b>${ids.length}</b> ${ids.length === 1 ? "player" : "players"}${ids.length >= PLAYER_LIMIT ? ` · <span class="lv-warn">the free plan takes about ${PLAYER_LIMIT} phones: let students share in pairs</span>` : ""}</p>`;
      if (solo()) return head + `<div class="lv-chips">${ids.map(chip).join("")}</div>`;
      return head + `<div class="lv-team-cols">${T().map((t, i) => `<div class="lv-col" style="--team:${t.color}"><h4>${teamPic(t.emoji)} ${esc(t.name)}</h4>${ids.filter((u) => teamOf[u] === i).map(chip).join("")}</div>`).join("")}</div>`;
    }

    function drawQr() {
      const box = screen.querySelector("#lvQr");
      if (!box || !net) return;
      const qr = qrcode(0, "M");
      qr.addData(net.url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    }

    async function startPhones() {
      netBusy = true;
      netError = "";
      try {
        const { openRoom } = await import("../live/net.js");
        net = await openRoom({ title: ctx.title || "Lingo Live", teams: T() });
        net.onPlayers((v) => {
          players = {};
          for (const [uid, pl] of Object.entries(v)) { players[uid] = { name: String(pl.name || "?").slice(0, 16), avatar: String(pl.avatar || "🙂").slice(0, 16) }; known[uid] = { name: players[uid].name }; }
          if (!solo()) {
            const next = assignTeams(pids(), teamOf, T().length);
            if (JSON.stringify(next) !== JSON.stringify(teamOf)) { teamOf = next; net?.setTeams(teamOf).catch(() => {}); }
          }
          const wall = screen.querySelector("#lvWall");
          if (wall) wall.innerHTML = wallHtml();
          const start = screen.querySelector("[data-start]");
          if (start) start.disabled = !pids().length;
          if (phase === "lobby" && pids().length) sfx.pop();
        });
        offConn = net.onConnection((on) => { online = on; showConnection(); });
      } catch (e) {
        net = null;
        netError = navigator.onLine === false ? "This computer is offline. Use cards & fingers, or connect to the internet." : "Couldn't open a room. Check the internet connection (some school networks block it), or use cards & fingers.";
      }
      netBusy = false;
      if (phase === "lobby") lobby();
    }

    /** A banner on the projector while the room's connection is lost (Firebase reconnects by itself). */
    function showConnection() {
      canvas.querySelector(".lv-offline")?.remove();
      if (online || !net) return;
      canvas.insertAdjacentHTML("beforeend", `<div class="lv-offline" role="status">📶 Reconnecting to the phones… answers arrive when the internet is back.</div>`);
    }

    function closePhones() {
      offAnswers?.();
      offAnswers = null;
      offConn?.();
      offConn = null;
      online = true;
      showConnection();
      if (!net) return;
      const n = net;
      net = null;
      players = {};
      teamOf = {};
      n.setPhase("ended").catch(() => {}).finally(() => setTimeout(() => n.close(), 1500));
    }

    /* ── 3-2-1 ─────────────────────────────────────────────────────── */
    function startShow() {
      questions = source === "lesson" ? checks.map((q) => ({ ...q })) : buildLiveQuestions(ctx.fullDeck, { count: prefs.count, greek: ctx.greek() });
      if (!questions.length) { set(`<div class="lv-empty">Lingo Live needs at least 4 words.</div>`); return; }
      if (prefs.mode === "phones" && (!net || !pids().length)) return;
      show = { pts: T().map(() => 0), streak: T().map(() => 0), right: T().map(() => 0), prevOrder: T().map((_, i) => i), prevPlayers: [] };
      qi = 0;
      showNo++;
      pstats = {};
      log = [];
      lastShow = null;
      pastOpen = false;
      if (net) { net.clearResults().catch(() => {}); net.setPhase("countdown").catch(() => {}); }
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
      net?.setPhase("intro", { qnum: qi + 1, total: questions.length }).catch(() => {});
      later(question, 1900);
    }

    /* ── Question ──────────────────────────────────────────────────── */
    function optionHtml(o, k, q) {
      const body = o.pic ? `<span class="lv-opt-pic">${pic(o.pic)}</span>` : `<span class="lv-opt-text">${esc(o.text)}</span>`;
      const dock = solo() || phones() ? "" : `<span class="lv-dock">${T().map((t, i) => `<button type="button" class="lv-dock-btn" data-team="${i}" data-opt="${k}" style="--team:${t.color}" aria-label="${esc(t.name)} chose ${KEYS[k]}">${teamPic(t.emoji)}</button>`).join("")}</span>`;
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
            <div class="lv-q-side">${phones() ? `<div class="lv-q-answered big" id="lvAnswered"><b>0</b> / ${pids().length}<span>answers</span></div>` : solo() ? "" : `<div class="lv-q-answered" id="lvAnswered"><b>0</b> / ${T().length} answered</div><div class="lv-pick" id="lvPick">${T().map((t, i) => `<span class="lv-pick-team${i === 0 ? " on" : ""}" data-pick="${i}" style="--team:${t.color}"><kbd>${i + 1}</kbd>${teamPic(t.emoji)}</span>`).join("")}</div>`}</div>
          </div>
          <div class="lv-timebar"><i id="lvBar"></i></div>
          <div class="lv-opts${q.options.length === 2 ? " two" : ""}" id="lvOpts">${q.options.map((o, k) => optionHtml(o, k, q)).join("")}</div>
        </div>`, "is-question");
      if (listen) later(() => say(q.sayPrompt, { must: true }), 350);
      else if (q.kind === "gap" && q.sayPrompt) { /* reading time is enough; the sentence is spoken at the reveal */ }
      // Options are live straight away; the clock starts now.
      shownAt = performance.now();
      left = prefs.time;
      if (net) {
        liveAnswers = {};
        startedAt = 0;
        const key = qkey();
        net.openQuestion({ qkey: key, qnum: qi + 1, total: questions.length, nOpts: q.options.length, limitMs: prefs.time * 1000, kindLabel: q.kindLabel })
          .then((t) => { startedAt = t; })
          .catch(() => {});
        offAnswers?.();
        offAnswers = net.onAnswers(key, (v) => {
          if (phase !== "question" || key !== qkey()) return;
          liveAnswers = v;
          const n = Object.keys(v).filter((u) => players[u]).length;
          const el = screen.querySelector("#lvAnswered b");
          if (el && el.textContent !== String(n)) { el.textContent = n; el.parentElement.classList.remove("bump"); void el.offsetWidth; el.parentElement.classList.add("bump"); stings.lock(); }
          if (n >= pids().length && n > 0) { stings.allIn(); later(reveal, 600); }
        });
      }
      playMusic("question", { variant: qi }); // each question its own key and groove
      updateClock();
      tick = setInterval(() => {
        left--;
        updateClock();
        setBuildup(1 - left / prefs.time); // the music builds as the clock runs down
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
      let round = null;
      if (net) {
        offAnswers?.();
        offAnswers = null;
        const streaks = Object.fromEntries(pids().map((u) => [u, pstats[u]?.streak || 0]));
        round = scorePhoneRound({ answers: liveAnswers, players: pids(), teamOf, answer: q.answer, startedAt: startedAt || net.serverNow() - (performance.now() - shownAt), limitMs: limit, streaks, teamCount: solo() ? 0 : T().length, nOpts: q.options.length });
        for (const [u, r] of Object.entries(round.perPlayer)) {
          const st = pstats[u] || (pstats[u] = { total: 0, streak: 0, right: 0, answered: 0 });
          st.total += r.pts;
          st.streak = r.streak;
          if (r.correct) st.right++;
          if (r.opt != null) st.answered++;
        }
        const ids = pids();
        const order = rankTeams(ids.map((u) => pstats[u].total));
        const resultsOut = {};
        order.forEach((o) => { const u = ids[o.index]; resultsOut[u] = { total: pstats[u].total, rank: o.rank, of: ids.length, last: { ...round.perPlayer[u], opt: round.perPlayer[u].opt ?? null } }; });
        net.reveal({ answer: q.answer, results: resultsOut }).catch(() => {});
      }
      const results = T().map((t, i) => {
        if (round) {
          // Phones: a team scores the average of its players; the whole class scores the average of everyone.
          const ids = solo() ? pids() : pids().filter((u) => teamOf[u] === i);
          const pts = solo() ? (ids.length ? Math.round(ids.reduce((sum, u) => sum + round.perPlayer[u].pts, 0) / ids.length) : 0) : round.teamPts[i];
          const correctN = ids.filter((u) => round.perPlayer[u].correct).length;
          show.pts[i] += pts;
          if (correctN) show.right[i]++;
          return { i, t, a: correctN || null, correct: correctN > 0, pts, streak: 0, correctN, n: ids.length };
        }
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
        if (round) el.insertAdjacentHTML("beforeend", `<span class="lv-hist" style="--f:${round.dist[k] / Math.max(1, pids().length)}"><b>${round.dist[k]}</b></span>`);
      });
      screen.querySelector(".lv-reveal-btn")?.remove();
      screen.classList.add("revealed");
      logQuestion(q, results, round);
      const w = q.word || { english: q.answerText || "", greek: "", emojis: "", example: "" };
      // A lesson question explains its answer in the lesson's words; a word question shows the example.
      const ex = String(q.explain || w.example || "");
      const exHtml = ex && w.english ? esc(ex).replace(new RegExp(`\\b(${w.english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)`, "i"), "<mark>$1</mark>") : esc(ex);
      const panel = document.createElement("div");
      panel.className = "lv-result";
      panel.innerHTML = `
        <div class="lv-learn">${w.emojis ? `<span class="lv-learn-pic">${pic(w.emojis.split(/\s+/)[0])}</span>` : ""}<div><b>${esc(w.english)}</b>${w.greek ? `<span class="gk" lang="el"> · ${esc(w.greek)}</span>` : ""}${exHtml ? `<p>${exHtml}</p>` : ""}</div></div>
        <div class="lv-scores">${results.map((r) => `
          <div class="lv-score ${r.correct ? "ok" : "no"}" style="--team:${r.t.color}">
            <span class="e">${teamPic(r.t.emoji)}</span>
            <span class="n">${solo() ? "Class" : esc(r.t.name)}</span>
            ${round ? `<span class="c">${r.correctN}/${r.n} right</span>` : ""}
            <b>${r.correct ? `+<span data-count="${r.pts}">0</span>` : r.a ? "✗" : "—"}</b>
            ${r.streak >= 2 ? `<em>🔥 ${r.streak}</em>` : ""}
          </div>`).join("")}</div>
        ${round?.fastest && players[round.fastest] ? `<p class="lv-fastest">⚡ Fastest: <b>${avatarPic(players[round.fastest].avatar)} ${esc(players[round.fastest].name)}</b></p>` : ""}`;
      const lvq = screen.querySelector(".lv-q");
      lvq.appendChild(panel);
      lvq.insertAdjacentHTML("beforeend", `<button type="button" class="lv-next" data-next>${qi + 1 < questions.length ? (solo() && !phones() ? "Next question" : "Leaderboard") : "Final results"} ${svg("arrow-right", "i-sm")}<kbd>Space</kbd></button>`);
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
      if (solo() && !phones()) { nextQuestion(); return; }
      net?.setPhase("board").catch(() => {});
      if (solo()) { playerBoard(); return; }
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
              <span class="lv-rank">${r.rank}</span><span class="lv-row-e">${teamPic(t.emoji)}</span><span class="lv-row-n">${esc(t.name)}</span>
              <span class="lv-row-bar"><i></i></span><b class="lv-row-s" data-count="${r.score}">${r.score}</b>${show.streak[r.index] >= 2 ? `<em>🔥 ${show.streak[r.index]}</em>` : ""}</div>`;
          }).join("")}</div>
          ${phones() ? topPlayersHtml(3) : ""}
          ${ranked[0].score > 0 ? `<p class="lv-lead">${teamPic(T()[ranked[0].index].emoji)} <b>${esc(T()[ranked[0].index].name)}</b> ${ranked[1] && ranked[1].score === ranked[0].score ? "share the lead!" : "are in the lead!"}</p>` : ""}
          <button type="button" class="lv-next" data-next>Next question ${svg("arrow-right", "i-sm")}<kbd>Space</kbd></button>
        </div>`, "is-board");
      show.prevOrder = ranked.map((r) => r.index);
      sfx.points();
    }

    function topPlayers(n) {
      const ids = pids();
      return rankTeams(ids.map((u) => pstats[u]?.total || 0)).slice(0, n).map((o) => ({ uid: ids[o.index], rank: o.rank, score: o.score }));
    }
    const topPlayersHtml = (n) => `<div class="lv-top">${topPlayers(n).map((p) => `<span>${p.rank}. ${avatarPic(players[p.uid]?.avatar || "")} <b>${esc(players[p.uid]?.name || "")}</b> ${p.score}</span>`).join("")}</div>`;

    /** Whole class on phones: a player leaderboard (top 5). */
    function playerBoard() {
      const top = topPlayers(5);
      const best = Math.max(1, top[0]?.score || 1);
      const rowH = 112;
      set(`
        <div class="lv-board">
          <h2>Leaderboard</h2>
          <div class="lv-rows" style="height:${top.length * rowH}px">${top.map((p, k) => {
            const was = show.prevPlayers.indexOf(p.uid);
            return `<div class="lv-row" style="--h:${rowH - 18}px;--team:#8b6cff;--from:${(was < 0 ? top.length : was) * rowH}px;--to:${k * rowH}px;--w:${Math.max(6, (p.score / best) * 100)}%">
              <span class="lv-rank">${p.rank}</span><span class="lv-row-e">${avatarPic(players[p.uid]?.avatar || "")}</span><span class="lv-row-n">${esc(players[p.uid]?.name || "")}</span>
              <span class="lv-row-bar"><i></i></span><b class="lv-row-s">${p.score}</b>${(pstats[p.uid]?.streak || 0) >= 2 ? `<em>🔥 ${pstats[p.uid].streak}</em>` : ""}</div>`;
          }).join("")}</div>
          <button type="button" class="lv-next" data-next>Next question ${svg("arrow-right", "i-sm")}<kbd>Space</kbd></button>
        </div>`, "is-board");
      show.prevPlayers = top.map((p) => p.uid);
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
      net?.setPhase("podium").catch(() => {});
      keepShow();
      const ranked = rankTeams(show.pts);
      const total = questions.length;
      if (solo() && phones()) { playerPodium(total); return; }
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
      const col = (p, cls, h) => (p ? `<div class="lv-pod ${cls}" style="--team:${p.t.color};--h:${h}px"><span class="lv-pod-e">${teamPic(p.t.emoji)}</span><b class="lv-pod-n">${esc(p.t.name)}</b><span class="lv-pod-s">${p.score}</span><div class="lv-pod-block"><i>${p.rank}</i></div><small>${show.right[p.index]}/${total} right</small></div>` : `<div class="lv-pod empty"></div>`);
      set(`
        <div class="lv-final">
          <h2 class="lv-final-title">And the winner is…</h2>
          <div class="lv-podium">${col(p2, "second", 190)}${col(p1, "first", 270)}${p3 ? col(p3, "third", 130) : ""}</div>
          ${p4 ? `<p class="lv-fourth">${teamPic(p4.t.emoji)} ${esc(p4.t.name)} · ${p4.score} points</p>` : ""}
          ${phones() && topPlayers(1)[0] ? `<p class="lv-fourth">🌟 Star player: ${avatarPic(players[topPlayers(1)[0].uid]?.avatar || "")} <b>${esc(players[topPlayers(1)[0].uid]?.name || "")}</b> · ${topPlayers(1)[0].score}</p>` : ""}
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

    /** Whole class on phones: the top three players on the podium. */
    function playerPodium(total) {
      const top = topPlayers(3);
      const col = (p, cls, h) => (p ? `<div class="lv-pod ${cls}" style="--team:${cls === "first" ? "#f2a900" : cls === "second" ? "#8b9bb4" : "#c47a3a"};--h:${h}px"><span class="lv-pod-e">${avatarPic(players[p.uid]?.avatar || "")}</span><b class="lv-pod-n">${esc(players[p.uid]?.name || "")}</b><span class="lv-pod-s">${p.score}</span><div class="lv-pod-block"><i>${p.rank}</i></div><small>${pstats[p.uid]?.right || 0}/${total} right</small></div>` : "");
      set(`
        <div class="lv-final">
          <h2 class="lv-final-title">And the winner is…</h2>
          <div class="lv-podium">${col(top[1], "second", 190)}${col(top[0], "first", 270)}${col(top[2], "third", 130)}</div>
          ${finalButtons(true)}
        </div>`, "is-podium");
      if (top[2]) later(() => { screen.querySelector(".lv-pod.third")?.classList.add("up"); sfx.whoosh(); }, 400);
      if (top[1]) later(() => { screen.querySelector(".lv-pod.second")?.classList.add("up"); sfx.whoosh(); }, 1400);
      later(() => stings.drumroll(1.8), 2200);
      later(() => {
        screen.querySelector(".lv-pod.first")?.classList.add("up");
        if (top[0]) screen.querySelector(".lv-final-title").textContent = `${players[top[0].uid]?.name || "Winner"} wins!`;
        stings.fanfare();
        ctx.confetti({ count: 300, originY: 0.3 });
        screen.querySelector(".lv-final-actions")?.classList.add("show");
      }, 4100);
    }

    const finalButtons = (forceHidden = false) => `<div class="lv-final-actions${solo() && !forceHidden ? " show" : ""}">
      ${ctx.hub ? `<button type="button" class="lv-ghost" data-hub>${svg("grid", "i-sm")}All games</button>` : ""}
      <button type="button" class="lv-ghost" data-save title="A spreadsheet (CSV) with every question, every player and the words to review">${svg("download", "i-sm")}Save results</button>
      <button type="button" class="lv-start sm" data-again>${svg("rotate", "i-sm")}Play again</button></div>`;

    /* ── Results: every show is kept on this computer and can be saved as a CSV ─ */
    function logQuestion(q, results, round) {
      const answerText = q.answerText || q.options[q.answer]?.text || q.options[q.answer]?.word || "";
      const base = { n: qi + 1, kind: q.kindLabel, prompt: q.kind === "listen" ? `(listen) ${q.sayPrompt || ""}` : q.prompt || "", answer: answerText, word: q.word?.english || answerText };
      if (round) {
        const per = Object.values(round.perPlayer);
        log.push({ ...base, right: per.filter((r) => r.correct).length, answered: per.filter((r) => r.opt != null).length, of: per.length });
      } else {
        log.push({ ...base, right: results.filter((r) => r.correct).length, answered: solo() ? Math.min(1, answers.size) : answers.size, of: solo() ? 1 : T().length });
      }
    }

    function keepShow({ stopped = false } = {}) {
      if (!log.length) return;
      const onPhones = Object.keys(pstats).length > 0;
      const n = Object.keys(pstats).length;
      const how = onPhones ? `Phones · ${n} ${n === 1 ? "player" : "players"}${solo() ? "" : ` in ${T().length} teams`}` : solo() ? "Answer cards · whole class" : `Answer cards · ${T().length} teams`;
      lastShow = newRecord({
        game: "Lingo Live",
        title: `${source === "lesson" ? "Lesson check · " : ""}${ctx.meta?.title || ""}`,
        className: ctx.meta?.className || "",
        mode: `${how}${stopped ? ` · stopped after ${log.length} of ${questions.length} questions` : ""}`,
        questions: log,
        players: onPhones ? Object.entries(pstats).map(([u, st]) => ({ name: known[u]?.name || "?", team: solo() ? "" : T()[teamOf[u]]?.name || "", points: st.total, right: st.right, answered: st.answered })) : [],
        teams: onPhones && solo() ? [] : T().map((t, i) => ({ name: solo() ? "Class" : t.name, points: show.pts[i], right: show.right[i] })),
      });
      keepResults(lastShow);
    }

    function pastHtml() {
      const list = listResults().filter((r) => r.game === "Lingo Live").slice(0, 8);
      const fmt = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
      const rightPct = (r) => { const qs = r.questions || []; const a = qs.reduce((s, q) => s + q.of, 0); return a ? Math.round((qs.reduce((s, q) => s + q.right, 0) / a) * 100) : 0; };
      return `<div class="lv-past" role="dialog" aria-label="Results of earlier shows">
        <header><h3>Results of earlier shows</h3><button type="button" class="lv-ghost sm" data-past>Close</button></header>
        <p class="lv-note">Kept on this computer (the last 40 games). Save one as a spreadsheet for your records.</p>
        <ul>${list.map((r) => {
          const miss = missedWords(r).slice(0, 4).map((m) => m.word);
          return `<li><span class="lv-past-when">${esc(fmt(r.date))}</span><span class="lv-past-what"><b>${esc(r.className || "Class")}</b> · ${esc(r.title || "")}<small>${esc(r.mode || "")} · ${rightPct(r)}% right${miss.length ? ` · review: ${esc(miss.join(", "))}` : ""}</small></span><button type="button" class="lv-ghost sm" data-past-save="${esc(r.id)}">${svg("download", "i-sm")}CSV</button></li>`;
        }).join("")}</ul>
      </div>`;
    }

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
      const src = e.target.closest("[data-src]");
      if (src && phase === "lobby") { if (src.dataset.src !== source) { source = src.dataset.src; sfx.tap(); lobby(); } return; }
      if (e.target.closest("[data-past]")) { pastOpen = !pastOpen; sfx.tap(); lobby(); return; }
      const pastSave = e.target.closest("[data-past-save]");
      if (pastSave) { const r = listResults().find((x) => x.id === pastSave.dataset.pastSave); if (r) saveResultsCsv(r); return; }
      if (e.target.closest("[data-save]")) { if (lastShow) saveResultsCsv(lastShow); return; }
      const modeBtn = e.target.closest("[data-mode]");
      if (modeBtn && phase === "lobby") {
        const m = modeBtn.dataset.mode;
        if (m !== prefs.mode) { prefs.mode = m; savePrefs(prefs); if (m === "cards") closePhones(); netError = ""; lobby(); sfx.tap(); }
        return;
      }
      if (e.target.closest("[data-retry]")) { netError = ""; lobby(); return; }
      const kick = e.target.closest("[data-kick]");
      if (kick && net) {
        const uid = kick.dataset.kick;
        if (kickArm === uid) { kickArm = null; net.kick(uid).catch(() => {}); }
        else { kickArm = uid; const wall = screen.querySelector("#lvWall"); if (wall) wall.innerHTML = wallHtml(); }
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
      if (e.target.closest("[data-again]")) { if (phones()) { phase = "lobby"; net.setPhase("lobby").catch(() => {}); lobby(); } else startShow(); return; }
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
        if (phase !== "question" || phones()) return;
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
        if (!questions.length || phase === "lobby" || phase === "podium" || source === "lesson") return;
        const keep = questions.slice(0, phase === "intro" ? qi : qi + 1);
        questions = [...keep, ...buildLiveQuestions(ctx.fullDeck, { count: questions.length - keep.length, greek: on })];
      },
      destroy() { if (log.length && phase !== "podium" && phase !== "lobby") keepShow({ stopped: true }); clearTimers(); stopMusic(0.15); setTension(false); ro.disconnect(); closePhones(); },
    };
  },
};

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("vm_live_prefs") || "{}");
    return { count: [5, 10, 15, 20].includes(p.count) ? p.count : 10, time: [10, 20, 30].includes(p.time) ? p.time : 20, mode: p.mode === "phones" ? "phones" : "cards" };
  } catch { return { count: 10, time: 20, mode: "cards" }; }
}
function savePrefs(p) { try { localStorage.setItem("vm_live_prefs", JSON.stringify(p)); } catch { /* ignore */ } }
