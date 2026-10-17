/* Lingo Arcade — mounts one game into a stage. Shared by the arcade shell and the lesson player,
   so every game runs identically wherever it is hosted. */
import { sfx, speak } from "./audio.js";
import { confetti } from "./fx.js";
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
export function mountGame(def, { stage, root, deck, picture = (t) => esc(t), teams, greek = () => false, setProgress = () => {}, onFinish, onRestart, onHub = null }) {
  const ctx = {
    deck: shuffle(deck),
    fullDeck: deck,
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
    finish: (o) => onFinish(o),
    restart: () => onRestart(),
    hub: onHub,
    esc,
    svg,
  };
  return def.create(ctx) || {};
}
