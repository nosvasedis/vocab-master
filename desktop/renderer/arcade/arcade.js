/* ══════════════════════════════════════════════════════════════════
   Lingo Arcade — full-screen classroom games for the smartboard.
   Shell: hub, teams & scoreboard, game lifecycle, end screens.
   ══════════════════════════════════════════════════════════════════ */
import { sfx, speak, stopSpeaking, configureAudio, audioSettings } from "./audio.js";
import { confetti, floatText } from "./fx.js";
import { mountGame, esc, svg } from "./host.js";
import { firstEmoji } from "./deck.js";
import flashcards from "./games/flashcards.js";
import memory from "./games/memory.js";
import spelling from "./games/spelling.js";
import quiz from "./games/quiz.js";
import taboo from "./games/taboo.js";
import live from "./games/live.js";
import { teamPic, avatarPic } from "../js/pics.js";

export const GAMES = [live, flashcards, memory, spelling, quiz, taboo];

export const TEAM_PRESETS = [
  { name: "Rockets", emoji: "🚀", color: "#7b6bff" },
  { name: "Tigers", emoji: "🐯", color: "#ff8a4c" },
  { name: "Dolphins", emoji: "🐬", color: "#22c3ee" },
  { name: "Dragons", emoji: "🐉", color: "#34d399" },
];


let session = null;

/**
 * Open the arcade.
 * @param {{ deck: object[], title: string, prefs: {sfx:boolean, tts:boolean}, onPrefs?: Function }} opts
 */
export function openArcade({ deck, title, prefs = {}, onPrefs, picture } = {}) {
  if (session) return;
  configureAudio(prefs);
  const teamCount = Number(localStorage.getItem("vm_arcade_teams") ?? 2);
  const savedNames = safeJSON(localStorage.getItem("vm_arcade_names"), []);
  session = {
    deck,
    title,
    onPrefs,
    teamCount: Number.isFinite(teamCount) ? teamCount : 2,
    teams: [],
    active: 0,
    game: null,
    gameDef: null,
    names: savedNames,
    greek: localStorage.getItem("vm_arcade_greek") === "on", // hidden by default, like the lessons
    picture: picture || ((t) => esc(t)),
  };
  buildTeams();

  const root = document.createElement("div");
  root.className = "arcade";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Lingo Arcade");
  root.innerHTML = `
    <div class="arc-bg" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <header class="arc-top">
      <button type="button" class="arc-brand" data-hub aria-label="All games">
        <span class="arc-logo">🎮</span><span class="arc-brand-text"><b>Lingo Arcade</b><small>${esc(title)}</small></span>
      </button>
      <div class="arc-crumb" id="arcCrumb"></div>
      <div class="arc-teams" id="arcTeams"></div>
      <div class="arc-tools">
        <button type="button" class="arc-icon arc-greek" data-greek-toggle aria-label="Show Greek" title="Greek (G)">ΕΛ</button>
        <button type="button" class="arc-icon" data-toggle="sfx" aria-label="Sound effects">${svg(audioSettings.sfx ? "volume" : "volume-off")}</button>
        <button type="button" class="arc-icon" data-toggle="tts" aria-label="Read words aloud">${svg("mic")}</button>
        <button type="button" class="arc-icon" data-full aria-label="Full screen">${svg("maximize")}</button>
        <button type="button" class="arc-close" data-close>${svg("x", "i-sm")}<span>Exit</span></button>
      </div>
    </header>
    <main class="arc-main" id="arcMain"></main>`;
  document.getElementById("overlayRoot").appendChild(root);
  session.root = root;
  syncToggles();

  root.querySelector("[data-hub]").addEventListener("click", () => showHub());
  root.querySelector("[data-greek-toggle]").addEventListener("click", toggleGreek);
  root.querySelector("[data-close]").addEventListener("click", closeArcade);
  root.querySelector("[data-full]").addEventListener("click", () => {
    sfx.tap();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.requestFullscreen?.().catch(() => {});
  });
  root.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.toggle;
    audioSettings[k] = !audioSettings[k];
    if (k === "tts" && !audioSettings.tts) stopSpeaking();
    sfx.tap(); // silent when effects were just switched off; a confirming tap when switched on
    syncToggles();
    session.onPrefs?.({ sfx: audioSettings.sfx, tts: audioSettings.tts });
  }));
  root.querySelector("#arcTeams").addEventListener("click", (e) => {
    const adj = e.target.closest("[data-adj]");
    const pill = e.target.closest("[data-team]");
    if (!pill) return;
    const t = session.teams[Number(pill.dataset.team)];
    if (adj) {
      t.score = Math.max(0, t.score + Number(adj.dataset.adj));
      Number(adj.dataset.adj) > 0 ? sfx.points() : sfx.pointsDown();
      renderTeams();
      return;
    }
    if (session.teams.length > 1) { session.active = Number(pill.dataset.team); sfx.tap(); renderTeams(); }
  });
  // A faint glass tick when the mouse moves onto a game card (not on touch boards).
  root.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const card = e.target.closest(".game-card:not([disabled])");
    if (card && !card.contains(e.relatedTarget)) sfx.hover();
  });
  window.addEventListener("keydown", onKey, true);
  showHub();
  sfx.enter();
}

