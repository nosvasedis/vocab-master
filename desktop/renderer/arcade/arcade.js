/* ══════════════════════════════════════════════════════════════════
   Lingo Arcade — full-screen classroom games for the smartboard.
   Shell: hub (who's playing, games, deck), scoreboard, turns, spinner, end screens.
   Who plays — whole class, individual players, or teams of named members — lives in arcade/players.js.
   ══════════════════════════════════════════════════════════════════ */
import { sfx, stopSpeaking, configureAudio, audioSettings } from "./audio.js";
import { confetti, floatText } from "./fx.js";
import { mountGame, esc, svg } from "./host.js";
import { firstEmoji, buildArcadeDeck } from "./deck.js";
import { openDeckPicker } from "./deck-picker.js";
import { rowById, describeDeck, logPlayed } from "./deck-source.js";
import { lookupCoursebookWord } from "../coursebook-data.js";
import { hasVoiceFor } from "./voice.js";
import flashcards from "./games/flashcards.js";
import memory from "./games/memory.js";
import spelling from "./games/spelling.js";
import quiz from "./games/quiz.js";
import taboo from "./games/taboo.js";
import live from "./games/live.js";
import board from "./games/board.js";
import feud from "./games/feud.js";
import { picForWord } from "../js/pics.js";
import * as P from "./players.js";
import * as A from "./avatars.js";
import { titleCard, turnToast, countdown, countTo, sparks, bouncy, reducedMotion } from "./showtime.js";
import { openAvatarPicker, openCrestPicker } from "./avatar-picker.js";

// Quiz Show stays for lessons' practice steps (hub: false); in the arcade, Word Board and Top Answers replace it.
export const GAMES = [live, board, feud, flashcards, memory, spelling, taboo, quiz];
const HUB_GAMES = () => GAMES.filter((g) => g.hub !== false);
export const TEAM_PRESETS = P.TEAM_PRESETS;

const MODES = [
  { id: "class", label: "Whole class", hint: "Everyone plays together for one class score — perfect for warm-ups and revision." },
  { id: "players", label: "Players", hint: "Each child plays for themselves. Turns go round fairly; spin for a surprise pick." },
  { id: "teams", label: "Teams", hint: "Teams take turns, and team members take turns answering. Teams can be different sizes." },
];

let session = null;

/* ── Saved classes (this computer only; first names) ─────────────────── */
const PICK_KEY = "vm_arcade_pick";
function store(key, value) { try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch { /* storage unavailable */ } }
function loadClasses() {
  const list = safeJSON(localStorage.getItem("vm_classes"), []);
  return Array.isArray(list) ? list.filter((c) => c && c.id && Array.isArray(c.players)) : [];
}
const saveClasses = () => store("vm_classes", session.classes);
const currentClass = () => session.classes.find((c) => c.id === session.classId) || null;

/**
 * Open the arcade.
 * @param {{ deck: object[], title: string, prefs: {sfx:boolean, tts:boolean}, onPrefs?: Function }} opts
 */
