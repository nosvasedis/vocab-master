/* Step 3 — Exercise plan (smart mix or hand-picked) and AI generation. */
import {
  CLASS_PROFILES, EXERCISE_LABELS, EXERCISE_DESCRIPTIONS, EXERCISE_EXAMPLES, EXERCISE_FAMILIES,
  pickGenerationPlan, analyzeVocabFeatures, generateWorksheets, regenerateDictationOnly,
  regenerateLingoPracticeOnly, normalizeWorksheetExercises, validateWorksheet, saveWorksheetSession, findVocabGaps,
  normalizeTune, isDefaultTune, tunedProfile,
} from "../../app.js";
import { $, $$, esc, icon, plural, toast, segmented, confirmDialog } from "../ui.js";
import { state, emit, on, buildForm, filledWords, bookTitle, unitNumber, pageRange, worksheetFreshness, detachWorksheet } from "../state.js";
import { getApiKey, isAiReady, getProvider, chatgptUsageLimited, manageChatGPTUsage } from "../bridge.js";
import { actions } from "../actions.js";

let modeSeg;
let familySeg;
let lengthSeg;
let levelSeg;
let genTimer = null;

const FAMILY_LABEL = { recognition: "Recognition", productive: "Productive", analysis: "Analysis" };
const NEEDS = {
  D06: ["hasSynonyms", "synonyms"], L03: ["hasSynonyms", "synonyms"],
  D05: ["hasAntonyms", "opposites"], L04: ["hasAntonyms", "opposites"],
  D02: ["hasDerivatives", "derivatives"], L07: ["hasDerivatives", "derivatives"],
  D25: ["hasPictures", "3+ words with word-bank pictures"],
};
const STAGES = [
  [0, "Reading your word list"],
  [4, "Choosing exercise formats for your class level"],
  [10, "Writing the Lingo Launcher practice"],
  [24, "Writing the Dictation exercises"],
  [44, "Checking that every word is tested"],
  [68, "Polishing sentences — almost there"],
  [100, "Still working — bigger units take a little longer"],
];

export function initExercises() {
  modeSeg = segmented($("exModeSeg"), {
    value: state.ex.mode,
    onChange: (v) => { state.ex.mode = v; refreshPlan(); },
  });
  familySeg = segmented($("familySeg"), {
    value: state.ex.family,
    onChange: (v) => { state.ex.family = v; renderPickers(); },
  });
  lengthSeg = segmented($("tuneLength"), { value: state.ex.tune?.length || "class", onChange: (v) => setTune({ length: v }) });
  levelSeg = segmented($("tuneLevel"), { value: state.ex.tune?.level || "class", onChange: (v) => setTune({ level: v }) });
  $("tuneItems").addEventListener("change", (e) => setTune({ items: Number(e.target.value) }));
  $("tuneExtras").addEventListener("change", (e) => setTune({ extras: Number(e.target.value) }));
  $("btnTuneReset").addEventListener("click", () => setTune(null));
  $("dictCount").addEventListener("change", (e) => { state.ex.dictCount = Number(e.target.value); refreshPlan(true); });
  $("lingoCount").addEventListener("change", (e) => { state.ex.lingoCount = Number(e.target.value); refreshPlan(true); });
  $("customPaneEx").closest("section").addEventListener("click", (e) => {
    const go = e.target.closest(".ex-crosslink")?.dataset.go;
    if (go) actions.go(go);
  });
  $("btnShuffle").addEventListener("click", () => {
    refreshPlan(true);
    $$("#planPreview .plan-item").forEach((p, i) => { p.style.animationDelay = `${i * 40}ms`; });
  });

  $("customPaneEx").addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox][data-ex]");
    if (!cb) return;
    const list = state.ex.picked[cb.dataset.section];
    const i = list.indexOf(cb.value);
    if (cb.checked && i < 0) list.push(cb.value);
    if (!cb.checked && i >= 0) list.splice(i, 1);
    refreshPlan();
  });
  $("customPaneEx").addEventListener("click", (e) => {
    const p = e.target.closest("[data-preset]");
    if (p) applyPreset(p.dataset.preset);
  });

  $("btnGenerate").addEventListener("click", () => runGenerate("full"));
  $("btnRegenDict").addEventListener("click", () => runGenerate("dictation"));
  $("btnRegenLingo").addEventListener("click", () => runGenerate("lingo"));
  $("genError").addEventListener("click", (e) => {
    if (e.target.closest("[data-action=usage]")) manageChatGPTUsage().catch(() => actions.openSettings());
    if (e.target.closest("[data-action=retry]")) runGenerate("full");
    if (e.target.closest("[data-action=settings]")) actions.openSettings();
  });

  on("level", () => { state.plan = null; });
  on("data", renderGenerateCard);
  on("setup", detachIfUnitChanged);
}

