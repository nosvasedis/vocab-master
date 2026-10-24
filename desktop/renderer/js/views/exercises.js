/* Step 3 — the worksheet's exercises, laid out like the Test Maker's parts: one row per exercise on each sheet (the
 * exercise is a button to the library), one opens at a time with what the children do beside its own settings
 * (lines, difficulty, word box, the teacher's wish). Lingo's mix fills it for the class; then AI generation. */
import {
  CLASS_PROFILES, EXERCISE_LABELS,
  pickGenerationPlan, analyzeVocabFeatures, generateWorksheets, regenerateDictationOnly,
  regenerateLingoPracticeOnly, normalizeWorksheetExercises, validateWorksheet, saveWorksheetSession, findVocabGaps,
  normalizeTune, isDefaultTune, tunedProfile,
} from "../../app.js";
import { $, esc, icon, plural, toast, segmented, confirmDialog } from "../ui.js";
import { state, emit, on, buildForm, filledWords, bookTitle, unitNumber, pageRange, worksheetFreshness, detachWorksheet } from "../state.js";
import { getApiKey, isAiReady, getProvider, chatgptUsageLimited, manageChatGPTUsage } from "../bridge.js";
import { actions } from "../actions.js";
import { stepperHtml } from "./studio-common.js";
import { openWorksheetLibrary, wsTask, wsBadges, sampleHtml } from "./task-library.js";
import {
  WS_TASKS, WS_SHEETS, WS_KINDS, WS_LEVELS, WS_ITEMS, WS_EXTRAS, wsTaskFit, wsBlock, planEntries, withEntries,
} from "../../studio/worksheet-tasks.js";

let lengthSeg;
let levelSeg;
let genTimer = null;
/** The open exercise ("dictation:2"), one at a time. */
let openKey = null;

const SHEETS = ["dictation", "lingo"];
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
  lengthSeg = segmented($("tuneLength"), { value: state.ex.tune?.length || "class", onChange: (v) => setTune({ length: v }) });
  levelSeg = segmented($("tuneLevel"), { value: state.ex.tune?.level || "class", onChange: (v) => setTune({ level: v }) });
  $("tuneItems").addEventListener("change", (e) => setTune({ items: Number(e.target.value) }));
  $("tuneExtras").addEventListener("change", (e) => setTune({ extras: Number(e.target.value) }));
  $("btnTuneReset").addEventListener("click", () => setTune(null));
  $("dictCount").addEventListener("change", (e) => { state.ex.dictCount = Number(e.target.value); newMix(); });
  $("lingoCount").addEventListener("change", (e) => { state.ex.lingoCount = Number(e.target.value); newMix(); });
  $("btnShuffle").addEventListener("click", () => newMix());
  $("wsPresets").addEventListener("click", (e) => {
    const p = e.target.closest("[data-preset]");
    if (p) applyPreset(p.dataset.preset);
  });
  const view = $("wsParts").closest("[data-view]");
  view.addEventListener("click", (e) => {
    const go = e.target.closest(".ex-crosslink")?.dataset.go;
    if (go) actions.go(go);
  });
  $("wsParts").addEventListener("click", onPartsClick);
  $("wsParts").addEventListener("input", onPartsInput);
  $("wsParts").addEventListener("change", onPartsChange);

  $("btnGenerate").addEventListener("click", () => runGenerate("full"));
  $("btnRegenDict").addEventListener("click", () => runGenerate("dictation"));
  $("btnRegenLingo").addEventListener("click", () => runGenerate("lingo"));
  $("genError").addEventListener("click", (e) => {
    if (e.target.closest("[data-action=usage]")) manageChatGPTUsage().catch(() => actions.openSettings());
    if (e.target.closest("[data-action=retry]")) runGenerate("full");
    if (e.target.closest("[data-action=settings]")) actions.openSettings();
  });

  // A new class gets Lingo's mix for it — unless the teacher built the plan, which keeps its exercises (the badges
  // then say which ones are a stretch or easy for the new class).
  on("level", () => { if (state.plan?.exerciseMode !== "custom") state.plan = null; });
  on("data", renderGenerateCard);
  on("setup", detachIfUnitChanged);
}

/** A different book or unit was chosen: the open worksheets belong to the old unit. Put them away
 *  (they are safe in the Library) so nothing of the old word list reaches the new generation. */
