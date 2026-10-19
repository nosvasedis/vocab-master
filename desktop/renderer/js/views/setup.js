/* Step 1 — class level, coursebook/unit and the coursebook word pool. */
import {
  CLASS_PROFILES, CPP_BOOKS, BOOK_PRESETS, inferUnitFromPages, getAllSavedSessions,
} from "../../app.js";
import { $, $$, esc, icon, plural, debounce, toast } from "../ui.js";
import {
  state, emit, on, prefs, savePrefs, LEVEL_COLORS, BOOK_COLORS, WORD_TARGETS, targetText,
  unitStructure, coursebookQuery, pickFromQuery, coursebookEntryToWord, isCpp,
} from "../state.js";
import { segmented } from "../ui.js";

let sourceSeg;
let lastQuery = null;
let loadToastDismiss = null;

export function initSetup() {
  renderLevels();
  renderBooks();

  sourceSeg = segmented($("sourceSeg"), {
    value: state.source,
    onChange: (v) => {
      state.source = v;
      if (v === "cpp") loadPoolWords({ reason: "Switched to Cambridge Primary Path" });
      emit("setup", "words");
    },
  });

  $("levelGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-level]");
    if (!card) return;
    if (state.profileId === card.dataset.level) return;
    state.profileId = card.dataset.level;
    resizeSmartPick();
    emit("setup", "level");
  });
  $("levelGrid").addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const ids = Object.keys(CLASS_PROFILES);
    const i = Math.max(0, ids.indexOf(state.profileId));
    const next = ids[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : ids.length - 1)) % ids.length];
    state.profileId = next;
    resizeSmartPick();
    emit("setup", "level");
    $("levelGrid").querySelector(`[data-level="${next}"]`)?.focus();
    e.preventDefault();
  });

  $("bookGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-book]");
    if (!card || card.dataset.book === state.cpp.bookId) return;
    const prevRecommended = CPP_BOOKS[state.cpp.bookId]?.recommendedProfile;
    state.cpp.bookId = card.dataset.book;
    state.cpp.pages = "";
    if (!state.profileId || state.profileId === prevRecommended) {
      state.profileId = CPP_BOOKS[state.cpp.bookId].recommendedProfile;
    }
    loadPoolWords({ reason: `${CPP_BOOKS[state.cpp.bookId].title}` });
    emit("setup", "words", "level");
  });

  $("unitGrid").addEventListener("click", (e) => {
    const tile = e.target.closest("[data-unit]");
    if (!tile) return;
    const u = Number(tile.dataset.unit);
    if (u === state.cpp.unit && !state.cpp.pages) return;
    state.cpp.unit = u;
    state.cpp.pages = "";
    loadPoolWords({ reason: `Unit ${u}` });
    emit("setup", "words");
  });

  $("unitFocus").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-pages]");
    if (!chip) return;
    state.cpp.pages = chip.dataset.pages;
    loadPoolWords({ reason: chip.dataset.label || "Section" });
    emit("setup", "words");
  });
  const onPagesInput = debounce((value) => {
    state.cpp.pages = value.trim();
    const inferred = state.cpp.pages ? inferUnitFromPages(state.cpp.bookId, state.cpp.pages) : null;
    if (inferred) state.cpp.unit = inferred;
    loadPoolWords({ reason: state.cpp.pages ? `pages ${state.cpp.pages}` : `Unit ${state.cpp.unit}` });
    emit("setup", "words");
  }, 450);
  $("unitFocus").addEventListener("input", (e) => {
    if (e.target.id === "cppPages") onPagesInput(e.target.value);
  });

  // Custom book fields
  $("customBook").addEventListener("input", (e) => { state.custom.bookTitle = e.target.value; emit("setup"); });
  $("customUnit").addEventListener("input", (e) => {
    state.custom.unit = Math.max(1, Number.parseInt(e.target.value, 10) || 1);
    emit("setup");
  });
  $("customPages").addEventListener("input", (e) => { state.custom.pages = e.target.value; emit("setup"); });
  $$("[data-step-unit]").forEach((b) => b.addEventListener("click", () => {
    state.custom.unit = Math.max(1, Math.min(30, (Number(state.custom.unit) || 1) + Number(b.dataset.stepUnit)));
    $("customUnit").value = state.custom.unit;
    emit("setup");
  }));
  $("recentBooks").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-book-title]");
    if (!chip) return;
    state.custom.bookTitle = chip.dataset.bookTitle;
    $("customBook").value = state.custom.bookTitle;
    emit("setup");
  });

  // Pool filters
  const bindCheck = (id, key) => $(id).addEventListener("change", (e) => {
    state.cpp[key] = e.target.checked;
    loadPoolWords({ reason: "Word sources updated" });
    emit("setup", "words");
  });
  bindCheck("srcSb", "includeSb");
  bindCheck("srcWb", "includeWb");
  $("wbScope").addEventListener("change", (e) => {
    state.cpp.wbScope = e.target.value;
    loadPoolWords({ reason: "Workbook scope updated" });
    emit("setup", "words");
  });
  $("poolLimit").addEventListener("change", (e) => {
    state.cpp.limit = e.target.value;
    loadPoolWords({ reason: "New word pick" });
    emit("setup", "words");
  });
  $("btnPoolReload").addEventListener("click", () => {
    loadPoolWords({ reason: "Fresh pick", force: true });
    emit("setup", "words");
  });
  $("poolSearch").addEventListener("input", () => renderPool());
  $("poolChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-pool-idx]");
    if (!chip) return;
    const entry = chip._entry;
    if (!entry) return;
    togglePoolWord(entry);
  });
  $("btnPoolAll").addEventListener("click", () => {
    const pool = lastQuery?.words || [];
    const have = new Set(state.words.map((w) => w.english.trim().toLowerCase()));
    const blanksRemoved = state.words.filter((w) => w.english.trim());
    state.words = [...blanksRemoved, ...pool.filter((p) => !have.has(p.english.toLowerCase())).map(coursebookEntryToWord)];
    emit("words", "setup");
  });
  $("btnPoolNone").addEventListener("click", () => {
    const pool = new Set((lastQuery?.words || []).map((p) => p.english.toLowerCase()));
    const before = state.words;
    state.words = state.words.filter((w) => !pool.has(w.english.trim().toLowerCase()));
    if (before.length !== state.words.length) {
      emit("words", "setup");
      toast(`Cleared ${plural(before.length - state.words.length, "word")} from your unit.`, "info", {
        actions: [{ label: "Undo", run: () => { state.words = before; emit("words", "setup"); } }],
      });
    }
  });

  $("welcomeCard").addEventListener("click", (e) => {
    if (e.target.closest('[data-action="dismiss-welcome"]')) {
      prefs.welcomeDismissed = true;
      savePrefs();
      $("welcomeCard").classList.add("hidden");
    }
  });

  on("setup", renderSetup);
  on("level", renderSetup);
  on("words", () => { if (state.view === "setup") renderPool(); });
}