/** A different book or unit was chosen: the open worksheets belong to the old unit. Put them away
 *  (they are safe in Saved units) so nothing of the old word list reaches the new generation. */
function detachIfUnitChanged() {
  const fr = worksheetFreshness();
  if (!fr?.unitChanged || state.busy) return;
  detachWorksheet();
  emit("data");
  toast(`${fr.label || "The previous unit"}: worksheets are saved in your library. The new unit starts fresh.`, "info", {
    ms: 4200,
    actions: [{ label: "Saved units", run: () => actions.go("library") }],
  });
}

/** Called when the Exercises view is shown. */
export function enterExercises() {
  const profile = CLASS_PROFILES[state.profileId];
  if (profile) {
    // Drop hand-picked types that this level (or the current vocabulary) can't support.
    const features = analyzeVocabFeatures(buildForm());
    const ok = (id, allowed) => allowed.includes(id) && (!NEEDS[id] || features[NEEDS[id][0]]);
    state.ex.picked.dictation = state.ex.picked.dictation.filter((id) => ok(id, profile.allowDictation));
    state.ex.picked.lingo = state.ex.picked.lingo.filter((id) => ok(id, profile.allowLingo));
    const stale = !state.plan
      || state.plan.dictationTypes?.some((t) => !ok(t, profile.allowDictation))
      || state.plan.lingoTypes?.some((t) => !ok(t, profile.allowLingo));
    if (stale || state.ex.mode === "custom") refreshPlan();
  }
  renderExercises();
}

/* ── Fine-tuning: it rides on the plan, so changing it never reshuffles the exercise mix ── */
function setTune(patch) {
  state.ex.tune = patch ? normalizeTune({ ...state.ex.tune, ...patch }) : normalizeTune(null);
  if (state.plan) {
    const { tune: _old, ...rest } = state.plan;
    state.plan = isDefaultTune(state.ex.tune) ? rest : { ...rest, tune: { ...state.ex.tune } };
  }
  emit("plan");
  renderExercises();
}

function renderTune() {
  const t = normalizeTune(state.ex.tune);
  const base = tunedProfile(state.profileId, null);
  $("tunePanel").classList.toggle("hidden", !base);
  if (!base) return;
  const p = tunedProfile(state.profileId, t);
  const sel = $("tuneItems");
  sel.innerHTML = [`<option value="0">For the class (${base.itemsPerExercise})</option>`,
    ...[3, 4, 5, 6, 7, 8].filter((n) => n !== base.itemsPerExercise).map((n) => `<option value="${n}">${n} items</option>`)].join("");
  sel.value = String(t.items && t.items !== base.itemsPerExercise ? t.items : 0);
  $("tuneExtras").value = String(t.extras);
  lengthSeg?.set(t.length);
  levelSeg?.set(t.level);
  const level = { easier: "a bit easier", class: "", harder: "a bit harder" }[t.level];
  $("tuneHint").textContent = `${p.itemsPerExercise} items per exercise · sentences up to ${p.maxSentenceWords} words${level ? ` · ${level}` : ""}${t.extras ? ` · +${t.extras} in word banks` : ""}`;
  $("btnTuneReset").classList.toggle("hidden", isDefaultTune(t));
  $("tunePanel").classList.toggle("tuned", !isDefaultTune(t));
}

