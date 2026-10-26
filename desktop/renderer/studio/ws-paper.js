/* Vocab Master — how a worksheet line (D01–D29, L01–L13) looks on paper, the Test Maker's way (pure): letter boxes for
 * letter help, a–c options to circle instead of "(x / y / z)", a yes/no box, a letter box for matching, numbered step
 * boxes, word chips for sentence order, whole lines for own sentences, a table of groups for sorting.
 * wsItemView() reads a line into parts (also used for Word in app.js); wsItemHtml() draws them.
 * Letter help is made by the app, like the Test Maker's: an exercise has a mode (ex.letterHelp, else its class default)
 * and a line can have its own letters (item.reveal: "none" or the positions to show). */
import { levelIndex, KNOBS } from "./tasks.js";
import { letterHint, familyHint, revealHint, cleanReveal, revealFor } from "./doc-model.js";
import { lineHtml, hintBoxHtml, isWriteIn } from "./paper-parts.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GAP = /_{3,}/;
const GAPS = /_{3,}/g;
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const LETTERS = "abcdefgh";

/* ── Letter help ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The exercises whose letter help the app makes: kind "hint" (letters of the answer: first, count…) or "family"
 * (the word in capitals inside the answer). def: the default ("class" = the class's default, as in the Test Maker).
 * not: modes that make no sense for it (missing letters always show some letters).
 */
export const WS_HELP = {
  D04: { kind: "hint", def: "none" },
  D07: { kind: "hint", def: "none" },
  D08: { kind: "hint", def: "none" },
  D17: { kind: "hint", def: "none" },
  D19: { kind: "hint", def: "none" },
  D22: { kind: "hint", def: "count" },
  D23: { kind: "hint", def: "none" },
  D25: { kind: "hint", def: "class" },
  D26: { kind: "hint", def: "none" },
  D27: { kind: "hint", def: "some", not: ["none", "count"] },
  D28: { kind: "hint", def: "none" },
  L12: { kind: "hint", def: "none" },
  D02: { kind: "family", def: "class" },
  D10: { kind: "family", def: "class" },
  L07: { kind: "family", def: "class" },
};

/** The modes a worksheet exercise can choose from: [[value, label]] (the Test Maker's knob values). */
export function helpModes(typeId) {
  const h = WS_HELP[typeId];
  if (!h) return [];
  return KNOBS[h.kind === "family" ? "family" : "hint"].values.filter(([v]) => !(h.not || []).includes(v));
}

/** The letter-help mode an exercise has by default for a class. */
export function defaultHelp(typeId, levelId) {
  const h = WS_HELP[typeId];
  if (!h) return "";
  if (h.def !== "class") return h.def;
  const i = levelIndex(levelId);
  return h.kind === "family" ? (i <= 2 ? "root" : i === 3 ? "count" : "none") : (i <= 1 ? "first" : i === 2 ? "count" : "none");
}

/** The exercise's mode: its own (Step 3 or the exercise settings on the paper), else the class default. */
export function helpMode(ex, levelId) {
  const h = WS_HELP[ex?.typeId];
  if (!h) return "";
  const own = ex.letterHelp;
  return own && helpModes(ex.typeId).some(([v]) => v === own) ? own : defaultHelp(ex.typeId, levelId);
}