/* ── Word pool assignment ────────────────────────────────────────── */
/** "Smart pick" follows the class: a new class reloads the unit's words at its size (Undo in the toast). An empty list stays empty. */
function resizeSmartPick() {
  if (isCpp() && state.cpp.limit === "smart" && state.words.some((w) => w.english.trim())) loadPoolWords({ reason: `${CLASS_PROFILES[state.profileId].label} aims for ${targetText(state.profileId)} words` });
}

export function loadPoolWords({ reason = "", force = false, silent = false } = {}) {
  if (!isCpp()) return;
  const q = coursebookQuery();
  const picked = pickFromQuery(q);
  if (!picked.length) {
    if (!silent) toast("No coursebook words match these filters. Try turning on more sources or widening the pages.", "warn");
    return;
  }
  const before = state.words;
  const byKey = new Map(before.filter((w) => w.english.trim()).map((w) => [w.english.trim().toLowerCase(), w]));
  // Keep any AI-filled details for words that stay in the list.
  state.words = picked.map((entry) => byKey.get(entry.english.toLowerCase()) || coursebookEntryToWord(entry));
  const changed = force || before.map((w) => w.english).join("|") !== state.words.map((w) => w.english).join("|");
  if (!changed || silent) return;
  loadToastDismiss?.();
  const hadWords = before.some((w) => w.english.trim());
  loadToastDismiss = toast(`Loaded ${plural(state.words.length, "word")}${reason ? ` · ${reason}` : ""}`, "ok", {
    ms: 3200,
    actions: hadWords ? [{ label: "Undo", run: () => { state.words = before; emit("words", "setup"); } }] : [],
  });
}

