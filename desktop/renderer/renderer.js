/* ══════════════════════════════════════════════════════════════════
   Vocab Master — Teacher Studio 2.0 Renderer
   Wires the full 4-step workflow, Live Worksheet & Vocabulary Editor,
   Bulk Smart Import, Classroom Projector Mode, Full Unit Pack Export,
   and History Backup onto the shared engine (app.js).
   ══════════════════════════════════════════════════════════════════ */
import {
  CLASS_PROFILES, EXERCISE_LABELS, EXERCISE_DESCRIPTIONS, STORAGE_KEY,
  EXERCISE_FAMILIES, EXERCISE_EXAMPLES, BOOK_PRESETS,
  pickGenerationPlan, analyzeVocabFeatures, validateWorksheet,
  renderLingoLauncher, renderDictation, renderAnswerKey, renderCoverageHeatmap,
  generateWorksheets, regenerateDictationOnly, regenerateLingoPracticeOnly,
  fixWorksheetValidationIssues, fixDictationCoverageGaps, fixAllWorksheetIssues,
  applyQuickWorksheetFixes, buildValidationReport,
  countQuickFixIssues, autofillVocabulary,
  exportDocx, openWorksheetPrint, fileBaseName,
  saveWorksheetSession, getAllSavedSessions, getSavedSession, deleteSavedSession,
  isLocalStorageWritable, normalizeWorksheetExercises,
  parseBulkVocabularyText, getSampleUnitData, WORKSHEET_PRINT_CSS,
  CPP_BOOKS, CPP_WORDBANK, resolveCoursebookId, getCppUnitStructure,
  parsePageRangeSpec, inferUnitFromPages, queryCoursebookWords,
  selectSmartCoursebookWords, lookupCoursebookWord,
} from "./app.js";

const API_KEY_KEY = STORAGE_KEY;
const THEME_KEY = "lingo_theme";
const SESSIONS_STORAGE_KEY = "lingo_saved_sessions_v1";

const $ = (id) => document.getElementById(id);
const desktop = () => (typeof window.desktop !== "undefined" ? window.desktop : null);

let currentStep = 1, currentData = null, currentPlan = null, currentSessionId = null;
let inputMode = "structured", previewTab = "lingo";
let generateBusy = false;
let activeFamilyFilter = "all";
let vocabCompactMode = false;

// Teacher view options in Step 4
let previewOptions = {
  showAnswers: false,
  studentHeader: false,
  density: "standard",
};

// Classroom projector state
let classroomSheet = "lingo";
let classroomZoom = 14; // pt

/* ── Escape helpers (mirrors engine) ─────────────────────────────── */
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const escAttr = escHtml;

/* ═══════════════ Desktop bridge: fetch → IPC ═══════════════════════ */
const realFetch = window.fetch.bind(window);
window.fetch = async (url, options = {}) => {
  const u = String(url);
  const d = desktop();

  if (u.endsWith("/chat/completions")) {
    if (d) {
      const res = await d.chat({
        body: typeof options.body === "string" ? options.body : JSON.stringify(options.body || {}),
        auth: (options.headers || {}).Authorization || "",
      });
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: async () => JSON.parse(res.body),
        text: async () => res.body,
      };
    }
    return realFetch(u, options);
  }

  if (u.endsWith("/export/docx")) {
    const { type, data } = JSON.parse(options.body || "{}");
    if (d) {
      const res = await d.exportDocx({ type, data });
      if (res.ok) {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        return { ok: true, status: 200, blob: async () => blob, text: async () => "" };
      }
      return { ok: false, status: 500, text: async () => res.error || "Export failed" };
    }
    return realFetch(u, options);
  }

  return realFetch(u, options);
};

/* ═══════════════ Storage bridge: localStorage → files/keychain ═════ */
let _hydrating = false;
let _apiKeyInMemory = null;
function patchStorageBridge() {
  const origGet = Storage.prototype.getItem;
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  if (desktop()) {
    try { origRemove.call(localStorage, API_KEY_KEY); } catch { /* ignore */ }
  }
  Storage.prototype.getItem = function (key) {
    if (key === API_KEY_KEY && desktop()) return _apiKeyInMemory;
    return origGet.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    const d = desktop();
    if (key === API_KEY_KEY && d) {
      _apiKeyInMemory = String(value) || null;
      if (!_hydrating) d.keychain.set(String(value));
      return;
    }
    origSet.call(this, key, value);
    if (_hydrating || !d) return;
    d.storage.set(key, String(value));
  };
  Storage.prototype.removeItem = function (key) {
    const d = desktop();
    if (key === API_KEY_KEY && d) {
      _apiKeyInMemory = null;
      if (!_hydrating) d.keychain.set("");
      return;
    }
    origRemove.call(this, key);
    if (_hydrating || !d) return;
    d.storage.remove(key);
  };
}

async function hydrateStorage() {
  const d = desktop();
  if (!d) return;
  try {
    _hydrating = true;
    const all = await d.storage.getAll();
    for (const [k, v] of Object.entries(all || {})) {
      if (k === API_KEY_KEY) continue;
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    }
    const key = await d.keychain.get();
    if (key) { try { localStorage.setItem(API_KEY_KEY, key); } catch { /* ignore */ } }
  } catch { /* ignore */ } finally {
    _hydrating = false;
  }
}

/* ═══════════════ Theme ════════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

/* ═══════════════ Toasts ═══════════════════════════════════════════ */
const TOAST_ICONS = { ok: "✓", error: "!", warn: "!", info: "i" };

function toast(message, type = "info", ms = 4200, actions = []) {
  const region = $("toastRegion");
  if (!region) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = TOAST_ICONS[type] || "i";
  const body = document.createElement("div");
  body.className = "toast-body";
  const text = document.createElement("span");
  text.textContent = message;
  body.appendChild(text);
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "toast-actions";
    actions.forEach(({ label, run }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => { run(); dismiss(); });
      row.appendChild(b);
    });
    body.appendChild(row);
  }
  el.append(icon, body);
  region.appendChild(el);
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.add("out");
    setTimeout(() => el.remove(), 320);
  };
  const arm = () => { timer = setTimeout(dismiss, type === "error" ? Math.max(ms, 8000) : ms); };
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", arm);
  el.addEventListener("click", (e) => { if (!e.target.closest("button")) dismiss(); });
  arm();
}

/* ═══════════════ Status bar & Live Context Pill ═══════════════════ */
function setConn(state, label) {
  const el = $("connState");
  if (!el) return;
  el.className = `conn-state ${state}`;
  const lbl = $("connLabel");
  if (lbl) lbl.textContent = label;
}
function setStorageLabel(text) {
  const el = $("storageLabel");
  if (el) el.textContent = text;
}

function updateContextSummary() {
  const book = $("bookTitle")?.value.trim() || "";
  const unit = $("unit")?.value.trim() || "";
  const pages = $("pageRange")?.value.trim() || "";
  const profileId = $("classProfile")?.value || "";
  const profile = CLASS_PROFILES[profileId];
  const wordCards = [...document.querySelectorAll(".vocab-card")].filter(
    (c) => c.querySelector(".vr-english")?.value.trim()
  );
  const wordCount = wordCards.length;

  // Topbar context pill
  const ctxBook = $("ctxBook");
  const ctxLevel = $("ctxLevel");
  const ctxWords = $("ctxWords");
  if (ctxBook) {
    ctxBook.textContent = book
      ? `${book}${unit ? ` · Unit ${unit}` : ""}${pages ? ` (p. ${pages})` : ""}`
      : "No book selected";
  }
  if (ctxLevel) {
    ctxLevel.textContent = profile ? `${profile.label} (${profile.cefr})` : "Select level";
  }
  if (ctxWords) {
    ctxWords.textContent = `${wordCount} word${wordCount === 1 ? "" : "s"}`;
  }

  // Stepper subtitles
  const sub1 = $("stepSub1");
  const sub2 = $("stepSub2");
  const sub3 = $("stepSub3");
  const sub4 = $("stepSub4");
  if (sub1) sub1.textContent = profile ? `${profile.label} · ${unit ? `Unit ${unit}` : "Set unit"}` : "Book & class level";
  if (sub2) sub2.textContent = inputMode === "freeform" ? "Freeform brief" : `${wordCount} word${wordCount === 1 ? "" : "s"} ready`;
  if (sub3) {
    sub3.textContent = currentPlan
      ? `${currentPlan.dictationExerciseCount} Dict · ${currentPlan.lingoPracticeCount} Lingo`
      : "Pick & generate";
  }
  if (sub4) sub4.textContent = currentData ? "Ready to edit & export" : "Edit, project & print";

  // Target word count hint in Step 2
  const targetHint = $("vocabTargetHint");
  if (targetHint) {
    const hints = {
      juniorA: "Recommended for A Senior: 6–10 words",
      juniorB: "Recommended for B Senior: 8–12 words",
      seniorC: "Recommended for C Senior: 10–15 words",
      seniorD: "Recommended for D Senior: 12–18 words",
      seniorE: "Recommended for E Senior: 14–20 words",
    };
    targetHint.textContent = hints[profileId] || "Recommended: 8–15 words";
  }

  // Update History count badge
  updateHistoryBadge();
}

function updateHistoryBadge() {
  const badge = $("historyCountBadge");
  if (!badge) return;
  try {
    const saves = getAllSavedSessions() || [];
    badge.textContent = String(saves.length);
    badge.classList.toggle("hidden", saves.length === 0);
  } catch {
    badge.classList.add("hidden");
  }
}