export function openArcade({ deck, title, prefs = {}, onPrefs, picture, buildDeck } = {}) {
  if (session) return;
  configureAudio(prefs);
  const classes = loadClasses();
  const savedMode = localStorage.getItem("vm_arcade_mode");
  const legacyTeams = Number(localStorage.getItem("vm_arcade_teams") ?? 2); // before modes: 1 = whole class
  session = {
    deck,
    title,
    baseDeck: deck,        // the words the arcade was opened with (worksheet or lesson)
    baseTitle: title,
    buildDeck,             // coursebook rows → a game deck (trusted pictures)
    source: "start",
    pickIds: null,         // coursebook word ids picked in "Choose your words" (remembered, see restorePick)
    pickOwn: [],           // the teacher's own words added in "Choose your words": [{ english, greek }]
    plan: null,            // the ready-made lesson: { ids, i }
    picker: null,
    onPrefs,
    classes,
    classId: localStorage.getItem("vm_arcade_class") || classes[0]?.id || null,
    mode: MODES.some((m) => m.id === savedMode) ? savedMode : legacyTeams === 1 ? "class" : "teams",
    absent: new Set(),       // away today (not saved)
    play: null,
    game: null,
    gameDef: null,
    delArm: false,
    greek: localStorage.getItem("vm_arcade_greek") === "on", // hidden by default, like the lessons
    picture: picture || ((t) => esc(t)),
    gamesStarted: 0,         // each game starts with the next team, so one team doesn't always go first
    lastUp: null,            // players mode: who was up when the last game ended (the next game carries on after them)
    intro: null,             // a game's title screen while it is showing
  };
  if (!currentClass()) session.classId = classes[0]?.id || null;
  restorePick();
  buildPlay();

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
  root.querySelector("#arcTeams").addEventListener("click", onScoreboardClick);
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
  session.picker?.destroy();
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
  store("vm_arcade_greek", session.greek ? "on" : "off");
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

/* ── Who's playing → a fresh line-up for each game ─────────────────── */
function buildPlay({ forGame = false } = {}) {
  const cls = currentClass();
  session.play = P.createPlay({
    mode: session.mode, cls, absent: session.absent, teamCount: cls?.teamCount || 2, teamNames: cls?.teamNames || [],
    startTeam: session.gamesStarted, after: session.lastUp,
  });
  if (forGame) session.gamesStarted++;
}

/** A side's badge: a child's avatar disc, a team's crest, or the class star. */
function sideBadge(s, o = {}) {
  if (!s) return "";
  if (s.shape) return A.crestBadge(s, o);
  return A.avatarDisc(s.emoji, s.color, o);
}
const playerChip = (p) => (p ? `<span class="who-chip" style="--team:${p.color}">${A.avatarDisc(p.emoji, p.color, { cls: "sm" })}<b>${esc(p.name)}</b></span>` : "");

/** "🦊 Maria" (players), "🦊 Maria · 🚀 Rockets" (teams), "" (class) — for the games' turn banners. */
function turnHtml() {
  const { side, player } = P.current(session.play);
  if (session.play.mode === "players") return playerChip(player);
  if (session.play.mode === "teams") return `${playerChip(player)}<span class="who-for">·</span><span class="who-team" style="--team:${side.color}">${A.crestBadge(side, { cls: "xs" })} ${esc(side.name)}</span>`;
  return "";
}

/* ── Scoreboard (top bar) ─────────────────────────────────────────── */
function renderTeams() {
  const wrap = session.root.querySelector("#arcTeams");
  const play = session.play;
  const spinBtn = play.mode !== "class" ? `<button type="button" class="arc-spin" data-spin title="Spin to pick who answers">🎲<span>Spin</span></button>` : "";
  if (play.mode === "players") {
    const { player } = P.current(play);
    const top = P.rankPlayers(play)[0];
    wrap.innerHTML = `
      <div class="arc-team active arc-up" style="--team:${player?.color || "#7b6bff"}" title="Whose turn it is">
        <span class="t-emoji">${player ? A.avatarDisc(player.emoji, player.color, { cls: "sm" }) : ""}</span>
        <span class="t-name">${esc(player?.name || "")}</span>
        <span class="t-score">${player?.score ?? 0}</span>
        <span class="t-adj"><button type="button" data-adj="1" aria-label="Add a point">+</button><button type="button" data-adj="-1" aria-label="Remove a point">−</button></span>
      </div>
      ${spinBtn}
      <button type="button" class="arc-board-btn" data-board title="All players' scores">🏆<span>${top && top.score > 0 ? `${esc(top.name)} ${top.score}` : `${play.players.length} players`}</span></button>`;
    return;
  }
  const solo = play.mode === "class";
  const { player } = P.current(play);
  wrap.innerHTML = P.sides(play).map((t, i) => `
    <div class="arc-team${!solo && i === play.team ? " active" : ""}" data-team="${i}" style="--team:${t.color}" title="${solo ? "Class score" : "Click to make it this team's turn"}">
      <span class="t-emoji">${solo ? A.crestBadge({ ...t, shape: "star" }, { cls: "sm" }) : A.crestBadge(t, { cls: "sm" })}</span>
      <span class="t-name">${esc(t.name)}${!solo && i === play.team && player ? `<small class="t-who">${esc(player.name)}</small>` : ""}</span>
      <span class="t-score">${t.score}</span>
      <span class="t-adj"><button type="button" data-adj="1" aria-label="Add a point">+</button><button type="button" data-adj="-1" aria-label="Remove a point">−</button></span>
    </div>`).join("") + spinBtn + (play.mode === "teams" ? `<button type="button" class="arc-board-btn icon" data-board title="Players' points">🏅</button>` : "");
}

function onScoreboardClick(e) {
  const play = session.play;
  if (e.target.closest("[data-spin]")) { openSpinner(); return; }
  if (e.target.closest("[data-board]")) { openBoard(); return; }
  const adj = e.target.closest("[data-adj]");
  const pill = e.target.closest(".arc-team");
  if (!pill) return;
  const side = play.mode === "players" ? P.activeSide(play) : P.sides(play)[Number(pill.dataset.team)];
  if (adj) {
    if (!side) return;
    side.score = Math.max(0, side.score + Number(adj.dataset.adj));
    Number(adj.dataset.adj) > 0 ? sfx.points() : sfx.pointsDown();
    renderTeams();
    return;
  }
  if (play.mode === "teams") { P.choose(play, { team: Number(pill.dataset.team) }); sfx.tap(); afterTurnChange(); }
}

/** Tell the running game that the teacher changed whose turn it is. */
function afterTurnChange() {
  renderTeams();
  session.game?.onTurn?.();
}

/* ── Spinner: a random pick among those who haven't answered yet ─────── */
function openSpinner() {
  const play = session.play;
  if (play.mode === "class" || session.root.querySelector(".arc-spinner")) return;
  const { pick, pool } = P.spin(play);
  if (!pick) return;
  const ov = document.createElement("div");
  ov.className = "arc-spinner";
  ov.innerHTML = `<div class="sp-box"><h2>🎲 Who's next?</h2><div class="sp-names">${pool.map((p) => `<span class="sp-name${play.had.has(p.id) ? " had" : ""}" data-id="${p.id}" style="--team:${p.color}">${A.avatarDisc(p.emoji, p.color, { cls: "md" })}<b>${esc(p.name)}</b></span>`).join("")}</div><p class="sp-hint">Click anywhere to continue</p></div>`;
  session.root.appendChild(ov);
  const chips = [...ov.querySelectorAll(".sp-name")];
  const fresh = chips.filter((c) => !c.classList.contains("had"));
  const order = fresh.length ? fresh : chips;
  const target = chips.find((c) => c.dataset.id === pick.id);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let step = 0;
  const total = reduced ? 0 : 14 + order.length + order.indexOf(target);
  const land = () => {
    chips.forEach((c) => c.classList.remove("hot"));
    target.classList.add("hot", "picked");
    sfx.star();
    sparks(target, { count: 26, color: pick.color });
    renderTeams();
    session.game?.onTurn?.();
  };
  const tickOnce = () => {
    if (!ov.isConnected) return;
    if (step >= total) { land(); return; }
    chips.forEach((c) => c.classList.remove("hot"));
    order[step % order.length].classList.add("hot");
    sfx.tick();
    step++;
    setTimeout(tickOnce, 55 + Math.pow(step / Math.max(1, total), 3) * 320); // slows down before it lands
  };
  tickOnce();
  ov.addEventListener("click", () => { if (step >= total) ov.remove(); });
}

/* ── Leaderboard: every player's points ─────────────────────────────── */
function openBoard() {
  if (session.root.querySelector(".arc-board")) return;
  const play = session.play;
  const ov = document.createElement("div");
  ov.className = "arc-board";
  const ranked = P.rankPlayers(play);
  const teamOf = (p) => (play.mode === "teams" && play.teams[p.team] ? `<span class="bd-team">${A.crestBadge(play.teams[p.team], { cls: "sm" })}</span>` : "");
  ov.innerHTML = `<div class="bd-box">
    <header><h2>${play.mode === "teams" ? "🏅 Players' points" : "🏆 Scores"}</h2><button type="button" class="arc-btn ghost" data-close-board>${svg("x", "i-sm")}Close</button></header>
    <ol class="bd-list">${ranked.map((p) => `<li style="--team:${p.color}" class="${p.id === play.player ? "up" : ""}"><span class="bd-rank">${p.rank}</span>${A.avatarDisc(p.emoji, p.color, { cls: "md" })}<b>${esc(p.name)}</b>${teamOf(p)}<span class="bd-turns">${p.right}/${p.turns} right</span><span class="bd-score">${p.score}</span><button type="button" data-pick="${p.id}" title="Make it ${esc(p.name)}'s turn">Their turn</button></li>`).join("")}</ol>
  </div>`;
  session.root.appendChild(ov);
  ov.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    if (pick) { P.choose(play, { player: pick.dataset.pick }); sfx.tap(); ov.remove(); afterTurnChange(); return; }
    if (e.target === ov || e.target.closest("[data-close-board]")) ov.remove();
  });
}