function togglePoolWord(entry) {
  const key = entry.english.toLowerCase();
  const idx = state.words.findIndex((w) => w.english.trim().toLowerCase() === key);
  if (idx >= 0) state.words.splice(idx, 1);
  else {
    state.words = state.words.filter((w) => w.english.trim());
    state.words.push(coursebookEntryToWord(entry));
  }
  emit("words", "setup");
}

/* ── Rendering ───────────────────────────────────────────────────── */
function renderLevels() {
  $("levelGrid").innerHTML = Object.values(CLASS_PROFILES).map((p) => `
    <button type="button" class="level-card" data-level="${esc(p.id)}" role="radio" aria-checked="false" style="--lvl:${LEVEL_COLORS[p.id] || "var(--brand)"}">
      <span class="lc-top">
        <span class="lc-letter">${esc(p.label.charAt(0))}</span>
        <span class="lc-check">${icon("check")}</span>
      </span>
      <span class="lc-name">${esc(p.label)}</span>
      <span class="lc-cefr">CEFR ${esc(p.cefr)}</span>
      <span class="lc-grade">${esc(p.greekGrades)}</span>
    </button>`).join("");
  const sel = $("libLevel");
  if (sel && sel.options.length <= 1) {
    Object.values(CLASS_PROFILES).forEach((p) => sel.add(new Option(`${p.label} · ${p.cefr}`, p.id)));
  }
}

function renderBooks() {
  $("bookGrid").innerHTML = Object.values(CPP_BOOKS).map((b) => {
    const prof = CLASS_PROFILES[b.recommendedProfile];
    return `<button type="button" class="book-card" data-book="${esc(b.id)}" style="--bk:${BOOK_COLORS[b.id] || "var(--brand)"}">
      <span class="book-cover">${esc(b.id.slice(-1))}</span>
      <span class="book-meta">
        <strong>Primary Path ${esc(b.id.slice(-1))}</strong>
        <span>${esc(prof?.label || "")} · CEFR ${esc(b.cefr)}</span>
      </span>
    </button>`;
  }).join("");
}

function renderSetup() {
  // Welcome
  // The Home screen welcomes the teacher now; the old Step 1 card stays hidden.
  $("welcomeCard").classList.add("hidden");

  // Level cards
  $$(".level-card").forEach((c) => {
    const on = c.dataset.level === state.profileId;
    c.classList.toggle("selected", on);
    c.setAttribute("aria-checked", on ? "true" : "false");
    c.tabIndex = on || (!state.profileId && c === $("levelGrid").firstElementChild) ? 0 : -1;
  });
  const p = CLASS_PROFILES[state.profileId];
  const target = WORD_TARGETS[state.profileId];
  $("levelDetail").innerHTML = p
    ? `<span class="ld-item">${icon("graduation")}<span><strong>${esc(p.label)}</strong> · ${esc(p.greekGrades)} · ages ${esc(p.ageRange)}</span></span>
       <span class="ld-item">${icon("file")}<span>Sentences up to <strong>${p.maxSentenceWords} words</strong></span></span>
       <span class="ld-item">${icon("layers")}<span><strong>${p.allowDictation.length}</strong> dictation + <strong>${p.allowLingo.length}</strong> practice formats</span></span>
       ${target ? `<span class="ld-item">${icon("target")}<span>Aim for <strong>${targetText(state.profileId)} words</strong></span></span>` : ""}`
    : `<span class="ld-item">${icon("info")}<span>Choose the class level first — it shapes every sentence the AI writes.</span></span>`;

  // Source switch
  sourceSeg?.set(state.source);
  $("cppPane").classList.toggle("hidden", !isCpp());
  $("customPane").classList.toggle("hidden", isCpp());
  $("poolCard").classList.toggle("hidden", !isCpp());

  if (isCpp()) renderCpp();
  else renderCustom();
}

