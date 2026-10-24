/* Test Maker — the exercise library: every task type of every skill as a card that says what the children do, why,
 * which class it suits and how it looks on paper (a tiny preview), plus the unit's reading texts. Used by the parts
 * step (js/views/tests.js) to change a part's exercise or add a new part. */
import { esc, icon, openDialog } from "../ui.js";
import { TASKS, SKILLS, KINDS, tasksFor, taskFit, defaultTask, secondTask } from "../../studio/tasks.js";
import { taskBlock } from "../../studio/test-builder.js";
import { TEXT_KINDS, wordCount, textUnitWords } from "../../studio/reading-texts.js";
import { WS_TASKS, WS_KINDS, WS_SHEETS, wsTaskFit, wsTasksFor, wsBlock } from "../../studio/worksheet-tasks.js";
import { EXERCISE_LABELS } from "../../app.js";

const LETTERS = "abcd";
const TEST_SKILLS = Object.keys(SKILLS).filter((k) => k !== "dictation");

/** A small paper-like preview of a task, from its sample (TASKS[id].sample, or a worksheet exercise from wsTask). */
export function sampleHtml(taskId, t = TASKS[taskId]) {
  const s = t?.sample;
  if (!s) return "";
  const out = [];
  if (s.audio) out.push(`<div class="tkp-audio">${icon("volume", "i-xs")}<span>${esc(s.audio)}</span></div>`);
  if (s.text) out.push(`<div class="tkp-text">${esc(s.text)}</div>`);
  if (s.bank) out.push(`<div class="tkp-bank">${s.bank.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`);
  if (s.pairs) {
    out.push(`<div class="tkp-pairs"><div>${s.pairs.map(([a], i) => `<span><i>${i + 1}</i>${esc(a)}</span>`).join("")}</div><div>${s.pairs.map((_, i) => `<span><i>${(LETTERS[i] || "").toUpperCase()}</i>${esc(s.pairs[(i + 1) % s.pairs.length][1])}</span>`).join("")}</div></div>`);
  } else if (s.list) {
    out.push(`<div class="tkp-order">${s.list.map((x, i) => `<span><b>${i === 1 ? "1" : ""}</b>${esc(x)}</span>`).join("")}</div>`);
  } else if (t.answer === "open") {
    if (s.pics) out.push(`<div class="tkp-pics">${s.pics.map((p) => `<span>${p}</span>`).join("")}</div>`);
    if (s.q) out.push(`<div class="tkp-q">${esc(s.q)}</div>`);
    if (s.lines) out.push(`<div class="tkp-lines">${s.lines.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`);
  } else {
    const q = s.q ? `<span class="tkp-qt">${esc(s.q)}${s.hint ? ` <em class="tkp-hint">${esc(s.hint)}</em>` : ""}</span>` : "";
    if (s.pics && t.answer === "choice") {
      out.push(`<div class="tkp-q">${q}</div><div class="tkp-pics">${s.pics.map((p, i) => `<span class="${i === s.a ? "on" : ""}">${p}${i === s.a ? "<b>✓</b>" : ""}</span>`).join("")}</div>`);
    } else if (s.pics) {
      out.push(`<div class="tkp-pics one">${s.pics.map((p) => `<span>${p}</span>`).join("")}<div class="tkp-q">${q}<span class="tkp-ans">${esc(s.a)}</span></div></div>`);
    } else if (t.answer === "choice") {
      out.push(`${q ? `<div class="tkp-q">${q}</div>` : ""}<div class="tkp-opts">${s.o.map((o, i) => `<span class="${i === s.a ? "on" : ""}"><b>${LETTERS[i]}</b>${esc(o)}</span>`).join("")}</div>`);
    } else if (t.answer === "tf") {
      out.push(`<div class="tkp-q tkp-tf">${q}<span class="tkp-box">${esc(s.a)}</span></div>`);
    } else {
      out.push(`<div class="tkp-q">${q}<span class="tkp-ans">${esc(s.a)}</span></div>`);
    }
  }
  return `<div class="tkp" data-skill="${esc(t.skill)}">${out.join("")}</div>`;
}

