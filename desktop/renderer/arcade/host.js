/* Lingo Arcade — mounts one game into a stage. Shared by the arcade shell and the lesson player,
   so every game runs identically wherever it is hosted. */
import { sfx, speak } from "./audio.js";
import { confetti } from "./fx.js";
import * as show from "./showtime.js";
import { crestBadge, avatarDisc } from "./avatars.js";
import { shuffle } from "./deck.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const svg = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/**
 * Mount a game definition ({ id, create(ctx) }) into `stage`.
 * @param {object} def
 * @param {{ stage: HTMLElement, root: HTMLElement, deck: object[], picture?: Function, teams: object,
 *   setProgress?: Function, onFinish: Function, onRestart: Function }} opts
 * @returns {{ onKey?: Function, destroy?: Function }}
 */
export function mountGame(def, { stage, root, deck, picture = (t) => esc(t), teams, greek = () => false, setProgress = () => {}, onFinish, onRestart, onHub = null, checks = null, meta = {} }) {
  // Hosts without turns (a lesson's practice step) get the turn helpers newer games call.
  teams.badge = teams.badge || ((side, o = {}) => (side?.shape ? crestBadge(side, o) : avatarDisc(side?.emoji || "⭐", side?.color || "#ffd23f", o)));
  teams.passTo = teams.passTo || (() => {});
  teams.activeIndex = teams.activeIndex || (() => 0);
  const fxHost = () => stage.closest(".arc-game") || stage;
  const ctx = {
    deck: shuffle(deck),
    fullDeck: deck,
    /** A lesson's check questions in Lingo Live form (arcade/live/questions.js fromLessonChecks), or null. */
    checks,
    /** { className, title } — for saved results. */
    meta,
    stage,
    root,
    sfx,
    speak: (t, o) => speak(t, o),
    // Pictures for a word's emojis in the chosen style ("" when switched off); picText keeps other text.
    pic: (t) => picture(t || ""),
    picText: (t) => picture(t || "", true),
    teams,
    // Is Greek showing? Greek UI also carries class "gk", hidden by CSS unless the host has .show-greek.
    greek,
    setProgress,
    confetti: (o) => confetti(root, o),
    // Showtime moments (arcade/showtime.js), sized to the game area.
    fx: {
      announce: (o) => show.announce(fxHost(), { sfx, ...o }),
      countdown: (o) => show.countdown(fxHost(), { sfx, ...o }),
      sparks: show.sparks,
      shake: show.shake,
      pop: show.pop,
      countTo: show.countTo,
    },
    finish: (o) => onFinish(o),
    restart: () => onRestart(),
    hub: onHub,
    esc,
    svg,
  };
  return def.create(ctx) || {};
}