/* ═══════════════ Steps ════════════════════════════════════════════ */
function showStep(n) {
  currentStep = n;
  document.querySelectorAll(".step-section").forEach((s) => {
    s.classList.toggle("hidden", Number(s.dataset.step) !== n);
  });
  document.querySelectorAll(".stepper .step").forEach((p) => {
    const sn = Number(p.dataset.step);
    p.classList.toggle("active", sn === n);
    p.classList.toggle("done", sn < n);
  });
  document.querySelectorAll(".step-line").forEach((line, i) => {
    line.classList.toggle("done", i + 1 < n);
  });
  updateContextSummary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ═══════════════ Step 1 · Unit setup & Class Level Cards ══════════ */
function initProfiles() {
  const sel = $("classProfile");
  const cardsContainer = $("classLevelCards");
  const histFilter = $("historyClassFilter");

  Object.values(CLASS_PROFILES).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.label} — ${p.greekGrades} (${p.cefr})`;
    sel.appendChild(opt);

    if (histFilter) {
      const hOpt = document.createElement("option");
      hOpt.value = p.id;
      hOpt.textContent = `${p.label} (${p.cefr})`;
      histFilter.appendChild(hOpt);
    }
  });

  if (cardsContainer) {
    cardsContainer.innerHTML = Object.values(CLASS_PROFILES).map((p) => `
      <button type="button" class="level-card" data-level-id="${escAttr(p.id)}" role="radio" aria-checked="false">
        <span class="level-card-top">
          <span class="level-card-name">${escHtml(p.label)}</span>
          <span class="level-card-cefr">${escHtml(p.cefr)}</span>
        </span>
        <span class="level-card-grade">${escHtml(p.greekGrades)}</span>
        <span class="level-card-meta">Ages ${escHtml(p.ageRange)} · ≤${p.maxSentenceWords}w/sent</span>
      </button>
    `).join("");

    cardsContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".level-card");
      if (!card) return;
      sel.value = card.dataset.levelId;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  initBookPresets();
  updateProfileInfo();

  sel.addEventListener("change", () => {
    syncLevelCardSelection();
    updateProfileInfo();
    renderExercisePickers();
    refreshPlanPreview();
    updateContextSummary();
  });
}

function syncLevelCardSelection() {
  const id = $("classProfile")?.value || "";
  document.querySelectorAll(".level-card").forEach((card) => {
    const active = card.dataset.levelId === id;
    card.classList.toggle("selected", active);
    card.setAttribute("aria-checked", active ? "true" : "false");
  });
}

function initBookPresets() {
  const dl = $("bookTitleList");
  if (!dl) return;
  const savedBooks = new Set();
  try {
    (getAllSavedSessions() || []).forEach((s) => {
      if (s.form?.bookTitle) savedBooks.add(s.form.bookTitle.trim());
    });
  } catch { /* ignore */ }

  const allBooks = [...new Set([...savedBooks, ...(BOOK_PRESETS || [])])];
  dl.innerHTML = allBooks.map((b) => `<option value="${escAttr(b)}"></option>`).join("");

  const recentBar = $("recentBooksBar");
  if (recentBar) {
    const coreCpp = [
      "Cambridge Primary Paths 1",
      "Cambridge Primary Paths 2",
      "Cambridge Primary Paths 3",
    ];
    const extras = [...savedBooks].filter((b) => !coreCpp.includes(b)).slice(0, 2);
    const quickBooks = [...coreCpp, ...extras];
    recentBar.innerHTML = quickBooks.map((b) => {
      const isCpp = coreCpp.includes(b);
      return `<button type="button" class="recent-book-chip" data-book="${escAttr(b)}" title="${isCpp ? "Includes official Student's Book + Workbook + 2nd Ed. Enriched Wordbank" : ""}">${isCpp ? "📚" : "📘"} ${escHtml(b)}</button>`;
    }).join("");
    recentBar.addEventListener("click", (e) => {
      const chip = e.target.closest(".recent-book-chip");
      if (!chip) return;
      $("bookTitle").value = chip.dataset.book;
      $("bookTitle").dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

function updateProfileInfo() {
  syncLevelCardSelection();
  const id = $("classProfile").value;
  if (!id) {
    $("profileInfo").innerHTML = "👆 Select a class level card above to see grammar, vocabulary, and sentence-length guidelines.";
    return;
  }
  const p = CLASS_PROFILES[id];
  $("profileInfo").innerHTML = `<strong>${escHtml(p.label)}</strong> · CEFR <strong>${escHtml(p.cefr)}</strong> · ${escHtml(p.greekGrades)} (ages ${escHtml(p.ageRange)})<br>
    Max <strong>${p.maxSentenceWords} words</strong> per sentence · <strong>${p.allowDictation.length}</strong> dictation formats &amp; <strong>${p.allowLingo.length}</strong> Lingo practice formats unlocked for this level.`;
}

/* ═══════════════ Smart Coursebook Wordbank & Auto-Assignment ══════ */
let lastCoursebookQuery = null;
let lastCoursebookBookId = null;

function getAssignedEnglishSet() {
  const set = new Set();
  document.querySelectorAll(".vocab-card .vr-english").forEach((inp) => {
    const v = inp.value.trim().toLowerCase();
    if (v) set.add(v);
  });
  return set;
}

function wordEntryToVocabRow(entry) {
  return {
    english: entry.english,
    type: entry.type || "n.",
    greek: entry.greek || "",
    emojis: entry.emojis || "",
    collocation: entry.collocation || "",
    derivatives: entry.derivatives || "",
    synonyms: entry.synonyms || "",
    antonyms: entry.antonyms || "",
    fieldToggles: {
      type: true,
      greek: true,
      emojis: true,
      collocation: true,
      derivatives: Boolean(entry.derivatives),
      synonyms: Boolean(entry.synonyms),
      antonyms: Boolean(entry.antonyms),
    },
  };
}

function getEffectiveAssignList(queryRes) {
  if (!queryRes || !queryRes.words?.length) return [];
  const limitVal = $("cbAssignLimit")?.value ?? "smart";
  if (limitVal === "0") {
    return [...queryRes.words];
  }
  if (limitVal === "smart") {
    // If the teacher selected a specific page range with <= 24 words, assign all of them;
    // otherwise (e.g., Full Unit), select the top 15 pedagogical words.
    if (queryRes.hasPageFilter && queryRes.words.length <= 24) {
      return [...queryRes.words];
    }
    return selectSmartCoursebookWords(queryRes.words, 15);
  }
  const num = Number(limitVal) || 15;
  return selectSmartCoursebookWords(queryRes.words, num);
}

function assignWordsToStudio(entries, { silent = false } = {}) {
  if (!Array.isArray(entries) || !entries.length) {
    if (!silent) toast("No matching coursebook words to assign.", "warn");
    return;
  }
  const container = $("vocabRows");
  if (!container) return;
  container.innerHTML = "";
  entries.forEach((entry) => {
    addVocabRow(wordEntryToVocabRow(entry));
  });
  renumberVocabCards();
  renderCoursebookWordChips();
  updateStep2CoursebookBar();
  if (!silent) {
    toast(`Assigned ${entries.length} coursebook word${entries.length === 1 ? "" : "s"} to Vocabulary Studio.`, "ok");
  }
}

function toggleSingleCoursebookWordInStudio(entry) {
  if (!entry) return;
  const key = entry.english.trim().toLowerCase();
  const cards = [...document.querySelectorAll(".vocab-card")];
  const existing = cards.find((c) => (c.querySelector(".vr-english")?.value || "").trim().toLowerCase() === key);

  if (existing) {
    existing.remove();
    if (document.querySelectorAll(".vocab-card").length === 0) addVocabRow();
    renumberVocabCards();
    toast(`Removed "${entry.english}" from Vocabulary Studio.`, "info", 1800);
  } else {
    // If all existing rows are blank placeholders, clear them first
    const allBlank = cards.every((c) => !(c.querySelector(".vr-english")?.value || "").trim());
    if (allBlank) $("vocabRows").innerHTML = "";
    addVocabRow(wordEntryToVocabRow(entry));
    renumberVocabCards();
    toast(`Added "${entry.english}" to Vocabulary Studio.`, "ok", 1800);
  }
  renderCoursebookWordChips();
}

function renderCoursebookUnitPills(bookId, activeUnit) {
  const wrap = $("cbUnitPills");
  if (!wrap || !CPP_BOOKS[bookId]) return;
  const units = CPP_BOOKS[bookId].units || {};
  wrap.innerHTML = Array.from({ length: 9 }, (_, i) => i + 1).map((u) => {
    const meta = units[u] || { title: `Unit ${u}` };
    const sbStart = 6 + (u - 1) * 22;
    const sbEnd = sbStart + 21;
    const isActive = Number(activeUnit) === u;
    return `<button type="button" class="cb-unit-pill${isActive ? " active" : ""}" data-cb-unit="${u}" title="${escAttr(`Unit ${u}: ${meta.title} (SB p. ${sbStart}–${sbEnd})`)}">
      <span>Unit ${u}</span>
      <span class="u-sub">p.${sbStart}–${sbEnd}</span>
    </button>`;
  }).join("");
}

function renderCoursebookSectionPills(unitStruct, currentPageRange) {
  const row = $("cbSectionPresetsRow");
  const wrap = $("cbSectionPills");
  if (!row || !wrap) return;
  if (!unitStruct) {
    row.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  row.classList.remove("hidden");
  const normCurrent = String(currentPageRange || "").trim().replace(/[–—−]/g, "-");

  wrap.innerHTML = unitStruct.sections.map((sec) => {
    const normSec = sec.pageRange.replace(/[–—−]/g, "-");
    const isFull = sec.id === "FULL";
    const isActive = isFull
      ? (!normCurrent || normCurrent === normSec)
      : (normCurrent === normSec);
    return `<button type="button" class="cb-section-pill${isActive ? " active" : ""}" data-sec-id="${escAttr(sec.id)}" data-sec-pages="${escAttr(isFull ? "" : sec.pageRange)}" title="${escAttr(`${sec.label} · ${sec.wbRange}`)}">
      ${escHtml(sec.shortLabel)}
    </button>`;
  }).join("");
}

function renderCoursebookWordChips() {
  const wrap = $("cbWordChips");
  const summaryEl = $("cbPreviewSummary");
  const btnCountEl = $("cbAssignCountBtn");
  if (!wrap || !summaryEl) return;

  if (!lastCoursebookQuery || !lastCoursebookQuery.supported) {
    wrap.innerHTML = "";
    summaryEl.textContent = "Select a unit above to browse and auto-assign words…";
    if (btnCountEl) btnCountEl.textContent = "0";
    return;
  }

  const assignList = getEffectiveAssignList(lastCoursebookQuery);
  if (btnCountEl) btnCountEl.textContent = String(assignList.length);

  const searchQ = ($("cbWordSearch")?.value || "").trim().toLowerCase();
  const assignedSet = getAssignedEnglishSet();
  const allWords = lastCoursebookQuery.words || [];
  const filtered = searchQ
    ? allWords.filter((w) =>
        w.english.toLowerCase().includes(searchQ) ||
        w.greek.toLowerCase().includes(searchQ) ||
        String(w.page).includes(searchQ)
      )
    : allWords;

  const assignedInPool = allWords.filter((w) => assignedSet.has(w.english.toLowerCase().trim())).length;
  const { counts } = lastCoursebookQuery;
  summaryEl.innerHTML = `Showing <strong>${filtered.length}</strong> word${filtered.length === 1 ? "" : "s"} ` +
    `(📗 SB: <strong>${counts.sb}</strong> · 📘 WB: <strong>${counts.wb}</strong> · ✨ 2nd Ed.: <strong>${counts.enriched}</strong>) — ` +
    `<strong>${assignedInPool}</strong> currently in Studio. <em>Click any word chip to add or remove it:</em>`;

  if (!filtered.length) {
    wrap.innerHTML = `<span style="color:var(--muted);font-size:0.82rem;padding:0.35rem 0">No words match your current filter. Try widening the page range or toggling Workbook / 2nd Ed. words on.</span>`;
    return;
  }

  wrap.innerHTML = filtered.map((w, idx) => {
    const isAssigned = assignedSet.has(w.english.toLowerCase().trim());
    const srcClass = w.source === "wb" ? "src-wb" : w.source === "enriched" ? "src-enriched" : "src-sb";
    const srcLabel = w.source === "wb"
      ? `WB p.${w.wbPage || w.page}`
      : w.source === "enriched"
      ? `✨ 2nd Ed.`
      : `SB p.${w.sbPage || w.page}`;
    const tooltip = [
      `${w.english} (${w.type}) — ${w.greek}`,
      w.collocation ? `Collocation: ${w.collocation}` : "",
      w.example ? `Example: ${w.example}` : "",
      w.derivatives ? `Derivatives: ${w.derivatives}` : "",
    ].filter(Boolean).join("\n");

    return `<button type="button" class="cb-word-chip${isAssigned ? " assigned" : ""}" data-cb-word-idx="${idx}" title="${escAttr(tooltip)}">
      <span class="chip-check">${isAssigned ? "✓" : "+"}</span>
      <span>${escHtml(w.english)}</span>
      <span class="chip-pos">${escHtml(w.type)}</span>
      <span class="chip-gr">${escHtml(w.greek)}</span>
      <span class="chip-src ${srcClass}">${escHtml(srcLabel)}</span>
    </button>`;
  }).join("");

  // Store filtered list reference on element for click handler
  wrap._filteredWords = filtered;
}

function updateStep2CoursebookBar() {
  const bar = $("cbStep2Bar");
  if (!bar) return;
  if (!lastCoursebookQuery || !lastCoursebookQuery.supported) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const uStruct = lastCoursebookQuery.unitStructure;
  const pages = $("pageRange")?.value.trim();
  const summary = $("cbStep2Summary");
  if (summary) {
    summary.innerHTML = `<strong>${escHtml(lastCoursebookQuery.bookTitle)}</strong>` +
      (uStruct ? ` · Unit ${uStruct.unit}: <em>${escHtml(uStruct.unitTitle)}</em>` : "") +
      (pages ? ` · Pages <strong>${escHtml(pages)}</strong>` : " · Full Unit") +
      ` <span style="color:var(--muted)">(${lastCoursebookQuery.counts.sb} SB + ${lastCoursebookQuery.counts.wb} WB + ${lastCoursebookQuery.counts.enriched} 2nd Ed.)</span>`;
  }
  if ($("cbStep2WbToggle") && $("cbIncludeWb")) {
    $("cbStep2WbToggle").checked = $("cbIncludeWb").checked;
  }
  if ($("cbStep2EnrichedToggle") && $("cbIncludeEnriched")) {
    $("cbStep2EnrichedToggle").checked = $("cbIncludeEnriched").checked;
  }
}

function refreshCoursebookPanel({ triggerAutoAssign = false, sourceEvent = "" } = {}) {
  const panel = $("coursebookSmartPanel");
  const bookTitleVal = $("bookTitle")?.value || "";
  const bookId = resolveCoursebookId(bookTitleVal);

  if (!bookId || !CPP_BOOKS[bookId]) {
    lastCoursebookQuery = null;
    lastCoursebookBookId = null;
    panel?.classList.add("hidden");
    $("cbStep2Bar")?.classList.add("hidden");
    return;
  }

  panel?.classList.remove("hidden");
  const bookMeta = CPP_BOOKS[bookId];

  // Auto-select recommended class profile if none selected yet (or when switching between CPP 1/2/3 before customizing)
  const classSel = $("classProfile");
  if (classSel && (!classSel.value || (sourceEvent === "bookTitle" && lastCoursebookBookId !== bookId))) {
    classSel.value = bookMeta.recommendedProfile;
    syncLevelCardSelection();
    updateProfileInfo();
    renderExercisePickers();
    refreshPlanPreview();
  }
  lastCoursebookBookId = bookId;

  // Smart unit inference from Page Range or default to Unit 1
  const pageRangeVal = $("pageRange")?.value.trim() || "";
  let unitNum = parseInt($("unit")?.value, 10) || 0;

  if (sourceEvent === "pageRange" && pageRangeVal) {
    const inferred = inferUnitFromPages(bookId, pageRangeVal);
    if (inferred && inferred !== unitNum) {
      unitNum = inferred;
      if ($("unit")) $("unit").value = String(inferred);
    }
  } else if (sourceEvent === "unitInput" && unitNum >= 1 && unitNum <= 9 && pageRangeVal) {
    // If the teacher changed the Unit number manually and the old pageRange belongs to another unit, clear pageRange
    const inferredFromOldPages = inferUnitFromPages(bookId, pageRangeVal);
    if (inferredFromOldPages && inferredFromOldPages !== unitNum) {
      $("pageRange").value = "";
    }
  }

  if (!unitNum || unitNum < 1 || unitNum > 9) {
    unitNum = 1;
    if ($("unit") && !$("unit").value) $("unit").value = "1";
  }

  const includeSb = $("cbIncludeSb") ? $("cbIncludeSb").checked : true;
  const includeWb = $("cbIncludeWb") ? $("cbIncludeWb").checked : true;
  const wbScope = $("cbWbScope")?.value || "unit";
  const includeEnriched = $("cbIncludeEnriched") ? $("cbIncludeEnriched").checked : true;
  const hideBasic = $("cbHideBasic") ? $("cbHideBasic").checked : true;

  $("lblCbSb")?.classList.toggle("active", includeSb);
  $("lblCbWb")?.classList.toggle("active", includeWb);
  $("lblCbEnriched")?.classList.toggle("active", includeEnriched);
  $("lblCbHideBasic")?.classList.toggle("active", hideBasic);
  if ($("cbWbScope")) $("cbWbScope").disabled = !includeWb;

  // Query counts for each source independently so the teacher always sees available counts on the pills
  const fullUnitCountsQuery = queryCoursebookWords({
    bookId,
    unit: unitNum,
    pageRange: $("pageRange")?.value.trim() || "",
    includeSb: true,
    includeWb: true,
    wbScope,
    includeEnriched: true,
    hideBasic,
  });
  if ($("cbCountSb")) $("cbCountSb").textContent = String(fullUnitCountsQuery.counts.sb);
  if ($("cbCountWb")) $("cbCountWb").textContent = String(fullUnitCountsQuery.counts.wb);
  if ($("cbCountEnriched")) $("cbCountEnriched").textContent = String(fullUnitCountsQuery.counts.enriched);

  const queryRes = queryCoursebookWords({
    bookId,
    unit: unitNum,
    pageRange: $("pageRange")?.value.trim() || "",
    includeSb,
    includeWb,
    wbScope,
    includeEnriched,
    hideBasic,
  });
  lastCoursebookQuery = queryRes;

  const uStruct = queryRes.unitStructure;
  if ($("cbCefrPill")) $("cbCefrPill").textContent = `CEFR ${bookMeta.cefr} · 2nd Edition`;
  if ($("cbPanelTitle")) {
    $("cbPanelTitle").textContent = uStruct
      ? `${bookMeta.title} · Unit ${uStruct.unit}: ${uStruct.unitTitle}`
      : `${bookMeta.title} — Official & Enriched Wordbank`;
  }
  if ($("cbPanelSub")) {
    $("cbPanelSub").innerHTML = uStruct
      ? `Theme: <strong>${escHtml(uStruct.unitTheme)}</strong> · Student's Book <strong>p. ${uStruct.sbStart}–${uStruct.sbEnd}</strong> · Workbook <strong>p. ${uStruct.wbStart}–${uStruct.wbEnd}</strong>`
      : `Select a unit or page range to automatically assign official Student's Book, Workbook, and 2nd Edition vocabulary.`;
  }

  renderCoursebookUnitPills(bookId, unitNum);
  renderCoursebookSectionPills(uStruct, $("pageRange")?.value.trim() || "");

  if (triggerAutoAssign && ($("cbAutoAssign")?.checked !== false)) {
    const toAssign = getEffectiveAssignList(queryRes);
    if (toAssign.length > 0) {
      assignWordsToStudio(toAssign, { silent: true });
    }
  } else {
    renderCoursebookWordChips();
    updateStep2CoursebookBar();
  }
  updateContextSummary();
}

/* ═══════════════ Step 2 · Vocabulary Studio ═══════════════════════ */
const VOCAB_FIELD_LABELS = {
  type: "Type", greek: "Greek", emojis: "Emojis", collocation: "Collocation",
  derivatives: "Derivatives", synonyms: "Synonyms", antonyms: "Antonyms",
};

function defaultCardToggles(overrides = {}) {
  return { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false, ...overrides };
}

function buildCardToggleHtml(toggles) {
  return `<span>Fields:</span>` + Object.entries(VOCAB_FIELD_LABELS).map(([key, label]) =>
    `<label class="chip-toggle chip-sm"><input type="checkbox" data-toggle-field="${key}" ${toggles[key] ? "checked" : ""} /> ${label}</label>`
  ).join("");
}

function getCardToggles(card) {
  const t = {};
  card.querySelectorAll("[data-toggle-field]").forEach((cb) => { t[cb.dataset.toggleField] = cb.checked; });
  return t;
}

function applyCardFieldVisibility(card) {
  const t = getCardToggles(card);
  card.querySelectorAll(".vf").forEach((el) => {
    el.classList.toggle("hidden-field", !t[el.dataset.field]);
  });
}

function syncBatchToggleBar() {
  const cards = [...document.querySelectorAll(".vocab-card")];
  if (!cards.length) return;
  document.querySelectorAll("[data-batch-field]").forEach((btn) => {
    const field = btn.dataset.batchField;
    const anyOn = cards.some((c) => c.querySelector(`[data-toggle-field="${field}"]`)?.checked);
    btn.classList.toggle("active", anyOn);
  });
}

function checkDuplicateVocabWords() {
  const cards = [...document.querySelectorAll(".vocab-card")];
  const counts = new Map();
  cards.forEach((c) => {
    const w = (c.querySelector(".vr-english")?.value || "").trim().toLowerCase();
    if (w) counts.set(w, (counts.get(w) || 0) + 1);
  });
  let dupCount = 0;
  cards.forEach((c) => {
    const w = (c.querySelector(".vr-english")?.value || "").trim().toLowerCase();
    const isDup = w && counts.get(w) > 1;
    c.classList.toggle("duplicate-word", !!isDup);
    if (isDup) dupCount++;
  });
  const pill = $("vocabDupWarning");
  if (pill) {
    pill.classList.toggle("hidden", dupCount === 0);
    if (dupCount > 0) pill.textContent = `⚠️ ${dupCount} duplicate word entries`;
  }
}

function renumberVocabCards() {
  const cards = [...document.querySelectorAll(".vocab-card")];
  cards.forEach((card, i) => {
    const el = card.querySelector(".vocab-word-num");
    if (el) el.textContent = String(i + 1);
  });
  const countEl = $("vocabWordCount");
  if (countEl) {
    const filled = cards.filter((c) => c.querySelector(".vr-english")?.value.trim()).length;
    const total = cards.length;
    countEl.innerHTML = `<strong>${filled}</strong> word${filled === 1 ? "" : "s"} <span style="color:var(--faint);font-size:0.78rem">(${total} row${total === 1 ? "" : "s"})</span>`;
  }
  checkDuplicateVocabWords();
  syncBatchToggleBar();
  updateContextSummary();
}

function createVocabCard(data = {}) {
  const toggles = defaultCardToggles(data.fieldToggles);
  const card = document.createElement("article");
  card.className = "vocab-card";
  card.innerHTML = `
    <div class="vocab-card-head">
      <span class="vocab-word-num" aria-label="Word number">1</span>
      <input class="vr-english" placeholder="English word or phrase (press Enter for next row)" value="${escAttr(data.english || "")}" />
      <div class="vocab-move-btns">
        <button type="button" class="icon-btn btn-move-up" title="Move word up" aria-label="Move word up">↑</button>
        <button type="button" class="icon-btn btn-move-down" title="Move word down" aria-label="Move word down">↓</button>
      </div>
      <button type="button" class="btn btn-soft btn-sm btn-fill-one" title="AI fill this word">✨ Fill</button>
      <button type="button" class="icon-btn btn-rm" title="Remove word">✕</button>
    </div>
    <div class="vocab-card-toggles toggle-group">${buildCardToggleHtml(toggles)}</div>
    <div class="vocab-card-fields">
      <div class="vf vf-type" data-field="type">
        <label class="field-label">Type</label>
        <input class="vr-type" value="${escAttr(data.type || "")}" placeholder="n., v., adj., phr. v. — locks word sense" />
      </div>
      <div class="vf vf-greek" data-field="greek">
        <label class="field-label">Greek</label>
        <input class="vr-greek" value="${escAttr(data.greek || "")}" placeholder="ελληνικά — locks meaning if filled first" />
      </div>
      <div class="vf vf-emojis" data-field="emojis">
        <label class="field-label">Emojis</label>
        <input class="vr-emojis" value="${escAttr(data.emojis || "")}" placeholder="🏃💪" />
      </div>
      <div class="vf vf-collocation" data-field="collocation">
        <label class="field-label">Collocation</label>
        <input class="vr-coll" value="${escAttr(data.collocation || "")}" placeholder="short natural phrase" />
      </div>
      <div class="vf vf-related vf-derivatives" data-field="derivatives">
        <label class="field-label">Derivatives</label>
        <input class="vr-derivatives" value="${escAttr(data.derivatives || "")}" placeholder="e.g. competition (n.) - διαγωνισμός" />
      </div>
      <div class="vf vf-related vf-synonyms" data-field="synonyms">
        <label class="field-label">Synonyms</label>
        <input class="vr-synonyms" value="${escAttr(data.synonyms || "")}" placeholder="near-same meaning" />
      </div>
      <div class="vf vf-related vf-antonyms" data-field="antonyms">
        <label class="field-label">Antonyms</label>
        <input class="vr-antonyms" value="${escAttr(data.antonyms || "")}" placeholder="opposite - ελληνικά" />
      </div>
    </div>`;

  card.querySelector(".btn-rm").addEventListener("click", () => {
    card.remove();
    renumberVocabCards();
  });
  card.querySelector(".btn-move-up").addEventListener("click", () => {
    const prev = card.previousElementSibling;
    if (prev) {
      card.parentNode.insertBefore(card, prev);
      renumberVocabCards();
    }
  });
  card.querySelector(".btn-move-down").addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (next) {
      card.parentNode.insertBefore(next, card);
      renumberVocabCards();
    }
  });
  card.querySelector(".btn-fill-one").addEventListener("click", () => fillVocabCards([card]));
  card.querySelectorAll("[data-toggle-field]").forEach((cb) => {
    cb.addEventListener("change", () => {
      applyCardFieldVisibility(card);
      syncBatchToggleBar();
    });
  });

  const engInput = card.querySelector(".vr-english");
  engInput.addEventListener("input", () => renumberVocabCards());
  engInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cards = [...document.querySelectorAll(".vocab-card")];
      const idx = cards.indexOf(card);
      if (idx >= 0 && idx < cards.length - 1) {
        cards[idx + 1].querySelector(".vr-english")?.focus();
      } else {
        const newCard = addVocabRow();
        newCard.querySelector(".vr-english")?.focus();
      }
    }
  });

  applyCardFieldVisibility(card);
  return card;
}