function planOptions(forceRandom) {
  const vocabFeatures = analyzeVocabFeatures(buildForm());
  const tune = state.ex.tune;
  if (!forceRandom && state.ex.mode === "custom") {
    return { exerciseMode: "custom", customDictationTypes: [...state.ex.picked.dictation], customLingoTypes: [...state.ex.picked.lingo], vocabFeatures, tune };
  }
  return {
    exerciseMode: "random",
    vocabFeatures,
    tune,
    ...(state.ex.dictCount > 0 ? { dictationCount: state.ex.dictCount } : {}),
    ...(state.ex.lingoCount > 0 ? { lingoCount: state.ex.lingoCount } : {}),
  };
}

function refreshPlan(forceRandom = false) {
  if (!state.profileId) { state.plan = null; renderExercises(); return; }
  if (state.ex.mode === "custom" && !forceRandom && (!state.ex.picked.dictation.length || !state.ex.picked.lingo.length)) {
    state.plan = null;
  } else {
    const random = forceRandom && state.ex.mode !== "custom";
    state.plan = pickGenerationPlan(state.profileId, { ...planOptions(random ? true : false), forceRandom: random });
  }
  emit("plan");
  renderExercises();
}

function planError() {
  if (!state.profileId) return "Choose a class level in Step 1.";
  if (state.inputMode === "structured" && !filledWords().length) return "Add some words in Step 2 first.";
  if (state.inputMode === "freeform" && state.freeform.trim().length < 10) return "Describe the unit in Step 2 first.";
  if (state.ex.mode !== "custom") return null;
  const f = analyzeVocabFeatures(buildForm());
  const { dictation, lingo } = state.ex.picked;
  if (!dictation.length) return "Pick at least one Dictation exercise.";
  if (!lingo.length) return "Pick at least one Lingo Launcher exercise.";
  for (const id of [...dictation, ...lingo]) {
    if (NEEDS[id] && !f[NEEDS[id][0]]) return `${id} (${EXERCISE_LABELS[id]}) needs ${NEEDS[id][1]} in your word list.`;
  }
  return null;
}

/* ── Presets ─────────────────────────────────────────────────────── */
function applyPreset(name) {
  const profile = CLASS_PROFILES[state.profileId];
  if (!profile) return;
  const features = analyzeVocabFeatures(buildForm());
  const usable = (ids) => ids.filter((id) => !NEEDS[id] || features[NEEDS[id][0]]);
  const D = usable(profile.allowDictation);
  const L = usable(profile.allowLingo);
  const pick = (pool, preferred, n) => {
    const out = preferred.filter((id) => pool.includes(id)).slice(0, n);
    for (const id of pool) { if (out.length >= n) break; if (!out.includes(id)) out.push(id); }
    return out;
  };
  const fam = (pool, f) => pool.filter((id) => EXERCISE_FAMILIES[id] === f);
  const presets = {
    balanced: [["D01", "D13", "D03", "D08", "D14"], ["L01", "L02", "L05"]],
    recognition: [fam(D, "recognition"), fam(L, "recognition")],
    productive: [fam(D, "productive"), fam(L, "productive")],
    exam: [["D03", "D02", "D18", "D07", "D24", "D01"], ["L08", "L09", "L01"]],
    families: [["D02", "D06", "D05", "D15", "D01"], ["L07", "L03", "L04", "L01"]],
  };
  if (name === "clear") state.ex.picked = { dictation: [], lingo: [] };
  else if (presets[name]) {
    state.ex.picked = { dictation: pick(D, presets[name][0], 4), lingo: pick(L, presets[name][1], 2) };
  }
  $$("#customPaneEx [data-preset]").forEach((b) => b.classList.toggle("active", b.dataset.preset === name && name !== "clear"));
  refreshPlan();
}