function renderCpp() {
  const c = state.cpp;
  $$(".book-card").forEach((b) => b.classList.toggle("selected", b.dataset.book === c.bookId));
  const book = CPP_BOOKS[c.bookId];
  $("unitGrid").innerHTML = Array.from({ length: 9 }, (_, i) => i + 1).map((u) => {
    const sbStart = 6 + (u - 1) * 22;
    const title = book?.units?.[u]?.title || `Unit ${u}`;
    return `<button type="button" class="unit-tile${u === c.unit ? " selected" : ""}" data-unit="${u}" data-tip="${esc(title)}">
      <span>Unit</span><b>${u}</b><small>p.${sbStart}–${sbStart + 21}</small>
    </button>`;
  }).join("");

  const us = unitStructure();
  if (us) {
    const norm = (s) => String(s || "").replace(/[–—−]/g, "-").replace(/\s+/g, "");
    const cur = norm(c.pages);
    const matchesSection = us.sections.some((s) => s.id !== "FULL" && norm(s.pageRange) === cur);
    const focusedInput = document.activeElement?.id === "cppPages";
    const sections = us.sections.map((s) => {
      const isFull = s.id === "FULL";
      const active = isFull ? !cur : norm(s.pageRange) === cur;
      const label = isFull ? "Full unit" : s.shortLabel.replace(/\s*\(p\..*\)$/, "");
      return `<button type="button" class="chip${active ? " active" : ""}" data-pages="${esc(isFull ? "" : s.pageRange)}" data-label="${esc(label)}" data-tip="${esc(`${s.label} · ${s.wbRange}`)}">${esc(label)} <small>p.${esc(s.pageRange)}</small></button>`;
    }).join("");
    const pagesVal = focusedInput ? $("cppPages").value : (c.pages && !matchesSection ? c.pages : "");
    $("unitFocus").innerHTML = `
      <div class="uf-head">
        <div class="uf-title">
          <h3>Unit ${us.unit} · ${esc(us.unitTitle)}</h3>
          <p>Student's Book <b>p. ${us.sbStart}–${us.sbEnd}</b> · Workbook <b>p. ${us.wbStart}–${us.wbEnd}</b>${us.nonfictionTitle ? ` · Readings: <b>${esc(us.nonfictionTitle)}</b> (A), <b>${esc(us.fictionTitle)}</b> (B)` : ""}</p>
        </div>
        <span class="badge brand">${icon("book-open", "i-xs")}${esc(book.cefr)}</span>
      </div>
      <div class="uf-sections">
        ${sections}
        <div class="input-group uf-pages">
          ${icon("search", "i-xs")}
          <input class="input" id="cppPages" placeholder="Pages, e.g. 14–17" value="${esc(pagesVal)}" autocomplete="off" />
        </div>
      </div>`;
    if (focusedInput) {
      const inp = $("cppPages");
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  $("srcSb").checked = c.includeSb;
  $("srcWb").checked = c.includeWb;
  $("wbScope").value = c.wbScope;
  $("wbScope").disabled = !c.includeWb;
  $("poolLimit").value = c.limit;

  const counts = coursebookQuery({ includeSb: true, includeWb: true })?.counts;
  $("countSb").textContent = counts?.sb ?? 0;
  $("countWb").textContent = counts?.wb ?? 0;
  renderPool();
}

function renderPool() {
  if (!isCpp()) return;
  lastQuery = coursebookQuery();
  const words = lastQuery?.words || [];
  const q = $("poolSearch").value.trim().toLowerCase();
  const chosen = new Set(state.words.map((w) => w.english.trim().toLowerCase()).filter(Boolean));
  const list = q
    ? words.filter((w) => w.english.toLowerCase().includes(q) || String(w.greek || "").toLowerCase().includes(q))
    : words;
  const wrap = $("poolChips");
  if (!words.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-art">${icon("filter")}</div><h3>No words here</h3><p>Turn on more word sources above or choose a wider page range.</p></div>`;
  } else if (!list.length) {
    wrap.innerHTML = `<div class="empty"><h3>No matches for “${esc(q)}”</h3></div>`;
  } else {
    wrap.innerHTML = list.map((w, i) => {
      const on = chosen.has(w.english.toLowerCase());
      const src = w.source === "wb" ? "Workbook" : w.origin === "keywords" ? "Student's Book Key Word (Cambridge Scope & Sequence; Greek added by Vocab Master)" : "Student's Book";
      const page = w.source === "wb" ? `WB p.${w.wbPage || w.page}` : `SB p.${w.sbPage || w.page}`;
      return `<button type="button" class="word-chip src-${esc(w.source)}${on ? " on" : ""}" data-pool-idx="${i}" title="${esc(`${w.english} (${w.type}) — ${w.greek}\n${src}${page ? ` · ${page}` : ""}`)}" style="animation-delay:${Math.min(i, 30) * 12}ms">
        <span class="wc-box">${icon(on ? "check" : "plus")}</span>
        <span>${esc(w.english)}</span>
        <span class="wc-gr">${esc(w.greek || "")}</span>
        <span class="wc-src"></span>
      </button>`;
    }).join("");
    [...wrap.children].forEach((chip, i) => { chip._entry = list[i]; });
  }
  const inPool = words.filter((w) => chosen.has(w.english.toLowerCase())).length;
  const extra = state.words.filter((w) => w.english.trim()).length - inPool;
  $("poolSummary").innerHTML = `<strong>${inPool}</strong> of ${words.length} pool words in your unit${extra > 0 ? ` · +${extra} of your own` : ""}
    <span class="pool-legend"><span><i style="background:var(--src-sb)"></i>SB</span><span><i style="background:var(--src-wb)"></i>WB</span></span>`;
  const us = lastQuery?.unitStructure;
  $("poolSub").textContent = us
    ? `${CPP_BOOKS[state.cpp.bookId].title} · Unit ${us.unit}${state.cpp.pages ? ` · p. ${state.cpp.pages}` : ""} — tap words to add or remove them.`
    : "Tap words to add or remove them from your unit.";
}

function renderCustom() {
  const c = state.custom;
  if (document.activeElement !== $("customBook")) $("customBook").value = c.bookTitle;
  if (document.activeElement !== $("customUnit")) $("customUnit").value = c.unit;
  if (document.activeElement !== $("customPages")) $("customPages").value = c.pages;
  const saved = new Set();
  (getAllSavedSessions() || []).forEach((s) => { if (s.form?.bookTitle) saved.add(s.form.bookTitle.trim()); });
  const cppTitles = new Set(Object.values(CPP_BOOKS).map((b) => b.title));
  const all = [...new Set([...saved, ...(BOOK_PRESETS || [])])].filter((b) => !cppTitles.has(b));
  $("bookList").innerHTML = all.map((b) => `<option value="${esc(b)}"></option>`).join("");
  const recent = [...saved].filter((b) => !cppTitles.has(b)).slice(0, 5);
  $("recentBooks").innerHTML = recent.map((b) => `<button type="button" class="chip" data-book-title="${esc(b)}">${icon("clock", "i-xs")}${esc(b)}</button>`).join("");
}

/** Scroll to and pulse whichever Step 1 field is still missing. */
export function highlightSetupGap() {
  const target = !state.profileId ? $("levelGrid") : !isCpp() && !state.custom.bookTitle.trim() ? $("customBook") : null;
  if (!target) return;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.remove("needs-attention");
  void target.offsetWidth;
  target.classList.add("needs-attention");
  if (target.id === "customBook") setTimeout(() => target.focus(), 350);
}

/** Returns an error message if the unit setup is incomplete, else null. */
export function validateSetup() {
  if (!state.profileId) return "Choose a class level first.";
  if (!isCpp() && !state.custom.bookTitle.trim()) return "Enter the coursebook title.";
  return null;
}

export { renderSetup };