function addVocabRow(data) {
  const card = createVocabCard(data);
  $("vocabRows").appendChild(card);
  renumberVocabCards();
  return card;
}

function initVocabRows() {
  $("vocabRows").innerHTML = "";
  for (let i = 0; i < 4; i++) addVocabRow();
}

function setVocabFillStatus(msg, type = "info") {
  const el = $("vocabFillStatus");
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove("hidden");
}

function readCardProvided(card) {
  const pick = (sel) => card.querySelector(sel)?.value.trim() || "";
  const provided = {};
  if (pick(".vr-type")) provided.type = pick(".vr-type");
  if (pick(".vr-greek")) provided.greek = pick(".vr-greek");
  if (pick(".vr-emojis")) provided.emojis = pick(".vr-emojis");
  if (pick(".vr-coll")) provided.collocation = pick(".vr-coll");
  if (pick(".vr-derivatives")) provided.derivatives = pick(".vr-derivatives");
  if (pick(".vr-synonyms")) provided.synonyms = pick(".vr-synonyms");
  if (pick(".vr-antonyms")) provided.antonyms = pick(".vr-antonyms");
  return provided;
}

function applyFillToCard(card, item) {
  if (!item) return;
  const toggles = getCardToggles(card);
  const provided = readCardProvided(card);
  const setField = (sel, val, key) => {
    if (provided[key]) return;
    if (!toggles[key] || !val || !String(val).trim()) return;
    const el = card.querySelector(sel);
    if (el) el.value = val;
  };
  setField(".vr-type", item.type, "type");
  setField(".vr-greek", item.greek, "greek");
  setField(".vr-emojis", item.emojis, "emojis");
  setField(".vr-coll", item.collocation, "collocation");
  setField(".vr-derivatives", item.derivatives, "derivatives");
  setField(".vr-synonyms", item.synonyms, "synonyms");
  setField(".vr-antonyms", item.antonyms, "antonyms");
}

async function fillVocabCards(cards) {
  const toFill = cards.filter((c) => c.querySelector(".vr-english").value.trim());
  if (!toFill.length) {
    setVocabFillStatus("Type at least one English word first.", "error");
    return;
  }

  // First pass: check if any words match the built-in Coursebook Wordbank (instant, works offline!)
  const bookTitleVal = $("bookTitle")?.value.trim() || "";
  const unitVal = parseInt($("unit")?.value, 10) || 0;
  let filledFromCoursebook = 0;

  toFill.forEach((card) => {
    const eng = card.querySelector(".vr-english")?.value.trim() || "";
    const cbMatch = lookupCoursebookWord(eng, bookTitleVal, unitVal);
    if (cbMatch) {
      applyFillToCard(card, cbMatch);
      filledFromCoursebook++;
    }
  });

  // Check which cards still have enabled fields that remain empty after coursebook lookup
  const remainingCards = toFill.filter((card) => {
    const fields = getCardToggles(card);
    const provided = readCardProvided(card);
    return Object.entries(fields).some(([k, on]) => on && !provided[k]);
  });

  if (!remainingCards.length) {
    setVocabFillStatus(`Filled ${toFill.length} word(s) instantly from the built-in Coursebook Wordbank.`, "ok");
    renumberVocabCards();
    return;
  }

  const apiKey = localStorage.getItem(API_KEY_KEY);
  if (!apiKey) {
    if (filledFromCoursebook > 0) {
      setVocabFillStatus(`Filled ${filledFromCoursebook} word(s) from Coursebook Wordbank. Add a DeepSeek API key in Settings to AI-fill custom words.`, "info");
      renumberVocabCards();
      return;
    }
    setVocabFillStatus("Add your DeepSeek API key in Settings first.", "error");
    openSettings();
    return;
  }

  const requests = remainingCards.map((card) => ({
    english: card.querySelector(".vr-english").value.trim(),
    fields: getCardToggles(card),
    provided: readCardProvided(card),
  }));

  remainingCards.forEach((c) => c.classList.add("filling"));
  setVocabFillStatus("AI is filling vocabulary…", "info");
  try {
    const items = await autofillVocabulary(apiKey, $("classProfile").value, requests);
    remainingCards.forEach((card, i) => applyFillToCard(card, items[i]));
    setVocabFillStatus(`Filled ${toFill.length} word(s).`, "ok");
  } catch (e) {
    setVocabFillStatus(e.message || String(e), "error");
  } finally {
    remainingCards.forEach((c) => c.classList.remove("filling"));
    renumberVocabCards();
  }
}

function readVocabRow(card) {
  const t = getCardToggles(card);
  const row = {
    english: card.querySelector(".vr-english").value.trim(),
    fieldToggles: t,
    type: card.querySelector(".vr-type").value.trim(),
    greek: card.querySelector(".vr-greek").value.trim(),
    emojis: card.querySelector(".vr-emojis").value.trim(),
    collocation: card.querySelector(".vr-coll").value.trim(),
    derivatives: card.querySelector(".vr-derivatives").value.trim(),
    synonyms: card.querySelector(".vr-synonyms").value.trim(),
    antonyms: card.querySelector(".vr-antonyms").value.trim(),
  };
  if (!t.type) row.type = "";
  if (!t.greek) row.greek = "";
  if (!t.emojis) row.emojis = "";
  if (!t.collocation) row.collocation = "";
  if (!t.derivatives) row.derivatives = "";
  if (!t.synonyms) row.synonyms = "";
  if (!t.antonyms) row.antonyms = "";
  return row;
}

/* ── Bulk Vocabulary Import & Studio Utilities ───────────────────── */
function updateBulkImportPreview() {
  const raw = $("bulkImportText")?.value || "";
  const parsed = parseBulkVocabularyText(raw);
  const preview = $("bulkImportPreview");
  if (!preview) return;
  if (!parsed.length) {
    preview.innerHTML = `<span style="color:var(--muted)">Paste text above to preview parsed words…</span>`;
    return;
  }
  preview.innerHTML = `<strong>Ready to import ${parsed.length} word${parsed.length === 1 ? "" : "s"}:</strong><br>` +
    parsed.slice(0, 12).map((item, i) => {
      const parts = [`<strong>${i + 1}. ${escHtml(item.english)}</strong>`];
      if (item.type) parts.push(`<em>(${escHtml(item.type)})</em>`);
      if (item.greek) parts.push(`— ${escHtml(item.greek)}`);
      if (item.collocation) parts.push(`[${escHtml(item.collocation)}]`);
      return parts.join(" ");
    }).join(" · ") + (parsed.length > 12 ? ` <em>…and ${parsed.length - 12} more</em>` : "");
}

function runBulkImport() {
  const raw = $("bulkImportText")?.value || "";
  const parsed = parseBulkVocabularyText(raw);
  if (!parsed.length) {
    toast("No words found to import. Type or paste at least one word.", "warn");
    return;
  }
  const replace = $("bulkReplaceExisting")?.checked;
  const existingCards = [...document.querySelectorAll(".vocab-card")];
  const allEmpty = existingCards.every((c) => !c.querySelector(".vr-english")?.value.trim());
  if (replace || allEmpty) {
    $("vocabRows").innerHTML = "";
  }
  parsed.forEach((row) => addVocabRow(row));
  closeModal("bulkImportModal");
  $("bulkImportText").value = "";
  toast(`Imported ${parsed.length} vocabulary word${parsed.length === 1 ? "" : "s"}.`, "ok");
}