export function closeArcade() {
  if (!session) return;
  session.game?.destroy?.();
  stopSpeaking();
  sfx.exit();
  window.removeEventListener("keydown", onKey, true);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  const root = session.root;
  session = null;
  root.classList.add("closing");
  setTimeout(() => root.remove(), 260);
}

export function isArcadeOpen() { return !!session; }

function safeJSON(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function toggleGreek() {
  session.greek = !session.greek;
  try { localStorage.setItem("vm_arcade_greek", session.greek ? "on" : "off"); } catch { /* ignore */ }
  syncToggles();
  sfx.tap();
  session.game?.onGreek?.(session.greek);
}

function syncToggles() {
  const r = session.root;
  r.classList.toggle("show-greek", session.greek);
  const gk = r.querySelector("[data-greek-toggle]");
  gk.classList.toggle("on", session.greek);
  gk.setAttribute("aria-pressed", String(session.greek));
  gk.title = session.greek ? "Greek is showing (G)" : "Greek is hidden (G)";
  const sfxBtn = r.querySelector('[data-toggle="sfx"]');
  sfxBtn.innerHTML = svg(audioSettings.sfx ? "volume" : "volume-off");
  sfxBtn.classList.toggle("off", !audioSettings.sfx);
  sfxBtn.title = audioSettings.sfx ? "Sound effects on" : "Sound effects off";
  const ttsBtn = r.querySelector('[data-toggle="tts"]');
  ttsBtn.classList.toggle("off", !audioSettings.tts);
  ttsBtn.title = audioSettings.tts ? "Reading words aloud" : "Voice off";
}

/* ── Teams ───────────────────────────────────────────────────────── */
function buildTeams() {
  const n = Math.max(1, Math.min(4, session.teamCount));
  session.teams = n === 1
    ? [{ name: "Class", emoji: "⭐", color: "#ffd23f", score: 0 }]
    : TEAM_PRESETS.slice(0, n).map((t, i) => ({ ...t, name: session.names[i] || t.name, score: 0 }));
  session.active = 0;
}

function renderTeams() {
  const wrap = session.root.querySelector("#arcTeams");
  const solo = session.teams.length === 1;
  wrap.innerHTML = session.teams.map((t, i) => `
    <div class="arc-team${!solo && i === session.active ? " active" : ""}" data-team="${i}" style="--team:${t.color}" title="${solo ? "Class score" : "Click to make it this team's turn"}">
      <span class="t-emoji">${teamPic(t.emoji)}</span>
      <span class="t-name">${esc(t.name)}</span>
      <span class="t-score">${t.score}</span>
      <span class="t-adj"><button type="button" data-adj="1" aria-label="Add a point">+</button><button type="button" data-adj="-1" aria-label="Remove a point">−</button></span>
    </div>`).join("");
}

function teamApi() {
  return {
    get solo() { return session.teams.length === 1; },
    get teams() { return session.teams; },
    active: () => session.teams[session.active],
    award(points, { from = null } = {}) {
      const team = session.teams[session.active];
      team.score += points;
      renderTeams();
      const pill = session.root.querySelector(`[data-team="${session.active}"]`);
      pill?.classList.add("bump");
      setTimeout(() => pill?.classList.remove("bump"), 600);
      floatText(from || pill, `+${points}`, { color: team.color });
      sfx.points();
    },
    /** Points for a specific team (live show: several teams score on the same question). */
    awardTo(index, points, { from = null, quiet = false } = {}) {
      const team = session.teams[index];
      if (!team) return;
      team.score += points;
      renderTeams();
      const pill = session.root.querySelector(`[data-team="${index}"]`);
      pill?.classList.add("bump");
      setTimeout(() => pill?.classList.remove("bump"), 600);
      if (!quiet) floatText(from || pill, `+${points}`, { color: team.color });
    },
    nextTurn() {
      if (session.teams.length < 2) return;
      session.active = (session.active + 1) % session.teams.length;
      renderTeams();
    },
  };
}

/** The first emoji of a word, drawn in the chosen picture style. */
function firstPicture(emojis) {
  const first = firstEmoji(emojis);
  return first ? session.picture(first) : "";
}

/* ── Hub ─────────────────────────────────────────────────────────── */
function clearFx() {
  session.root?.querySelectorAll(".arc-confetti").forEach((c) => c.remove());
}

function showHub() {
  clearFx();
  if (session.gameDef) sfx.back();
  session.game?.destroy?.();
  session.game = null;
  session.gameDef = null;
  stopSpeaking();
  const main = session.root.querySelector("#arcMain");
  session.root.querySelector("#arcCrumb").innerHTML = "";
  renderTeams();
  const deck = session.deck;
  main.innerHTML = `
    <div class="arc-hub">
      <section class="hub-hero">
        <h1>Let's play!</h1>
        <p><b>${deck.length}</b> words ready · ${esc(session.title)}</p>
      </section>

      <section class="hub-teams">
        <div class="ht-head">
          <span class="ht-label">${svg("users", "i-sm")}Who's playing?</span>
          <div class="arc-seg" id="teamSeg">
            ${[1, 2, 3, 4].map((n) => `<button type="button" data-n="${n}" class="${session.teams.length === n ? "on" : ""}">${n === 1 ? "Whole class" : `${n} teams`}</button>`).join("")}
          </div>
        </div>
        <div class="ht-names">
          ${session.teams.length > 1 ? session.teams.map((t, i) => `
            <label class="ht-name" style="--team:${t.color}"><span>${teamPic(t.emoji)}</span><input data-name="${i}" value="${esc(t.name)}" maxlength="16" spellcheck="false" aria-label="Team ${i + 1} name" /></label>`).join("") : `<p class="ht-solo">Everyone plays together — perfect for warm-ups and revision.</p>`}
        </div>
      </section>

      <section class="hub-games">
        ${GAMES.map((g, i) => {
          if (g.featured) {
            const locked = deck.length < g.minWords;
            return `<button type="button" class="game-card featured g-${g.id}${locked ? " locked" : ""}" data-game="${g.id}" ${locked ? "disabled" : ""}>
              <span class="gc-art"><span class="gc-shapes" aria-hidden="true"><i class="s-tri"></i><i class="s-dia"></i><i class="s-cir"></i><i class="s-sq"></i></span><span class="gc-emoji">${g.emoji}</span></span>
              <span class="gc-body">
                <span class="gc-badge">NEW · Live show</span>
                <span class="gc-title">${esc(g.title)}</span>
                <span class="gc-desc">${esc(g.description)}</span>
                <span class="gc-tags">${g.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>
              </span>
              <span class="gc-play">${locked ? `Needs ${g.minWords}+ words` : `${svg("play", "i-sm")}Start the show`}</span>
            </button>`;
          }
          const locked = deck.length < g.minWords;
          return `<button type="button" class="game-card g-${g.id}${locked ? " locked" : ""}" data-game="${g.id}" style="animation-delay:${i * 70}ms" ${locked ? "disabled" : ""}>
            <span class="gc-art"><span class="gc-emoji">${g.emoji}</span></span>
            <span class="gc-body">
              <span class="gc-title">${esc(g.title)}</span>
              <span class="gc-desc">${esc(g.description)}</span>
              <span class="gc-tags">${g.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>
            </span>
            <span class="gc-play">${locked ? `Needs ${g.minWords}+ words` : `${svg("play", "i-sm")}Play`}</span>
          </button>`;
        }).join("")}
      </section>

      <section class="hub-deck">
        <span class="hd-label">In this deck</span>
        <div class="hd-words">${deck.map((w) => `<button type="button" class="hd-word" data-say="${esc(w.english)}">${firstPicture(w.emojis) ? `<span class="hd-pic">${firstPicture(w.emojis)}</span>` : ""}${esc(w.english)}</button>`).join("")}</div>
      </section>
    </div>`;

  main.querySelector("#teamSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    session.teamCount = Number(b.dataset.n);
    try { localStorage.setItem("vm_arcade_teams", String(session.teamCount)); } catch { /* ignore */ }
    buildTeams();
    sfx.tap();
    showHub();
  });
  main.querySelectorAll("[data-name]").forEach((inp) => inp.addEventListener("input", () => {
    const i = Number(inp.dataset.name);
    session.teams[i].name = inp.value.trim() || TEAM_PRESETS[i].name;
    session.names[i] = inp.value.trim();
    try { localStorage.setItem("vm_arcade_names", JSON.stringify(session.names)); } catch { /* ignore */ }
    renderTeams();
  }));
  main.querySelectorAll("[data-game]").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.game)));
  main.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () => speak(b.dataset.say, { force: true })));
}

