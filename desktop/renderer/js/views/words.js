/* Step 2 — Vocabulary studio: editable word rows, AI fill, bulk paste, freeform brief. */
import {
  CLASS_PROFILES, CPP_BOOKS, autofillVocabulary, lookupCoursebookWord, parseBulkVocabularyText,
} from "../../app.js";
import { $, esc, icon, plural, toast, openDialog, confirmDialog, segmented, el } from "../ui.js";
import {
  state, emit, on, FIELD_KEYS, FIELD_LABELS, WORD_TARGETS, BOOK_COLORS,
  makeWord, filledWords, duplicateKeys, isCpp, unitStructure, bookTitle, unitNumber,
} from "../state.js";
import { getApiKey } from "../bridge.js";
import { actions } from "../actions.js";
import { loadPoolWords } from "./setup.js";
import { speak } from "../../arcade/audio.js";

let modeSeg;
let filling = false;

const FIELD_PLACEHOLDER = {
  type: "n. / v. / adj.",
  greek: "ελληνικά",
  emojis: "🙂",
  collocation: "a short natural phrase",
  derivatives: "e.g. competition (n.) - διαγωνισμός",
  synonyms: "same meaning",
  antonyms: "opposite meaning",
};
const FIELD_SHORT = { greek: "Greek", collocation: "Phrase", derivatives: "Family", synonyms: "Synonym", antonyms: "Opposite" };

export function initWords() {
  modeSeg = segmented($("modeSeg"), {
    value: state.inputMode,
    onChange: (v) => { state.inputMode = v; emit("words"); },
  });

  $("fieldChips").innerHTML = FIELD_KEYS.map((k) => `<button type="button" class="chip" data-field="${k}">${icon("check")}${esc(FIELD_LABELS[k])}</button>`).join("");
  $("fieldChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-field]");
    if (!chip) return;
    const k = chip.dataset.field;
    state.fields[k] = !state.fields[k];
    emit("words", "fields");
  });

  $("btnAddWord").addEventListener("click", () => addWordAndFocus());
  $("btnAiFill").addEventListener("click", () => fillWithAi(null));
  $("btnBulk").addEventListener("click", openBulkPaste);
  $("btnSortWords").addEventListener("click", () => {
    const filled = filledWords();
    if (filled.length < 2) return;
    const before = state.words;
    state.words = [...filled].sort((a, b) => a.english.localeCompare(b.english, "en", { sensitivity: "base" }));
    emit("words");
    toast("Sorted A–Z.", "ok", { ms: 2600, actions: [{ label: "Undo", run: () => { state.words = before; emit("words"); } }] });
  });
  $("btnCleanWords").addEventListener("click", () => {
    const n = state.words.length - filledWords().length;
    if (!n) { toast("No empty rows to remove.", "info", { ms: 2200 }); return; }
    state.words = filledWords();
    emit("words");
    toast(`Removed ${plural(n, "empty row")}.`, "ok", { ms: 2400 });
  });
  $("btnClearWords").addEventListener("click", async () => {
    if (!filledWords().length) return;
    const ok = await confirmDialog({ title: "Clear all words?", body: "Every word in this unit will be removed. You can undo straight after.", okLabel: "Clear words" });
    if (!ok) return;
    const before = state.words;
    state.words = [];
    emit("words");
    toast("All words cleared.", "info", { actions: [{ label: "Undo", run: () => { state.words = before; emit("words"); } }] });
  });

  $("freeform").addEventListener("input", (e) => { state.freeform = e.target.value; emit("wordsMeta"); });
  $("linkedBanner").addEventListener("click", (e) => {
    if (e.target.closest("[data-action=change-unit]")) actions.go("setup");
    if (e.target.closest("[data-action=reload-unit]")) { loadPoolWords({ reason: "Unit words restored", force: true }); emit("words", "setup"); }
  });

  wireList();
  on("words", renderWords);
  on("fields", renderFieldChips);
  on("level", renderStats);
}

/* ── Rendering ───────────────────────────────────────────────────── */
export function renderWords() {
  modeSeg?.set(state.inputMode);
  const structured = state.inputMode === "structured";
  $("structuredPane").classList.toggle("hidden", !structured);
  $("freeformPane").classList.toggle("hidden", structured);
  if (document.activeElement !== $("freeform")) $("freeform").value = state.freeform;
  $("freeformLevel").textContent = CLASS_PROFILES[state.profileId]?.label || "your class level";
  renderBanner();
  renderFieldChips();
  renderList();
  renderStats();
}