function detachIfUnitChanged() {
  const fr = worksheetFreshness();
  if (!fr?.unitChanged || state.busy) return;
  detachWorksheet();
  emit("data");
  toast(`${fr.label || "The previous unit"}: worksheets are saved in your library. The new unit starts fresh.`, "info", {
    ms: 4200,
    actions: [{ label: "Library", run: () => actions.go("library") }],
  });
}

/** Called when the Exercises view is shown. */
export function enterExercises() {
  if (state.profileId && !state.plan?.dictationTypes?.length) newMix({ quiet: true });
  renderExercises();
}

const features = () => analyzeVocabFeatures(buildForm());
const levelName = () => CLASS_PROFILES[state.profileId]?.label || "";

/* ── The plan: state.plan is the one source (types, counts, each exercise's settings, the fine-tuning) ── */
function commit(sheet, list) {
  state.plan = withEntries(state.plan, sheet, list);
  if (!isDefaultTune(state.ex.tune)) state.plan.tune = { ...normalizeTune(state.ex.tune) };
  emit("plan");
  renderExercises();
}

/** Lingo's mix for the class (the old plan comes back with Undo). */
function newMix({ quiet = false } = {}) {
  if (!state.profileId) { state.plan = null; renderExercises(); return; }
  const before = state.plan;
  const tune = state.ex.tune;
  state.plan = pickGenerationPlan(state.profileId, {
    exerciseMode: "random",
    forceRandom: !!before,
    vocabFeatures: features(),
    tune,
    ...(state.ex.dictCount > 0 ? { dictationCount: state.ex.dictCount } : {}),
    ...(state.ex.lingoCount > 0 ? { lingoCount: state.ex.lingoCount } : {}),
  });
  openKey = null;
  emit("plan");
  renderExercises();
  if (!quiet && before?.dictationTypes) {
    toast(`A new mix for ${levelName()}.`, "ok", { ms: 3200, actions: [{ label: "Undo", run: () => { state.plan = before; emit("plan"); renderExercises(); } }] });
  }
}

/* ── Fine-tuning for every exercise: it rides on the plan, so changing it never reshuffles the exercises ── */
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
    ...[3, 4, 5, 6, 7, 8].filter((n) => n !== base.itemsPerExercise).map((n) => `<option value="${n}">${n} lines</option>`)].join("");
  sel.value = String(t.items && t.items !== base.itemsPerExercise ? t.items : 0);
  $("tuneExtras").value = String(t.extras);
  lengthSeg?.set(t.length);
  levelSeg?.set(t.level);
  const level = { easier: "a bit easier", class: "", harder: "a bit harder" }[t.level];
  $("tuneHint").textContent = `${p.itemsPerExercise} lines per exercise · sentences up to ${p.maxSentenceWords} words${level ? ` · ${level}` : ""}${t.extras ? ` · +${t.extras} in word boxes` : ""}`;
  $("btnTuneReset").classList.toggle("hidden", isDefaultTune(t));
  $("tunePanel").classList.toggle("tuned", !isDefaultTune(t));
}

/* ── Presets: a starting set made of the exercises that suit the class and the word list ── */
const PRESETS = {
  balanced: [["D01", "D13", "D03", "D08", "D29"], ["L01", "L02"]],
  recognise: [["D03", "D13", "D15", "D12", "D11"], ["L02", "L11"]],
  recall: [["D01", "D27", "D04", "D22", "D28", "D29"], ["L01", "L08"]],
  exam: [["D01", "D13", "D02", "D14", "D17", "D25"], ["L02", "L13"]],
  families: [["D02", "D10", "D05", "D06", "D01"], ["L07", "L04", "L03"]],
};

function applyPreset(name) {
  if (!state.profileId || !PRESETS[name]) return;
  const f = features();
  const usable = (id) => wsTaskFit(id, state.profileId).fit === "great" && !wsBlock(id, f);
  const pool = (sheet) => Object.keys(WS_TASKS).filter((id) => WS_TASKS[id].sheet === sheet && usable(id));
  const pick = (sheet, preferred, n) => {
    const out = preferred.filter(usable).slice(0, n);
    for (const id of pool(sheet)) { if (out.length >= n) break; if (!out.includes(id)) out.push(id); }
    return out;
  };
  const before = state.plan;
  const dict = pick("dictation", PRESETS[name][0], 4).map((type) => ({ type }));
  const lingo = pick("lingo", PRESETS[name][1], 2).map((type) => ({ type }));
  state.plan = withEntries(withEntries({ tune: before?.tune }, "dictation", dict), "lingo", lingo);
  if (!state.plan.tune) delete state.plan.tune;
  openKey = null;
  emit("plan");
  renderExercises();
  const label = $("wsPresets").querySelector(`[data-preset="${name}"]`)?.textContent.replace(/^\W+/u, "").trim() || name;
  toast(`Started from “${label}” — change any exercise below.`, "ok", {
    ms: 3200, actions: before?.dictationTypes ? [{ label: "Undo", run: () => { state.plan = before; emit("plan"); renderExercises(); } }] : [],
  });
}

