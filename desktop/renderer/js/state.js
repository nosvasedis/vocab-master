/* Vocab Master — application state, derived values and draft persistence. */
import {
  CLASS_PROFILES, CPP_BOOKS, resolveCoursebookId, getCppUnitStructure,
  queryCoursebookWords, selectSmartCoursebookWords,
} from "../app.js";
import { readJSON, writeJSON } from "./bridge.js";
import { uid, debounce } from "./ui.js";

export const FIELD_KEYS = ["type", "greek", "emojis", "collocation", "derivatives", "synonyms", "antonyms"];
export const FIELD_LABELS = {
  type: "Part of speech", greek: "Greek", emojis: "Emojis", collocation: "Collocation",
  derivatives: "Derivatives", synonyms: "Synonyms", antonyms: "Opposites",
};
export const LEVEL_COLORS = { A_SENIOR: "var(--lvl-a)", B_SENIOR: "var(--lvl-b)", C_SENIOR: "var(--lvl-c)", D_SENIOR: "var(--lvl-d)", E_SENIOR: "var(--lvl-e)" };
export const BOOK_COLORS = { CPP1: "#0fb5a6", CPP2: "#22a75e", CPP3: "#f2780c" };
export const WORD_TARGETS = { A_SENIOR: [6, 10], B_SENIOR: [8, 12], C_SENIOR: [10, 15], D_SENIOR: [12, 18], E_SENIOR: [14, 20] };

const DRAFT_KEY = "vm_draft_v2";
const PREFS_KEY = "vm_prefs_v2";

export const state = {
  view: "setup",
  profileId: "",
  source: "cpp",
  cpp: { bookId: "CPP1", unit: 1, pages: "", includeSb: true, includeWb: true, wbScope: "unit", limit: "smart" },
  custom: { bookTitle: "", unit: 1, pages: "" },
  inputMode: "structured",
  words: [],
  fields: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
  freeform: "",
  ex: { mode: "random", dictCount: 0, lingoCount: 0, family: "all", picked: { dictation: [], lingo: [] } },
  plan: null,
  data: null,
  sessionId: null,
  preview: { sheet: "lingo", showAnswers: false, density: "standard", zoom: 1, layout: {} },
  busy: false,
};

export const prefs = Object.assign(
  { theme: "system", welcomeDismissed: false, sfx: true, tts: true, schoolName: "", pictureStyle: "emoji" },
  readJSON(PREFS_KEY, {}),
);
export function savePrefs() { writeJSON(PREFS_KEY, prefs); }

/* ── Tiny event bus ──────────────────────────────────────────────── */
const listeners = new Map();
export function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
}
export function emit(...topics) {
  for (const t of topics) listeners.get(t)?.forEach((fn) => fn());
  listeners.get("*")?.forEach((fn) => fn());
  saveDraft();
}

/* ── Words ───────────────────────────────────────────────────────── */
export function makeWord(data = {}) {
  const w = { id: uid("w"), english: "" };
  FIELD_KEYS.forEach((k) => { w[k] = ""; });
  for (const k of ["english", ...FIELD_KEYS]) {
    const v = data[k];
    if (v == null) continue;
    w[k] = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : [x.text, x.type ? `(${x.type})` : "", x.greek ? `- ${x.greek}` : ""].filter(Boolean).join(" "))).join(", ") : String(v).trim();
  }
  return w;
}

export const filledWords = () => state.words.filter((w) => w.english.trim());