/* ── Rendering ───────────────────────────────────────────────────── */
export function renderExercises() {
  modeSeg?.set(state.ex.mode);
  familySeg?.set(state.ex.family);
  const custom = state.ex.mode === "custom";
  $("smartPane").classList.toggle("hidden", custom);
  $("customPaneEx").classList.toggle("hidden", !custom);
  $("dictCount").value = String(state.ex.dictCount || 0);
  $("lingoCount").value = String(state.ex.lingoCount || 0);
  if (custom) renderPickers();
  renderTune();
  renderPlan();
  renderGenerateCard();
}

function exCard(id, section, features) {
  const fam = EXERCISE_FAMILIES[id] || "productive";
  const need = NEEDS[id] && !features[NEEDS[id][0]] ? NEEDS[id][1] : null;
  const checked = state.ex.picked[section].includes(id);
  const hidden = state.ex.family !== "all" && state.ex.family !== fam;
  return `<label class="ex-card fam-${fam}${need ? " disabled" : ""}${hidden ? " hidden" : ""}">
    <input type="checkbox" data-ex data-section="${section}" value="${esc(id)}" ${checked ? "checked" : ""} ${need ? "disabled" : ""} />
    <span class="exc-top"><span class="exc-id">${esc(id)}</span><span class="exc-fam">${FAMILY_LABEL[fam]}</span><span class="exc-check">${icon("check")}</span></span>
    <span class="exc-title">${esc(EXERCISE_LABELS[id] || id)}</span>
    <span class="exc-desc">${esc(EXERCISE_DESCRIPTIONS[id] || "")}</span>
    ${EXERCISE_EXAMPLES?.[id] ? `<span class="exc-example">${esc(EXERCISE_EXAMPLES[id])}</span>` : ""}
    ${need ? `<span class="exc-need">${icon("alert")}${id === "D25" ? "Needs 3+ words that have word-bank pictures" : `Turn on ${esc(need)} in Step 2 to use this`}</span>` : ""}
  </label>`;
}

function renderPickers() {
  const profile = CLASS_PROFILES[state.profileId];
  if (!profile) {
    $("dictGrid").innerHTML = $("lingoGrid").innerHTML = "";
    return;
  }
  const features = analyzeVocabFeatures(buildForm());
  $("dictGrid").innerHTML = profile.allowDictation.map((id) => exCard(id, "dictation", features)).join("");
  $("lingoGrid").innerHTML = profile.allowLingo.map((id) => exCard(id, "lingo", features)).join("");
  $("pickedDict").textContent = `${state.ex.picked.dictation.length} picked`;
  $("pickedLingo").textContent = `${state.ex.picked.lingo.length} picked`;
}

function planItems(types) {
  return types.map((t, i) => `<div class="plan-item" style="animation-delay:${i * 50}ms">
    <span class="pi-n">${i + 1}</span>
    <span class="pi-t">${esc(EXERCISE_LABELS[t] || t)}<small>${esc(EXERCISE_EXAMPLES?.[t] || EXERCISE_DESCRIPTIONS[t] || "")}</small></span>
    <span class="exc-id" style="--fam:var(--fam-${EXERCISE_FAMILIES[t] || "productive"})">${esc(t)}</span>
  </div>`).join("");
}

function renderPlan() {
  const p = state.plan;
  if (!state.profileId) {
    $("planPreview").innerHTML = `<div class="callout warning plan-empty">${icon("info")}<span>Choose a class level in Step 1 to see the exercise plan.</span></div>`;
    return;
  }
  if (!p) {
    $("planPreview").innerHTML = `<div class="callout plan-empty">${icon("info")}<span>Pick at least one <strong>Dictation</strong> and one <strong>Lingo Launcher</strong> exercise — or tap a preset.</span></div>`;
    return;
  }
  $("planPreview").innerHTML = `
    <div class="plan-col"><h4>📝 Dictation <span class="badge">${plural(p.dictationExerciseCount, "exercise")}</span></h4><div class="plan-items">${planItems(p.dictationTypes)}</div></div>
    <div class="plan-col"><h4>🚀 Lingo Launcher <span class="badge">${plural(p.lingoPracticeCount, "exercise")}</span></h4><div class="plan-items">${planItems(p.lingoTypes)}</div></div>`;
}