function planError() {
  if (!state.profileId) return "Choose a class level in Step 1.";
  if (state.inputMode === "structured" && !filledWords().length) return "Add some words in Step 2 first.";
  if (state.inputMode === "freeform" && state.freeform.trim().length < 10) return "Describe the unit in Step 2 first.";
  const p = state.plan;
  if (!p?.dictationTypes?.length) return "Add at least one Dictation exercise.";
  if (!p?.lingoTypes?.length) return "Add at least one Lingo practice exercise.";
  const f = features();
  for (const id of [...p.dictationTypes, ...p.lingoTypes]) {
    const block = wsBlock(id, f);
    if (block) return `“${EXERCISE_LABELS[id] || id}” ${block} — change it or fill that column.`;
  }
  return null;
}

/* ── Rendering ───────────────────────────────────────────────────── */
export function renderExercises() {
  $("dictCount").value = String(state.ex.dictCount || 0);
  $("lingoCount").value = String(state.ex.lingoCount || 0);
  renderParts();
  renderTune();
  renderGenerateCard();
}

/** The lines an exercise will have: its own number, else the worksheet's. */
function linesOf(e) {
  return e.items || tunedProfile(state.profileId, state.ex.tune)?.itemsPerExercise || 5;
}

/** What a closed row says on one line. */
function facts(e) {
  const t = WS_TASKS[e.type];
  const out = [plural(linesOf(e), "line")];
  out.push(WS_LEVELS[e.level || 3].label);
  if (t?.knobs?.includes("extras")) {
    const n = e.extras ?? normalizeTune(state.ex.tune).extras;
    out.push(n ? `Word box: +${n} extra` : "Word box: one per gap");
  }
  const fit = wsTaskFit(e.type, state.profileId);
  if (fit.fit !== "great") out.push(fit.label);
  return out;
}