function teamApi() {
  const play = session.play;
  const core = P.turnApi(play);
  const pill = () => session.root.querySelector(play.mode === "players" ? ".arc-up" : `[data-team="${play.team}"]`);
  const bump = (el) => { el?.classList.add("bump"); setTimeout(() => el?.classList.remove("bump"), 600); };
  /** Run a turn change, redraw the scoreboard, and (when someone else is up) slide in a "Your turn" banner. */
  const turnChange = (fn, { toast = true } = {}) => {
    const before = `${play.team}|${play.player}`;
    fn();
    renderTeams();
    if (!toast || play.mode === "class" || before === `${play.team}|${play.player}`) return;
    const host = session.root.querySelector(".arc-game");
    if (!host) return;
    const side = P.activeSide(play);
    turnToast(host, { html: turnHtml(), color: side?.color, label: play.mode === "teams" && before.split("|")[0] !== String(play.team) ? `${side.name}' turn` : "Your turn" });
    sfx.turn();
  };
  return {
    get solo() { return core.solo; },
    get mode() { return core.mode; },
    get teams() { return core.teams; },
    get groups() { return core.groups; },
    active: core.active,
    activeIndex: core.activeIndex,
    player: core.player,
    turnHtml,
    /** A side's badge (avatar disc, team crest or class star), for banners and round cards. */
    badge: (side, o) => sideBadge(side, o),
    award(points, { from = null } = {}) {
      const side = core.award(points);
      renderTeams();
      const el = pill();
      bump(el);
      floatText(from || el, `+${points}`, { color: side?.color || "#ffd23f" });
      if (points >= 20 && from) sparks(from, { count: 14, color: side?.color });
      sfx.points();
    },
    /** Points for one group (Lingo Live: several teams score on the same question; Top Answers: a failed steal). */
    awardTo(index, points, { from = null, quiet = false } = {}) {
      const group = core.awardTo(index, points);
      if (!group) return;
      renderTeams();
      const el = session.root.querySelector(`[data-team="${index}"]`);
      bump(el);
      if (!quiet) floatText(from || el, `+${points}`, { color: group.color });
    },
    nextTurn() { turnChange(core.nextTurn); },
    /** Teams: the next member of the same team answers (players: the next player). */
    nextMember() { turnChange(core.nextMember); },
    /** Teams: hand the turn to a team (its next fair member). Games announce this themselves. */
    passTo(index) { turnChange(() => core.passTo(index), { toast: false }); },
  };
}

/** The first emoji of a word, drawn in the chosen picture style. */
function firstPicture(emojis) {
  const first = firstEmoji(emojis);
  return first ? session.picture(first) : "";
}

/* ── Hub ─────────────────────────────────────────────────────────── */
function clearFx() {
  session.root?.querySelectorAll(".arc-confetti, .arc-spinner, .arc-board, .avp").forEach((c) => c.remove());
  document.querySelectorAll(".sx-sparks").forEach((c) => c.remove());
  session.intro?.destroy();
  session.intro = null;
}

/** The "Who's playing?" panel: mode, class, names (away today), teams. */
function whoHtml() {
  const mode = MODES.find((m) => m.id === session.mode);
  const cls = currentClass();
  const seg = `<div class="arc-seg" id="modeSeg">${MODES.map((m) => `<button type="button" data-mode="${m.id}" class="${m.id === session.mode ? "on" : ""}">${m.label}</button>`).join("")}</div>`;
  if (session.mode === "class") {
    return `<div class="ht-head"><span class="ht-label">${svg("users", "i-sm")}Who's playing?</span>${seg}</div><p class="ht-solo">${mode.hint}</p>`;
  }
  const classPick = `<div class="ht-class">
      <select id="clsSel" aria-label="Class">${session.classes.map((c) => `<option value="${esc(c.id)}" ${c.id === session.classId ? "selected" : ""}>${esc(c.name)} · ${c.players.length}</option>`).join("")}<option value="__new">＋ New class…</option></select>
      ${cls ? `<input id="clsName" value="${esc(cls.name)}" maxlength="30" spellcheck="false" aria-label="Class name" title="Rename the class">
      <button type="button" class="arc-btn ghost sm${session.delArm ? " danger" : ""}" data-del-class>${session.delArm ? "Tap again to delete" : "Delete class"}</button>` : ""}
    </div>`;
  if (!cls) {
    return `<div class="ht-head"><span class="ht-label">${svg("users", "i-sm")}Who's playing?</span>${seg}</div>
      <div class="ht-start"><p>${mode.hint}</p><p><b>Start a class list</b> — the names stay on this computer only.</p>
      <div class="ht-add"><input id="newCls" placeholder="Class name, e.g. B Senior" maxlength="30"><button type="button" class="arc-btn primary sm" data-new-class>Create</button></div></div>`;
  }
  const present = cls.players.filter((p) => !session.absent.has(p.id));
  const chip = (p) => {
    const away = session.absent.has(p.id);
    const look = A.playerLook(cls, p);
    return `<span class="ht-chip${away ? " away" : ""}" style="--team:${look.color}">
      <button type="button" class="hc-av" data-avatar="${p.id}" title="Choose ${esc(p.name)}'s avatar">${A.avatarDisc(look.emoji, look.color, { cls: "sm" })}</button>
      <button type="button" data-tap="${p.id}" title="${session.mode === "teams" ? "Move to the next team" : away ? "Back today" : "Away today"}"><b>${esc(p.name)}</b></button>
      ${session.mode === "teams" ? `<button type="button" class="hc-away" data-away="${p.id}" title="${away ? "Back today" : "Away today"}">${away ? "↩" : "💤"}</button>` : ""}
      <button type="button" class="hc-del" data-del="${p.id}" title="Remove from the class">×</button></span>`;
  };
  let roster;
  if (session.mode === "teams") {
    const n = cls.teamCount || 2;
    P.fillTeams(cls, cls.players.map((p) => p.id), n);
    roster = `<div class="ht-teambar"><div class="arc-seg" id="teamSeg">${[2, 3, 4].map((k) => `<button type="button" data-n="${k}" class="${k === n ? "on" : ""}">${k} teams</button>`).join("")}</div>
        <button type="button" class="arc-btn ghost sm" data-shuffle>🔀 Shuffle teams</button>
        <button type="button" class="arc-btn ghost sm" data-surprise title="A different random avatar and colour for everyone">🎲 Surprise avatars</button></div>
      <div class="ht-cols" style="--cols:${n}">${P.TEAM_PRESETS.slice(0, n).map((t, ti) => {
        const members = cls.players.filter((p) => cls.assign[p.id] === ti);
        return `<div class="ht-col" style="--team:${A.teamCrest(cls, ti).color}"><label class="ht-name"><button type="button" class="ht-crest" data-crest="${ti}" title="Choose the team's crest">${A.crestBadge(A.teamCrest(cls, ti), { cls: "md" })}</button><input data-tname="${ti}" value="${esc(cls.teamNames?.[ti] || t.name)}" maxlength="16" spellcheck="false" aria-label="Team ${ti + 1} name"></label>
          <div class="ht-members">${members.map(chip).join("") || `<p class="ht-empty">Tap a name to move it here</p>`}</div>
          <small class="ht-count">${members.filter((p) => !session.absent.has(p.id)).length} playing</small></div>`;
      }).join("")}</div>`;
  } else {
    roster = `${cls.players.length ? `<div class="ht-teambar"><span class="ht-avtip">Tap a face to choose an avatar</span><button type="button" class="arc-btn ghost sm" data-surprise title="A different random avatar and colour for everyone">🎲 Surprise avatars</button></div>` : ""}<div class="ht-roster">${cls.players.map(chip).join("") || `<p class="ht-empty">No names yet — add the class below.</p>`}</div>`;
  }
  const tip = session.mode === "teams" ? "Tap a face to choose an avatar · a name to move them to the next team · a crest to change it · 💤 away today · × remove" : "Tap a face to choose an avatar · a name if they're away today · × removes them from the class";
  return `<div class="ht-head"><span class="ht-label">${svg("users", "i-sm")}Who's playing? <em>${present.length} of ${cls.players.length}</em></span>${seg}</div>
    ${classPick}
    <p class="ht-solo">${mode.hint}</p>
    ${roster}
    <div class="ht-add"><input id="addNames" placeholder="Type a name and press Enter — or paste the whole class list" maxlength="2000" spellcheck="false"><button type="button" class="arc-btn primary sm" data-add>Add</button></div>
    <p class="ht-tip">${tip}</p>`;
}