/* ── Game lifecycle ──────────────────────────────────────────────── */
function startGame(id) {
  const def = GAMES.find((g) => g.id === id);
  if (!def) return;
  clearFx();
  session.game?.destroy?.();
  session.gameDef = def;
  sfx.whoosh();
  const main = session.root.querySelector("#arcMain");
  session.root.querySelector("#arcCrumb").innerHTML = `
    <button type="button" class="arc-back" data-back>${svg("arrow-left", "i-sm")}<span>Games</span></button>
    <span class="arc-game-name">${def.emoji} ${esc(def.title)}</span>
    <span class="arc-progress" id="arcProgress"></span>`;
  session.root.querySelector("[data-back]").addEventListener("click", () => showHub());
  main.innerHTML = `<div class="arc-game g-${def.id}"><div class="game-stage" id="gameStage"></div></div>`;
  const stage = main.querySelector("#gameStage");
  session.game = mountGame(def, {
    stage,
    root: session.root,
    deck: session.deck,
    picture: session.picture,
    teams: teamApi(),
    greek: () => session.greek,
    setProgress(html) { const p = session.root.querySelector("#arcProgress"); if (p) p.innerHTML = html; },
    onFinish: (o) => showFinish(def, o),
    onRestart: () => startGame(id),
    onHub: () => showHub(),
  });
}