function sortVocabRowsAlphabetically() {
  const cards = [...document.querySelectorAll(".vocab-card")];
  const rows = cards.map(readVocabRow).filter((r) => r.english);
  if (rows.length < 2) return;
  rows.sort((a, b) => a.english.localeCompare(b.english, "en", { sensitivity: "base" }));
  $("vocabRows").innerHTML = "";
  rows.forEach((r) => addVocabRow(r));
  toast("Sorted vocabulary alphabetically (A–Z).", "ok");
}

function cleanEmptyVocabRows() {
  const cards = [...document.querySelectorAll(".vocab-card")];
  const nonEmpty = cards.filter((c) => c.querySelector(".vr-english")?.value.trim());
  if (nonEmpty.length === cards.length) {
    toast("No empty rows to remove.", "info");
    return;
  }
  cards.forEach((c) => {
    if (!c.querySelector(".vr-english")?.value.trim()) c.remove();
  });
  if (document.querySelectorAll(".vocab-card").length === 0) addVocabRow();
  renumberVocabCards();
  toast("Removed empty word cards.", "ok");
}

function toggleBatchField(fieldKey) {
  const cards = [...document.querySelectorAll(".vocab-card")];
  if (!cards.length) return;
  const allChecked = cards.every((c) => c.querySelector(`[data-toggle-field="${fieldKey}"]`)?.checked);
  const nextState = !allChecked;
  cards.forEach((c) => {
    const cb = c.querySelector(`[data-toggle-field="${fieldKey}"]`);
    if (cb) {
      cb.checked = nextState;
      applyCardFieldVisibility(c);
    }
  });
  syncBatchToggleBar();
  toast(`${VOCAB_FIELD_LABELS[fieldKey] || fieldKey} ${nextState ? "enabled" : "disabled"} on all words.`, "info", 2400);
}

/* ═══════════════ Step 3 · Exercise Architect ══════════════════════ */
function getExerciseMode() {
  return document.querySelector('input[name="exerciseMode"]:checked')?.value || "random";
}

function getSelectedExerciseTypes(section) {
  const id = section === "dictation" ? "dictationPicker" : "lingoPicker";
  return [...document.querySelectorAll(`#${id} input:checked`)].map((cb) => cb.value);
}

function exerciseFeatureTag(id, features) {
  if (id === "D06" || id === "L03") {
    return features.hasSynonyms
      ? { text: "Synonyms ready", ok: true }
      : { text: "Needs Synonyms enabled on Step 2", ok: false };
  }
  if (id === "D05" || id === "L04") {
    return features.hasAntonyms
      ? { text: "Antonyms ready", ok: true }
      : { text: "Needs Antonyms enabled on Step 2", ok: false };
  }
  if (id === "D02" || id === "L07") {
    return features.hasDerivatives
      ? { text: "Derivatives ready", ok: true }
      : { text: "Needs Derivatives enabled on Step 2", ok: false };
  }
  return null;
}

function buildExerciseCardHtml(id, features) {
  const tag = exerciseFeatureTag(id, features);
  const disabled = tag && !tag.ok;
  const desc = EXERCISE_DESCRIPTIONS[id] || "";
  const example = EXERCISE_EXAMPLES?.[id] || "";
  const fam = EXERCISE_FAMILIES?.[id] || "productive";
  const famLabel = fam === "recognition" ? "Recognition" : fam === "analysis" ? "Analysis" : "Productive";
  const hiddenByFilter = activeFamilyFilter !== "all" && activeFamilyFilter !== fam;

  return `<label class="exercise-card${disabled ? " exercise-card--disabled" : ""}${hiddenByFilter ? " hidden" : ""}" data-family="${escAttr(fam)}">
    <input type="checkbox" value="${escAttr(id)}" ${disabled ? "disabled" : ""} />
    <span class="exercise-card-inner">
      <span class="exercise-card-top">
        <span class="exercise-card-id">${escHtml(id)}</span>
        <span class="fam-pill fam-${escAttr(fam)}">${escHtml(famLabel)}</span>
      </span>
      <span class="exercise-card-title">${escHtml(EXERCISE_LABELS[id] || id)}</span>
      <span class="exercise-card-desc">${escHtml(desc)}</span>
      ${example ? `<span class="exercise-card-example">${escHtml(example)}</span>` : ""}
      ${tag ? `<span class="exercise-card-tag${tag.ok ? " ok" : ""}">${escHtml(tag.text)}</span>` : ""}
    </span>
  </label>`;
}

function renderExercisePickers() {
  const profileId = $("classProfile").value;
  const dictEl = $("dictationPicker");
  const lingoEl = $("lingoPicker");
  if (!profileId || !dictEl || !lingoEl) return;
  const p = CLASS_PROFILES[profileId];
  const features = analyzeVocabFeatures(getFormData());
  const keepDict = new Set(getSelectedExerciseTypes("dictation"));
  const keepLingo = new Set(getSelectedExerciseTypes("lingo"));
  dictEl.innerHTML = p.allowDictation.map((id) => buildExerciseCardHtml(id, features)).join("");
  lingoEl.innerHTML = p.allowLingo.map((id) => buildExerciseCardHtml(id, features)).join("");
  dictEl.querySelectorAll("input:not(:disabled)").forEach((cb) => { cb.checked = keepDict.has(cb.value); });
  lingoEl.querySelectorAll("input:not(:disabled)").forEach((cb) => { cb.checked = keepLingo.has(cb.value); });
}

function applyExercisePreset(presetName) {
  const profileId = $("classProfile").value;
  if (!profileId) return;
  const dictInputs = [...document.querySelectorAll("#dictationPicker input:not(:disabled)")];
  const lingoInputs = [...document.querySelectorAll("#lingoPicker input:not(:disabled)")];
  dictInputs.forEach((cb) => { cb.checked = false; });
  lingoInputs.forEach((cb) => { cb.checked = false; });

  if (presetName === "clear") {
    refreshPlanPreview();
    return;
  }

  const pickUpTo = (inputs, preferredIds, count) => {
    const picked = [];
    for (const id of preferredIds) {
      const match = inputs.find((cb) => cb.value === id);
      if (match && picked.length < count) {
        match.checked = true;
        picked.push(id);
      }
    }
    for (const cb of inputs) {
      if (picked.length >= count) break;
      if (!cb.checked) {
        cb.checked = true;
        picked.push(cb.value);
      }
    }
  };

  if (presetName === "balanced") {
    pickUpTo(dictInputs, ["D01", "D13", "D03", "D08", "D14"], 4);
    pickUpTo(lingoInputs, ["L01", "L02", "L05"], 2);
  } else if (presetName === "recognition") {
    const recD = dictInputs.filter((cb) => EXERCISE_FAMILIES[cb.value] === "recognition").map((cb) => cb.value);
    const recL = lingoInputs.filter((cb) => EXERCISE_FAMILIES[cb.value] === "recognition").map((cb) => cb.value);
    pickUpTo(dictInputs, recD, 4);
    pickUpTo(lingoInputs, recL, 2);
  } else if (presetName === "productive") {
    const prodD = dictInputs.filter((cb) => EXERCISE_FAMILIES[cb.value] === "productive").map((cb) => cb.value);
    const prodL = lingoInputs.filter((cb) => EXERCISE_FAMILIES[cb.value] === "productive").map((cb) => cb.value);
    pickUpTo(dictInputs, prodD, 4);
    pickUpTo(lingoInputs, prodL, 2);
  } else if (presetName === "exam") {
    pickUpTo(dictInputs, ["D03", "D02", "D18", "D07", "D24", "D01"], 4);
    pickUpTo(lingoInputs, ["L08", "L09", "L01"], 2);
  } else if (presetName === "families") {
    pickUpTo(dictInputs, ["D02", "D06", "D05", "D15", "D01"], 4);
    pickUpTo(lingoInputs, ["L07", "L03", "L04", "L01"], 2);
  }
  refreshPlanPreview();
}

function enterStep3() {
  renderExercisePickers();
  const profile = CLASS_PROFILES[$("classProfile").value];
  const features = analyzeVocabFeatures(getFormData());
  const needs = { D06: "hasSynonyms", L03: "hasSynonyms", D05: "hasAntonyms", L04: "hasAntonyms", L07: "hasDerivatives" };
  const stale = !currentPlan || !profile || getExerciseMode() === "custom"
    || currentPlan.dictationTypes.some((t) => !profile.allowDictation.includes(t) || (needs[t] && !features[needs[t]]))
    || currentPlan.lingoTypes.some((t) => !profile.allowLingo.includes(t) || (needs[t] && !features[needs[t]]));
  if (stale) refreshPlanPreview();
  showStep(3);
}

function goToStep(n) {
  if (n === currentStep) return;
  if (n >= 2) {
    const err = validateUnitSetup();
    if (err) {
      showStep(1);
      showSetupError(err);
      return;
    }
  }
  if (n === 4 && !currentData) {
    toast("Generate the worksheets first (or click 🎓 Sample Unit) to preview and export.", "info");
    return;
  }
  if (n === 3) enterStep3();
  else {
    showStep(n);
    if (n === 4) renderPreview();
  }
}

function showSetupError(err) {
  $("profileInfo").innerHTML = `<span class="inline-error">${escHtml(err)}</span>`;
}

function updateExerciseModeUi() {
  const custom = getExerciseMode() === "custom";
  $("exercisePicker").classList.toggle("hidden", !custom);
  $("randomMixControls")?.classList.toggle("hidden", custom);
  refreshPlanPreview();
}

function getExercisePlanOptions(forceRandom = false) {
  const vocabFeatures = analyzeVocabFeatures(getFormData());
  if (!forceRandom && getExerciseMode() === "custom") {
    return {
      exerciseMode: "custom",
      customDictationTypes: getSelectedExerciseTypes("dictation"),
      customLingoTypes: getSelectedExerciseTypes("lingo"),
      vocabFeatures,
    };
  }
  const dictationCount = Number($("randomDictCount")?.value || 0);
  const lingoCount = Number($("randomLingoCount")?.value || 0);
  return {
    exerciseMode: "random",
    vocabFeatures,
    ...(dictationCount > 0 ? { dictationCount } : {}),
    ...(lingoCount > 0 ? { lingoCount } : {}),
  };
}

function validateExercisePlan() {
  if (getExerciseMode() !== "custom") return null;
  const dict = getSelectedExerciseTypes("dictation");
  const lingo = getSelectedExerciseTypes("lingo");
  const features = analyzeVocabFeatures(getFormData());
  if (!dict.length) return "Choose at least one dictation exercise type.";
  if (!lingo.length) return "Choose at least one Lingo practice exercise type.";
  if (lingo.includes("L03") && !features.hasSynonyms) return "L03 (synonym match) needs at least one word with Synonyms enabled and filled in.";
  if (lingo.includes("L04") && !features.hasAntonyms) return "L04 (opposite pairs) needs at least one word with Antonyms enabled and filled in.";
  if (dict.includes("D06") && !features.hasSynonyms) return "D06 (synonym select) needs at least one word with synonyms in vocabulary.";
  if (dict.includes("D05") && !features.hasAntonyms) return "D05 (opposite match) needs at least one word with antonyms in vocabulary.";
  return null;
}

function getFormData() {
  const rows = [...document.querySelectorAll(".vocab-card")].map(readVocabRow).filter((r) => r.english);
  return {
    bookTitle: $("bookTitle").value.trim(),
    unit: $("unit").value,
    pageRange: $("pageRange").value.trim(),
    classProfile: $("classProfile").value,
    inputMode,
    vocabRows: rows,
    freeform: $("freeform").value.trim(),
    teacherHints: rows
      .filter((r) => {
        const t = r.fieldToggles || {};
        return (t.derivatives && r.derivatives) || (t.synonyms && r.synonyms) || (t.antonyms && r.antonyms);
      })
      .map((r) => ({ english: r.english, derivatives: r.derivatives, synonyms: r.synonyms, antonyms: r.antonyms })),
  };
}

function renderPlanPreviewHtml(plan) {
  const modeNote = plan.exerciseMode === "custom" ? " <em>(custom selection)</em>" : " <em>(smart mix)</em>";
  const dChips = plan.dictationTypes.map((t) => `<span class="plan-chip"><code>${escHtml(t)}</code> ${escHtml(EXERCISE_LABELS[t] || t)}</span>`).join("");
  const lChips = plan.lingoTypes.map((t) => `<span class="plan-chip"><code>${escHtml(t)}</code> ${escHtml(EXERCISE_LABELS[t] || t)}</span>`).join("");
  return `
    <div><strong>📝 ${plan.dictationExerciseCount} Dictation exercises</strong>${modeNote}</div>
    <div class="plan-chips-row">${dChips}</div>
    <div style="margin-top:0.55rem"><strong>🚀 ${plan.lingoPracticeCount} Lingo Launcher practice</strong>${modeNote}</div>
    <div class="plan-chips-row">${lChips}</div>
  `;
}

function refreshPlanPreview(forceRandom = false) {
  const profileId = $("classProfile").value;
  if (!profileId) {
    $("planPreview").textContent = "Select a class profile on Step 1 to preview exercise types.";
    currentPlan = null;
    updateContextSummary();
    return;
  }
  if (!forceRandom && getExerciseMode() === "custom"
    && (!getSelectedExerciseTypes("dictation").length || !getSelectedExerciseTypes("lingo").length)) {
    $("planPreview").textContent = "Tick at least one Dictation type and one Lingo type above (or click a Preset).";
    currentPlan = null;
    updateContextSummary();
    return;
  }
  currentPlan = pickGenerationPlan(profileId, { ...getExercisePlanOptions(forceRandom), forceRandom });
  $("planPreview").innerHTML = renderPlanPreviewHtml(currentPlan);
  updateContextSummary();
}

/* ═══════════════ Generate & Validation ════════════════════════════ */
function setGenStatus(msg, type = "info", withSpinner = false) {
  const el = $("genStatus");
  el.innerHTML = (withSpinner ? `<span class="gen-spinner"></span>` : "") + escHtml(msg);
  el.className = `status ${type}`;
  el.classList.remove("hidden");
}