function rowHtml(sheet, e, i, count, f) {
  const t = wsTask(e.type);
  if (!t) return "";
  const key = `${sheet}:${i}`;
  const expanded = openKey === key;
  const block = wsBlock(e.type, f);
  const lv = e.level || 3;
  const fit = wsTaskFit(e.type, state.profileId);
  const head = `<div class="pc-head" data-expand="${key}">
      <span class="pc-num" aria-hidden="true"><b>${i + 1}</b><span>${WS_SHEETS[sheet].icon}</span></span>
      <div class="pc-main">
        <small class="pc-skill">${esc(sheet === "dictation" ? "Dictation" : "Lingo practice")} · ${esc(e.type)}${block ? ` · <em>${esc(block)}</em>` : ""}</small>
        <div class="pc-name">
          <button type="button" class="pc-task" data-pick="${key}" data-tip="Change the exercise" aria-label="Change exercise ${i + 1}: ${esc(t.label)}"><span>${esc(t.label)}</span>${icon("chevron-down", "i-sm")}</button>
          <span class="tk-kind kind-${esc(t.kind)}">${esc(WS_KINDS[t.kind].label)}</span>
        </div>
        <p class="pc-facts">${facts(e).map((x) => `<span${x === fit.label ? ` class="ws-fit-${fit.fit}"` : ""}>${esc(x)}</span>`).join("")}${e.note ? `<span class="pc-wish">${icon("pencil", "i-xs")}${esc(e.note)}</span>` : ""}</p>
      </div>
      <span class="pc-pts"><b>${linesOf(e)}</b><small>lines</small></span>
      <span class="part-acts">
        <button type="button" class="icon-btn sm" data-move="-1" data-key="${key}" data-tip="Move up" aria-label="Move exercise ${i + 1} up" ${i === 0 ? "disabled" : ""}>${icon("chevron-up", "i-sm")}</button>
        <button type="button" class="icon-btn sm" data-move="1" data-key="${key}" data-tip="Move down" aria-label="Move exercise ${i + 1} down" ${i === count - 1 ? "disabled" : ""}>${icon("chevron-down", "i-sm")}</button>
        <button type="button" class="icon-btn sm danger" data-remove="${key}" data-tip="Remove this exercise" aria-label="Remove exercise ${i + 1}" ${count <= 1 ? "disabled" : ""}>${icon("trash", "i-sm")}</button>
      </span>
      <button type="button" class="pc-toggle" data-expand="${key}" aria-expanded="${expanded}" aria-controls="wsBody-${key.replace(":", "-")}">${icon(expanded ? "chevron-up" : "sliders", "i-sm")}<span>${expanded ? "Done" : "Settings"}</span></button>
    </div>`;
  const cls = `part-card${block ? " stale" : ""}${expanded ? " open" : ""}`;
  if (!expanded) return `<li class="${cls}" data-key="${key}" data-skill="ws-${sheet}">${head}</li>`;
  const extras = t.knobs?.includes("extras")
    ? `<div class="pc-knob"><span class="pc-lbl">Word box</span><div class="pc-chips" role="radiogroup" aria-label="Extra words in the word box">${[["", "Like every exercise"], ...WS_EXTRAS].map(([v, label]) => {
      const on = String(e.extras ?? "") === String(v);
      return `<button type="button" class="pc-chip${on ? " active" : ""}" data-extras="${esc(v)}" data-key="${key}" role="radio" aria-checked="${on}">${esc(label)}</button>`;
    }).join("")}</div></div>`
    : "";
  return `<li class="${cls}" data-key="${key}" data-skill="ws-${sheet}">${head}
    <div class="pc-body" id="wsBody-${key.replace(":", "-")}">
      <div class="pc-about">
        <div class="pc-badges">${wsBadges(e.type, state.profileId)}</div>
        <p class="pc-blurb">${esc(t.blurb || "")}</p>
        <div class="pc-sample" aria-label="How it looks on the paper">${sampleHtml(e.type, t)}</div>
        ${t.trains?.length ? `<p class="pc-trains">${icon("target", "i-xs")}<span>Trains: ${esc(t.trains.join(" · "))}</span></p>` : ""}
        ${fit.fit !== "great" ? `<p class="pc-trains ws-fit-note">${icon("info", "i-xs")}<span>Usually for ${esc(fit.range)} — ${fit.fit === "stretch" ? "a challenge for" : "easy for"} ${esc(levelName())}. Fine if you chose it on purpose.</span></p>` : ""}
      </div>
      <div class="pc-set">
        <div class="pc-ctl">
          <span class="part-ctl">${stepperHtml(`items:${key}`, linesOf(e), WS_ITEMS[0], WS_ITEMS[1])}<small>lines${e.items ? "" : " (like every exercise)"}</small></span>
          ${e.items ? `<button type="button" class="btn btn-ghost btn-sm" data-items-reset="${key}">Like every exercise</button>` : ""}
        </div>
        <div class="pc-level" style="--lv:${(lv - 1) * 25}%" data-lv="${lv}">
          <span class="pc-lbl">Difficulty</span>
          <input type="range" min="1" max="5" step="1" value="${lv}" data-level="${key}" aria-label="Difficulty of exercise ${i + 1}" aria-valuetext="${WS_LEVELS[lv].label}" />
          <b class="pc-level-v">${WS_LEVELS[lv].label}</b>
        </div>
        ${extras}
        <div class="pc-knob"><span class="pc-lbl">Your wish</span><input class="input sm part-note" data-note="${key}" placeholder="Optional, e.g. “about a school trip”" value="${esc(e.note || "")}" maxlength="160" /></div>
        ${block ? `<p class="pc-new-words ws-block">${icon("alert", "i-xs")}<span>This exercise ${esc(block)}. Change the exercise, or add them in Step 2.</span></p>` : ""}
      </div>
    </div>
  </li>`;
}