/** The kind and class-fit badges of a task (a worksheet exercise passes its own task and fit). */
export function taskBadges(taskId, levelId, { task = TASKS[taskId], fit = taskFit(taskId, levelId) } = {}) {
  const t = task;
  return `<span class="tk-kind kind-${esc(t.kind)}" data-tip="${esc(KINDS[t.kind]?.hint || "")}">${esc(KINDS[t.kind]?.label || "")}</span>${fit.label ? `<span class="tk-fit fit-${fit.fit}">${fit.fit === "great" ? icon("check", "i-xs") : ""}${esc(fit.label)}</span>` : ""}`;
}

function card(t, { levelId, current, src, recommended }) {
  const block = src ? taskBlock(t.id, src) : "";
  const fit = taskFit(t.id, levelId);
  const isCurrent = t.id === current;
  return `<button type="button" class="tl-card kind-${esc(t.kind)} fit-${fit.fit}${isCurrent ? " current" : ""}${block ? " blocked" : ""}" data-task="${esc(t.id)}" data-skill="${esc(t.skill)}"${block ? ` aria-disabled="true"` : ""}>
    <span class="tl-top">${taskBadges(t.id, levelId)}${recommended.includes(t.id) ? `<span class="tk-rec">${icon("star", "i-xs")}Lingo's pick</span>` : ""}${isCurrent ? `<span class="tl-now">${icon("check", "i-xs")}In this part</span>` : ""}</span>
    <b class="tl-title">${esc(t.label)}</b>
    <span class="tl-blurb">${esc(t.blurb || "")}</span>
    ${sampleHtml(t.id)}
    <span class="tl-trains">${(t.trains || []).map((x) => `<span>${esc(x)}</span>`).join("")}</span>
    ${block ? `<span class="tl-block">${icon("alert", "i-xs")}${esc(block[0].toUpperCase() + block.slice(1))}</span>` : ""}
  </button>`;
}

/**
 * The library dialog. mode "change" (a part's exercise) or "add" (a new part).
 * onPick(taskId) is called with the chosen task; the dialog closes.
 */
export function openTaskLibrary({ skill, levelId, levelName = "", current = "", src = null, mode = "change", partLabel = "", onPick }) {
  let tab = skill || "reading";
  let onlyFit = false;
  const recommended = (k) => [defaultTask(k, levelId), secondTask(k, levelId)];
  const grid = () => {
    const list = tasksFor(tab, levelId).filter((t) => !onlyFit || taskFit(t.id, levelId).fit === "great");
    return list.map((t) => card(t, { levelId, current, src, recommended: recommended(tab) })).join("") || `<p class="tl-empty">No ${esc(SKILLS[tab].label.toLowerCase())} exercises are made for ${esc(levelName || "this class")} — turn off the filter to see them all.</p>`;
  };
  const tabs = () => TEST_SKILLS.map((k) => `<button type="button" class="tl-tab${k === tab ? " active" : ""}" data-tab="${k}" data-skill="${k}" role="tab" aria-selected="${k === tab}"><span>${SKILLS[k].icon}</span>${esc(SKILLS[k].label)}<small>${tasksFor(k).length}</small></button>`).join("");
  const title = mode === "add" ? "Add a part" : `Change the exercise${partLabel ? ` · ${partLabel}` : ""}`;
  return openDialog({
    title,
    subtitle: `Every exercise says what the children do and how it looks on paper. Badges show what suits ${levelName || "your class"}.`,
    iconName: "layers",
    size: "tl-dialog",
    body: `<div class="tl-tabs" role="tablist">${tabs()}</div>
      <div class="tl-bar">
        <div class="tl-legend">${Object.entries(KINDS).map(([k, v]) => `<span class="kind-${k}" data-tip="${esc(v.hint)}"><i></i>${esc(v.label)}</span>`).join("")}<small>A fair test moves from recognising to recalling to creating.</small></div>
        <label class="switch sm"><input type="checkbox" data-only-fit /><span class="track"></span><span class="sw-text">Only for ${esc(levelName || "my class")}</span></label>
      </div>
      <div class="tl-grid" data-skill="${tab}">${grid()}</div>`,
    onMount(root, close) {
      const body = root.querySelector(".dialog-body");
      const redraw = () => {
        root.querySelector(".tl-tabs").innerHTML = tabs();
        const g = root.querySelector(".tl-grid");
        g.dataset.skill = tab;
        g.innerHTML = grid();
      };
      root.querySelector("[data-only-fit]").addEventListener("change", (e) => { onlyFit = e.target.checked; redraw(); });
      body.addEventListener("click", (e) => {
        const tb = e.target.closest("[data-tab]");
        if (tb) { tab = tb.dataset.tab; redraw(); body.scrollTop = 0; return; }
        const c = e.target.closest("[data-task]");
        if (!c || c.getAttribute("aria-disabled") === "true") return;
        close();
        onPick?.(c.dataset.task);
      });
    },
  });
}

/** The reading-text chooser inside a reading part: "Lingo writes a new text" or one of the unit's own texts. */
export function textChooserHtml(partId, texts, chosen, { newNote = "", peek = false } = {}) {
  const sel = texts.find((t) => t.id === chosen) || null;
  const cardFor = (t) => {
    const k = TEXT_KINDS[t.kind] || {};
    const words = textUnitWords(t).length;
    return `<button type="button" class="tx-card${t.id === chosen ? " active" : ""}" data-knob="text" data-val="${esc(t.id)}" data-part-opt="${esc(partId)}" aria-pressed="${t.id === chosen}">
      <span class="tx-kind">${k.icon || ""} ${esc(t.genre)}${texts.some((x) => x.unit !== t.unit) ? ` · U${t.unit}` : ""}</span>
      <b>${esc(t.title)}</b>
      <small>${wordCount(t.text)} words · ${words} unit word${words === 1 ? "" : "s"}</small>
    </button>`;
  };
  return `<div class="tx-pick">
    <div class="tx-cards">
      <button type="button" class="tx-card tx-new${!sel ? " active" : ""}" data-knob="text" data-val="" data-part-opt="${esc(partId)}" aria-pressed="${!sel}"><span class="tx-kind">${icon("sparkles", "i-xs")} New</span><b>Lingo writes a text</b><small>${esc(newNote)}</small></button>
      ${texts.map(cardFor).join("")}
    </div>
    ${sel ? `<div class="tx-preview${peek ? " open" : ""}">
      <button type="button" class="tx-peek" data-peek="${esc(partId)}" aria-expanded="${peek}">${icon(peek ? "eye-off" : "eye", "i-xs")}${peek ? "Hide the text" : `Read “${esc(sel.title)}”`}</button>
      ${peek ? `<div class="tx-body"><h5>${esc(sel.title)}</h5>${sel.text.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}<div class="tx-words">${textUnitWords(sel).map((w) => `<span>${esc(w)}</span>`).join("")}</div></div>` : ""}
    </div>` : ""}
  </div>`;
}

/* ── Worksheets: the same library for the Dictation and Lingo Launcher exercises ─────────────────── */

/**
 * A worksheet exercise (D01–D29, L01–L13) in the Test Maker's task shape, so the same cards, previews and badges
 * show it: label, skill (its sheet's colour) and how it is answered (for the preview).
 */
export function wsTask(id) {
  const t = WS_TASKS[id];
  if (!t) return null;
  const s = t.sample || {};
  const answer = s.o ? "choice" : t.kind === "create" ? "word" : /^(T|F|Yes|No)$/.test(s.a || "") ? "tf" : "word";
  return { ...t, id, label: EXERCISE_LABELS[id] || id, skill: `ws-${t.sheet}`, answer };
}

/** Kind + class-fit badges of a worksheet exercise. */
export function wsBadges(id, levelId) {
  return taskBadges(id, levelId, { task: wsTask(id), fit: wsTaskFit(id, levelId) });
}

function wsCard(id, { levelId, current, features, recommended }) {
  const t = wsTask(id);
  const block = wsBlock(id, features);
  const fit = wsTaskFit(id, levelId);
  const isCurrent = id === current;
  return `<button type="button" class="tl-card kind-${esc(t.kind)} fit-${fit.fit}${isCurrent ? " current" : ""}${block ? " blocked" : ""}" data-task="${esc(id)}" data-skill="${esc(t.skill)}"${block ? ` aria-disabled="true"` : ""}>
    <span class="tl-top">${wsBadges(id, levelId)}${recommended.includes(id) ? `<span class="tk-rec">${icon("star", "i-xs")}In Lingo's mix</span>` : ""}${isCurrent ? `<span class="tl-now">${icon("check", "i-xs")}This exercise</span>` : ""}</span>
    <b class="tl-title">${esc(t.label)} <small class="tl-id">${esc(id)}</small></b>
    <span class="tl-blurb">${esc(t.blurb || "")}</span>
    ${sampleHtml(id, t)}
    <span class="tl-trains">${(t.trains || []).map((x) => `<span>${esc(x)}</span>`).join("")}</span>
    ${block ? `<span class="tl-block">${icon("alert", "i-xs")}${esc(block[0].toUpperCase() + block.slice(1))}</span>` : ""}
  </button>`;
}

/**
 * The worksheet library dialog: every exercise of one sheet as a card (what the children do, a paper preview, the kind
 * and how well it suits the class). mode "change" (an exercise of the plan) or "add". onPick(id) gets the choice.
 */
export function openWorksheetLibrary({ sheet = "dictation", levelId, levelName = "", current = "", features = {}, recommended = [], mode = "change", partLabel = "", onPick }) {
  let onlyFit = false;
  let kind = "all";
  const grid = () => {
    const list = wsTasksFor(sheet, levelId).filter((t) => (!onlyFit || wsTaskFit(t.id, levelId).fit === "great") && (kind === "all" || t.kind === kind));
    return list.map((t) => wsCard(t.id, { levelId, current, features, recommended })).join("") || `<p class="tl-empty">Nothing here for ${esc(levelName || "this class")} — turn off the filters to see every exercise.</p>`;
  };
  const kinds = () => [["all", "All"], ...Object.entries(WS_KINDS).map(([k, v]) => [k, v.label])].map(([k, label]) => `<button type="button" class="tl-tab${k === kind ? " active" : ""}" data-kind="${k}" data-skill="ws-${sheet}" role="tab" aria-selected="${k === kind}">${k === "all" ? "" : `<i class="tl-dot kind-${k}"></i>`}${esc(label)}<small>${wsTasksFor(sheet).filter((t) => k === "all" || t.kind === k).length}</small></button>`).join("");
  const sh = WS_SHEETS[sheet];
  const title = mode === "add" ? `Add a ${sheet === "dictation" ? "Dictation" : "Lingo practice"} exercise` : `Change the exercise${partLabel ? ` · ${partLabel}` : ""}`;
  return openDialog({
    title,
    subtitle: `${sh.icon} ${sh.label}. Every exercise says what the children do and how it looks on paper. Badges show what suits ${levelName || "your class"}.`,
    iconName: "layers",
    size: "tl-dialog",
    body: `<div class="tl-tabs" role="tablist">${kinds()}</div>
      <div class="tl-bar">
        <div class="tl-legend">${Object.entries(WS_KINDS).map(([k, v]) => `<span class="kind-${k}" data-tip="${esc(v.hint)}"><i></i>${esc(v.label)}</span>`).join("")}<small>A good worksheet moves from recognising to recalling to using the words.</small></div>
        <label class="switch sm"><input type="checkbox" data-only-fit /><span class="track"></span><span class="sw-text">Only for ${esc(levelName || "my class")}</span></label>
      </div>
      <div class="tl-grid" data-skill="ws-${sheet}">${grid()}</div>`,
    onMount(root, close) {
      const body = root.querySelector(".dialog-body");
      const redraw = () => {
        root.querySelector(".tl-tabs").innerHTML = kinds();
        root.querySelector(".tl-grid").innerHTML = grid();
      };
      root.querySelector("[data-only-fit]").addEventListener("change", (e) => { onlyFit = e.target.checked; redraw(); });
      body.addEventListener("click", (e) => {
        const kb = e.target.closest("[data-kind]");
        if (kb) { kind = kb.dataset.kind; redraw(); body.scrollTop = 0; return; }
        const c = e.target.closest("[data-task]");
        if (!c || c.getAttribute("aria-disabled") === "true") return;
        close();
        onPick?.(c.dataset.task);
      });
    },
  });
}