function renderValidationPanel(val) {
  const report = buildValidationReport(val, currentData);
  if (report.valid) {
    return `<div class="validation-panel ok-panel"><p class="validation-intro"><span class="ok-badge">✓</span> ${escHtml(report.intro)}</p></div>`;
  }
  const { categories } = report;
  let sections = "";
  if (categories.quick.length) {
    sections += `<div class="validation-section">
      <h4>⚡ Quick fixes (instant, no AI)</h4>
      <ul>${categories.quick.map((i) => `<li>${escHtml(i.friendly)}</li>`).join("")}</ul>
    </div>`;
  }
  if (categories.items.length) {
    sections += `<div class="validation-section">
      <h4>✏️ Exercise lines to rewrite</h4>
      <ul>${categories.items.map((i) => `<li>${escHtml(i.friendly)}</li>`).join("")}</ul>
    </div>`;
  }
  if (report.coverageCount > 0) {
    sections += `<div class="validation-section">
      <h4>📋 Dictation coverage</h4>
      <p style="font-size:0.84rem;margin:0;color:var(--muted)">These words are not tested in dictation yet:</p>
      <div class="validation-coverage-words">${report.coverageWords.map((w) => `<span>${escHtml(w)}</span>`).join("")}</div>
    </div>`;
  }
  if (categories.manual.length) {
    sections += `<div class="validation-section">
      <h4>📝 May need a full regenerate</h4>
      <ul>${categories.manual.map((i) => `<li>${escHtml(i.friendly)}</li>`).join("")}</ul>
    </div>`;
  }

  const actions = [];
  if (report.quickCount > 0) actions.push(`<button type="button" class="btn btn-secondary" id="btnQuickFix">⚡ Apply ${report.quickCount} quick fix${report.quickCount === 1 ? "" : "es"}</button>`);
  if (report.itemCount > 0) actions.push(`<button type="button" class="btn btn-primary" id="btnFixValidation">✏️ Fix ${report.itemCount} line${report.itemCount === 1 ? "" : "s"} with AI</button>`);
  if (report.coverageCount > 0) actions.push(`<button type="button" class="btn btn-secondary" id="btnFixCoverage">📋 Fill dictation gaps with AI</button>`);
  const fixableTotal = report.quickCount + report.itemCount + report.coverageCount;
  if (fixableTotal > 1) actions.push(`<button type="button" class="btn btn-primary" id="btnFixAll">🔧 Fix all (${fixableTotal})</button>`);
  const actionHtml = actions.length
    ? `<div class="validation-actions">${actions.join("")}<p class="fix-hint">Keeps vocabulary and unchanged exercises as they are.</p></div>`
    : `<p class="fix-hint" style="margin-top:0.5rem">Use Regenerate Dictation / Lingo practice on Step 3, or click any line below to edit manually.</p>`;

  return `<div class="validation-panel">
    <p class="validation-intro">${escHtml(report.intro)}</p>
    ${sections}
    ${actionHtml}
  </div>`;
}

function renderPreview() {
  if (!currentData) return;
  if (currentData.meta) {
    currentData.meta.includeStudentHeader = !!previewOptions.studentHeader;
    currentData.meta.density = previewOptions.density;
  }
  const opts = {
    showAnswers: previewOptions.showAnswers,
    studentHeader: previewOptions.studentHeader,
    density: previewOptions.density,
  };
  if (previewTab === "lingo") {
    $("previewFrame").innerHTML = renderLingoLauncher(currentData, opts);
  } else if (previewTab === "dictation") {
    $("previewFrame").innerHTML = renderDictation(currentData, opts);
  } else {
    $("previewFrame").innerHTML = renderAnswerKey(currentData, opts);
  }
  decorateEditableItems();
  const val = validateWorksheet(currentData);
  $("validationPanel").innerHTML = renderValidationPanel(val);
  const dictOk = val.coverage?.dictation?.ok !== false;
  const lingoTested = val.coverage?.lingo?.testedCount ?? 0;
  const lingoTotal = val.coverage?.lingo?.totalHeadwords ?? currentData.lingoLauncher.vocabulary.length;
  $("coverageSummary").innerHTML = `Word coverage · <span class="${dictOk ? "cov-ok" : "cov-gap"}">${dictOk ? "every word is tested in Dictation" : "some words are not in Dictation yet"}</span>`;
  $("coveragePanel").innerHTML = `
    <p class="cov-note">Every unit word (and its synonyms, antonyms, derivatives) should appear in Dictation at least once.
      Lingo practice tests ${lingoTested} of ${lingoTotal} headwords — partial coverage is fine there.</p>
    <div class="cov-chips">${renderCoverageHeatmap(val.coverage, currentData.lingoLauncher.vocabulary)}</div>
    <p class="cov-legend"><span class="cov-chip cov-good">in Dictation</span><span class="cov-chip cov-warn">Lingo only</span><span class="cov-chip cov-bad">not tested</span></p>`;
  updateContextSummary();
}

/* ═══════════════ Live Item & Vocab Editor (Step 4) ════════════════ */
let editorTarget = null; // { sheet, exIndex, itemIndex }
let editorValidationTimer = null;
let vocabEditorIndex = null;

function getEditorExercise(sheet, exIndex) {
  if (!currentData) return null;
  const list = sheet === "lingo" ? currentData.lingoLauncher.practice : currentData.dictation.exercises;
  return list?.[exIndex] || null;
}