function renderBanner() {
  const banner = $("linkedBanner");
  const us = unitStructure();
  if (!isCpp() || !us || state.inputMode !== "structured") { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  const id = state.cpp.bookId;
  banner.innerHTML = `
    <span class="book-cover lb-cover" style="--bk:${BOOK_COLORS[id]}">${esc(id.slice(-1))}</span>
    <div class="lb-text">
      <strong>${esc(CPP_BOOKS[id].title)} · Unit ${us.unit}: ${esc(us.unitTitle)}</strong>
      <span>${state.cpp.pages ? `Pages ${esc(state.cpp.pages)}` : `Full unit · p. ${us.sbStart}–${us.sbEnd}`} · official words with their Greek meanings — AI adds phrases &amp; word families.</span>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="reload-unit">${icon("refresh", "i-sm")}Reset to unit words</button>
    <button type="button" class="btn btn-secondary btn-sm" data-action="change-unit">${icon("book-open", "i-sm")}Change unit</button>`;
}

function renderFieldChips() {
  $("fieldChips").querySelectorAll("[data-field]").forEach((c) => c.classList.toggle("active", !!state.fields[c.dataset.field]));
}

function rowHtml(w, i) {
  const f = state.fields;
  const input = (k, extra = "") => `<input class="input wr-${k}" data-k="${k}" value="${esc(w[k])}" placeholder="${esc(FIELD_PLACEHOLDER[k])}" ${extra} autocomplete="off" spellcheck="false" />`;
  const fieldCell = (k, wide = false) => f[k]
    ? `<div class="wr-f ${k}${wide ? " wide" : ""}"><label>${esc(FIELD_SHORT[k])}</label>${input(k, k === "greek" ? 'lang="el"' : "")}</div>`
    : "";
  const meta = [f.type ? input("type") : "", f.emojis ? input("emojis") : ""].join("");
  return `<article class="word-row" data-id="${esc(w.id)}" style="animation-delay:${Math.min(i, 20) * 18}ms">
    <div class="wr-grip" draggable="true" title="Drag to reorder (or Alt + ↑/↓)">${icon("grip", "i-sm")}</div>
    <div class="wr-num">${i + 1}</div>
    <div class="wr-main">
      <input class="input wr-english" data-k="english" value="${esc(w.english)}" placeholder="English word or phrase" autocomplete="off" spellcheck="false" />
      ${meta ? `<div class="wr-meta">${meta}</div>` : ""}
    </div>
    <div class="wr-fields">${fieldCell("greek")}${fieldCell("collocation")}${fieldCell("derivatives", true)}${fieldCell("synonyms")}${fieldCell("antonyms")}</div>
    <div class="wr-actions">
      <div class="row">
        <button type="button" class="icon-btn sm brand" data-act="fill" data-tip="Regenerate with AI" data-tip-pos="left" aria-label="Fill this word with AI">${icon("sparkles", "i-sm")}</button>
        <button type="button" class="icon-btn sm" data-act="speak" data-tip="Pronounce" data-tip-pos="left" aria-label="Pronounce">${icon("volume", "i-sm")}</button>
      </div>
      <div class="row">
        <button type="button" class="icon-btn sm danger" data-act="remove" data-tip="Remove" data-tip-pos="left" aria-label="Remove word">${icon("trash", "i-sm")}</button>
      </div>
    </div>
  </article>`;
}

function renderList() {
  if (!state.words.length) state.words.push(makeWord(), makeWord(), makeWord());
  const list = $("wordList");
  list.innerHTML = state.words.map(rowHtml).join("");
  markDuplicates();
}

function renderStats() {
  const n = filledWords().length;
  const target = WORD_TARGETS[state.profileId];
  const dups = duplicateKeys().size;
  let meter = "";
  if (target && state.inputMode === "structured") {
    const pct = Math.min(100, Math.round((n / target[1]) * 100));
    const cls = n > target[1] ? "over" : n >= target[0] ? "ok" : "";
    meter = `<span class="target-meter ${cls}" data-tip="${esc(`Recommended for ${CLASS_PROFILES[state.profileId].label}: ${target[0]}–${target[1]} words`)}">
      <span class="tm-bar"><i style="width:${pct}%"></i></span><span>${target[0]}–${target[1]}</span></span>`;
  }
  $("wordsStats").innerHTML = state.inputMode === "structured"
    ? `${dups ? `<span class="badge warning">${icon("alert", "i-xs")}${plural(dups, "duplicate")}</span>` : ""}
       <span class="count-big">${n}</span><span>${n === 1 ? "word" : "words"}</span>${meter}`
    : `<span class="badge brand">${icon("sparkles", "i-xs")}AI picks the words</span>`;
}

function markDuplicates() {
  const dups = duplicateKeys();
  $("wordList").querySelectorAll(".word-row").forEach((row) => {
    const w = state.words.find((x) => x.id === row.dataset.id);
    row.classList.toggle("dup", !!w && dups.has(w.english.trim().toLowerCase()));
  });
}

/* ── List interactions ───────────────────────────────────────────── */
const findWord = (row) => state.words.find((w) => w.id === row?.dataset.id);

function addWordAndFocus(afterId = null) {
  const w = makeWord();
  const idx = afterId ? state.words.findIndex((x) => x.id === afterId) : -1;
  if (idx >= 0) state.words.splice(idx + 1, 0, w);
  else state.words.push(w);
  emit("words");
  requestAnimationFrame(() => {
    const row = $("wordList").querySelector(`[data-id="${w.id}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row?.querySelector(".wr-english")?.focus();
  });
}

function moveWord(id, delta) {
  const i = state.words.findIndex((w) => w.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.words.length) return;
  [state.words[i], state.words[j]] = [state.words[j], state.words[i]];
  emit("words");
  requestAnimationFrame(() => $("wordList").querySelector(`[data-id="${id}"] .wr-english`)?.focus());
}

function wireList() {
  const list = $("wordList");
  list.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-k]");
    const w = findWord(e.target.closest(".word-row"));
    if (!inp || !w) return;
    w[inp.dataset.k] = inp.value;
    if (inp.dataset.k === "english") { markDuplicates(); renderStats(); }
    emit("wordsMeta");
  });
  list.addEventListener("keydown", (e) => {
    const row = e.target.closest(".word-row");
    if (!row) return;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moveWord(row.dataset.id, e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.key === "Enter" && e.target.classList.contains("wr-english")) {
      e.preventDefault();
      const next = row.nextElementSibling;
      if (next) next.querySelector(".wr-english")?.focus();
      else addWordAndFocus(row.dataset.id);
    }
  });
  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    const row = e.target.closest(".word-row");
    const w = findWord(row);
    if (!btn || !w) return;
    if (btn.dataset.act === "speak") {
      if (w.english.trim()) speak(w.english, { force: true });
    } else if (btn.dataset.act === "remove") {
      const i = state.words.indexOf(w);
      row.style.transition = "opacity 160ms, transform 160ms";
      row.style.opacity = "0";
      row.style.transform = "translateX(-12px)";
      setTimeout(() => {
        state.words.splice(i, 1);
        emit("words");
        if (w.english.trim()) {
          toast(`Removed “${w.english}”.`, "info", { ms: 3000, actions: [{ label: "Undo", run: () => { state.words.splice(i, 0, w); emit("words"); } }] });
        }
      }, 150);
    } else if (btn.dataset.act === "fill") {
      fillWithAi([w], { regenerate: true });
    }
  });

  // Drag & drop reordering (grip handle)
  let dragId = null;
  list.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".word-row");
    if (!row) return;
    dragId = row.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    e.dataTransfer.setDragImage(row, 30, 24);
    requestAnimationFrame(() => row.classList.add("dragging"));
  });
  list.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const row = e.target.closest(".word-row");
    list.querySelectorAll(".drop-before, .drop-after").forEach((r) => r.classList.remove("drop-before", "drop-after"));
    if (!row || row.dataset.id === dragId) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(e.clientY < rect.top + rect.height / 2 ? "drop-before" : "drop-after");
  });
  list.addEventListener("drop", (e) => {
    e.preventDefault();
    const row = list.querySelector(".drop-before, .drop-after");
    if (dragId && row) {
      const from = state.words.findIndex((w) => w.id === dragId);
      const [moved] = state.words.splice(from, 1);
      let to = state.words.findIndex((w) => w.id === row.dataset.id);
      if (row.classList.contains("drop-after")) to += 1;
      state.words.splice(to, 0, moved);
      emit("words");
    }
    dragId = null;
  });
  list.addEventListener("dragend", () => {
    dragId = null;
    list.querySelectorAll(".dragging, .drop-before, .drop-after").forEach((r) => r.classList.remove("dragging", "drop-before", "drop-after"));
  });
}

/* ── AI fill ─────────────────────────────────────────────────────── */
const AI_FIELDS = ["emojis", "collocation", "derivatives", "synonyms", "antonyms"];

function wordNeedsFill(w) {
  return FIELD_KEYS.some((k) => state.fields[k] && !String(w[k] || "").trim());
}

/**
 * Fill words with AI. `targets` null = every word with an empty enabled field.
 * `regenerate` rewrites the AI fields (Part of speech + Greek stay as sense locks).
 */
export async function fillWithAi(targets, { regenerate = false } = {}) {
  if (filling) return;
  if (!state.profileId) { toast("Choose a class level in Step 1 first.", "warn"); actions.go("setup"); return; }
  let words = (targets || filledWords()).filter((w) => w.english.trim());
  if (!words.length) { toast("Add at least one English word first.", "warn"); return; }
  if (!regenerate) words = words.filter(wordNeedsFill);
  if (!words.length) {
    toast("Every visible field is already filled. Use ✨ on a row to rewrite it.", "info");
    return;
  }

  // Free, instant: official coursebook meanings for empty Part of speech / Greek.
  let fromBook = 0;
  words.forEach((w) => {
    const hit = lookupCoursebookWord(w.english, bookTitle(), unitNumber());
    if (!hit) return;
    if (!w.type && hit.type) { w.type = hit.type; fromBook++; }
    if (!w.greek && hit.greek) { w.greek = hit.greek; fromBook++; }
  });

  // Only ask the AI about words that still have something to generate.
  const lockedKeys = (w) => {
    const provided = {};
    if (w.type.trim()) provided.type = w.type.trim();
    if (w.greek.trim()) provided.greek = w.greek.trim();
    if (!regenerate) AI_FIELDS.forEach((k) => { if (w[k]?.trim()) provided[k] = w[k].trim(); });
    return provided;
  };
  words = words.filter((w) => {
    const provided = lockedKeys(w);
    return FIELD_KEYS.some((k) => state.fields[k] && !provided[k]);
  });
  if (!words.length) {
    emit("words");
    toast(fromBook ? "Filled meanings from the coursebook." : "Nothing left to fill — turn on more fields (e.g. Collocation) first.", fromBook ? "ok" : "info");
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    if (fromBook) emit("words");
    toast(fromBook ? "Filled meanings from the coursebook. Add an AI key in Settings (Google Gemini is free) for phrases and word families." : "Add an AI key in Settings (Google Gemini is free) to fill words with AI.", "warn", {
      actions: [{ label: "Open settings", run: () => actions.openSettings() }],
    });
    return;
  }

  filling = true;
  const ids = new Set(words.map((w) => w.id));
  const rows = [...$("wordList").querySelectorAll(".word-row")].filter((r) => ids.has(r.dataset.id));
  rows.forEach((r) => r.classList.add("filling"));
  $("btnAiFill").classList.add("is-loading");
  $("btnAiFill").disabled = true;
  $("fillProgress").classList.remove("hidden");
  $("fillTitle").textContent = `AI is writing details for ${plural(words.length, "word")}…`;
  $("fillSub").textContent = "Phrases, emojis and word families matched to your class level.";
  actions.setAiState("busy");
  const started = Date.now();
  const tick = setInterval(() => {
    $("fillSub").textContent = `Phrases, emojis and word families matched to your class level · ${Math.round((Date.now() - started) / 1000)}s`;
  }, 1000);

  try {
    const requests = words.map((w) => ({ english: w.english.trim(), fields: { ...state.fields }, provided: lockedKeys(w) }));
    const items = await autofillVocabulary(apiKey, state.profileId, requests);
    words.forEach((w, i) => {
      const item = items?.[i];
      if (!item) return;
      FIELD_KEYS.forEach((k) => {
        if (!state.fields[k]) return;
        const v = String(item[k] ?? "").trim();
        if (!v) return;
        const locked = k === "type" || k === "greek";
        if (locked ? !w[k].trim() : (regenerate || !w[k].trim())) w[k] = v;
      });
    });
    actions.setAiState("on");
    emit("words");
    requestAnimationFrame(() => {
      [...$("wordList").querySelectorAll(".word-row")].filter((r) => ids.has(r.dataset.id)).forEach((r) => {
        r.classList.add("just-filled");
        setTimeout(() => r.classList.remove("just-filled"), 900);
      });
    });
    // Fields the AI says have no genuine answer (e.g. an opposite of "pencil") stay empty on purpose.
    const gaps = Object.entries(items.unavailable || {});
    if (gaps.length) {
      const list = gaps.slice(0, 3).map(([en, keys]) => `${en}: ${keys.map((k) => FIELD_LABELS[k].toLowerCase()).join(", ")}`).join(" · ");
      toast(`AI filled ${plural(words.length, "word")}. No natural answer for ${list}${gaps.length > 3 ? ` (+${gaps.length - 3} more)` : ""}.`, "ok", { ms: 7000 });
    } else {
      toast(`AI filled every field for ${plural(words.length, "word")}.`, "ok");
    }
  } catch (err) {
    actions.setAiState("error", err.message);
    toast(err.message || String(err), "error");
    rows.forEach((r) => r.classList.remove("filling"));
  } finally {
    clearInterval(tick);
    filling = false;
    $("btnAiFill").classList.remove("is-loading");
    $("btnAiFill").disabled = false;
    $("fillProgress").classList.add("hidden");
  }
}

/* ── Bulk paste ──────────────────────────────────────────────────── */
function openBulkPaste() {
  openDialog({
    title: "Paste a word list",
    subtitle: "One word per line or comma-separated. Parts of speech, Greek and phrases are detected automatically.",
    iconName: "clipboard",
    size: "wide",
    body: `
      <div class="bulk-format">compete (v.) - συναγωνίζομαι | compete in a race &gt; competition (n.) ≈ contest ≠ give up</div>
      <textarea class="textarea" id="bulkText" rows="8" placeholder="1. explore (v.) - εξερευνώ | explore a cave&#10;2. equipment (n.) - εξοπλισμός&#10;3. exhausted (adj.) ≈ tired ≠ energetic&#10;rescue, brave, cliff" autofocus></textarea>
      <div class="bulk-preview" id="bulkPreview"><span class="hint">Your words will appear here as you paste…</span></div>`,
    foot: `
      <label class="switch"><input type="checkbox" id="bulkReplace" /><span class="track"></span><span>Replace current words</span></label>
      <span class="spacer"></span>
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" id="bulkImport" disabled>Add words</button>`,
    onMount(root, close) {
      const text = root.querySelector("#bulkText");
      const preview = root.querySelector("#bulkPreview");
      const go = root.querySelector("#bulkImport");
      let parsed = [];
      const update = () => {
        parsed = parseBulkVocabularyText(text.value);
        go.disabled = !parsed.length;
        go.textContent = parsed.length ? `Add ${plural(parsed.length, "word")}` : "Add words";
        preview.innerHTML = parsed.length
          ? parsed.slice(0, 60).map((p) => `<span class="bp-word"><b>${esc(p.english)}</b>${p.type ? `<small>${esc(p.type)}</small>` : ""}${p.greek ? `<small lang="el">${esc(p.greek)}</small>` : ""}</span>`).join("") + (parsed.length > 60 ? `<span class="hint">+${parsed.length - 60} more</span>` : "")
          : `<span class="hint">Your words will appear here as you paste…</span>`;
      };
      text.addEventListener("input", update);
      text.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (parsed.length) go.click(); } });
      go.addEventListener("click", () => {
        const replace = root.querySelector("#bulkReplace").checked;
        const incoming = parsed.map((p) => makeWord(p));
        incoming.forEach((w) => {
          FIELD_KEYS.forEach((k) => { if (w[k] && ["derivatives", "synonyms", "antonyms"].includes(k)) state.fields[k] = true; });
        });
        state.words = replace ? incoming : [...filledWords(), ...incoming];
        emit("words", "fields");
        close();
        toast(`Added ${plural(incoming.length, "word")}.`, "ok");
      });
    },
  });
}
