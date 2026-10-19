/* Vocab Master — the "which voices?" picker and status lines shared by the Unit test and Read-aloud
 * dictation screens (and Settings). The engines themselves live in js/voices/listening.js. */
import { esc, icon, toast } from "../ui.js";
import { actions } from "../actions.js";
import { ENGINES } from "../../studio/voice-cast.js";
import { chosenEngine, setEngine, activeEngine, studioAvailable, naturalSupported, studioCostFor, NATURAL_DOWNLOAD_MB } from "../voices/listening.js";

const SHORT = { natural: "Natural", studio: "Studio", computer: "Computer" };

/** Segmented picker: Natural · Studio · Computer. */
export function voicePickerHtml() {
  const on = chosenEngine();
  return `<div class="voice-pick" role="group" aria-label="Voices">${Object.keys(ENGINES).map((id) => {
    const off = (id === "studio" && !studioAvailable()) || (id === "natural" && !naturalSupported());
    const tip = id === "studio" && !studioAvailable() ? "Add a Gemini key in Settings to use the studio voices" : `${ENGINES[id].label}: ${ENGINES[id].note}`;
    return `<button type="button" class="vp-opt${on === id ? " active" : ""}${off ? " needs-setup" : ""}" data-voice="${id}" aria-pressed="${on === id}" data-tip="${esc(tip)}">${SHORT[id]}</button>`;
  }).join("")}</div>`;
}

/** Handle a click on the picker. Returns true when the choice changed. */
export function pickVoice(e) {
  const b = e.target.closest("[data-voice]");
  if (!b) return false;
  const id = b.dataset.voice;
  if (id === "studio" && !studioAvailable()) {
    toast("The studio voices use your own Gemini key (about 2 cents per test). Add one in Settings → AI service → Google Gemini.", "info", { actions: [{ label: "Open settings", run: () => actions.openSettings() }] });
    return false;
  }
  if (id === chosenEngine()) return false;
  setEngine(id);
  return true;
}

/** One line under the tracks: what the chosen voices are and what they cost. chars = characters to speak. */
export function voiceNote(chars = 0, { downloaded = true } = {}) {
  const engine = activeEngine();
  if (engine === "studio") {
    const cents = Math.max(0.1, studioCostFor(chars) * 100);
    return `Studio voices (Gemini, your key): about ${cents < 1 ? cents.toFixed(1) : Math.round(cents)} ¢ for this listening, made once and kept on this computer.`;
  }
  if (engine === "natural") {
    return downloaded
      ? "Natural voices, made on this computer — free, and kept for next time. A different voice for each speaker."
      : `Natural voices, made on this computer — free. The first time, they download once (about ${NATURAL_DOWNLOAD_MB} MB).`;
  }
  return "The computer's own voices (they sound robotic) — try Natural for lifelike, free voices.";
}

/** Status of a track or reading: "Downloading the natural voices… 40%", "Making the voices… 3 of 9", … */
export function statusText(st) {
  if (!st) return "";
  if (st.phase === "download") return `Downloading the natural voices… ${Math.round((st.progress || 0) * 100)}%`;
  if (st.phase === "prepare") return st.total ? `Making the voices… ${st.done} of ${st.total}` : "Making the voices…";
  if (st.phase === "play") return st.engine === "computer" ? "Playing (computer voices)" : `Playing · ${SHORT[st.engine] || ""} voices`;
  if (st.phase === "fallback") return st.message || "";
  if (st.phase === "save") return "Saving the audio file…";
  return "";
}

/** The status text, shown as a small pill. */
export const statusPill = (st) => {
  const t = statusText(st);
  return t ? `<span class="vp-status${st.phase === "fallback" ? " warn" : ""}">${st.phase === "play" ? icon("volume", "i-sm") : st.phase === "fallback" ? icon("alert", "i-sm") : '<span class="vp-spin"></span>'}${esc(t)}</span>` : "";
};