function decorateEditableItems() {
  const frame = $("previewFrame");
  const tip = $("previewTip");
  if (!frame) return;
  if (tip) tip.classList.toggle("hidden", previewTab === "answer");
  if (previewTab === "answer") return;

  // Decorate vocabulary cells on Lingo Launcher
  if (previewTab === "lingo") {
    frame.querySelectorAll(".vocab-table td.vocab-cell[data-vocab-num]").forEach((td) => {
      td.classList.add("editable-vocab");
      td.setAttribute("tabindex", "0");
      td.setAttribute("role", "button");
      const num = Number(td.dataset.vocabNum);
      td.setAttribute("aria-label", `Edit vocabulary word ${num}`);
    });
  }

  // Decorate exercise lines
  const blocks = frame.querySelectorAll(".ex-block");
  const sheet = previewTab;
  blocks.forEach((block, exIndex) => {
    const ex = getEditorExercise(sheet, exIndex);
    if (!ex) return;
    block.querySelectorAll(".ex-item").forEach((el, itemIndex) => {
      el.classList.add("editable");
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Edit exercise ${ex.number}, item ${ex.items?.[itemIndex]?.number ?? itemIndex + 1}`);
      el.dataset.editorSheet = sheet;
      el.dataset.editorEx = String(exIndex);
      el.dataset.editorItem = String(itemIndex);
    });
  });
}

/* ── Live Vocabulary Cell Editor ── */
function openVocabCellEditor(vocabIndex) {
  const vocabList = currentData?.lingoLauncher?.vocabulary;
  const entry = vocabList?.[vocabIndex];
  if (!entry) return;
  vocabEditorIndex = vocabIndex;
  $("vocabEditorTitle").textContent = `Edit Vocabulary Word #${entry.number || vocabIndex + 1}`;
  $("veEnglish").value = entry.english || "";
  $("veType").value = entry.type || "";
  $("veGreek").value = entry.greek || "";
  $("veEmojis").value = entry.emojis || "";
  $("veCollocation").value = entry.collocation || "";
  $("veDerivatives").value = entry.derivatives || "";
  $("veSynonyms").value = entry.synonyms || "";
  $("veAntonyms").value = entry.antonyms || "";
  openModal("vocabEditorModal");
  $("veEnglish").focus();
}

function saveVocabCellEditor() {
  if (vocabEditorIndex === null || !currentData) return;
  const entry = currentData.lingoLauncher?.vocabulary?.[vocabEditorIndex];
  if (!entry) return;
  const eng = $("veEnglish").value.trim();
  if (!eng) {
    toast("English word cannot be empty.", "error");
    return;
  }
  entry.english = eng;
  entry.type = $("veType").value.trim();
  entry.greek = $("veGreek").value.trim();
  entry.emojis = $("veEmojis").value.trim();
  entry.collocation = $("veCollocation").value.trim();
  entry.derivatives = $("veDerivatives").value.trim();
  entry.synonyms = $("veSynonyms").value.trim();
  entry.antonyms = $("veAntonyms").value.trim();

  // Sync back to Step 2 cards so Step 2 stays consistent
  const cards = [...document.querySelectorAll(".vocab-card")];
  const card = cards[vocabEditorIndex];
  if (card) {
    card.querySelector(".vr-english").value = entry.english;
    card.querySelector(".vr-type").value = entry.type;
    card.querySelector(".vr-greek").value = entry.greek;
    card.querySelector(".vr-emojis").value = entry.emojis;
    card.querySelector(".vr-coll").value = entry.collocation;
    card.querySelector(".vr-derivatives").value = entry.derivatives;
    card.querySelector(".vr-synonyms").value = entry.synonyms;
    card.querySelector(".vr-antonyms").value = entry.antonyms;
  }

  const val = validateWorksheet(currentData);
  try {
    currentSessionId = saveWorksheetSession(getFormData(), currentData, currentPlan, {
      updateId: currentSessionId,
      validation: val,
    });
  } catch { /* ignore */ }
  closeModal("vocabEditorModal");
  vocabEditorIndex = null;
  renderPreview();
  toast(`Updated vocabulary entry "${eng}".`, "ok");
}

/* ── Live Exercise Item Editor ── */
function openItemEditor(sheet, exIndex, itemIndex) {
  const ex = getEditorExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  editorTarget = { sheet, exIndex, itemIndex };

  $("itemEditorTitle").textContent = `${sheet === "lingo" ? "Lingo practice" : "Dictation"} — Exercise ${ex.number}`;
  const typeLabel = `${ex.typeId} · ${EXERCISE_LABELS[ex.typeId] || ex.typeId} · item ${item.number}`;
  $("itemEditorSub").textContent = ex.typeId === "D13"
    ? `${typeLabel} — matching letters are auto-assigned from the word bank`
    : typeLabel;
  $("itemPrompt").value = item.prompt || "";

  const showAnswer = ex.typeId !== "D13";
  $("itemAnswerWrap").classList.toggle("hidden", !showAnswer);
  if (showAnswer) $("itemAnswer").value = item.answer || "";

  const showStem = ex.typeId === "D02";
  $("itemStemWrap").classList.toggle("hidden", !showStem);
  if (showStem) $("itemStem").value = item.stem || "";

  const showTests = sheet === "dictation" && Array.isArray(item.testsWords);
  $("itemTestsWrap").classList.toggle("hidden", !showTests);
  if (showTests) $("itemTests").value = (item.testsWords || []).join(", ");

  const showBank = Array.isArray(ex.wordBank) && ex.wordBank.length > 0;
  $("itemBankWrap").classList.toggle("hidden", !showBank);
  if (showBank) $("itemBank").value = (ex.wordBank || []).join("\n");

  const showList = Array.isArray(ex.wordList) && ex.wordList.length > 0;
  $("itemListWrap").classList.toggle("hidden", !showList);
  if (showList) $("itemList").value = (ex.wordList || []).join("\n");

  runLiveEditorValidation();
  $("itemEditorModal").classList.remove("hidden");
  $("itemPrompt").focus();
}

function applyEditorValuesTo(clone) {
  if (!editorTarget) return clone;
  const cEx = editorTarget.sheet === "lingo"
    ? clone.lingoLauncher.practice[editorTarget.exIndex]
    : clone.dictation.exercises[editorTarget.exIndex];
  const cItem = cEx?.items?.[editorTarget.itemIndex];
  if (!cEx || !cItem) return clone;
  cItem.prompt = $("itemPrompt").value.trim();
  if (cEx.typeId !== "D13") cItem.answer = $("itemAnswer").value.trim();
  if (cEx.typeId === "D02") cItem.stem = $("itemStem").value.trim();
  if (!$("itemTestsWrap").classList.contains("hidden")) {
    cItem.testsWords = $("itemTests").value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!$("itemBankWrap").classList.contains("hidden")) {
    cEx.wordBank = $("itemBank").value.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  if (!$("itemListWrap").classList.contains("hidden")) {
    cEx.wordList = $("itemList").value.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  return clone;
}

function closeItemEditorModal() {
  clearTimeout(editorValidationTimer);
  editorTarget = null;
  $("itemEditorModal").classList.add("hidden");
}

function splitIssuesForLine(issues, data, target) {
  const list = target.sheet === "lingo" ? data.lingoLauncher.practice : data.dictation.exercises;
  const ex = list[target.exIndex];
  const item = ex?.items?.[target.itemIndex];
  if (!ex || !item) return { lineIssues: [], others: issues.length };
  const sheetWord = target.sheet === "lingo" ? "Lingo" : "Dictation";
  const re = new RegExp(`^${sheetWord} ex ${ex.number}\\b(?: \\([^)]*\\))? item ${item.number}:`, "i");
  const lineIssues = issues.filter((i) => re.test(i));
  return { lineIssues, others: issues.length - lineIssues.length };
}

function runLiveEditorValidation() {
  clearTimeout(editorValidationTimer);
  editorValidationTimer = setTimeout(() => {
    const el = $("itemEditorValidation");
    if (!el || !currentData || !editorTarget) return;
    try {
      const clone = applyEditorValuesTo(normalizeWorksheetExercises(JSON.parse(JSON.stringify(currentData))));
      const val = validateWorksheet(clone);
      const { lineIssues, others } = splitIssuesForLine(val.issues || [], clone, editorTarget);
      el.className = `editor-validation ${lineIssues.length ? "warn" : "ok"}`;
      const otherNote = others ? ` (${others} other note${others === 1 ? "" : "s"} elsewhere on the worksheet.)` : "";
      el.textContent = lineIssues.length
        ? `This line: ${lineIssues.map((i) => i.replace(/^.*?item \d+:\s*/i, "")).join(" · ")}${otherNote}`
        : `✓ This line looks good.${otherNote}`;
    } catch {
      el.className = "editor-validation warn";
      el.textContent = "Could not validate this edit.";
    }
  }, 250);
}

function saveItemEditor() {
  if (!editorTarget || !currentData) return;
  const { sheet, exIndex, itemIndex } = editorTarget;
  const ex = getEditorExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;

  applyEditorValuesTo(currentData);
  currentData = normalizeWorksheetExercises(currentData);
  const val = validateWorksheet(currentData);
  const form = getFormData();
  let saveError = null;
  try {
    currentSessionId = saveWorksheetSession(form, currentData, currentPlan, {
      updateId: currentSessionId,
      validation: val,
    });
  } catch (saveErr) {
    saveError = saveErr;
  }
  if (saveError) {
    toast(`Edit applied but History save failed: ${saveError.message}`, "error");
    closeItemEditorModal();
    renderPreview();
    return;
  }
  const flagged = val.issues?.length || 0;
  const msg = flagged ? `Item updated — ${flagged} validation note${flagged === 1 ? "" : "s"} remain.` : "Item updated — saved to History.";
  toast(msg, flagged ? "warn" : "ok");
  closeItemEditorModal();
  renderPreview();
}

function addItemAfterCurrent() {
  if (!editorTarget || !currentData) return;
  const { sheet, exIndex, itemIndex } = editorTarget;
  const ex = getEditorExercise(sheet, exIndex);
  if (!ex || !Array.isArray(ex.items)) return;
  applyEditorValuesTo(currentData);
  const newItem = {
    number: itemIndex + 2,
    prompt: "The ____ is ready.",
    answer: ex.items[itemIndex]?.answer || "",
    ...(ex.typeId === "D02" ? { stem: "WORD" } : {}),
    ...(sheet === "dictation" ? { testsWords: ex.items[itemIndex]?.testsWords ? [...ex.items[itemIndex].testsWords] : [] } : {}),
  };
  ex.items.splice(itemIndex + 1, 0, newItem);
  ex.items.forEach((it, idx) => { it.number = idx + 1; });
  currentData = normalizeWorksheetExercises(currentData);
  const val = validateWorksheet(currentData);
  try {
    currentSessionId = saveWorksheetSession(getFormData(), currentData, currentPlan, {
      updateId: currentSessionId,
      validation: val,
    });
  } catch { /* ignore */ }
  renderPreview();
  openItemEditor(sheet, exIndex, itemIndex + 1);
  toast("Added a new item line — edit its prompt and answer.", "info");
}

function deleteCurrentItem() {
  if (!editorTarget || !currentData) return;
  const { sheet, exIndex, itemIndex } = editorTarget;
  const ex = getEditorExercise(sheet, exIndex);
  if (!ex || !Array.isArray(ex.items)) return;
  if (ex.items.length <= 1) {
    toast("An exercise must have at least one item.", "warn");
    return;
  }
  ex.items.splice(itemIndex, 1);
  ex.items.forEach((it, idx) => { it.number = idx + 1; });
  currentData = normalizeWorksheetExercises(currentData);
  const val = validateWorksheet(currentData);
  try {
    currentSessionId = saveWorksheetSession(getFormData(), currentData, currentPlan, {
      updateId: currentSessionId,
      validation: val,
    });
  } catch { /* ignore */ }
  closeItemEditorModal();
  renderPreview();
  toast("Deleted item line and renumbered exercise.", "ok");
}

/* ═══════════════ Classroom Projector Mode ════════════════════════ */
function openClassroomMode() {
  if (!currentData) {
    toast("Generate or load a unit first to use Classroom Mode.", "warn");
    return;
  }
  classroomSheet = previewTab;
  const meta = currentData.meta || {};
  $("classroomUnitLabel").textContent = `${meta.bookTitle || "Unit"} · Unit ${meta.unit || ""} (p. ${meta.pageRange || ""})`;
  document.querySelectorAll(".cr-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.crSheet === classroomSheet);
  });
  renderClassroomStage();
  $("classroomModal").classList.remove("hidden");
}

function renderClassroomStage() {
  if (!currentData) return;
  const stage = $("classroomStage");
  stage.style.setProperty("--cr-scale", `${classroomZoom}pt`);
  if (classroomSheet === "answer") {
    stage.innerHTML = renderAnswerKey(currentData);
    $("crRevealAll").classList.add("hidden");
    return;
  }
  $("crRevealAll").classList.remove("hidden");
  $("crRevealAll").textContent = "👁️ Reveal All Answers";
  const opts = { showAnswers: true, studentHeader: false, density: "comfortable" };
  stage.innerHTML = classroomSheet === "lingo"
    ? renderLingoLauncher(currentData, opts)
    : renderDictation(currentData, opts);
  stage.querySelectorAll(".ex-item").forEach((itemEl) => {
    itemEl.classList.add("cr-interactive");
    itemEl.setAttribute("title", "Click to reveal / hide answer");
  });
}

function toggleClassroomRevealAll() {
  const stage = $("classroomStage");
  const items = [...stage.querySelectorAll(".ex-item.cr-interactive")];
  if (!items.length) return;
  const allRevealed = items.every((el) => el.classList.contains("revealed"));
  items.forEach((el) => el.classList.toggle("revealed", !allRevealed));
  $("crRevealAll").textContent = allRevealed ? "👁️ Reveal All Answers" : "🙈 Hide All Answers";
}

/* ═══════════════ Sample Unit Loader (Zero API Key Demo) ══════════ */
function loadSampleUnit() {
  const sample = getSampleUnitData();
  applyFormToUi(sample.form, { restorePlan: sample.plan });
  currentData = normalizeWorksheetExercises(JSON.parse(JSON.stringify(sample.data)));
  currentPlan = sample.plan;
  const val = validateWorksheet(currentData);
  try {
    currentSessionId = saveWorksheetSession(sample.form, currentData, currentPlan, {
      updateId: null,
      validation: val,
    });
  } catch { /* ignore */ }
  $("regenDictation").disabled = false;
  $("regenLingo").disabled = false;
  $("toStep4").classList.remove("hidden");
  closeModal("helpModal");
  showStep(4);
  renderPreview();
  toast("🎓 Sample C Senior unit loaded! Try clicking lines to edit, Classroom Mode, or Export.", "ok", 5500);
}

/* ═══════════════ Validation & AI Fixes ═══════════════════════════ */
function validateUnitSetup() {
  if (!$("bookTitle").value.trim()) return "Enter a book title.";
  if (!$("classProfile").value) return "Select a class profile.";
  if (!$("unit").value) return "Enter a unit number.";
  if (!$("pageRange").value.trim()) return "Enter a page range.";
  return null;
}

async function saveAfterFix(message, validation) {
  const form = getFormData();
  try {
    currentSessionId = saveWorksheetSession(form, currentData, currentPlan, {
      updateId: currentSessionId,
      validation,
    });
  } catch (saveErr) {
    setGenStatus(`Fixed but not saved: ${saveErr.message}`, "error");
    renderPreview();
    return false;
  }
  setGenStatus(message, validation.valid ? "ok" : "error");
  toast(message, validation.valid ? "ok" : "warn");
  renderPreview();
  return true;
}

async function runQuickFix() {
  if (!currentData) return;
  const btn = $("btnQuickFix");
  if (btn) btn.disabled = true;
  setGenStatus("Applying quick fixes…", "info", true);
  currentData = applyQuickWorksheetFixes(currentData);
  const val = validateWorksheet(currentData);
  await saveAfterFix(
    countQuickFixIssues(val.issues) === 0 ? "Quick fixes applied." : "Quick fixes applied — some notes remain.",
    val
  );
}

async function runFixValidationItems() {
  const apiKey = localStorage.getItem(API_KEY_KEY);
  if (!apiKey) {
    setGenStatus("Add your DeepSeek API key in Settings.", "error");
    openSettings();
    return;
  }
  if (!currentData) return;
  const form = getFormData();
  const val = validateWorksheet(currentData);
  const btn = $("btnFixValidation");
  if (btn) btn.disabled = true;
  setGenStatus("Fixing problem lines only…", "info", true);
  try {
    const result = await fixWorksheetValidationIssues(form, apiKey, currentData, val);
    currentData = result.data;
    await saveAfterFix(result.message, result.validation);
  } catch (e) {
    setGenStatus(e.message || String(e), "error");
    if ($("btnFixValidation")) $("btnFixValidation").disabled = false;
  }
}

async function runFixCoverage() {
  const apiKey = localStorage.getItem(API_KEY_KEY);
  if (!apiKey) {
    setGenStatus("Add your DeepSeek API key in Settings.", "error");
    openSettings();
    return;
  }
  if (!currentData) return;
  const form = getFormData();
  const val = validateWorksheet(currentData);
  const btn = $("btnFixCoverage");
  if (btn) btn.disabled = true;
  setGenStatus("Filling dictation coverage gaps…", "info", true);
  try {
    const result = await fixDictationCoverageGaps(form, apiKey, currentData, val);
    currentData = result.data;
    await saveAfterFix(result.message, result.validation);
  } catch (e) {
    setGenStatus(e.message || String(e), "error");
    if ($("btnFixCoverage")) $("btnFixCoverage").disabled = false;
  }
}

async function runFixAll() {
  const apiKey = localStorage.getItem(API_KEY_KEY);
  if (!apiKey) {
    setGenStatus("Add your DeepSeek API key in Settings.", "error");
    openSettings();
    return;
  }
  if (!currentData) return;
  const form = getFormData();
  const val = validateWorksheet(currentData);
  const btn = $("btnFixAll");
  if (btn) btn.disabled = true;
  setGenStatus("Fixing everything we can…", "info", true);
  try {
    const result = await fixAllWorksheetIssues(form, apiKey, currentData, val);
    currentData = result.data;
    await saveAfterFix(result.message, result.validation);
  } catch (e) {
    setGenStatus(e.message || String(e), "error");
    if ($("btnFixAll")) $("btnFixAll").disabled = false;
  }
}

async function runGenerate(mode = "full") {
  if (generateBusy) return;
  const apiKey = localStorage.getItem(API_KEY_KEY);
  if (!apiKey) {
    setGenStatus("Add your DeepSeek API key in Settings.", "error");
    openSettings();
    return;
  }
  const setupErr = validateUnitSetup();
  if (setupErr) {
    setGenStatus(setupErr, "error");
    showStep(1);
    return;
  }
  const planErr = validateExercisePlan();
  if (planErr) {
    setGenStatus(planErr, "error");
    return;
  }
  const form = getFormData();
  if (!currentPlan || getExerciseMode() === "custom") refreshPlanPreview();
  const customPlan = getExerciseMode() === "custom" ? currentPlan : null;
  const label = mode === "dictation" ? "Rewriting the Dictation sheet" : mode === "lingo" ? "Rewriting Lingo practice" : "Creating your worksheets";
  generateBusy = true;
  setConn("busy", "generating…");
  const started = Date.now();
  const tick = () => setGenStatus(`${label}… ${Math.round((Date.now() - started) / 1000)}s (usually 30–90 seconds)`, "info", true);
  tick();
  const timer = setInterval(tick, 1000);
  setBusyButtons(true);
  try {
    let result;
    if (mode === "dictation" && currentData) result = await regenerateDictationOnly(form, apiKey, currentData, { plan: customPlan });
    else if (mode === "lingo" && currentData) result = await regenerateLingoPracticeOnly(form, apiKey, currentData, { plan: customPlan });
    else result = await generateWorksheets(form, apiKey, { plan: currentPlan });
    currentData = normalizeWorksheetExercises(result.data);
    currentPlan = result.plan;
    const val = validateWorksheet(currentData);
    clearInterval(timer);
    setConn("on", "ready");
    $("toStep4").classList.remove("hidden");
    try {
      currentSessionId = saveWorksheetSession(form, currentData, currentPlan, {
        updateId: currentSessionId,
        validation: val,
      });
      initBookPresets();
    } catch (saveErr) {
      setGenStatus(`Generated but not saved: ${saveErr.message}`, "error");
      renderPreview();
      return;
    }
    const msg = val.valid
      ? "Done! Saved to History — ready to export."
      : `Saved to History with ${val.issues.length} note${val.issues.length === 1 ? "" : "s"} — review them on the Preview step.`;
    setGenStatus(msg, val.valid ? "ok" : "warn");
    toast(val.valid ? "Worksheets generated and saved." : "Generated with notes — see the review panel.", val.valid ? "ok" : "warn");
    showStep(4);
    renderPreview();
  } catch (e) {
    clearInterval(timer);
    setGenStatus(e.message || String(e), "error");
    setConn("off", "error");
  } finally {
    clearInterval(timer);
    generateBusy = false;
    setBusyButtons(false);
  }
}

function setBusyButtons(busy) {
  $("btnGenerate").disabled = busy;
  $("regenDictation").disabled = busy || !currentData;
  $("regenLingo").disabled = busy || !currentData;
  $("fillAllVocab").disabled = busy;
}

/* ═══════════════ Session Restore & History Library ═══════════════ */
function applyFormToUi(form, { restorePlan = null } = {}) {
  $("bookTitle").value = form.bookTitle || "";
  $("unit").value = form.unit ?? "";
  $("pageRange").value = form.pageRange || "";
  $("classProfile").value = form.classProfile || "";
  updateProfileInfo();
  inputMode = form.inputMode || "structured";
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === inputMode));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${inputMode}`));
  $("freeform").value = form.freeform || "";
  $("vocabRows").innerHTML = "";
  if (form.vocabRows?.length) form.vocabRows.forEach((row) => addVocabRow(row));
  else initVocabRows();
  renderExercisePickers();
  if (restorePlan) {
    currentPlan = restorePlan;
    const isCustom = restorePlan.exerciseMode === "custom";
    document.querySelector(`input[name="exerciseMode"][value="${isCustom ? "custom" : "random"}"]`).checked = true;
    $("exercisePicker").classList.toggle("hidden", !isCustom);
    $("randomMixControls")?.classList.toggle("hidden", isCustom);
    if (isCustom) {
      document.querySelectorAll("#dictationPicker input, #lingoPicker input").forEach((cb) => { cb.checked = false; });
      restorePlan.dictationTypes.forEach((id) => {
        const cb = document.querySelector(`#dictationPicker input[value="${id}"]`);
        if (cb) cb.checked = true;
      });
      restorePlan.lingoTypes.forEach((id) => {
        const cb = document.querySelector(`#lingoPicker input[value="${id}"]`);
        if (cb) cb.checked = true;
      });
    }
    $("planPreview").innerHTML = renderPlanPreviewHtml(restorePlan);
  } else {
    refreshPlanPreview();
  }
  refreshCoursebookPanel({ triggerAutoAssign: false, sourceEvent: "restore" });
  updateContextSummary();
}

function loadSession(id, targetStep = 4) {
  const session = getSavedSession(id);
  if (!session) {
    setGenStatus("Save not found — it may have been deleted.", "error");
    return;
  }
  applyFormToUi(session.form, { restorePlan: session.plan });
  currentData = normalizeWorksheetExercises(JSON.parse(JSON.stringify(session.data)));
  currentPlan = session.plan;
  currentSessionId = session.id;
  $("regenDictation").disabled = false;
  $("regenLingo").disabled = false;
  $("toStep4").classList.remove("hidden");
  $("historyModal").classList.add("hidden");
  showStep(targetStep);
  if (targetStep === 4) renderPreview();
  setGenStatus(`Loaded ${session.label} (p. ${session.pageRange}).`, "ok");
}

function duplicateSession(id) {
  const session = id ? getSavedSession(id) : (currentData ? { form: getFormData(), data: currentData, plan: currentPlan } : null);
  if (!session) return;
  const clonedForm = JSON.parse(JSON.stringify(session.form || {}));
  const clonedData = normalizeWorksheetExercises(JSON.parse(JSON.stringify(session.data)));
  const clonedPlan = JSON.parse(JSON.stringify(session.plan || currentPlan || {}));
  clonedForm.bookTitle = `${clonedForm.bookTitle || "Unit"} (Copy)`;
  if (clonedData.meta) clonedData.meta.bookTitle = clonedForm.bookTitle;
  const val = validateWorksheet(clonedData);
  const newId = saveWorksheetSession(clonedForm, clonedData, clonedPlan, { validation: val });
  loadSession(newId, 1);
  toast("Duplicated unit! You can now change the Class Level or tweak words.", "ok");
}