function renderParts() {
  const host = $("wsParts");
  if (!state.profileId) {
    host.innerHTML = `<div class="callout warning plan-empty">${icon("info")}<span>Choose a class level in Step 1 to see the exercises.</span></div>`;
    $("wsPlanSum").textContent = "";
    return;
  }
  const f = features();
  const lists = Object.fromEntries(SHEETS.map((sh) => [sh, planEntries(state.plan, sh)]));
  const all = [...lists.dictation, ...lists.lingo];
  const mix = Object.entries(all.reduce((m, e) => { const k = WS_TASKS[e.type]?.kind; if (k) m[k] = (m[k] || 0) + 1; return m; }, {}));
  const lines = all.reduce((n, e) => n + linesOf(e), 0);
  const section = (sheet) => {
    const list = lists[sheet];
    const sh = WS_SHEETS[sheet];
    return `<section class="ws-sheet" data-skill="ws-${sheet}">
      <div class="ws-sheet-head"><span class="ws-sheet-ico">${sh.icon}</span><div><b>${esc(sh.label)}</b><small>${esc(sh.note)}</small></div><span class="badge">${plural(list.length, "exercise")}</span></div>
      <ol class="part-list">${list.map((e, i) => rowHtml(sheet, e, i, list.length, f)).join("") || `<li class="st-hint">No exercises yet — add one below.</li>`}</ol>
      <button type="button" class="add-tile ws-add" data-add="${sheet}" data-skill="ws-${sheet}"><span>${sh.icon}</span>Add a ${sheet === "dictation" ? "Dictation" : "Lingo practice"} exercise${icon("plus", "i-xs")}</button>
    </section>`;
  };
  host.innerHTML = `${all.length ? `<div class="pc-overview">
      <div class="pc-bar" aria-label="Each exercise's share of the lines">${SHEETS.flatMap((sheet) => lists[sheet].map((e, i) => `<button type="button" class="pc-seg" data-skill="ws-${sheet}" data-expand="${sheet}:${i}" style="flex:${linesOf(e)}" data-tip="${esc(`${sheet === "dictation" ? "Dictation" : "Lingo"} ${i + 1} · ${EXERCISE_LABELS[e.type] || e.type} · ${plural(linesOf(e), "line")}`)}" aria-label="${esc(`${sheet === "dictation" ? "Dictation" : "Lingo"} exercise ${i + 1}`)}">${WS_SHEETS[sheet].icon}</button>`)).join("")}</div>
      <div class="pc-mix">${icon("layers", "i-sm")}<span>This worksheet:</span>${mix.map(([k, n]) => `<span class="tk-kind kind-${k}">${n} × ${esc(WS_KINDS[k].label)}</span>`).join("")}<small>${mix.length < 2 ? "Mix kinds of exercise: recognising first, then recalling." : "A good mix: recognising, recalling" + (mix.some(([k]) => k === "create") ? " and using the words." : " — add “Own sentence” to use them too.")}</small></div>
    </div>` : ""}
    <div class="ws-sheets">${section("dictation")}${section("lingo")}</div>`;
  $("wsPlanSum").textContent = `${plural(lists.dictation.length, "Dictation exercise")} · ${plural(lists.lingo.length, "practice exercise")} · ≈ ${lines} lines`;
}

/* ── Interaction ─────────────────────────────────────────────────── */
const parseKey = (key) => { const [sheet, i] = String(key || "").split(":"); return { sheet, i: Number(i) }; };