export function duplicateKeys() {
  const seen = new Map();
  filledWords().forEach((w) => {
    const k = w.english.trim().toLowerCase();
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

/* ── Coursebook derived values ───────────────────────────────────── */
export const isCpp = () => state.source === "cpp";
export const unitStructure = () => (isCpp() ? getCppUnitStructure(state.cpp.bookId, state.cpp.unit) : null);

export function bookTitle() {
  return isCpp() ? CPP_BOOKS[state.cpp.bookId]?.title || "" : state.custom.bookTitle.trim();
}
export function unitNumber() {
  return isCpp() ? state.cpp.unit : state.custom.unit;
}
/** Page range as shown on worksheets. A CPP "full unit" uses the unit's Student's Book span. */
export function pageRange() {
  if (isCpp()) return state.cpp.pages.trim() || unitStructure()?.sections[0].pageRange || "";
  return state.custom.pages.trim();
}

export function coursebookQuery(overrides = {}) {
  if (!isCpp()) return null;
  const c = state.cpp;
  return queryCoursebookWords({
    bookId: c.bookId, unit: c.unit, pageRange: c.pages,
    includeSb: c.includeSb, includeWb: c.includeWb, wbScope: c.wbScope,    ...overrides,
  });
}

export function pickFromQuery(query, limit = state.cpp.limit) {
  if (!query?.words?.length) return [];
  if (limit === "0") return [...query.words];
  if (limit === "smart") {
    if (query.hasPageFilter && query.words.length <= 24) return [...query.words];
    return selectSmartCoursebookWords(query.words, 15);
  }
  return selectSmartCoursebookWords(query.words, Number(limit) || 15);
}

export function coursebookEntryToWord(entry) {
  return makeWord({
    english: entry.english, type: entry.type, greek: entry.greek, emojis: entry.emojis,
    collocation: entry.collocation,
  });
}

/* ── Engine form ─────────────────────────────────────────────────── */
export function readWordRow(w) {
  const row = { english: w.english.trim(), fieldToggles: { ...state.fields } };
  FIELD_KEYS.forEach((k) => { row[k] = state.fields[k] ? String(w[k] || "").trim() : ""; });
  return row;
}

export function buildForm() {
  const rows = filledWords().map(readWordRow);
  return {
    bookTitle: bookTitle(),
    unit: String(unitNumber() || ""),
    pageRange: pageRange(),
    classProfile: state.profileId,
    inputMode: state.inputMode,
    vocabRows: rows,
    freeform: state.freeform.trim(),
    teacherHints: rows
      .filter((r) => r.derivatives || r.synonyms || r.antonyms)
      .map((r) => ({ english: r.english, derivatives: r.derivatives, synonyms: r.synonyms, antonyms: r.antonyms })),
  };
}

/** Restore UI state from a saved engine form (+ plan). */
export function applyForm(form = {}, plan = null) {
  state.profileId = CLASS_PROFILES[form.classProfile] ? form.classProfile : state.profileId;
  const bookId = resolveCoursebookId(form.bookTitle || "");
  const unit = Number.parseInt(form.unit, 10) || 1;
  if (bookId) {
    state.source = "cpp";
    state.cpp.bookId = bookId;
    state.cpp.unit = Math.min(9, Math.max(1, unit));
    const full = getCppUnitStructure(bookId, state.cpp.unit)?.sections[0].pageRange || "";
    const pr = String(form.pageRange || "").trim();
    state.cpp.pages = pr && pr.replace(/[–—−]/g, "-") !== full.replace(/[–—−]/g, "-") ? pr : "";
  } else {
    state.source = "custom";
    state.custom = { bookTitle: form.bookTitle || "", unit, pages: form.pageRange || "" };
  }
  state.inputMode = form.inputMode === "freeform" ? "freeform" : "structured";
  state.freeform = form.freeform || "";
  const rows = Array.isArray(form.vocabRows) ? form.vocabRows : [];
  state.words = rows.map((r) => makeWord(r));
  if (rows.length) {
    const fields = {};
    FIELD_KEYS.forEach((k) => {
      fields[k] = rows.some((r) => (r.fieldToggles ? r.fieldToggles[k] : Boolean(r[k])));
    });
    state.fields = fields;
  }
  if (plan) {
    state.plan = plan;
    state.ex.mode = plan.exerciseMode === "custom" ? "custom" : "random";
    if (state.ex.mode === "custom") {
      state.ex.picked = { dictation: [...(plan.dictationTypes || [])], lingo: [...(plan.lingoTypes || [])] };
    }
  }
}

/* ── Draft persistence (survives restarts) ───────────────────────── */
const persistDraft = debounce(() => {
  writeJSON(DRAFT_KEY, {
    v: 2,
    view: state.view,
    profileId: state.profileId,
    source: state.source,
    cpp: state.cpp,
    custom: state.custom,
    inputMode: state.inputMode,
    words: state.words,
    fields: state.fields,
    freeform: state.freeform,
    ex: state.ex,
    plan: state.plan,
    sessionId: state.sessionId,
    preview: state.preview,
  });
}, 400);

export function saveDraft() { persistDraft(); }
export function flushDraft() { persistDraft.flush(); }

export function loadDraft() {
  const d = readJSON(DRAFT_KEY, null);
  if (!d || d.v !== 2) return false;
  for (const k of ["view", "profileId", "source", "inputMode", "freeform", "plan", "sessionId"]) {
    if (d[k] !== undefined) state[k] = d[k];
  }
  Object.assign(state.cpp, d.cpp || {});
  Object.assign(state.custom, d.custom || {});
  Object.assign(state.fields, d.fields || {});
  Object.assign(state.preview, d.preview || {});
  if (d.ex) state.ex = { ...state.ex, ...d.ex, picked: { dictation: [], lingo: [], ...(d.ex.picked || {}) } };
  state.words = Array.isArray(d.words) ? d.words.map((w) => ({ ...makeWord(w), id: w.id || uid("w") })) : [];
  return true;
}

export function resetState() {
  state.view = "setup";
  state.inputMode = "structured";
  state.words = [];
  state.freeform = "";
  state.plan = null;
  state.data = null;
  state.sessionId = null;
  state.cpp.pages = "";
  state.custom.pages = "";
  state.preview.sheet = "lingo";
}