function renderHistoryModal() {
  if (!isLocalStorageWritable()) {
    $("historyContent").innerHTML = `<p style="color:var(--bad)">Saved worksheets need storage access.</p>`;
    return;
  }
  const allSaves = getAllSavedSessions();
  const query = ($("historySearch")?.value || "").trim().toLowerCase();
  const classFilter = $("historyClassFilter")?.value || "";
  const saves = allSaves.filter((s) => {
    if (classFilter && s.profileId !== classFilter) return false;
    if (!query) return true;
    const hay = `${s.label || ""} ${s.bookTitle || ""} ${s.pageRange || ""} ${s.signature || ""}`.toLowerCase();
    return hay.includes(query);
  });

  if (!allSaves.length) {
    $("historyContent").innerHTML = `<div class="history-empty"><span class="big">🗂️</span>No saved worksheets yet. Generate a unit or load the Sample Unit — it saves automatically.</div>`;
    return;
  }
  if (!saves.length) {
    $("historyContent").innerHTML = `<div class="history-empty">No worksheets match your search filter.</div>`;
    return;
  }
  $("historyContent").innerHTML = saves.map((s) => {
    const profile = CLASS_PROFILES[s.profileId];
    const when = new Date(s.savedAt).toLocaleString();
    const note = s.validationOk === false
      ? `<span class="history-meta" style="color:var(--amber-ink)">⚠️ Has validation notes</span>`
      : `<span class="history-meta" style="color:var(--good)">✓ Validated</span>`;
    return `<article class="history-entry" data-id="${escHtml(s.id)}">
      <div class="history-entry-main">
        <strong>${escHtml(s.label)}</strong>
        <span class="history-meta">p. ${escHtml(s.pageRange)} · ${escHtml(profile?.label || s.profileId)} (${escHtml(profile?.cefr || "")})</span>
        ${note}
        <code class="history-sig">${escHtml(s.signature)}</code>
        <small style="color:var(--muted)">${escHtml(when)}</small>
      </div>
      <div class="history-entry-actions">
        <button type="button" class="btn btn-primary btn-sm hist-load">Load</button>
        <button type="button" class="btn btn-secondary btn-sm hist-edit">Edit Words</button>
        <button type="button" class="btn btn-soft btn-sm hist-dup" title="Duplicate unit">Duplicate</button>
        <button type="button" class="icon-btn btn-sm hist-del" title="Delete">✕</button>
      </div>
    </article>`;
  }).join("");
}