function renderGenerateCard() {
  if (state.busy) return;
  const profile = CLASS_PROFILES[state.profileId];
  const n = filledWords().length;
  const err = planError();
  const facts = [
    profile ? `<span class="badge brand">${esc(profile.label)} · ${esc(profile.cefr)}</span>` : "",
    bookTitle() ? `<span class="badge">${icon("book", "i-xs")}${esc(bookTitle())}${unitNumber() ? ` · Unit ${esc(unitNumber())}` : ""}${pageRange() ? ` · p. ${esc(pageRange())}` : ""}</span>` : "",
    state.inputMode === "structured" ? `<span class="badge">${plural(n, "word")}</span>` : `<span class="badge">Freeform brief</span>`,
    state.plan ? `<span class="badge">${state.plan.dictationExerciseCount} Dictation · ${state.plan.lingoPracticeCount} Lingo</span>` : "",
  ].join("");
  const fr = worksheetFreshness();
  const staleNote = fr?.wordsChanged
    ? `<div class="callout info">${icon("info")}<span>Your word list changed since these worksheets were written. <strong>Generate again</strong> writes everything with the new words — rewriting only one sheet would mix old and new words, so that option is off until then.</span></div>`
    : "";
  $("genSummary").innerHTML = `
    <h3>${state.data ? (fr?.wordsChanged ? "New word list — time for fresh worksheets" : "Worksheets ready — want a fresh version?") : "Ready to write your worksheets"}</h3>
    <div class="gs-facts">${facts}</div>
    ${err ? `<div class="callout warning">${icon("alert")}<span>${esc(err)}</span></div>` : staleNote || `<p class="hint">Lingo Launcher study sheet, Dictation test and a full teacher answer key — usually 30–90 seconds.</p>`}`;
  $("btnGenerate").disabled = !!err;
  $("btnGenerate").innerHTML = `${icon("sparkles")}${state.data ? "Generate again" : "Generate worksheets"}`;
  $("genRegen").classList.toggle("hidden", !state.data || !!fr?.wordsChanged);
  $("btnRegenDict").disabled = $("btnRegenLingo").disabled = !!err;
}

/* ── Generation ──────────────────────────────────────────────────── */
function setBusy(on, title = "") {
  state.busy = on;
  $("genIdle").classList.toggle("hidden", on);
  $("genBusy").classList.toggle("hidden", !on);
  $("genError").classList.add("hidden");
  clearInterval(genTimer);
  emit("busy");
  if (!on) { renderGenerateCard(); return; }
  $("genBusyTitle").textContent = title;
  const started = Date.now();
  let lastStage = "";
  const tick = () => {
    const s = (Date.now() - started) / 1000;
    const stage = [...STAGES].reverse().find(([t]) => s >= t)[1];
    if (stage !== lastStage) {
      lastStage = stage;
      const p = $("genBusyStage");
      p.textContent = stage;
      p.style.animation = "none";
      void p.offsetWidth;
      p.style.animation = "";
    }
    $("genBar").style.width = `${Math.round(95 * (1 - Math.exp(-s / 38)))}%`;
    $("genBusyTime").textContent = `${Math.round(s)}s · usually 30–90 seconds`;
  };
  tick();
  genTimer = setInterval(tick, 1000);
}