/** The base word a family answer is built from: D02's stem, D10's word in quotes, L07's first word. */
export function familyBase(ex, item) {
  if (ex?.typeId === "D02") return String(item.stem || "").trim();
  const p = String(item.prompt || "");
  if (ex?.typeId === "D10") return (p.match(/[“"']([A-Za-z][A-Za-z' -]*)[”"']/) || [])[1] || "";
  if (ex?.typeId === "L07") return (p.match(/^\s*([A-Za-z][A-Za-z'-]*)/) || [])[1] || "";
  return "";
}

/** One line's letter help ("c _ _ _ _" or ""): its own letters, else the exercise's mode. */
export function itemHint(ex, item, levelId) {
  const h = WS_HELP[ex?.typeId];
  const answer = String(item?.answer || "").trim();
  if (!h || !answer || /[,;/]/.test(answer)) return "";
  if (item.reveal === "none" && !(h.not || []).includes("none")) return "";
  const own = cleanReveal(item.reveal, answer);
  if (Array.isArray(own)) return revealHint(answer, own);
  const mode = helpMode(ex, levelId);
  if (!mode || mode === "none") return "";
  if (h.kind === "family") {
    const base = familyBase(ex, item);
    return familyHint(base ? `(${base.toUpperCase()})` : "", answer, mode);
  }
  return letterHint(answer, mode);
}

/** The positions a mode shows for an answer (for the editor's boxes). */
export const helpPositions = (answer, mode, base = "") => revealFor(answer, mode, base ? `(${base.toUpperCase()})` : "") || [];

/* ── Reading a line ──────────────────────────────────────────────────────────────────────────────────────── */

const CHOICES = /\(([^()]*\/[^()]*)\)/;
/** Types whose "(x / y / z)" are options to circle. */
export const WS_CHOICE_TYPES = new Set(["D03", "D05", "D06", "D12", "D18", "D24", "L02", "L03", "L04"]);
/** A word printed in capitals with its options under it (opposite, synonym). */
const TARGET_TYPES = new Set(["D05", "D06", "L03", "L04"]);
const WORD_CLASSES = ["noun", "verb", "adjective", "adverb"];

/** "(x / y / z)" of a prompt: the text before and after, the options. */
export function choiceSplit(prompt) {
  const p = String(prompt || "");
  const m = p.match(CHOICES);
  if (!m) return null;
  const options = m[1].split("/").map((s) => s.trim()).filter(Boolean);
  if (options.length < 2) return null;
  const before = p.slice(0, m.index).replace(/\s*(→|->|:)\s*$/, "").trimEnd();
  const after = p.slice(m.index + m[0].length).trim();
  return { before, after, options };
}

/** A prompt rebuilt from a sentence and its options (the editor): the options go where the gap is, else at the end. */
export function joinChoices(body, options) {
  const group = `(${options.map((o) => String(o).trim()).filter(Boolean).join(" / ")})`;
  const b = String(body || "").trim();
  return GAP.test(b) ? b.replace(GAP, (g) => `${g} ${group}`) : `${b} ${group}`.trim();
}

/** "a) First… / b) Then…" → ["First…", "Then…"] (the letters are the app's). */
export function splitSteps(prompt) {
  const parts = String(prompt || "").split(/\s+\/\s+|\s*\n\s*/).map((s) => s.replace(/^\s*\(?[a-h]\)\s*|^\s*[a-h][.:]\s+/i, "").trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}
export const joinSteps = (steps) => steps.map((s, i) => `${LETTERS[i]}) ${String(s).trim()}`).join(" / ");

/** "A. sentence  B. sentence" → ["sentence", "sentence"]. */
export function splitAB(prompt) {
  const m = String(prompt || "").match(/A[.)]\s*(.+?)\s+B[.)]\s*(.+)$/s);
  return m ? [m[1].trim(), m[2].trim()] : null;
}
export const joinAB = ([a, b]) => `A. ${String(a).trim()}  B. ${String(b).trim()}`;

/** D26 "ckrat (a path…)" → { letters: "ckrat", clue: "a path…" }; D27 "t _ a _ k (clue)" → { pattern, clue }. */
export function splitClue(prompt) {
  const m = String(prompt || "").match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? { head: m[1].trim(), clue: m[2].trim() } : { head: String(prompt || "").trim(), clue: "" };
}

/** D16 "Sports: ________, ________" → { group: "Sports", slots: 2 }. */
export function splitGroup(prompt, answer) {
  const m = String(prompt || "").match(/^\s*([^:]{1,40}):\s*(.*)$/);
  if (!m) return null;
  const answers = String(answer || "").split(/\s*,\s*/).filter(Boolean);
  const gaps = (m[2].match(GAPS) || []).length;
  return { group: m[1].trim(), slots: Math.max(1, answers.length, gaps) };
}

/**
 * The parts of one line, for the paper and for Word. kind:
 *   choice { before, after, gap, target, options, answerIndex, stack } · tf { text } · match { word } ·
 *   steps { steps } · chips { words } · full { text, bold } · write { text, hint, stem, wrong, jumble, clue, number }
 *   group { group, slots }
 */
export function wsItemView(ex, item, levelId) {
  const t = ex?.typeId;
  const prompt = String(item?.prompt ?? "");
  const answer = String(item?.answer ?? "").trim();
  const pick = (options) => options.findIndex((o) => norm(o) === norm(answer));
  const stack = (options) => options.some((o) => String(o).length > 26);
  if (WS_CHOICE_TYPES.has(t)) {
    const c = choiceSplit(prompt);
    if (c) {
      const gap = GAP.test(c.before) || GAP.test(c.after);
      const mid = !gap && c.after.replace(/[.?!"”]/g, "").trim().length > 0;
      const target = TARGET_TYPES.has(t) && !gap && !mid;
      return { kind: "choice", before: c.before, after: c.after, gap: gap || mid, mid, target, options: c.options, answerIndex: pick(c.options), stack: stack(c.options) };
    }
  }
  if (t === "D11" || t === "L09") {
    const words = prompt.split(",").map((s) => s.trim()).filter(Boolean);
    if (words.length >= 3) return { kind: "choice", before: "", after: "", gap: false, target: false, options: words, answerIndex: pick(words), stack: false };
  }
  if (t === "L13") {
    const ab = splitAB(prompt);
    if (ab) return { kind: "choice", before: "", after: "", gap: false, target: false, options: ab, answerIndex: /^b$/i.test(answer) ? 1 : /^a$/i.test(answer) ? 0 : -1, stack: true, upper: true };
  }
  if (t === "L06" && WORD_CLASSES.includes(norm(answer))) {
    // An exercise with an adverb among its answers offers all four classes on every line (its task line names four).
    const adverbs = (ex?.items || []).some((it) => norm(it?.answer) === "adverb");
    const options = adverbs || norm(answer) === "adverb" ? WORD_CLASSES : WORD_CLASSES.slice(0, 3);
    return { kind: "choice", before: prompt.trim(), after: "", gap: false, target: true, options, answerIndex: pick(options), stack: false };
  }
  if (t === "D15" || t === "L11") return { kind: "tf", text: prompt.replace(/^\s*\(\s*\)\s*/, "").trim() };
  if (t === "D13") return { kind: "match", word: prompt.replace(GAPS, "").replace(/\s+$/, "").trim() };
  if (t === "D16") { const g = splitGroup(prompt, answer); if (g) return { kind: "group", ...g }; }
  if (t === "D21") { const steps = splitSteps(prompt); if (steps) return { kind: "steps", steps }; }
  if (t === "L08") {
    const words = prompt.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
    if (words.length >= 2) return { kind: "chips", words };
  }
  if (t === "D29") return { kind: "full", text: prompt, bold: true };
  if (t === "D20" || t === "L10") return { kind: "full", text: prompt.replace(GAPS, "").trim(), bold: false };
  // Everything else is written: a gap (or a line after the text), letter boxes when the exercise or line has help.
  const hint = itemHint(ex, item, levelId);
  const out = { kind: "write", text: prompt, hint, writeIn: isWriteIn(hint) };
  if (t === "D02") out.stem = String(item.stem || "").toUpperCase();
  if (t === "D08" || t === "D28" || t === "L12") out.wrong = true;
  if (t === "D26") { const s = splitClue(prompt); out.text = s.clue; out.jumble = s.head.replace(/[^A-Za-z]/g, "").toLowerCase().split("").join(" · "); out.clue = true; }
  if (t === "D27") { const s = splitClue(prompt); out.text = s.clue; out.clue = true; out.writeIn = true; out.hint = hint || s.head; }
  if (t === "D22" && out.writeIn) out.text = prompt.replace(/\s*\(\s*\d+\s*letters?\s*\)\s*/i, " ").trim();
  if (t === "D14") { const m = prompt.match(/^\s*\((\d+)\)\s*/); if (m) out.number = m[1]; }
  return out;
}

/* ── Drawing a line ──────────────────────────────────────────────────────────────────────────────────────── */

/** The extra class of a line's .ex-item. */
export function wsItemClass(view) {
  return { choice: "ws-x ws-choice", tf: "ws-x", match: "ws-x ws-match", steps: "ws-x ws-steps", chips: "ws-x", full: "ws-x ws-full", group: "ws-x ws-group", write: "ws-x" }[view.kind] || "ws-x";
}

/**
 * The inside of a line (.item-text). text(s): the line's text as HTML (escaped; emojis drawn in the sheet's picture
 * style). The answer pill is added by the caller.
 */
export function wsItemHtml(view, item, { text = esc } = {}) {
  const withGaps = (s) => text(s).replace(GAPS, () => lineHtml("inline"));
  if (view.kind === "choice") {
    let body = "";
    if (view.target) body = `<span class="ws-target">${text(view.before)}</span>`;
    else if (view.before || view.after) body = view.mid ? `${withGaps(view.before)} ${lineHtml("inline")} ${withGaps(view.after)}` : withGaps(`${view.before} ${view.after}`.trim());
    const opts = `<div class="st-options${view.stack ? " stack" : ""}">${view.options.map((o, i) => `<span class="st-opt"><b>${view.upper ? LETTERS[i].toUpperCase() : LETTERS[i]}</b><span>${text(o)}</span></span>`).join("")}</div>`;
    return `${body ? `<div>${body}</div>` : ""}${opts}`;
  }
  if (view.kind === "tf") return `<div class="st-tf"><span>${withGaps(view.text)}</span><span class="st-tf-box"></span></div>`;
  if (view.kind === "match") return `<b>${text(view.word)}</b><span class="st-order-box"></span>`;
  if (view.kind === "steps") return view.steps.map((s, i) => `<div class="ws-step-row"><span class="st-order-box"></span><b>${LETTERS[i]}</b> ${text(s)}</div>`).join("");
  if (view.kind === "chips") return `<div class="ws-chips">${view.words.map((w) => `<span>${text(w)}</span>`).join("")}</div>${lineHtml("full")}`;
  if (view.kind === "full") return `${view.bold ? `<b>${text(view.text)}</b>` : `<span>${withGaps(view.text)}</span>`}${lineHtml("full")}`;
  if (view.kind === "group") return `<span class="ws-sort-head">${text(view.group)}</span>${Array.from({ length: view.slots }, () => lineHtml("full")).join("")}`;
  // Written answers.
  const box = view.writeIn ? hintBoxHtml(view.hint, item?.answer) : "";
  let s = String(view.text || "");
  let html;
  const number = view.number ? `<b>(${esc(view.number)})</b> ` : "";
  if (view.number) s = s.replace(/^\s*\(\d+\)\s*/, "");
  const marked = (h) => (view.wrong ? h.replace(/\[([^\]]+)\]/g, (_, w) => `<b class="ws-wrong">[${w}]</b>`) : h);
  if (view.clue) {
    // Jumbled / missing letters: the clue, the letters, then where to write.
    html = `${s ? `<span class="ws-clue">${text(s)}</span> ` : ""}${view.jumble ? `<span class="st-hint st-jumble">${esc(view.jumble)}</span> ` : ""}${box || lineHtml()}`;
  } else if (GAP.test(s)) {
    // The first gap takes the letter boxes; any other gap is a line.
    let first = true;
    html = text(s).replace(GAPS, () => { const g = first && box ? box : lineHtml("inline"); first = false; return g; });
    html = number + marked(html);
  } else {
    html = `${number}${marked(text(s))} ${box || lineHtml()}`;
  }
  if (view.stem) html += ` <b class="ws-stem">${esc(view.stem)}</b>`;
  return html;
}

/** Picture cards (D25): the letter boxes go on the card's line. */
export function wsPicLineHtml(view, item) {
  return view.writeIn ? hintBoxHtml(view.hint, item?.answer) : "";
}