/** What each game trains and when to use it — shown on the cards so a teacher can choose with a purpose. */
const GAME_META = {
  flashcards: { skills: ["Meaning", "Pronunciation"], best: "Introducing or recapping words", how: "See it, hear it, say it, then sort what the class knows." },
  memory: { skills: ["Meaning", "Memory"], best: "A calm warm-up", how: "Match each word with its picture or Greek meaning." },
  spelling: { skills: ["Spelling", "Listening"], best: "Spelling practice", how: "Hear the word, then build it letter by letter." },
  board: { skills: ["Meaning", "Spelling", "Listening"], best: "Mixed revision", how: "Pictures, gaps, spelling and listening — harder rows are worth more." },
  feud: { skills: ["Speaking", "Topics"], best: "Using words in topics", how: "Name things that fit a topic — the class's top answers win." },
  taboo: { skills: ["Speaking", "Describing"], best: "Fluency and explaining", how: "Describe a word without saying it (or its forbidden words)." },
  live: { skills: ["Meaning", "Reading", "Listening"], best: "A full-class quiz", how: "Everyone answers on a phone or tablet; the board shows the results." },
};
const HUB_GROUPS = [
  { id: "meet", title: "Meet the words", sub: "See them, hear them, remember them", ids: ["flashcards", "memory"] },
  { id: "practise", title: "Practise", sub: "Spell, choose, collect points", ids: ["spelling", "board"] },
  { id: "speak", title: "Speak & show off", sub: "Use the words out loud", ids: ["feud", "taboo"] },
];
/** A ready-made lesson: each game picks up where the last one ended. */
const CLASS_PLAN = ["flashcards", "memory", "spelling", "board", "feud"];

const deckStats = (deck) => {
  const count = (re) => deck.filter((w) => re.test(w.type || "")).length;
  const bits = [[count(/^n\./), "nouns"], [count(/^v\.|^phr\. v/), "verbs"], [count(/^adj\.|^adv\./), "describing words"], [count(/^phr\.$/), "phrases"]].filter(([n]) => n);
  const pics = deck.filter((w) => firstPicture(w.emojis)).length;
  return `${bits.map(([n, l]) => `${n} ${l}`).join(" · ")}${pics ? ` · ${pics} with pictures` : ""}`;
};

function gameCard(g, deck, i) {
  const locked = deck.length < g.minWords;
  const meta = GAME_META[g.id] || { skills: g.tags, best: "", how: g.description };
  if (g.featured) {
    return `<button type="button" class="game-card featured g-${g.id}${locked ? " locked" : ""}" data-game="${g.id}" ${locked ? "disabled" : ""}>
      <span class="gc-art"><span class="gc-shapes" aria-hidden="true"><i class="s-tri"></i><i class="s-dia"></i><i class="s-cir"></i><i class="s-sq"></i></span><span class="gc-emoji">${g.emoji}</span></span>
      <span class="gc-body">
        <span class="gc-badge">Live show · whole class</span>
        <span class="gc-title">${esc(g.title)}</span>
        <span class="gc-desc">${esc(g.description)}</span>
        <span class="gc-skills">${meta.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</span>
      </span>
      <span class="gc-play">${locked ? `Needs ${g.minWords}+ words` : `${svg("play", "i-sm")}Start the show`}</span>
    </button>`;
  }
  return `<button type="button" class="game-card g-${g.id}${locked ? " locked" : ""}" data-game="${g.id}" style="animation-delay:${i * 80}ms" ${locked ? "disabled" : ""}>
    <span class="gc-art"><span class="gc-emoji">${g.emoji}</span></span>
    <span class="gc-body">
      <span class="gc-title">${esc(g.title)}</span>
      <span class="gc-desc">${esc(meta.how)}</span>
      <span class="gc-skills">${meta.skills.map((s) => `<span>${esc(s)}</span>`).join("")}</span>
      ${meta.best ? `<span class="gc-best">★ ${esc(meta.best)}</span>` : ""}
    </span>
    <span class="gc-play">${locked ? `Needs ${g.minWords}+ words` : `${svg("play", "i-sm")}Play`}</span>
  </button>`;
}