function showGenError(message) {
  const chatgpt = getProvider() === "chatgpt";
  const limited = chatgptUsageLimited(message);
  const keyIssue = /api key|401|unauthor|quota|429/i.test(message) || chatgpt;
  $("genError").classList.remove("hidden");
  $("genError").innerHTML = `<div class="callout danger">${icon("alert")}<div><strong>Generation didn't finish.</strong> ${esc(message)}
    <div style="margin-top:8px;display:flex;gap:6px">
      ${limited ? `<button type="button" class="btn btn-primary btn-sm" data-action="usage">Manage usage</button>` : ""}
      <button type="button" class="btn btn-secondary btn-sm" data-action="retry">${icon("refresh", "i-sm")}Try again</button>
      ${keyIssue ? `<button type="button" class="btn btn-ghost btn-sm" data-action="settings">${icon("key", "i-sm")}${chatgpt ? "ChatGPT settings" : "Check API key"}</button>` : ""}
    </div></div></div>`;
  requestAnimationFrame(() => $("genError").scrollIntoView({ block: "nearest", behavior: "smooth" }));
}

export async function runGenerate(mode = "full") {
  if (state.busy) return;
  const err = planError();
  if (err) { toast(err, "warn"); return; }
  const apiKey = getApiKey();
  if (!isAiReady()) {
    toast("Connect an AI service in Settings to generate worksheets.", "warn", { actions: [{ label: "Open settings", run: () => actions.openSettings() }] });
    actions.openSettings();
    return;
  }
  if (!state.plan) refreshPlan();
  const form = buildForm();
  // The worksheet's word table is exactly the Step 2 table, so empty fields stay empty — say so first.
  const gaps = Object.entries(findVocabGaps(form));
  if (mode === "full" && gaps.length) {
    const label = { type: "Part of speech", greek: "Greek", emojis: "Emojis", collocation: "Phrase" };
    const list = gaps.map(([k, w]) => `${label[k]}: ${w.slice(0, 3).join(", ")}${w.length > 3 ? ` +${w.length - 3}` : ""}`).join("  ·  ");
    const ok = await confirmDialog({
      title: "Some fields are empty",
      body: `${list}. The worksheet uses exactly what is in Step 2, so these will stay blank. Fill them in Step 2 (✨ Fill with AI) or generate anyway.`,
      okLabel: "Generate anyway", cancelLabel: "Back to Step 2", tone: "primary", iconName: "alert",
    });
    if (!ok) { actions.go("words"); return; }
  }
  const customPlan = state.ex.mode === "custom" ? state.plan : null;
  // The current selection is the only source of words: a stale worksheet is rewritten in full, and a
  // worksheet for another unit becomes a new library entry instead of overwriting the old unit's.
  const fr = worksheetFreshness();
  if (fr?.wordsChanged) mode = "full";
  const updateId = fr?.unitChanged ? null : state.sessionId;
  const title = mode === "dictation" ? "Rewriting the Dictation…" : mode === "lingo" ? "Rewriting the Lingo practice…" : "Writing your worksheets…";
  setBusy(true, title);
  actions.setAiState("busy");
  try {
    let result;
    if (mode === "dictation" && state.data) result = await regenerateDictationOnly(form, apiKey, state.data, { plan: customPlan, tune: state.ex.tune });
    else if (mode === "lingo" && state.data) result = await regenerateLingoPracticeOnly(form, apiKey, state.data, { plan: customPlan, tune: state.ex.tune });
    else result = await generateWorksheets(form, apiKey, { plan: state.plan });
    state.data = normalizeWorksheetExercises(result.data);
    state.plan = result.plan || state.plan;
    const val = validateWorksheet(state.data);
    try {
      state.sessionId = saveWorksheetSession(form, state.data, state.plan, { updateId, validation: val });
    } catch (saveErr) {
      toast(`Generated, but saving to the library failed: ${saveErr.message}`, "error");
    }
    actions.setAiState("on");
    setBusy(false);
    emit("data", "library");
    toast(val.valid ? "Worksheets ready and saved to your library." : `Worksheets ready — ${plural(val.issues.length, "note")} to review.`, val.valid ? "ok" : "warn");
    actions.go("preview");
  } catch (e) {
    setBusy(false);
    actions.setAiState("error", e.message);
    showGenError(e.message || String(e));
  }
}
