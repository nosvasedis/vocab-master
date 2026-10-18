/* ══════════════════════════════════════════════════════════════════
   Lingo Arcade — full-screen classroom games for the smartboard.
   Shell: hub (who's playing, games, deck), scoreboard, turns, spinner, end screens.
   Who plays — whole class, individual players, or teams of named members — lives in arcade/players.js.
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
import board from "./games/board.js";
import feud from "./games/feud.js";
import { teamPic, avatarPic } from "../js/pics.js";
import * as P from "./players.js";

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
export function openArcade({ deck, title, prefs = {}, onPrefs, picture } = {}) {
  if (session) return;
  configureAudio(prefs);
  const classes = loadClasses();
  const savedMode = localStorage.getItem("vm_arcade_mode");
  const legacyTeams = Number(localStorage.getItem("vm_arcade_teams") ?? 2); // before modes: 1 = whole class
  session = {
    deck,
    title,
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
  };
  if (!currentClass()) session.classId = classes[0]?.id || null;
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
function buildPlay() {
  const cls = currentClass();
  session.play = P.createPlay({ mode: session.mode, cls, absent: session.absent, teamCount: cls?.teamCount || 2, teamNames: cls?.teamNames || [] });
}

const sideIcon = (s) => (session.play.mode === "players" ? avatarPic(s.emoji) : teamPic(s.emoji));
const playerChip = (p) => (p ? `<span class="who-chip" style="--team:${p.color}">${avatarPic(p.emoji)}<b>${esc(p.name)}</b></span>` : "");

/** "🦊 Maria" (players), "🦊 Maria · 🚀 Rockets" (teams), "" (class) — for the games' turn banners. */
function turnHtml() {
  const { side, player } = P.current(session.play);
  if (session.play.mode === "players") return playerChip(player);
  if (session.play.mode === "teams") return `${playerChip(player)}<span class="who-for">·</span><span class="who-team" style="--team:${side.color}">${teamPic(side.emoji)} ${esc(side.name)}</span>`;
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
        <span class="t-emoji">${player ? avatarPic(player.emoji) : ""}</span>
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
      <span class="t-emoji">${teamPic(t.emoji)}</span>
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
  ov.innerHTML = `<div class="sp-box"><h2>🎲 Who's next?</h2><div class="sp-names">${pool.map((p) => `<span class="sp-name${play.had.has(p.id) ? " had" : ""}" data-id="${p.id}" style="--team:${p.color}">${avatarPic(p.emoji)}<b>${esc(p.name)}</b></span>`).join("")}</div><p class="sp-hint">Click anywhere to continue</p></div>`;
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
  const teamOf = (p) => (play.mode === "teams" && play.teams[p.team] ? `<span class="bd-team" style="--team:${play.teams[p.team].color}">${teamPic(play.teams[p.team].emoji)}</span>` : "");
  ov.innerHTML = `<div class="bd-box">
    <header><h2>${play.mode === "teams" ? "🏅 Players' points" : "🏆 Scores"}</h2><button type="button" class="arc-btn ghost" data-close-board>${svg("x", "i-sm")}Close</button></header>
    <ol class="bd-list">${ranked.map((p) => `<li style="--team:${p.color}" class="${p.id === play.player ? "up" : ""}"><span class="bd-rank">${p.rank}</span>${avatarPic(p.emoji)}<b>${esc(p.name)}</b>${teamOf(p)}<span class="bd-turns">${p.right}/${p.turns} right</span><span class="bd-score">${p.score}</span><button type="button" data-pick="${p.id}" title="Make it ${esc(p.name)}'s turn">Their turn</button></li>`).join("")}</ol>
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
  const pill = () => session.root.querySelector(play.mode === "players" ? ".arc-up" : `[data-team="${play.team}"]`);
  return {
    /** Whole-class mode (no turns). */
    get solo() { return play.mode === "class"; },
    get mode() { return play.mode; },
    /** Scoring sides: [class], the players, or the teams. */
    get teams() { return P.sides(play); },
    /** Lingo Live with answer cards: teams answer together; individual players answer as one class (phones are per player). */
    get groups() { return play.mode === "teams" ? play.teams : [play.classSide]; },
    active: () => P.activeSide(play),
    player: () => P.current(play).player,
    turnHtml,
    award(points, { from = null } = {}) {
      const side = P.award(play, points);
      renderTeams();
      const el = pill();
      el?.classList.add("bump");
      setTimeout(() => el?.classList.remove("bump"), 600);
      floatText(from || el, `+${points}`, { color: side?.color || "#ffd23f" });
      sfx.points();
    },
    /** Points for one group (Lingo Live: several teams score on the same question). */
    awardTo(index, points, { from = null, quiet = false } = {}) {
      const group = this.groups[index];
      if (!group) return;
      group.score += points;
      renderTeams();
      const el = session.root.querySelector(`[data-team="${index}"]`);
      el?.classList.add("bump");
      setTimeout(() => el?.classList.remove("bump"), 600);
      if (!quiet) floatText(from || el, `+${points}`, { color: group.color });
    },
    nextTurn() {
      P.nextTurn(play);
      renderTeams();
    },
    /** Teams: the next member of the same team answers (players: the next player). */
    nextMember() {
      P.nextMember(play);
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
  session.root?.querySelectorAll(".arc-confetti, .arc-spinner, .arc-board").forEach((c) => c.remove());
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
  const chip = (p, i) => {
    const away = session.absent.has(p.id);
    const av = P.PLAYER_AVATARS[cls.players.indexOf(p) % P.PLAYER_AVATARS.length];
    return `<span class="ht-chip${away ? " away" : ""}" style="--team:${P.PLAYER_COLORS[cls.players.indexOf(p) % P.PLAYER_COLORS.length]}">
      <button type="button" data-tap="${p.id}" title="${session.mode === "teams" ? "Move to the next team" : away ? "Back today" : "Away today"}">${avatarPic(av)}<b>${esc(p.name)}</b></button>
      ${session.mode === "teams" ? `<button type="button" class="hc-away" data-away="${p.id}" title="${away ? "Back today" : "Away today"}">${away ? "↩" : "💤"}</button>` : ""}
      <button type="button" class="hc-del" data-del="${p.id}" title="Remove from the class">×</button></span>`;
  };
  let roster;
  if (session.mode === "teams") {
    const n = cls.teamCount || 2;
    P.fillTeams(cls, cls.players.map((p) => p.id), n);
    roster = `<div class="ht-teambar"><div class="arc-seg" id="teamSeg">${[2, 3, 4].map((k) => `<button type="button" data-n="${k}" class="${k === n ? "on" : ""}">${k} teams</button>`).join("")}</div>
        <button type="button" class="arc-btn ghost sm" data-shuffle>🔀 Shuffle teams</button></div>
      <div class="ht-cols" style="--cols:${n}">${P.TEAM_PRESETS.slice(0, n).map((t, ti) => {
        const members = cls.players.filter((p) => cls.assign[p.id] === ti);
        return `<div class="ht-col" style="--team:${t.color}"><label class="ht-name"><span>${teamPic(t.emoji)}</span><input data-tname="${ti}" value="${esc(cls.teamNames?.[ti] || t.name)}" maxlength="16" spellcheck="false" aria-label="Team ${ti + 1} name"></label>
          <div class="ht-members">${members.map(chip).join("") || `<p class="ht-empty">Tap a name to move it here</p>`}</div>
          <small class="ht-count">${members.filter((p) => !session.absent.has(p.id)).length} playing</small></div>`;
      }).join("")}</div>`;
  } else {
    roster = `<div class="ht-roster">${cls.players.map(chip).join("") || `<p class="ht-empty">No names yet — add the class below.</p>`}</div>`;
  }
  const tip = session.mode === "teams" ? "Tap a name to move them to the next team · 💤 away today · × remove" : "Tap a name if they're away today · × removes them from the class";
  return `<div class="ht-head"><span class="ht-label">${svg("users", "i-sm")}Who's playing? <em>${present.length} of ${cls.players.length}</em></span>${seg}</div>
    ${classPick}
    <p class="ht-solo">${mode.hint}</p>
    ${roster}
    <div class="ht-add"><input id="addNames" placeholder="Type a name and press Enter — or paste the whole class list" maxlength="2000" spellcheck="false"><button type="button" class="arc-btn primary sm" data-add>Add</button></div>
    <p class="ht-tip">${tip}</p>`;
}

function showHub() {
  clearFx();
  if (session.gameDef) sfx.back();
  session.game?.destroy?.();
  session.game = null;
  session.gameDef = null;
  stopSpeaking();
  buildPlay();
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

      <section class="hub-teams" id="hubWho">${whoHtml()}</section>

      <section class="hub-games">
        ${HUB_GAMES().map((g, i) => {
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
  const who = main.querySelector("#hubWho");
  who.addEventListener("click", onWhoClick); // once per hub: the panel re-renders inside it
  wireWho(who);
  main.querySelectorAll("[data-game]").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.game)));
  main.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () => speak(b.dataset.say, { force: true })));
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
function startGame(id) {
  const def = GAMES.find((g) => g.id === id);
  if (!def) return;
  clearFx();
  session.game?.destroy?.();
  session.gameDef = def;
  buildPlay(); // a fresh line-up and scores for every game
  renderTeams();
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
  clearFx();
  const main = session.root.querySelector("#arcMain");
  const play = session.play;
  const solo = play.mode === "class";
  const ranked = play.mode === "players" ? P.rankPlayers(play) : [...P.sides(play)].sort((a, b) => b.score - a.score);
  const tie = !solo && ranked.length > 1 && ranked[0].score === ranked[1].score;
  const winner = ranked[0];
  const heading = solo ? title : tie ? "It's a tie!" : play.mode === "players" ? `${winner.name} wins!` : `${winner.name} win!`;
  const podium = ranked.slice(0, play.mode === "players" ? 3 : 4);
  const stars = play.mode === "teams" ? P.rankPlayers(play).filter((p) => p.score > 0).slice(0, 3) : [];
  const rest = play.mode === "players" ? ranked.slice(3) : [];
  sfx.win();
  main.innerHTML = `
    <div class="arc-finish">
      <div class="fin-trophy">🏆</div>
      <h1>${esc(heading)}</h1>
      ${subtitle ? `<p class="fin-sub">${esc(subtitle)}</p>` : ""}
      ${stats.length ? `<div class="fin-stats">${stats.map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : ""}
      ${!solo ? `<div class="podium">${podium.map((t, i) => `
        <div class="pod" style="--team:${t.color};--h:${Math.max(44, Math.round((t.score / Math.max(1, winner.score)) * 160))}px;animation-delay:${i * 120}ms">
          <span class="pod-emoji">${sideIcon(t)}</span><span class="pod-name">${esc(t.name)}</span>
          <span class="pod-bar"><b>${t.score}</b></span>
        </div>`).join("")}</div>` : `<div class="fin-score"><b>${winner.score}</b><span>class points</span></div>`}
      ${stars.length ? `<div class="fin-stars"><span>⭐ Stars of the game</span>${stars.map((p) => `${playerChip(p)}<em>${p.score}</em>`).join("")}</div>` : ""}
      ${rest.length ? `<ol class="fin-rest" start="4">${rest.map((p) => `<li>${avatarPic(p.emoji)}<b>${esc(p.name)}</b><em>${p.score}</em></li>`).join("")}</ol>` : ""}
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
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    const overlay = session.root.querySelector(".arc-spinner, .arc-board");
    if (overlay) { overlay.remove(); return; }
    if (session.gameDef) showHub();
    else closeArcade();
    return;
  }
  if (typing) return;
  if (session.root.querySelector(".arc-spinner, .arc-board")) { e.preventDefault(); e.stopPropagation(); return; } // keys wait while a pick or the scores are open
  if ((e.key === "g" || e.key === "G") && !session.game?.capturesLetters) { e.preventDefault(); toggleGreek(); return; }
  if (session.game?.onKey) {
    session.game.onKey(e);
    e.stopPropagation();
  }
}