function showHub() {
  clearFx();
  if (session.gameDef) sfx.back();
  session.game?.destroy?.();
  session.game = null;
  session.gameDef = null;
  session.plan = null;
  stopSpeaking();
  buildPlay();
  const main = session.root.querySelector("#arcMain");
  session.root.querySelector("#arcCrumb").innerHTML = "";
  session.root.querySelector(".arc-brand-text small").textContent = session.title;
  renderTeams();
  const deck = session.deck;
  const byId = new Map(GAMES.map((g) => [g.id, g]));
  const live = byId.get("live");
  const planIds = CLASS_PLAN.filter((id) => byId.get(id) && deck.length >= byId.get(id).minWords);
  const ribbon = deck.map((w) => firstPicture(w.emojis)).filter(Boolean);
  const track = ribbon.length >= 4 ? ribbon.concat(ribbon).map((p) => `<span>${p}</span>`).join("") : "";
  main.innerHTML = `
    <div class="arc-hub">
      <section class="hub-hero">
        <div class="hh-copy">
          <h1>Let's play!</h1>
          <p>Choose the words, then choose a game — every game uses exactly your words.</p>
        </div>
        <div class="hh-deck">
          <div class="hhd-main">
            <div class="hhd-count"><b data-countup="${deck.length}">${deck.length}</b><span>words</span></div>
            <div class="hhd-info"><b>${esc(session.title)}</b><small>${esc(deckStats(deck))}</small></div>
            <button type="button" class="arc-btn primary hhd-pick" data-pick-words>${svg("book-open", "i-sm")}Choose words</button>
          </div>
          ${track ? `<div class="hhd-ribbon" aria-hidden="true"><div class="hhd-track">${track}</div></div>` : ""}
        </div>
      </section>

      <section class="hub-teams" id="hubWho">${whoHtml()}</section>

      ${planIds.length >= 3 ? `<section class="hub-plan">
        <div class="hp-copy"><b>Ready-made lesson</b><span>${planIds.length} games, one after another — each picks up where the last ended.</span></div>
        <ol class="hp-steps">${planIds.map((id, i) => `<li><span class="hp-n">${i + 1}</span>${byId.get(id).emoji} ${esc(byId.get(id).title)}</li>`).join("")}</ol>
        <button type="button" class="arc-btn primary" data-plan>${svg("play", "i-sm")}Start the lesson</button>
      </section>` : ""}

      <section class="hub-games">
        ${live && live.hub !== false ? gameCard(live, deck, 0) : ""}
      </section>
      ${HUB_GROUPS.map((grp) => {
        const games = grp.ids.map((id) => byId.get(id)).filter((g) => g && g.hub !== false);
        return games.length ? `<section class="hub-group g-${grp.id}">
          <header><h2>${esc(grp.title)}</h2><span>${esc(grp.sub)}</span></header>
          <div class="hub-games two">${games.map((g, i) => gameCard(g, deck, i + 1)).join("")}</div>
        </section>` : "";
      }).join("")}

    </div>`;
  const who = main.querySelector("#hubWho");
  who.addEventListener("click", onWhoClick); // once per hub: the panel re-renders inside it
  wireWho(who);
  main.querySelectorAll("[data-game]").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.game)));
  main.querySelectorAll("[data-pick-words]").forEach((b) => b.addEventListener("click", openPicker));
  main.querySelector("[data-plan]")?.addEventListener("click", () => { session.plan = { ids: planIds, i: 0 }; startGame(planIds[0]); });
  main.querySelectorAll(".game-card:not(.featured):not(:disabled)").forEach(tilt);
  countUp(main.querySelector("[data-countup]"));
}

