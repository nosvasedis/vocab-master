/* Interface sounds for the studio (everything outside the arcade and lesson overlays, which have their own).
   One delegated listener per event type gives every button, switch, dropdown and drag a sound;
   specific moments (navigation, dialogs, toasts, AI work) play their own and the generic click stays quiet.
   An element can choose its click sound with data-sound="press" (any palette name) or opt out with data-sound="none". */
import { play, claimed } from "../arcade/audio.js";

const OVERLAYS = ".arcade, .lesson";
const CLICKABLE = "button, [role='button'], [role='tab'], a.btn, summary, [data-sound]";

function clickSound(el) {
  if (el.dataset.sound) return el.dataset.sound;
  if (el.matches("[data-act='remove'], .icon-btn.danger, .btn-danger-ghost")) return "remove";
  if (el.matches(".add-word, [data-act='add']")) return "add";
  if (el.matches(".btn-primary, .btn-magic, .btn-accent, .btn-danger")) return "press";
  if (el.matches(".segmented button, [role='tab'], .theme-opt, .provider-opt, [aria-pressed]")) return "select";
  return "tapUi";
}

export function initInterfaceSounds() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(CLICKABLE);
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest(OVERLAYS)) return;
    const name = clickSound(el);
    // A handler on the element that played its own sound wins.
    if (name === "none" || claimed()) return;
    play(name, { generic: true });
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el.closest(OVERLAYS) || claimed()) return;
    if (el.matches("input[type='checkbox']")) play(el.checked ? "toggleOn" : "toggleOff", { generic: true });
    else if (el.matches("input[type='radio'], select")) play("select", { generic: true });
    else if (el.matches("input[type='range']")) play("tapUi", { generic: true });
  });

  document.addEventListener("dragstart", (e) => { if (!e.target.closest?.(OVERLAYS)) play("pickup"); });
  document.addEventListener("drop", (e) => { if (!e.target.closest?.(OVERLAYS)) play("drop"); });
}