function exportHistoryBackup() {
  const saves = getAllSavedSessions() || [];
  if (!saves.length) {
    toast("No saved worksheets to back up yet.", "warn");
    return;
  }
  const payload = JSON.stringify({
    app: "Vocab Master",
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    sessions: saves,
  }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Vocab-Master-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exported backup of ${saves.length} worksheet${saves.length === 1 ? "" : "s"}.`, "ok");
}

function importHistoryBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.sessions) ? parsed.sessions : []);
      if (!incoming.length) {
        toast("No valid worksheet sessions found in this backup file.", "error");
        return;
      }
      const existing = getAllSavedSessions() || [];
      const byId = new Map(existing.map((s) => [s.id, s]));
      incoming.forEach((s) => {
        if (s && s.id && s.data && s.form) byId.set(s.id, s);
      });
      const merged = [...byId.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(merged));
      renderHistoryModal();
      updateHistoryBadge();
      initBookPresets();
      toast(`Restored ${incoming.length} worksheet(s) into History.`, "ok");
    } catch (err) {
      toast(`Backup import failed: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}

/* ═══════════════ Confirm dialog & Modals ═════════════════════════ */
let pendingConfirm = null;

function confirmDialog({ title = "Are you sure?", body = "This action cannot be undone.", okLabel = "Delete" }) {
  settleConfirm(false);
  return new Promise((resolve) => {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
    $("confirmOk").textContent = okLabel;
    pendingConfirm = resolve;
    openModal("confirmModal");
    $("confirmCancel").focus();
  });
}

function settleConfirm(value) {
  const resolve = pendingConfirm;
  pendingConfirm = null;
  $("confirmModal").classList.add("hidden");
  if (resolve) resolve(value);
}

function openModal(id) {
  $(id)?.classList.remove("hidden");
}

function closeModal(id) {
  if (id === "confirmModal") settleConfirm(false);
  else if (id === "itemEditorModal") closeItemEditorModal();
  else $(id)?.classList.add("hidden");
}

/* ═══════════════ Export Helpers & Full Unit Pack ═════════════════ */
function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

function savedToast(filePath, customLabel = null) {
  const d = desktop();
  const name = customLabel || String(filePath).split(/[\\/]/).pop();
  const actions = d?.openPath ? [
    { label: "Open", run: () => d.openPath(filePath) },
    { label: "Show in folder", run: () => d.showItemInFolder(filePath) },
  ] : [];
  toast(`Saved ${name}`, "ok", 6500, actions);
}

async function runDocxExport(type, btn) {
  if (!currentData) return;
  if (currentData.meta) {
    currentData.meta.includeStudentHeader = !!previewOptions.studentHeader;
    currentData.meta.density = previewOptions.density;
  }
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> Saving…`;
  const sheetName = type === "lingo" ? "Lingo Launcher" : type === "dictation" ? "Dictation" : "Answer Key";
  const filename = safeFileName(`${sheetName}, ${fileBaseName(currentData.meta)}.docx`);
  const d = desktop();
  try {
    if (d?.saveDocx) {
      const res = await d.saveDocx({ type, data: currentData, filename });
      if (res.ok) savedToast(res.path);
      else if (!res.canceled) toast("Word export failed: " + (res.error || "unknown error"), "error");
    } else {
      await exportDocx(type, currentData, filename);
    }
  } catch (e) {
    toast("Download failed: " + (e.message || e), "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
}

function buildPdfHtml(sheet) {
  const opts = {
    showAnswers: false,
    studentHeader: previewOptions.studentHeader,
    density: previewOptions.density,
  };
  const bodyHtml = sheet === "lingo"
    ? renderLingoLauncher(currentData, opts)
    : sheet === "dictation"
      ? renderDictation(currentData, opts)
      : renderAnswerKey(currentData, opts);
  const title = sheet === "lingo" ? "Lingo Launcher" : sheet === "dictation" ? "Dictation" : "Answer Key";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>${WORKSHEET_PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

async function runPdfExport(sheet, btn) {
  const d = desktop();
  if (!currentData) return;
  if (!d) {
    // Browser fallback: open print window so user can Save as PDF
    openWorksheetPrint(currentData, sheet, {
      studentHeader: previewOptions.studentHeader,
      density: previewOptions.density,
    });
    return;
  }
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> Saving…`;
  try {
    const base = sheet === "answer" ? "Answer Key" : sheet === "lingo" ? "Lingo Launcher" : "Dictation";
    const filename = safeFileName(`${base}, ${fileBaseName(currentData.meta)}.pdf`);
    const res = await d.exportPdf({ html: buildPdfHtml(sheet), filename });
    if (res.ok) savedToast(res.path);
    else if (!res.canceled) toast(res.error || "PDF export failed.", "error");
  } catch (e) {
    toast("PDF export failed: " + (e.message || e), "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
}

async function runFullPackExport() {
  if (!currentData) return;
  if (currentData.meta) {
    currentData.meta.includeStudentHeader = !!previewOptions.studentHeader;
    currentData.meta.density = previewOptions.density;
  }
  const btn = $("btnExportPack");
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> Exporting Pack…`;
  const d = desktop();
  try {
    const baseSlug = safeFileName(fileBaseName(currentData.meta));
    if (d?.exportPack) {
      const htmlPages = {
        lingo: buildPdfHtml("lingo"),
        dictation: buildPdfHtml("dictation"),
        answer: buildPdfHtml("answer"),
      };
      const res = await d.exportPack({ data: currentData, baseSlug, htmlPages });
      if (res.ok) {
        savedToast(res.folder, `Unit Pack (${res.files.length} files)`);
      } else if (!res.canceled) {
        toast("Pack export failed: " + (res.error || "unknown error"), "error");
      }
    } else {
      // Browser fallback: download all 3 Word files sequentially
      await exportDocx("lingo", currentData, safeFileName(`Lingo Launcher, ${baseSlug}.docx`));
      await exportDocx("dictation", currentData, safeFileName(`Dictation, ${baseSlug}.docx`));
      await exportDocx("answer", currentData, safeFileName(`Answer Key, ${baseSlug}.docx`));
      toast("Downloaded Lingo Launcher, Dictation, and Answer Key (.docx)!", "ok");
    }
  } catch (e) {
    toast("Unit Pack export failed: " + (e.message || e), "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
}

/* ═══════════════ New worksheet ════════════════════════════════════ */
function newWorksheet() {
  if (generateBusy) {
    toast("Please wait for the current generation to finish.", "warn");
    return;
  }
  currentData = null;
  currentPlan = null;
  currentSessionId = null;
  $("unit").value = "";
  $("pageRange").value = "";
  $("freeform").value = "";
  initVocabRows();
  $("vocabFillStatus").classList.add("hidden");
  $("genStatus").classList.add("hidden");
  $("toStep4").classList.add("hidden");
  $("previewFrame").innerHTML = "";
  $("validationPanel").innerHTML = "";
  $("coveragePanel").innerHTML = "";
  setBusyButtons(false);
  renderExercisePickers();
  refreshPlanPreview();
  refreshCoursebookPanel({ triggerAutoAssign: false, sourceEvent: "new" });
  showStep(1);
  setConn("on", "ready");
  toast("New worksheet started — previous work is safely stored in History.", "info");
}

/* ═══════════════ Settings ═════════════════════════════════════════ */
function openSettings() {
  $("apiKey").value = localStorage.getItem(API_KEY_KEY) || "";
  $("apiKey").classList.remove("visible");
  $("apiKey").type = "password";
  $("keyStatus").className = "key-status hidden";
  openModal("settingsModal");
  $("apiKey").focus();
}

async function testApiKey() {
  const d = desktop();
  const key = $("apiKey").value.trim();
  const out = $("keyStatus");
  const show = (cls, text) => { out.className = `key-status ${cls}`; out.textContent = text; };
  if (!key) return show("error", "Paste your key first (it starts with sk-).");
  const btn = $("testApiKey");
  btn.disabled = true;
  show("info", "Checking with DeepSeek…");
  try {
    let res;
    if (d?.balance) {
      res = await d.balance(key);
    } else {
      const r = await realFetch("/user/balance", { headers: { Authorization: `Bearer ${key}` } });
      res = { status: r.status, body: await r.text() };
    }
    if (res.status === 200) {
      const body = JSON.parse(res.body || "{}");
      const info = (body.balance_infos || [])[0];
      const bal = info ? ` · balance ${info.total_balance} ${info.currency}` : "";
      show(body.is_available === false ? "warn" : "ok",
        body.is_available === false ? `Key works, but the balance is empty — top up to generate${bal}.` : `Key works${bal}.`);
    } else if (res.status === 401) show("error", "DeepSeek rejected this key — check you copied all of it.");
    else if (res.status === 502) show("error", "Could not reach DeepSeek — check your internet connection.");
    else show("error", `DeepSeek answered with an error (${res.status}).`);
  } catch (e) {
    show("error", e.message || String(e));
  } finally {
    btn.disabled = false;
  }
}

/* ═══════════════ Wiring ═══════════════════════════════════════════ */
function wireUi() {
  $("btnTheme").addEventListener("click", toggleTheme);
  $("btnNew").addEventListener("click", newWorksheet);

  // Sample unit & Help guide
  $("btnLoadSample")?.addEventListener("click", loadSampleUnit);
  $("btnSampleStep1")?.addEventListener("click", loadSampleUnit);
  $("btnHelpLoadSample")?.addEventListener("click", loadSampleUnit);
  $("btnHelp")?.addEventListener("click", () => openModal("helpModal"));
  $("closeHelp")?.addEventListener("click", () => closeModal("helpModal"));
  $("closeHelpBtn")?.addEventListener("click", () => closeModal("helpModal"));

  // Stepper & step navigation
  $("toStep2").addEventListener("click", () => goToStep(2));
  document.querySelectorAll(".stepper .step").forEach((btn) => {
    btn.addEventListener("click", () => goToStep(Number(btn.dataset.step)));
  });
  ["bookTitle", "unit", "pageRange"].forEach((id) => $(id).addEventListener("input", () => {
    if ($("profileInfo").querySelector(".inline-error")) updateProfileInfo();
    const sourceEvent = id === "bookTitle" ? "bookTitle" : id === "unit" ? "unitInput" : "pageRange";
    refreshCoursebookPanel({ triggerAutoAssign: true, sourceEvent });
    updateContextSummary();
  }));
  $("btnNextUnit")?.addEventListener("click", () => {
    const cur = parseInt($("unit").value, 10);
    $("unit").value = Number.isFinite(cur) && cur >= 1 ? String(cur + 1) : "1";
    $("unit").dispatchEvent(new Event("input", { bubbles: true }));
  });

  // Coursebook Smart Panel (Step 1) & Step 2 Coursebook Bar
  $("cbUnitPills")?.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-cb-unit]");
    if (!pill) return;
    $("unit").value = pill.dataset.cbUnit;
    $("pageRange").value = "";
    refreshCoursebookPanel({ triggerAutoAssign: true, sourceEvent: "unitPill" });
  });
  $("cbSectionPills")?.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-sec-pages]");
    if (!pill) return;
    $("pageRange").value = pill.dataset.secPages || "";
    refreshCoursebookPanel({ triggerAutoAssign: true, sourceEvent: "sectionPill" });
  });
  ["cbIncludeSb", "cbIncludeWb", "cbWbScope", "cbIncludeEnriched", "cbHideBasic", "cbAssignLimit", "cbAutoAssign"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      refreshCoursebookPanel({ triggerAutoAssign: true, sourceEvent: "filter" });
    });
  });
  $("btnCbAssignNow")?.addEventListener("click", () => {
    if (!lastCoursebookQuery) return;
    assignWordsToStudio(getEffectiveAssignList(lastCoursebookQuery));
  });
  $("btnCbSelectAll")?.addEventListener("click", () => {
    if (!lastCoursebookQuery?.words?.length) return;
    assignWordsToStudio(lastCoursebookQuery.words);
  });
  $("cbWordSearch")?.addEventListener("input", () => renderCoursebookWordChips());
  $("cbWordChips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".cb-word-chip");
    if (!chip) return;
    const wrap = $("cbWordChips");
    const idx = Number(chip.dataset.cbIdx);
    const word = wrap?._filteredWords?.[idx];
    if (word) toggleSingleCoursebookWordInStudio(word);
  });
  $("cbStep2WbToggle")?.addEventListener("change", (e) => {
    if ($("cbIncludeWb")) $("cbIncludeWb").checked = e.target.checked;
    refreshCoursebookPanel({ triggerAutoAssign: true, sourceEvent: "step2Toggle" });
  });
  $("cbStep2EnrichedToggle")?.addEventListener("change", (e) => {
    if ($("cbIncludeEnriched")) $("cbIncludeEnriched").checked = e.target.checked;
    refreshCoursebookPanel({ triggerAutoAssign: true, sourceEvent: "step2Toggle" });
  });
  $("btnStep2ResyncCb")?.addEventListener("click", () => {
    if (!lastCoursebookQuery) return;
    assignWordsToStudio(getEffectiveAssignList(lastCoursebookQuery));
  });
  $("btnStep2EditUnit")?.addEventListener("click", () => {
    showStep(1);
    $("coursebookSmartPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("backStep1").addEventListener("click", () => showStep(1));
  $("toStep3").addEventListener("click", enterStep3);
  $("backStep2").addEventListener("click", () => showStep(2));
  $("toStep4").addEventListener("click", () => { showStep(4); renderPreview(); });
  $("backStep3").addEventListener("click", () => showStep(3));

  // Step 2 tabs & Vocabulary Studio tools
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      inputMode = t.dataset.tab;
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${t.dataset.tab}`));
      updateContextSummary();
    });
  });

  $("addVocabRow").addEventListener("click", () => {
    const c = addVocabRow();
    c.querySelector(".vr-english")?.focus();
  });
  $("addFiveVocabRows")?.addEventListener("click", () => {
    for (let i = 0; i < 5; i++) addVocabRow();
  });
  $("fillAllVocab").addEventListener("click", () => fillVocabCards([...document.querySelectorAll(".vocab-card")]));

  $("btnOpenBulkImport")?.addEventListener("click", () => {
    updateBulkImportPreview();
    openModal("bulkImportModal");
    $("bulkImportText")?.focus();
  });
  $("bulkImportText")?.addEventListener("input", updateBulkImportPreview);
  $("confirmBulkImport")?.addEventListener("click", runBulkImport);
  $("cancelBulkImport")?.addEventListener("click", () => closeModal("bulkImportModal"));
  $("closeBulkImport")?.addEventListener("click", () => closeModal("bulkImportModal"));

  $("btnSortVocab")?.addEventListener("click", sortVocabRowsAlphabetically);
  $("btnCleanEmptyVocab")?.addEventListener("click", cleanEmptyVocabRows);
  $("btnToggleVocabCompact")?.addEventListener("click", () => {
    vocabCompactMode = !vocabCompactMode;
    $("vocabRows").classList.toggle("compact-cards", vocabCompactMode);
    $("btnToggleVocabCompact").textContent = vocabCompactMode ? "📐 Detailed View" : "📐 Compact View";
  });

  $("batchFieldToggles")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-batch-field]");
    if (!btn) return;
    toggleBatchField(btn.dataset.batchField);
  });

  // Step 3 Exercise Architect
  $("shufflePlan").addEventListener("click", () => refreshPlanPreview(true));
  $("randomDictCount")?.addEventListener("change", () => refreshPlanPreview(true));
  $("randomLingoCount")?.addEventListener("change", () => refreshPlanPreview(true));
  document.querySelectorAll('input[name="exerciseMode"]').forEach((r) => r.addEventListener("change", updateExerciseModeUi));
  $("exercisePicker").addEventListener("change", () => refreshPlanPreview());

  $("exercisePresetBar")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    applyExercisePreset(btn.dataset.preset);
  });

  $("exerciseFamilyFilter")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-family]");
    if (!btn) return;
    activeFamilyFilter = btn.dataset.family;
    document.querySelectorAll("#exerciseFamilyFilter .chip-filter").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll("#dictationPicker .exercise-card, #lingoPicker .exercise-card").forEach((card) => {
      const match = activeFamilyFilter === "all" || card.dataset.family === activeFamilyFilter;
      card.classList.toggle("hidden", !match);
    });
  });

  $("btnGenerate").addEventListener("click", () => runGenerate("full"));
  $("regenDictation").addEventListener("click", () => runGenerate("dictation"));
  $("regenLingo").addEventListener("click", () => runGenerate("lingo"));

  // Step 4 Preview, Teacher View Bar & Export
  $("validationPanel").addEventListener("click", (e) => {
    const id = e.target.id;
    if (id === "btnQuickFix") runQuickFix();
    else if (id === "btnFixValidation") runFixValidationItems();
    else if (id === "btnFixCoverage") runFixCoverage();
    else if (id === "btnFixAll") runFixAll();
  });

  document.querySelectorAll(".preview-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      previewTab = btn.dataset.preview;
      document.querySelectorAll(".preview-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderPreview();
    });
  });

  $("toggleShowAnswers")?.addEventListener("change", (e) => {
    previewOptions.showAnswers = e.target.checked;
    renderPreview();
  });
  $("toggleStudentHeader")?.addEventListener("change", (e) => {
    previewOptions.studentHeader = e.target.checked;
    renderPreview();
  });
  $("selectDensity")?.addEventListener("change", (e) => {
    previewOptions.density = e.target.value;
    renderPreview();
  });

  const printSheet = (sheet) => {
    if (!currentData) return;
    try {
      openWorksheetPrint(currentData, sheet, {
        studentHeader: previewOptions.studentHeader,
        density: previewOptions.density,
      });
    } catch (e) {
      setGenStatus(e.message || String(e), "error");
    }
  };

  $("exPrint").addEventListener("click", () => printSheet(previewTab));
  $("exPdf").addEventListener("click", (e) => runPdfExport(previewTab, e.currentTarget));
  $("exDocx").addEventListener("click", (e) => runDocxExport(previewTab, e.currentTarget));
  $("exKeyPrint")?.addEventListener("click", () => printSheet("answer"));
  $("exKeyPdf").addEventListener("click", (e) => runPdfExport("answer", e.currentTarget));
  $("exKeyDocx").addEventListener("click", (e) => runDocxExport("answer", e.currentTarget));
  $("btnExportPack")?.addEventListener("click", runFullPackExport);
  $("btnDuplicateCurrent")?.addEventListener("click", () => duplicateSession(currentSessionId));

  // Classroom Projector Mode
  $("btnClassroomMode")?.addEventListener("click", openClassroomMode);
  $("closeClassroomMode")?.addEventListener("click", () => $("classroomModal").classList.add("hidden"));
  $("crRevealAll")?.addEventListener("click", toggleClassroomRevealAll);
  $("crZoomIn")?.addEventListener("click", () => {
    classroomZoom = Math.min(22, classroomZoom + 1.5);
    $("classroomStage").style.setProperty("--cr-scale", `${classroomZoom}pt`);
  });
  $("crZoomOut")?.addEventListener("click", () => {
    classroomZoom = Math.max(10, classroomZoom - 1.5);
    $("classroomStage").style.setProperty("--cr-scale", `${classroomZoom}pt`);
  });
  document.querySelectorAll(".cr-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      classroomSheet = btn.dataset.crSheet;
      document.querySelectorAll(".cr-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderClassroomStage();
    });
  });
  $("classroomStage")?.addEventListener("click", (e) => {
    const item = e.target.closest(".ex-item.cr-interactive");
    if (item) item.classList.toggle("revealed");
  });

  // Settings
  $("btnSettings").addEventListener("click", openSettings);
  $("testApiKey").addEventListener("click", testApiKey);
  $("apiKey").addEventListener("keydown", (e) => { if (e.key === "Enter") $("saveSettings").click(); });
  $("toggleKeyVisible").addEventListener("click", () => {
    const input = $("apiKey");
    input.classList.toggle("visible");
    input.type = input.type === "password" ? "text" : "password";
  });
  $("saveSettings").addEventListener("click", () => {
    localStorage.setItem(API_KEY_KEY, $("apiKey").value.trim());
    $("settingsModal").classList.add("hidden");
    toast("API key saved on this device.", "ok");
  });
  $("closeSettings").addEventListener("click", () => $("settingsModal").classList.add("hidden"));
  $("closeSettingsX")?.addEventListener("click", () => $("settingsModal").classList.add("hidden"));
  $("openDataFolder").addEventListener("click", async () => {
    const d = desktop();
    if (d) await d.openDataFolder();
    else toast("Data is saved in your browser's localStorage.", "info");
  });

  // History & Backup
  $("btnHistory").addEventListener("click", () => {
    renderHistoryModal();
    $("historyModal").classList.remove("hidden");
  });
  $("historySearch")?.addEventListener("input", renderHistoryModal);
  $("historyClassFilter")?.addEventListener("change", renderHistoryModal);
  $("btnExportBackup")?.addEventListener("click", exportHistoryBackup);
  $("btnImportBackup")?.addEventListener("click", () => $("backupFileInput")?.click());
  $("backupFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importHistoryBackup(file);
    e.target.value = "";
  });

  $("historyContent").addEventListener("click", async (e) => {
    const entry = e.target.closest(".history-entry");
    if (!entry) return;
    const id = entry.dataset.id;
    if (e.target.closest(".hist-load")) loadSession(id, 4);
    else if (e.target.closest(".hist-edit")) loadSession(id, 2);
    else if (e.target.closest(".hist-dup")) duplicateSession(id);
    else if (e.target.closest(".hist-del")) {
      const ok = await confirmDialog({
        title: "Delete this worksheet?",
        body: `"${entry.querySelector("strong")?.textContent || ""}" will be permanently removed from this device.`,
      });
      if (ok) {
        deleteSavedSession(id);
        if (currentSessionId === id) currentSessionId = null;
        renderHistoryModal();
        updateHistoryBadge();
      }
    }
  });
  $("closeHistory").addEventListener("click", () => $("historyModal").classList.add("hidden"));

  // Live Item Editor & Vocab Cell Editor
  $("closeItemEditor").addEventListener("click", closeItemEditorModal);
  $("cancelItemEditor").addEventListener("click", closeItemEditorModal);
  $("saveItemEditor").addEventListener("click", saveItemEditor);
  $("btnAddItemAfter")?.addEventListener("click", addItemAfterCurrent);
  $("btnDeleteItem")?.addEventListener("click", deleteCurrentItem);
  ["itemPrompt", "itemAnswer", "itemStem", "itemTests", "itemBank", "itemList"].forEach((id) => {
    $(id).addEventListener("input", runLiveEditorValidation);
  });

  $("closeVocabEditor")?.addEventListener("click", () => closeModal("vocabEditorModal"));
  $("cancelVocabEditor")?.addEventListener("click", () => closeModal("vocabEditorModal"));
  $("saveVocabEditor")?.addEventListener("click", saveVocabCellEditor);

  $("previewFrame").addEventListener("click", (e) => {
    const vocabCell = e.target.closest(".vocab-cell.editable-vocab");
    if (vocabCell) {
      const idx = Number(vocabCell.dataset.vocabNum) - 1;
      if (idx >= 0) openVocabCellEditor(idx);
      return;
    }
    const el = e.target.closest(".ex-item.editable");
    if (!el) return;
    openItemEditor(el.dataset.editorSheet, Number(el.dataset.editorEx), Number(el.dataset.editorItem));
  });
  $("previewFrame").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const vocabCell = e.target.closest?.(".vocab-cell.editable-vocab");
    if (vocabCell) {
      e.preventDefault();
      openVocabCellEditor(Number(vocabCell.dataset.vocabNum) - 1);
      return;
    }
    const el = e.target.closest?.(".ex-item.editable");
    if (!el) return;
    e.preventDefault();
    openItemEditor(el.dataset.editorSheet, Number(el.dataset.editorEx), Number(el.dataset.editorItem));
  });

  $("confirmOk").addEventListener("click", () => settleConfirm(true));
  $("confirmCancel").addEventListener("click", () => settleConfirm(false));

  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.addEventListener("mousedown", (e) => {
      if (e.target === m) closeModal(m.id);
    });
  });

  // Global keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("classroomModal").classList.contains("hidden")) {
        $("classroomModal").classList.add("hidden");
        return;
      }
      const open = [...document.querySelectorAll(".modal-overlay:not(.hidden)")];
      if (open.length) closeModal(open[open.length - 1].id);
      return;
    }
    if (e.key === "?" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      openModal("helpModal");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (!$("itemEditorModal").classList.contains("hidden")) {
        e.preventDefault();
        saveItemEditor();
      } else if (!$("vocabEditorModal").classList.contains("hidden")) {
        e.preventDefault();
        saveVocabCellEditor();
      } else if (currentStep === 3) {
        e.preventDefault();
        runGenerate("full");
      }
    }
  });

  // Menu events + download results from the main process
  const d = desktop();
  if (d && d.onMenu) {
    d.onMenu((action) => {
      if (action === "new") newWorksheet();
      else if (action === "print") {
        if (!currentData) { toast("Generate a worksheet first.", "warn"); return; }
        printSheet(previewTab);
      }
    });
  }
  if (d && d.onDownloadDone) {
    d.onDownloadDone(({ state, filename }) => {
      if (state === "completed") toast(`Saved ${filename}.`, "ok");
      else if (state === "interrupted") toast(`Save interrupted for ${filename}.`, "error");
    });
  }
}

/* ═══════════════ Boot ═════════════════════════════════════════════ */
async function bootApp() {
  try {
    const d = desktop();
    if (!d) {
      setStorageLabel("Saved in browser storage");
      const ver = $("appVersion");
      if (ver) ver.textContent = "Web 2.0";
    } else {
      await hydrateStorage();
      const info = await d.info();
      const ver = $("appVersion");
      if (ver) ver.textContent = `v${info.version}`;
      setStorageLabel(`Saved to ${info.userData.replace(/\\/g, "/").split("/").slice(-2).join("/")}`);
    }

    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || (!savedTheme && window.matchMedia?.("(prefers-color-scheme: dark)").matches)) {
      applyTheme("dark");
    }

    initProfiles();
    initVocabRows();
    renderExercisePickers();
    refreshPlanPreview();
    refreshCoursebookPanel({ triggerAutoAssign: false, sourceEvent: "boot" });
    updateContextSummary();
    setConn("on", "ready");

    // Expose the engine for the main-process smoke test
    window.__LINGO_ENGINE__ = await import("./app.js");
  } catch (err) {
    console.error(err);
    const banner = document.createElement("div");
    banner.className = "status error";
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:300;margin:0;border-radius:0";
    banner.textContent = `Startup error: ${err.message}`;
    document.body.prepend(banner);
  }
}

patchStorageBridge();
wireUi();
bootApp();

// Test hook for the main-process smoke test (inject a synthetic worksheet + plan)
window.__EDITOR_API__ = {
  setTestData: (d, plan) => {
    currentData = normalizeWorksheetExercises(d);
    if (plan) currentPlan = plan;
    else if (!currentPlan) currentPlan = {
      exerciseMode: "random", dictationTypes: ["D01"], lingoTypes: ["L01"],
      dictationExerciseCount: 1, lingoPracticeCount: 1, signature: "smoke",
    };
  },
};