/** Cards lean towards the pointer a little (smartboards and touch just skip it). */
function tilt(card) {
  card.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--rx", `${(((e.clientY - r.top) / r.height) - 0.5) * -7}deg`);
    card.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width) - 0.5) * 9}deg`);
  });
  card.addEventListener("pointerleave", () => { card.style.removeProperty("--rx"); card.style.removeProperty("--ry"); });
}

function countUp(el) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const to = Number(el.dataset.countup) || 0;
  const t0 = performance.now();
  const step = (t) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (t - t0) / 700);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** The deck of a pick: the coursebook rows (trusted pictures), then the teacher's own words. */
function deckOf(ids, own = []) {
  const rows = ids.map((id) => rowById.get(id)).filter(Boolean);
  const book = rows.length ? (session.buildDeck ? session.buildDeck(rows) : buildArcadeDeck(rows)) : [];
  // An own word takes the coursebook's type, Greek, phrase and example when the word is in a book; the bank's emoji
  // fillers are left out (buildArcadeDeck still gives it the illustrated picture when there is one).
  const lookup = (english) => { const hit = lookupCoursebookWord(english); return hit ? { ...hit, emojis: "" } : null; };
  const seen = new Set(book.map((w) => w.english.toLowerCase()));
  const mine = buildArcadeDeck(own.map((w) => ({ english: w.english, greek: w.greek || "" })), lookup).filter((w) => !seen.has(w.english.toLowerCase()));
  return [...book, ...mine];
}

/** "Choose your words" is remembered on this computer: the arcade opens with the same words until the teacher picks again.
 *  Saved as { ids, own } (older versions saved the ids alone). */
function restorePick() {
  const saved = safeJSON(localStorage.getItem(PICK_KEY), null);
  const ids = (Array.isArray(saved) ? saved : saved?.ids || []).filter((id) => rowById.has(id));
  const own = Array.isArray(saved?.own) ? saved.own.filter((w) => w?.english) : [];
  if (ids.length + own.length < 3) return;
  session.deck = deckOf(ids, own);
  session.title = describeDeck(ids, own);
  session.pickIds = ids;
  session.pickOwn = own;
  session.source = "book";
}

/** Open "Choose your words": book → unit → lesson → word, with the deck growing alongside. */
function openPicker() {
  if (session.picker) return;
  sfx.whoosh();
  const minWords = HUB_GAMES().map((g) => ({ title: g.title, min: g.minWords }));
  session.picker = openDeckPicker({
    root: session.root,
    esc,
    svg,
    sfx,
    pic: rowPicture,
    picked: session.pickIds || [],
    own: session.pickOwn || [],
    // The worksheet's words can be added to a book pick (the arcade was opened with them).
    worksheetWords: session.baseDeck.map((w) => ({ english: w.english, greek: w.greek || "" })),
    minWords,
    hasWorksheet: !!session.baseDeck.length && session.source !== "start",
    hasVoice: (row) => hasVoiceFor(row.english),
    onClose: closePicker,
    onApply: applyPick,
  });
}
function closePicker() { session.picker?.destroy(); session.picker = null; }

/** A coursebook word's picture (the illustrated picture when it has one), drawn in the chosen style. */
function rowPicture(row) {
  const token = picForWord(row.english, row.type);
  return token ? session.picture(token) : "";
}

/** ids = the picked coursebook words, own = the teacher's own words; ids null = go back to the words the arcade was opened with. */
function applyPick(ids, own = []) {
  closePicker();
  if (!ids) {
    session.deck = session.baseDeck;
    session.title = session.baseTitle;
    session.pickIds = null;
    session.pickOwn = [];
    session.source = "start";
  } else {
    session.deck = deckOf(ids, own);
    session.title = describeDeck(ids, own);
    session.pickIds = ids;
    session.pickOwn = own;
    session.source = "book";
  }
  if (ids) store(PICK_KEY, { ids, own }); else { try { localStorage.removeItem(PICK_KEY); } catch { /* storage unavailable */ } }
  sfx.win();
  showHub();
  confetti(session.root, { count: 90, originY: 0.2 });
}

/** Re-render only the "Who's playing?" panel (keeps the page scroll and focus calm). */
function refreshWho(focusAdd = false) {
  const host = session.root.querySelector("#hubWho");
  if (!host) return;
  host.innerHTML = whoHtml();
  wireWho(host);
  buildPlay();
  renderTeams();
  if (focusAdd) host.querySelector("#addNames, #newCls")?.focus();
}

function onWhoClick(e) {
  const host = e.currentTarget;
  const cls = currentClass();
  const changed = () => { saveClasses(); refreshWho(); };
  {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.mode) { session.mode = t.dataset.mode; store("vm_arcade_mode", session.mode); session.delArm = false; sfx.tap(); refreshWho(); return; }
    if (t.dataset.n && cls) { cls.teamCount = Number(t.dataset.n); P.balanceTeams(cls, cls.players.map((p) => p.id), cls.teamCount); sfx.tap(); changed(); return; }
    if (t.hasAttribute("data-shuffle") && cls) { P.balanceTeams(cls, cls.players.filter((p) => !session.absent.has(p.id)).map((p) => p.id), cls.teamCount || 2); sfx.whoosh(); changed(); return; }
    if (t.dataset.avatar && cls) { openAvatars(t.dataset.avatar); return; }
    if (t.dataset.crest && cls) { openCrests(Number(t.dataset.crest)); return; }
    if (t.hasAttribute("data-surprise") && cls) {
      A.shuffleAvatars(cls);
      sfx.sparkle();
      changed();
      host.querySelectorAll(".ht-chip .av").forEach((a, i) => a.animate?.([{ transform: "scale(0.3) rotate(-30deg)" }, { transform: "scale(1.15)" }, { transform: "none" }], { duration: 520, delay: i * 35, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "backwards" }));
      return;
    }
    if (t.hasAttribute("data-new-class")) { createClass(host.querySelector("#newCls")?.value); return; }
    if (t.hasAttribute("data-add")) { addNames(host.querySelector("#addNames")?.value); return; }
    if (t.hasAttribute("data-del-class") && cls) {
      if (!session.delArm) { session.delArm = true; refreshWho(); setTimeout(() => { if (session?.delArm) { session.delArm = false; refreshWho(); } }, 4000); return; }
      session.classes = session.classes.filter((c) => c.id !== cls.id);
      session.classId = session.classes[0]?.id || null;
      session.delArm = false;
      store("vm_arcade_class", session.classId || "");
      sfx.pointsDown();
      changed();
      return;
    }
    const id = t.dataset.tap || t.dataset.away || t.dataset.del;
    if (!id || !cls) return;
    if (t.dataset.del) { cls.players = cls.players.filter((p) => p.id !== id); delete cls.assign[id]; session.absent.delete(id); sfx.pointsDown(); changed(); return; }
    if (t.dataset.tap && session.mode === "teams") { const n = cls.teamCount || 2; cls.assign[id] = ((cls.assign[id] ?? 0) + 1) % n; sfx.tap(); changed(); return; }
    session.absent.has(id) ? session.absent.delete(id) : session.absent.add(id); // away today (not saved)
    sfx.tap();
    refreshWho();
  }
}

/** Inputs inside the panel (they are re-created on every refresh). */
function wireWho(host) {
  const cls = currentClass();
  const changed = () => { saveClasses(); refreshWho(); };
  host.querySelector("#clsSel")?.addEventListener("change", (e) => {
    if (e.target.value === "__new") { session.classId = null; refreshWho(true); return; }
    session.classId = e.target.value;
    session.absent.clear();
    store("vm_arcade_class", session.classId);
    sfx.tap();
    refreshWho();
  });
  host.querySelector("#clsName")?.addEventListener("change", (e) => { if (cls) { cls.name = e.target.value.trim() || cls.name; changed(); } });
  host.querySelectorAll("[data-tname]").forEach((inp) => inp.addEventListener("input", () => {
    if (!cls) return;
    cls.teamNames = cls.teamNames || [];
    cls.teamNames[Number(inp.dataset.tname)] = inp.value.trim();
    saveClasses();
    buildPlay();
    renderTeams();
  }));
  host.querySelector("#addNames")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addNames(e.target.value); } });
  host.querySelector("#addNames")?.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (/[\n,;\t]/.test(text)) { e.preventDefault(); addNames(text); } // a pasted class list goes straight in
  });
  host.querySelector("#newCls")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createClass(e.target.value); } });
}

function createClass(name) {
  const cls = P.newClass(name || `Class ${session.classes.length + 1}`);
  session.classes.push(cls);
  session.classId = cls.id;
  store("vm_arcade_class", cls.id);
  saveClasses();
  sfx.pop();
  refreshWho(true);
}

/** The avatar picker for one child (arrows go through the class). Choices are saved with the class at once. */
function openAvatars(playerId) {
  const cls = currentClass();
  if (!cls || session.root.querySelector(".avp")) return;
  sfx.whoosh();
  openAvatarPicker({
    root: session.root, cls, playerId, sfx, esc,
    onChange() { saveClasses(); refreshWho(); },
  });
}

/** The crest picker for a team: mascot, colour, badge shape and name. */
function openCrests(teamIndex) {
  const cls = currentClass();
  if (!cls || session.root.querySelector(".avp")) return;
  sfx.whoosh();
  openCrestPicker({
    root: session.root, cls, teamIndex, sfx, esc,
    teamName: (i) => cls.teamNames?.[i] || P.TEAM_PRESETS[i].name,
    onRename(i, name) { cls.teamNames = cls.teamNames || []; cls.teamNames[i] = name; },
    onChange() { saveClasses(); refreshWho(); },
  });
}

function addNames(text) {
  const cls = currentClass();
  const names = P.parseNames(text);
  if (!cls || !names.length) return;
  const ids = P.addPlayers(cls, names);
  P.fillTeams(cls, cls.players.map((p) => p.id), cls.teamCount || 2);
  saveClasses();
  if (ids.length) sfx.pop();
  refreshWho(true);
}

/* ── Game lifecycle ──────────────────────────────────────────────── */
/** Each game's title screen: its colours, a one-line promise and three steps a class can read from the back. */
const INTRO = {
  flashcards: { c: "#7b6bff", c2: "#c056f0", tag: "See it, hear it, say it!", steps: [["👀", "Look at the card — what's the word?"], ["🗣️", "Say it out loud together"], ["✅", "Sort them: we know it · still learning"]] },
  memory: { c: "#22c3ee", c2: "#7b6bff", tag: "Find the matching pairs!", steps: [["🃏", "Turn over two cards"], ["🔍", "Match each word with its picture"], ["🎯", "A match scores and you go again"]] },
  spelling: { c: "#f2a900", c2: "#ff8a4c", tag: "Hear it. Spell it. Win it!", steps: [["👂", "Listen to the word"], ["🔤", "Tap the letters in the right order"], ["⭐", "Fewer hints, more points"]] },
  board: { c: "#5b3df5", c2: "#22c3ee", tag: "Pick a tile — dare the big points!", steps: [["🎯", "Choose a category and points"], ["⏱️", "Answer before the time runs out"], ["⭐", "One tile hides double points!"]] },
  feud: { c: "#fbbf24", c2: "#f472b6", tag: "100 children answered — what did they say?", steps: [["💬", "Name things that fit the topic"], ["📋", "Find the top answers on the board"], ["❌", "Three strikes… and the other team can steal!"]] },
  taboo: { c: "#ff5e7a", c2: "#ff8a4c", tag: "Describe it — but don't say it!", steps: [["🪑", "One player sits with their back to the board"], ["🗣️", "The others describe the word in English"], ["🚫", "Never say the forbidden words!"]] },
  quiz: { c: "#6366f1", c2: "#ec4899", tag: "Pick the right answer!", steps: [["❓", "Read the question"], ["🔤", "Choose A, B, C or D"], ["🔥", "Answer quickly for bonus points"]] },
};

/** "Who's playing" on a title screen: team crests face to face, the players' avatars, or the whole class. */
function introWho() {
  const play = session.play;
  if (play.mode === "teams") {
    return `<div class="sx-vs">${play.teams.map((t, i) => `${i ? `<span class="sx-vs-x">VS</span>` : ""}<span class="sx-team" style="--team:${t.color};--i:${i}">${A.crestBadge(t, { cls: "lg" })}<b>${esc(t.name)}</b><small>${play.players.filter((p) => p.team === i).map((p) => esc(p.name)).join(" · ")}</small></span>`).join("")}</div>`;
  }
  if (play.mode === "players") {
    const shown = play.players.slice(0, 14);
    return `<div class="sx-crowd">${shown.map((p, i) => `<span class="sx-kid" style="--i:${i}">${A.avatarDisc(p.emoji, p.color, { cls: "md" })}<b>${esc(p.name)}</b></span>`).join("")}${play.players.length > shown.length ? `<span class="sx-more">+${play.players.length - shown.length}</span>` : ""}</div>`;
  }
  return `<div class="sx-class">${A.crestBadge({ emoji: "⭐", color: "#ffd23f", shape: "star" }, { cls: "md" })}<b>Whole class</b><small>one team, one score</small></div>`;
}

function introFor(def) {
  const i = INTRO[def.id] || { c: "#7b6bff", c2: "#c056f0", tag: def.description, steps: [] };
  const steps = i.steps.map(([icon, text]) => ({ icon, text }));
  if (def.id === "feud" && session.play.mode !== "teams") steps[2] = { icon: "❌", text: "Three strikes and the round is over!" };
  const plan = session.plan;
  return {
    title: def.title,
    emoji: def.emoji,
    color: i.c,
    color2: i.c2,
    tagline: i.tag,
    steps,
    who: introWho(),
    kicker: plan ? `Ready-made lesson · game ${plan.i + 1} of ${plan.ids.length}` : "Lingo Arcade",
    keys: "<kbd>Space</kbd> start · <kbd>Esc</kbd> all games",
    sfx,
  };
}

/**
 * Start a game: a fresh line-up (the next team goes first), then its title screen, then the game.
 * quick: "Play again" skips the title screen for a 3 · 2 · 1 countdown.
 */
function startGame(id, { quick = false } = {}) {
  const def = GAMES.find((g) => g.id === id);
  if (!def) return;
  clearFx();
  session.game?.destroy?.();
  session.game = null;
  session.gameDef = def;
  buildPlay({ forGame: true }); // a fresh line-up and scores for every game
  // Remember what the class played ("Choose your words" can hide this week's words).
  store("vm_arcade_played", logPlayed(safeJSON(localStorage.getItem("vm_arcade_played"), {}), session.deck));
  renderTeams();
  sfx.whoosh();
  const main = session.root.querySelector("#arcMain");
  session.root.querySelector("#arcCrumb").innerHTML = `
    <button type="button" class="arc-back" data-back>${svg("arrow-left", "i-sm")}<span>Games</span></button>
    <span class="arc-game-name">${def.emoji} ${esc(def.title)}</span>
    <span class="arc-progress" id="arcProgress"></span>`;
  session.root.querySelector("[data-back]").addEventListener("click", () => showHub());
  main.innerHTML = `<div class="arc-game g-${def.id}"><div class="game-stage" id="gameStage"></div></div>`;
  const area = main.querySelector(".arc-game");
  const stage = main.querySelector("#gameStage");
  const mount = () => {
    if (!session || session.gameDef !== def || !stage.isConnected) return;
    stage.classList.add("stage-in");
    session.game = mountGame(def, {
      stage,
      root: session.root,
      deck: session.deck,
      picture: session.picture,
      teams: teamApi(),
      greek: () => session.greek,
      setProgress(html) { const p = session.root.querySelector("#arcProgress"); if (p) p.innerHTML = html; },
      onFinish: (o) => showFinish(def, o),
      onRestart: () => startGame(id, { quick: true }),
      onHub: () => showHub(),
    });
  };
  // Lingo Live has its own lobby; every other game opens on its title screen.
  if (def.id === "live") { mount(); return; }
  if (quick) { countdown(area, { sfx }).then(mount); return; }
  session.intro = titleCard(area, introFor(def));
  session.intro.done.then((ok) => { if (ok && session) { session.intro = null; mount(); } });
}

/**
 * The end screen: a drumroll, the podium rising from last place to first, the winner's crown, fanfare and confetti.
 * Class mode: the class's points count up under the trophy.
 */
function showFinish(def, { title = "Game over!", subtitle = "", stats = [], extraAction = null } = {}) {
  session.game?.destroy?.();
  session.game = { destroy() {} };
  clearFx();
  const main = session.root.querySelector("#arcMain");
  const play = session.play;
  session.lastUp = play.player; // the next game carries on after whoever was up
  const solo = play.mode === "class";
  const ranked = play.mode === "players" ? P.rankPlayers(play) : [...P.sides(play)].sort((a, b) => b.score - a.score);
  const tie = !solo && ranked.length > 1 && ranked[0].score === ranked[1].score;
  const winner = ranked[0];
  const heading = solo ? title : tie ? "It's a tie!" : play.mode === "players" ? `${winner.name} wins!` : `${winner.name} win!`;
  const podium = solo ? [] : ranked.slice(0, play.mode === "players" ? 3 : 4);
  const nextId = session.plan?.ids[session.plan.i + 1];
  const nextDef = nextId ? GAMES.find((g) => g.id === nextId) : null;
  const stars = play.mode === "teams" ? P.rankPlayers(play).filter((p) => p.score > 0).slice(0, 3) : [];
  const rest = play.mode === "players" ? ranked.slice(3) : [];
  // Reveal times (ms): last place first, the winner last, as the drumroll lands.
  const still = reducedMotion();
  const n = podium.length;
  const at = (rank) => (still ? 0 : 350 + (n - 1 - rank) * 520);
  const winAt = still ? 0 : solo ? 500 : at(0) + 380;
  const after = winAt + (still ? 0 : 450);
  // Podium order on screen: 2nd, 1st, 3rd, 4th.
  const slot = (i) => (n >= 3 ? [1, 0, 2, 3][i] : i);
  const top = Math.max(1, winner?.score || 0);
  main.innerHTML = `
    <div class="arc-finish fin2${solo ? " solo" : ""}" style="--g1:${INTRO[def.id]?.c || "#7b6bff"};--g2:${INTRO[def.id]?.c2 || "#c056f0"}">
      <div class="fin-rays" aria-hidden="true" style="--d:${winAt}ms"></div>
      <div class="fin-head">
        <div class="fin-kick">${def.emoji} ${esc(def.title)} · ${solo ? "well played!" : tie ? "what a game!" : "and the winner is…"}</div>
        <h1 class="fin-title" style="--d:${winAt}ms" aria-label="${esc(heading)}">${bouncy(heading, "fin-l")}</h1>
        ${subtitle ? `<p class="fin-sub" style="--d:${after}ms">${esc(subtitle)}</p>` : ""}
      </div>
      ${solo ? `<div class="fin-solo" style="--d:${winAt}ms"><div class="fin-trophy">🏆</div><div class="fin-score"><b data-count="${winner.score}">0</b><span>class points</span></div></div>`
        : `<div class="podium p${n}">${podium.map((t, i) => {
          const rank = ranked.indexOf(t);
          const first = rank === 0 || (tie && t.score === winner.score);
          return `<div class="pod${first ? " first" : ""}" style="--team:${t.color};--p:${Math.max(0.32, t.score / top).toFixed(3)};--d:${at(i)}ms;order:${slot(i)}">
            <span class="pod-crown" aria-hidden="true">${first ? "👑" : ""}</span>
            <span class="pod-face">${sideBadge(t, { cls: first ? "xl" : "lg" })}</span>
            <span class="pod-name">${esc(t.name)}</span>
            <span class="pod-bar"><b data-count="${t.score}" data-at="${at(i)}">0</b><i class="pod-place">${i + 1}</i></span>
          </div>`;
        }).join("")}</div>`}
      ${stats.length ? `<div class="fin-stats" style="--d:${after}ms">${stats.map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
      ${stars.length ? `<div class="fin-stars" style="--d:${after + 150}ms"><span>⭐ Stars of the game</span>${stars.map((p) => `${playerChip(p)}<em>${p.score}</em>`).join("")}</div>` : ""}
      ${rest.length ? `<ol class="fin-rest" start="4" style="--d:${after + 150}ms">${rest.map((p) => `<li>${A.avatarDisc(p.emoji, p.color, { cls: "sm" })}<b>${esc(p.name)}</b><em>${p.score}</em></li>`).join("")}</ol>` : ""}
      <div class="fin-actions" style="--d:${after + 250}ms">
        ${extraAction ? `<button type="button" class="arc-btn ghost" data-extra>${esc(extraAction.label)}</button>` : ""}
        <button type="button" class="arc-btn ghost" data-hub2>${svg("grid", "i-sm")}All games</button>
        <button type="button" class="arc-btn ${nextDef ? "ghost" : "primary"}" data-again>${svg("rotate", "i-sm")}Play again</button>
        ${nextDef ? `<button type="button" class="arc-btn primary xl" data-next-plan>Next: ${nextDef.emoji} ${esc(nextDef.title)}${svg("arrow-right", "i-sm")}</button>` : session.plan ? `<span class="fin-plan-done">🎓 Lesson complete!</span>` : ""}
      </div>
    </div>`;
  const fin = main.querySelector(".arc-finish");
  const later = (fn, ms) => setTimeout(() => { if (session && fin.isConnected) fn(); }, ms);
  if (!solo && !still) sfx.drumroll();
  // Each score counts up as its bar rises.
  fin.querySelectorAll(".pod-bar b[data-count]").forEach((b) => later(() => { countTo(b, Number(b.dataset.count), { ms: 700 }); if (!still) sfx.reveal(); }, Number(b.dataset.at) + 150));
  const big = fin.querySelector(".fin-score b[data-count]");
  if (big) later(() => countTo(big, Number(big.dataset.count), { ms: 1100 }), winAt);
  later(() => {
    sfx.fanfare();
    confetti(session.root, { count: 220, originY: 0.25 });
    sparks(fin.querySelector(".pod.first .pod-face, .fin-trophy"), { count: 30, size: 1.4 });
  }, winAt);
  later(() => confetti(session.root, { count: 120, originX: 0.2, originY: 0.5 }), winAt + 450);
  later(() => confetti(session.root, { count: 120, originX: 0.8, originY: 0.5 }), winAt + 750);
  main.querySelector("[data-again]").addEventListener("click", () => startGame(def.id, { quick: true }));
  main.querySelector("[data-hub2]").addEventListener("click", () => showHub());
  main.querySelector("[data-next-plan]")?.addEventListener("click", () => { session.plan.i++; startGame(nextId); });
  main.querySelector("[data-extra]")?.addEventListener("click", () => extraAction.run());
}

function onKey(e) {
  if (!session) return;
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (session.picker) { closePicker(); return; }
    const overlay = session.root.querySelector(".avp, .arc-spinner, .arc-board");
    if (overlay) { overlay.dispatchEvent(new CustomEvent("arc-close")); overlay.remove(); return; }
    if (session.gameDef) showHub();
    else closeArcade();
    return;
  }
  if (typing || session.picker) return;
  if (session.root.querySelector(".avp, .arc-spinner, .arc-board")) { if (!session.root.querySelector(".avp")) { e.preventDefault(); e.stopPropagation(); } return; } // keys wait while a pick or the scores are open
  if ((e.key === "g" || e.key === "G") && !session.game?.capturesLetters) { e.preventDefault(); toggleGreek(); return; }
  if (session.game?.onKey) {
    session.game.onKey(e);
    e.stopPropagation();
  }
}