function showFinish(def, { title = "Game over!", subtitle = "", stats = [], extraAction = null } = {}) {
  session.game?.destroy?.();
  session.game = { destroy() {} };
  const main = session.root.querySelector("#arcMain");
  const teams = [...session.teams].sort((a, b) => b.score - a.score);
  const solo = session.teams.length === 1;
  const tie = !solo && teams.length > 1 && teams[0].score === teams[1].score;
  const winner = teams[0];
  sfx.win();
  main.innerHTML = `
    <div class="arc-finish">
      <div class="fin-trophy">🏆</div>
      <h1>${esc(solo ? title : tie ? "It's a tie!" : `${winner.name} win!`)}</h1>
      ${subtitle ? `<p class="fin-sub">${esc(subtitle)}</p>` : ""}
      ${stats.length ? `<div class="fin-stats">${stats.map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
      ${!solo ? `<div class="podium">${teams.map((t, i) => `
        <div class="pod" style="--team:${t.color};--h:${Math.max(44, Math.round((t.score / Math.max(1, winner.score)) * 160))}px;animation-delay:${i * 120}ms">
          <span class="pod-emoji">${teamPic(t.emoji)}</span><span class="pod-name">${esc(t.name)}</span>
          <span class="pod-bar"><b>${t.score}</b></span>
        </div>`).join("")}</div>` : `<div class="fin-score"><b>${winner.score}</b><span>class points</span></div>`}
      <div class="fin-actions">
        ${extraAction ? `<button type="button" class="arc-btn ghost" data-extra>${esc(extraAction.label)}</button>` : ""}
        <button type="button" class="arc-btn ghost" data-hub2>${svg("grid", "i-sm")}All games</button>
        <button type="button" class="arc-btn primary" data-again>${svg("rotate", "i-sm")}Play again</button>
      </div>
    </div>`;
  confetti(session.root, { count: 220, originY: 0.25 });
  setTimeout(() => session && confetti(session.root, { count: 120, originX: 0.2, originY: 0.5 }), 450);
  setTimeout(() => session && confetti(session.root, { count: 120, originX: 0.8, originY: 0.5 }), 750);
  main.querySelector("[data-again]").addEventListener("click", () => startGame(def.id));
  main.querySelector("[data-hub2]").addEventListener("click", () => showHub());
  main.querySelector("[data-extra]")?.addEventListener("click", () => extraAction.run());
}

function onKey(e) {
  if (!session) return;
  const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (session.gameDef) showHub();
    else closeArcade();
    return;
  }
  if (typing) return;
  if ((e.key === "g" || e.key === "G") && !session.game?.capturesLetters) { e.preventDefault(); toggleGreek(); return; }
  if (session.game?.onKey) {
    session.game.onKey(e);
    e.stopPropagation();
  }
}