function update(key, patch) {
  const { sheet, i } = parseKey(key);
  const list = planEntries(state.plan, sheet);
  if (!list[i]) return;
  list[i] = { ...list[i], ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete list[i][k];
  commit(sheet, list);
}

function libraryFor(sheet, i, mode) {
  const list = planEntries(state.plan, sheet);
  const recommended = sheet === "dictation" ? CLASS_PROFILES[state.profileId]?.seedCombos.flat() || [] : CLASS_PROFILES[state.profileId]?.seedLingo.flat() || [];
  openWorksheetLibrary({
    sheet,
    levelId: state.profileId,
    levelName: levelName(),
    current: mode === "change" ? list[i]?.type : "",
    features: features(),
    recommended,
    mode,
    partLabel: mode === "change" ? `${sheet === "dictation" ? "Dictation" : "Lingo"} ${i + 1}` : "",
    onPick: (id) => {
      const label = EXERCISE_LABELS[id] || id;
      if (mode === "change") {
        // A new exercise keeps the lines and the wish; the word box is its own.
        const { extras: _x, ...keep } = list[i];
        list[i] = { ...keep, type: id };
        openKey = `${sheet}:${i}`;
        commit(sheet, list);
        toast(`${sheet === "dictation" ? "Dictation" : "Lingo"} ${i + 1} is now “${label}”.`, "ok", { ms: 2000 });
        return;
      }
      list.push({ type: id });
      openKey = `${sheet}:${list.length - 1}`;
      commit(sheet, list);
      requestAnimationFrame(() => $("wsParts").querySelector(`[data-key="${openKey}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    },
  });
}

function onPartsClick(e) {
  const ex = e.target.closest("[data-expand]");
  if (ex && (ex.matches("button") || !e.target.closest("button, input, a"))) {
    openKey = openKey === ex.dataset.expand ? null : ex.dataset.expand;
    renderParts();
    if (openKey) $("wsParts").querySelector(`[data-key="${openKey}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const add = e.target.closest("[data-add]");
  if (add) { libraryFor(add.dataset.add, -1, "add"); return; }
  const pick = e.target.closest("[data-pick]");
  if (pick) { const { sheet, i } = parseKey(pick.dataset.pick); libraryFor(sheet, i, "change"); return; }
  const step = e.target.closest("[data-stepper] [data-step]");
  if (step) {
    const key = step.closest("[data-stepper]").dataset.stepper.split("items:")[1];
    const { sheet, i } = parseKey(key);
    const cur = planEntries(state.plan, sheet)[i];
    if (!cur) return;
    const n = Math.max(WS_ITEMS[0], Math.min(WS_ITEMS[1], linesOf(cur) + Number(step.dataset.step)));
    update(key, { items: n });
    return;
  }
  const reset = e.target.closest("[data-items-reset]");
  if (reset) { update(reset.dataset.itemsReset, { items: undefined }); return; }
  const chip = e.target.closest("[data-extras]");
  if (chip) { update(chip.dataset.key, { extras: chip.dataset.extras === "" ? undefined : Number(chip.dataset.extras) }); return; }
  const mv = e.target.closest("[data-move]");
  if (mv) {
    const { sheet, i } = parseKey(mv.dataset.key);
    const j = i + Number(mv.dataset.move);
    const list = planEntries(state.plan, sheet);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    if (openKey === `${sheet}:${i}`) openKey = `${sheet}:${j}`;
    else if (openKey === `${sheet}:${j}`) openKey = `${sheet}:${i}`;
    commit(sheet, list);
    return;
  }
  const rm = e.target.closest("[data-remove]");
  if (rm) {
    const { sheet, i } = parseKey(rm.dataset.remove);
    const list = planEntries(state.plan, sheet);
    if (list.length <= 1) return;
    const before = state.plan;
    const [gone] = list.splice(i, 1);
    if (openKey?.startsWith(`${sheet}:`)) openKey = null;
    commit(sheet, list);
    toast(`Removed “${EXERCISE_LABELS[gone.type] || gone.type}”.`, "info", { ms: 3200, actions: [{ label: "Undo", run: () => { state.plan = before; emit("plan"); renderExercises(); } }] });
  }
}

/** The difficulty slider moves its label live; the plan changes when it is let go (change). */
function onPartsInput(e) {
  const r = e.target.closest("[data-level]");
  if (!r) return;
  const lv = Number(r.value);
  const box = r.closest(".pc-level");
  box.dataset.lv = lv;
  box.style.setProperty("--lv", `${(lv - 1) * 25}%`);
  box.querySelector(".pc-level-v").textContent = WS_LEVELS[lv].label;
}

function onPartsChange(e) {
  const r = e.target.closest("[data-level]");
  if (r) { update(r.dataset.level, { level: Number(r.value) === 3 ? undefined : Number(r.value) }); return; }
  const n = e.target.closest("[data-note]");
  if (n) update(n.dataset.note, { note: n.value.trim() || undefined });
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
    state.plan ? `<span class="badge">${state.plan.dictationTypes?.length || 0} Dictation · ${state.plan.lingoTypes?.length || 0} Lingo</span>` : "",
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
  if (!state.plan?.dictationTypes?.length && state.profileId) newMix({ quiet: true });
  const err = planError();
  if (err) { toast(err, "warn"); return; }
  const apiKey = getApiKey();
  if (!isAiReady()) {
    toast("Connect an AI service in Settings to generate worksheets.", "warn", { actions: [{ label: "Open settings", run: () => actions.openSettings() }] });
    actions.openSettings();
    return;
  }
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
  // Step 3 is what gets written: the exercises, their order and their own settings.
  const plan = state.plan;
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
    if (mode === "dictation" && state.data) result = await regenerateDictationOnly(form, apiKey, state.data, { plan, tune: state.ex.tune });
    else if (mode === "lingo" && state.data) result = await regenerateLingoPracticeOnly(form, apiKey, state.data, { plan, tune: state.ex.tune });
    else result = await generateWorksheets(form, apiKey, { plan });
    state.data = normalizeWorksheetExercises(result.data);
    // A one-sheet rewrite keeps the other sheet as it is: the plan says what the worksheet now holds.
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
