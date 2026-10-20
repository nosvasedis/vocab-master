/* Teacher assistant — the teacher says what they need; the assistant asks at most two questions (as chips),
 * shows an editable plan card, then builds it with the Unit test, Dictation or worksheet makers. */
import { CPP_BOOKS, CLASS_PROFILES, lookupCoursebookWord } from "../../app.js";
import { state, emit, isCpp, LEVEL_COLORS, targetText, makeWord, coursebookEntryToWord, filledWords, SMART_PICK } from "../state.js";
import { isAiReady } from "../bridge.js";
import { actions } from "../actions.js";
import { segmented } from "../ui.js";
import { $, esc, icon, plural, toast, askAi, aiErrorToast, segHtml, switchHtml, stepperHtml, owl, owlHead, loadLessonJson, askClassMemory, classMemoryFor } from "./studio-common.js";
import { reviewWords } from "../../studio/class-memory.js";
import { unitWords, SECTION_LABEL } from "../../studio/unit-context.js";
import { chooseUnitWords, normalizeChoice, WORD_MODES, SECTION_KEYS } from "../../studio/word-choice.js";
import { addOwnWords } from "../../studio/own-words.js";
import { CPP_WORDBANK } from "../../coursebook-data.js";
import {
  KINDS, parseRequest, completePlan, clarifyingQuestions, answerQuestion, planSummary, assistantPrompt, mergeAiPlan, needsAi,
} from "../../studio/assistant.js";
import { GRAMMAR_MENU, LEVEL_IDS, DIFFICULTY } from "../../studio/levels.js";
import { SKILLS, DICTATION_STYLES, defaultTask } from "../../studio/tasks.js";
import { testDefaults, makePart, presetParts, LENGTHS } from "../../studio/test-builder.js";
import { dictationDefaults } from "../../studio/dictation.js";
import { applyTestPreset, generateTestNow } from "./tests.js";
import { applyPreset as applyDictationPreset, generateNow as generateDictationNow, renderDictationView } from "./dictation.js";
import { loadPoolWords } from "./setup.js";
import { runGenerate } from "./exercises.js";

let built = false;
const as = { messages: [], plan: null, questions: [], thinking: false, keyWords: [], keyFor: "", wordsOpen: false };

export function initAssistant() {}

const context = () => ({
  bookId: isCpp() ? state.cpp.bookId : "",
  unit: isCpp() ? state.cpp.unit : 0,
  level: state.profileId || "",
});

/** Starter ideas: [what the teacher would type, kind, short title]. */
function suggestions() {
  const c = context();
  const unit = c.bookId ? `Unit ${c.unit}` : "Unit 4";
  const book = c.bookId ? `Primary Path ${c.bookId.slice(-1)} ` : "";
  return [
    [`A test for ${book}${unit}`, "test", "Unit test"],
    [`A read-aloud dictation for ${unit}, 8 sentences`, "dictation", "Dictation"],
    ["A Present Simple vs Present Continuous test for E class", "test", "Grammar test"],
    [`A quick vocabulary quiz on ${unit}`, "quiz", "Quick quiz"],
    ["Worksheets on There is / there are for A class", "worksheet", "Worksheets"],
    [`Listening and reading test, ${book}Units 3–4, two versions`, "test", "Skills test"],
  ];
}

const autoGrow = (el) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; };

function build() {
  $("assistantView").innerHTML = `
  <div class="as-shell" id="asShell">
    <div class="as-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="as-layout">
      <div class="as-chat">
        <div class="as-messages" id="asMessages"></div>
        <div class="as-dock">
          <div class="as-suggest" id="asSuggest"></div>
          <form class="as-composer" id="asForm">
            <span class="as-composer-ico">${icon("sparkles")}</span>
            <textarea id="asText" rows="1" aria-label="Message to Lingo" placeholder="Tell me what you need… e.g. “a test for Unit 4 with listening, a bit easier”"></textarea>
            <button type="submit" class="as-send" id="asSend" aria-label="Send">${icon("arrow-right")}</button>
          </form>
          <p class="as-foot-note">English or <span lang="el">Ελληνικά</span> · <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line · you can change everything before it’s written</p>
        </div>
      </div>
      <aside class="as-plan" id="asPlan"></aside>
    </div>
  </div>`;
  $("asForm").addEventListener("submit", (e) => { e.preventDefault(); send($("asText").value); });
  $("asText").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("asText").value); } });
  $("asText").addEventListener("input", (e) => { autoGrow(e.target); $("asForm").classList.toggle("ready", !!e.target.value.trim()); });
  $("asMessages").addEventListener("click", (e) => { const b = e.target.closest("[data-suggest]"); if (b) send(b.dataset.suggest); });
  $("asSuggest").addEventListener("click", (e) => { const b = e.target.closest("[data-suggest]"); if (b) send(b.dataset.suggest); });
  $("asMessages").addEventListener("click", (e) => {
    const b = e.target.closest("[data-answer]");
    if (!b) return;
    const q = as.questions.find((x) => x.id === b.dataset.q);
    const opt = q?.options[Number(b.dataset.answer)];
    if (!opt) return;
    as.messages.push({ role: "teacher", text: opt.label });
    as.plan = completePlan(answerQuestion(as.plan, q.id, opt.value), context());
    respond();
    refreshKeyWords();
  });
  $("asPlan").addEventListener("click", onPlanClick);
  $("asPlan").addEventListener("input", onPlanInput);
  $("asPlan").addEventListener("change", (e) => { const k = e.target.dataset.opt; if (k) { as.plan[k] = e.target.checked; renderPlan(); } });
  // Own words: Enter adds; a pasted list (one per line) is added at once.
  $("asPlan").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.own !== undefined) { e.preventDefault(); addOwn(e.target.value); }
  });
  $("asPlan").addEventListener("paste", (e) => {
    if (e.target.dataset?.own === undefined) return;
    const text = e.clipboardData?.getData("text") || "";
    if (/[\n\r]/.test(text)) { e.preventDefault(); addOwn(text); }
  });
  built = true;
}

/* ── Conversation ─────────────────────────────────────────────────── */
async function send(text) {
  text = String(text || "").trim();
  if (!text || as.thinking) return;
  $("asText").value = "";
  autoGrow($("asText"));
  $("asForm").classList.remove("ready");
  as.messages.push({ role: "teacher", text });
  const partial = parseRequest(text, context());
  // A new kind of thing (or a dictation of either kind) starts a new plan; anything else refines the current one.
  const base = partial.kind || partial.dictationChoice || !as.plan ? {} : as.plan;
  let plan = { ...base, ...partial, ...(partial.grammar && base.grammar ? { grammar: [...new Set([...base.grammar, ...partial.grammar])] } : {}) };
  if (needsAi(text, partial) && isAiReady()) {
    as.thinking = true;
    renderMessages();
    try {
      const { system, user } = assistantPrompt(text, context(), plan);
      const ai = await askAi(system, user);
      plan = mergeAiPlan(plan, ai);
      if (ai.reply) as.aiReply = String(ai.reply);
    } catch (e) { aiErrorToast(e); }
    as.thinking = false;
  }
  as.plan = completePlan(plan, context());
  respond();
  refreshKeyWords();
}

function respond() {
  as.questions = clarifyingQuestions(as.plan, context());
  const lead = as.aiReply ? `${as.aiReply} ` : "";
  as.aiReply = "";
  if (as.questions.length) {
    as.messages.push({ role: "assistant", text: `${lead}${as.plan.kind ? `Here’s what I have so far: ${planSummary(as.plan)}` : "Happy to help!"}`, question: as.questions[0] });
  } else {
    as.messages.push({ role: "assistant", text: `${lead}${esc(`Here’s my plan: ${planSummary(as.plan)}`)} Change anything you like on the right, then press <b>Create it now</b>.`, html: true });
  }
  renderMessages();
  renderPlan();
}

function bubble(m) {
  const body = m.html ? m.text : esc(m.text);
  const q = m.question && m === as.messages.findLast((x) => x.question) && as.questions[0]?.id === m.question.id
    ? `<div class="as-q"><b>${esc(m.question.text)}</b><div class="as-q-chips">${m.question.options.map((o, i) => `<button type="button" class="as-opt" data-q="${m.question.id}" data-answer="${i}" style="--i:${i}">${esc(o.label)}</button>`).join("")}</div></div>`
    : m.question ? `<div class="as-q done">${icon("check", "i-xs")}<b>${esc(m.question.text)}</b></div>` : "";
  return `<div class="as-msg ${m.role}">${m.role === "assistant" ? `<span class="as-avatar">${owlHead()}</span>` : ""}<div class="as-bubble">${m.role === "assistant" ? `<span class="as-name">Lingo</span>` : ""}${body}${q}</div></div>`;
}

const KIND_ICON = { test: "clipboard", quiz: "zap", dictation: "mic", worksheet: "file" };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function renderMessages() {
  const intro = !as.messages.length;
  $("asShell").classList.toggle("intro", intro);
  const hero = intro
    ? `<div class="as-hero">
        <div class="as-hero-owl">${owl()}</div>
        <span class="as-hero-kicker">${icon("wand", "i-xs")}Teacher assistant</span>
        <h2>${greeting()}! <span class="as-grad">What shall we make today?</span></h2>
        <p>Ask Lingo for a <b>unit test</b>, a <b>dictation</b>, a <b>quick quiz</b> or <b>worksheets</b> — for any Primary Path unit or grammar point. If something is missing it asks, then shows you a plan to change before anything is written.</p>
        <div class="as-starters">${suggestions().map(([text, kind, title], i) => `<button type="button" class="as-starter" data-suggest="${esc(text)}" data-kind="${kind}" style="--i:${i}"><span class="as-starter-ico">${icon(KIND_ICON[kind], "i-sm")}</span><span class="as-starter-text"><small>${esc(title)}</small>${esc(text)}</span>${icon("arrow-right", "i-sm as-starter-go")}</button>`).join("")}</div>
        <p class="as-hero-el" lang="el">Γράψτε μου στα αγγλικά ή στα ελληνικά.</p>
      </div>`
    : "";
  $("asMessages").innerHTML = hero + as.messages.map(bubble).join("") + (as.thinking ? `<div class="as-msg assistant"><span class="as-avatar">${owlHead()}</span><div class="as-bubble as-typing"><span class="as-name">Lingo is thinking</span><span class="as-dots"><i></i><i></i><i></i></span></div></div>` : "");
  $("asMessages").scrollTop = $("asMessages").scrollHeight;
  $("asSuggest").innerHTML = intro ? "" : suggestions().slice(0, 3).map(([s]) => `<button type="button" class="chip" data-suggest="${esc(s)}">${icon("sparkles", "i-xs")}${esc(s)}</button>`).join("");
}

/* ── Plan card ────────────────────────────────────────────────────── */
function renderPlan() {
  const p = as.plan;
  $("asShell").classList.toggle("has-plan", !!p);
  if (!p) { $("asPlan").innerHTML = ""; return; }
  const src = p.source || {};
  const isTest = p.kind === "test" || p.kind === "quiz";
  const multi = isTest;
  const grammar = GRAMMAR_MENU[p.levelId] || [];
  const extraGrammar = (p.grammar || []).filter((g) => !grammar.includes(g));
  const kindLabel = { worksheet: "Worksheets" };
  $("asPlan").innerHTML = `
    <header class="as-plan-head" data-kind="${p.kind || ""}">
      <span class="as-plan-ico">${icon(KIND_ICON[p.kind] || "clipboard")}</span>
      <div><small>Your plan</small><h3>${esc(kindLabel[p.kind] || KINDS[p.kind]?.label || "Something new")}</h3></div>
      ${p.levelId ? `<span class="as-plan-lvl" style="--lvl:${LEVEL_COLORS[p.levelId]}">${esc(CLASS_PROFILES[p.levelId].label)}</span>` : ""}
      <p>${esc(planSummary(p))}</p>
    </header>
    <div class="as-plan-body">
    <div class="st-row col"><span class="st-lbl">What shall I make?</span><div class="as-kinds">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="as-kind${p.kind === k ? " active" : ""}" data-kind="${k}">${icon(KIND_ICON[k], "i-sm")}<span>${esc(kindLabel[k] || v.label)}</span></button>`).join("")}</div></div>
    <div class="st-row col"><span class="st-lbl">For which class?</span><div class="as-levels">${LEVEL_IDS.map((id) => `<button type="button" class="as-level${p.levelId === id ? " active" : ""}" data-level="${id}" style="--lvl:${LEVEL_COLORS[id]}" title="${esc(CLASS_PROFILES[id].label)} · ${esc(CLASS_PROFILES[id].cefr)}">${esc(CLASS_PROFILES[id].label[0])}</button>`).join("")}</div></div>
    <div class="st-row col"><span class="st-lbl">Based on</span>
      <div class="kind-chips">
        <button type="button" class="chip${src.kind === "unit" ? " active" : ""}" data-src="unit">${icon("book", "i-xs")}A coursebook unit</button>
        ${p.kind !== "dictation" ? `<button type="button" class="chip${src.kind === "topic" ? " active" : ""}" data-src="topic">${icon("bulb", "i-xs")}A grammar point or topic</button>` : ""}
        <button type="button" class="chip${src.kind === "current" ? " active" : ""}" data-src="current">${icon("list", "i-xs")}My word list (Step 2)</button>
      </div>
      ${src.kind === "unit" ? `<div class="kind-chips">${Object.keys(CPP_BOOKS).map((b) => `<button type="button" class="chip${src.bookId === b ? " active" : ""}" data-book="${b}">Primary Path ${b.slice(-1)}</button>`).join("")}</div>
        <div class="kind-chips units">${Array.from({ length: 9 }, (_, i) => i + 1).map((u) => `<button type="button" class="chip${src.units?.includes(u) ? " active" : ""}" data-unit="${u}" title="${esc(CPP_BOOKS[src.bookId]?.units?.[u]?.title || "")}">${u}</button>`).join("")}</div>
        ${multi ? `<small class="st-hint">Tap more units to test several together.</small>` : ""}` : ""}
      ${src.kind === "topic" ? `<input class="input sm" data-topic placeholder="e.g. Present Simple vs Present Continuous" value="${esc(src.topic || "")}" />` : ""}
    </div>
    ${isTest ? `<div class="st-row col"><span class="st-lbl">Which skills?</span><div class="kind-chips">${Object.entries(SKILLS).filter(([k]) => k !== "dictation").map(([k, v]) => `<button type="button" class="chip${(p.skills || defaultSkills(p)).includes(k) ? " active" : ""}" data-skill="${k}">${v.icon} ${esc(v.label)}</button>`).join("")}</div></div>` : ""}
    ${p.kind === "dictation" ? `<div class="st-row col"><span class="st-lbl">Dictation style</span><div class="kind-chips">${Object.entries(DICTATION_STYLES).map(([k, v]) => `<button type="button" class="chip${(p.style || "classic") === k ? " active" : ""}" data-style="${k}">${esc(v.label)}</button>`).join("")}</div></div>
      <div class="st-row"><span class="st-lbl">How many sentences</span>${stepperHtml("count", p.count || dictationDefaults(p.levelId || "B_SENIOR").count, 3, 15)}</div>` : ""}
    ${wordsBlock(p)}
    ${isTest ? `<div class="st-row"><span class="st-lbl">Questions in each part</span>${stepperHtml("items", p.items || 0, 0, 12).replace(/<b>0<\/b>/, "<b>Auto</b>")}</div>` : ""}
    <div class="st-row col"><span class="st-lbl">Grammar <small>(optional)</small></span><div class="gram-chips">${[...extraGrammar, ...grammar].map((g) => `<button type="button" class="chip${p.grammar?.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("")}</div></div>
    <div class="st-row"><span class="st-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), p.difficulty || "level")}</div>
    ${isTest ? `<div class="st-row"><span class="st-lbl">Versions</span>${segHtml("versions", [[1, "One version"], [2, "A + B"]], p.versions || 1)}</div>` : ""}
    ${p.kind === "dictation" ? `<div class="st-row col"><span class="st-lbl">Who writes the sentences?</span>${segHtml("writer", [["ai", `${icon("sparkles", "i-xs")}The AI`], ["book", `${icon("book", "i-xs")}The coursebook`]], p.writer || "ai")}</div>` : ""}
    ${p.kind !== "worksheet" ? `<div class="st-row col"><span class="st-lbl">Title <small>(optional)</small></span><input class="input sm" data-title placeholder="Lingo gives it a title" value="${esc(p.title || "")}" /></div>` : ""}
    <div class="st-switches">${switchHtml("greek", "Instructions also in Greek", "", p.greek !== false)}${p.kind !== "worksheet" ? switchHtml("pictures", "Pictures", "The app’s illustrations in picture tasks", p.pictures !== false) : ""}</div>
    ${p.note ? `<p class="st-hint">${icon("info", "i-xs")} ${esc(p.note)}</p>` : ""}
    </div>
    <div class="as-plan-actions">
      <button type="button" class="btn btn-magic btn-lg btn-block" data-make>${icon("sparkles")}Create it now</button>
      <button type="button" class="btn btn-ghost btn-sm btn-block" data-open>${icon("sliders", "i-sm")}Let me fine-tune it first</button>
    </div>`;
  $("asPlan").querySelectorAll("[data-segmented]").forEach((root) => segmented(root, { value: String(p[root.dataset.seg] ?? ({ versions: 1, writer: "ai" }[root.dataset.seg] || "level")), onChange: (v) => { p[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; refreshSummary(); } }));
}

/** The plan's one-line summary, kept in step without redrawing the card. */
function refreshSummary() {
  const el = $("asPlan").querySelector(".as-plan-head p");
  if (el && as.plan) el.textContent = planSummary(as.plan);
}

/* ── Which words ──────────────────────────────────────────────────── */
const keyCache = new Map();
/** The key words of a unit's lessons (Big Question, Lessons A and B), lower case. */
function keyWordsOf(bookId, unit) {
  const k = `${bookId}|${unit}`;
  if (!keyCache.has(k)) {
    keyCache.set(k, Promise.all(["BQ", "A", "B"].map((sec) => loadLessonJson(`${bookId}/U${unit}-${sec}.json`)))
      .then((ls) => ls.flatMap((l) => (l?.focusWords || []).map((f) => String(f.english || "").toLowerCase())).filter(Boolean))
      .catch(() => []));
  }
  return keyCache.get(k);
}
const unitKey = (p) => (p?.source?.kind === "unit" && p.source.bookId ? `${p.source.bookId}|${(p.source.units || []).join(",")}` : "");
/** Load the key words of the plan's units, then redraw the plan (the key-word count and list need them). */
async function refreshKeyWords() {
  const p = as.plan;
  const k = unitKey(p);
  if (!k || as.keyFor === k) return;
  const words = (await Promise.all(p.source.units.map((u) => keyWordsOf(p.source.bookId, u)))).flat();
  if (unitKey(as.plan) !== k) return;
  as.keyWords = words;
  as.keyFor = k;
  renderPlan();
}
const classWords = (p) => SMART_PICK[p.levelId] || 15;
const planChoice = (p) => normalizeChoice(p.vocab || {}, { fallback: p.kind === "worksheet" ? "smart" : "key", classCount: classWords(p) });

/** The unit words a plan uses: { words, missing, pool, all, choice }. */
function resolveWords(p) {
  const src = p.source || {};
  if (src.kind !== "unit" || !src.bookId || !src.units?.length) return null;
  const choice = planChoice(p);
  const all = src.units.flatMap((u) => unitWords(src.bookId, u, SECTION_KEYS));
  const pool = src.units.flatMap((u) => unitWords(src.bookId, u, choice.sections));
  const keys = unitKey(p) === as.keyFor ? as.keyWords : [];
  return { ...chooseUnitWords(pool, keys, choice), pool, all, choice, keys: new Set(keys) };
}

/** "Which words?": how many, which parts of the unit, the words themselves (tap to leave one out), and own words. */
function wordsBlock(p) {
  const src = p.source || {};
  const ownChips = (p.words || []).map((w, i) => `<span class="as-wchip own"><b>${esc(w.english)}</b>${w.greek ? `<small>${esc(w.greek)}</small>` : ""}<button type="button" data-own-del="${i}" aria-label="Remove ${esc(w.english)}">${icon("x", "i-xs")}</button></span>`).join("");
  const ownBox = (label, hint) => `<div class="as-own">
      <div class="as-own-row"><input class="input sm" data-own placeholder="${esc(label)}" aria-label="${esc(label)}" autocomplete="off" /><button type="button" class="btn btn-secondary btn-sm" data-own-add>${icon("plus", "i-xs")}Add</button></div>
      ${ownChips ? `<div class="as-wlist">${ownChips}</div>` : `<small class="st-hint">${esc(hint)}</small>`}
    </div>`;
  if (src.kind === "topic") {
    return `<div class="as-sec"><div class="as-sec-head"><span class="st-lbl">Words to use <small>(optional)</small></span>${p.words?.length ? `<span class="as-count">${plural(p.words.length, "word")}</span>` : ""}</div>
      ${ownBox("Add words: crater, ash cloud, volcano - ηφαίστειο", "Leave it empty and Lingo chooses words the class knows.")}</div>`;
  }
  if (src.kind === "current") {
    const list = filledWords();
    return `<div class="as-sec"><div class="as-sec-head"><span class="st-lbl">Which words?</span><span class="as-count">${plural(list.length + (p.words?.length || 0), "word")}</span></div>
      <div class="as-wlist">${list.slice(0, 40).map((w) => `<span class="as-wchip">${esc(w.english)}</span>`).join("")}${list.length > 40 ? `<small>+${list.length - 40}</small>` : ""}</div>
      ${ownBox("Add more words…", "Words that aren’t in your list, mixed in with it.")}</div>`;
  }
  const res = resolveWords(p);
  if (!res) return "";
  const c = res.choice;
  const keyCount = res.pool.filter((w) => res.keys.has(w.english.toLowerCase())).length;
  const loadingKeys = unitKey(p) !== as.keyFor;
  const modes = [
    ...(p.kind === "worksheet" ? [["smart", `Fits the class`, c.mode === "smart" ? c.count : classWords(p)]] : []),
    ["key", "★ Key words", loadingKeys ? "…" : keyCount || "—"],
    ["all", "All", res.pool.length],
    ["some", "A number", c.mode === "some" ? c.count : ""],
    ["mix", "A mix", c.mode === "mix" ? c.count : ""],
    ["pick", "I’ll choose", ""],
  ];
  const sectionCount = (s) => res.all.filter((w) => w.section === s).length;
  const picking = c.mode === "pick";
  const chosen = new Set(res.words.map((w) => w.english.toLowerCase()));
  const list = picking ? res.pool : res.words;
  // An own word that is already among the chosen words counts once (as the makers count it).
  const extra = [...(p.words || []).map((w) => w.english), ...res.missing].filter((w) => !chosen.has(w.toLowerCase()));
  const n = res.words.length + new Set(extra.map((w) => w.toLowerCase())).size;
  return `<div class="as-sec as-words">
      <div class="as-sec-head"><span class="st-lbl">Which words?</span><span class="as-count">${plural(n, "word")}</span></div>
      <div class="as-wmodes" role="radiogroup" aria-label="Which words">${modes.map(([m, label, num]) => `<button type="button" role="radio" aria-checked="${c.mode === m}" class="as-wmode${c.mode === m ? " active" : ""}" data-wmode="${m}" title="${esc(WORD_MODES[m].hint)}"><span>${label}</span>${num !== "" ? `<small>${num}</small>` : ""}</button>`).join("")}</div>
      ${["some", "mix", "smart"].includes(c.mode) ? `<div class="st-row as-wcount"><span class="st-lbl">How many</span>${stepperHtml("wcount", c.count, 3, 60)}<small class="st-hint">${c.mode === "mix" ? "half key words, half others" : "key words first, the rest spread over the unit"}</small></div>` : ""}
      <div class="as-wparts">${SECTION_KEYS.map((s) => `<button type="button" class="chip${c.sections.includes(s) ? " active" : ""}" data-wsec="${s}">${esc(SECTION_LABEL[s])} <small>${sectionCount(s)}</small></button>`).join("")}</div>
      <div class="as-wlist${picking ? " picking" : ""}">${list.map((w) => {
    const on = chosen.has(w.english.toLowerCase());
    const isKey = res.keys.has(w.english.toLowerCase());
    return picking
      ? `<button type="button" class="as-wchip${on ? " on" : ""}${isKey ? " key" : ""}" data-wtoggle="${esc(w.english)}">${esc(w.english)}</button>`
      : `<span class="as-wchip${isKey ? " key" : ""}">${esc(w.english)}<button type="button" data-wout="${esc(w.english)}" aria-label="Leave out ${esc(w.english)}" title="Leave it out">${icon("x", "i-xs")}</button></span>`;
  }).join("") || `<small class="st-hint">${loadingKeys ? "Loading the unit’s key words…" : "No words — choose another option or more parts of the unit."}</small>`}</div>
      ${c.except.length ? `<div class="as-wout">Left out: ${c.except.map((w) => `<button type="button" class="chip" data-win="${esc(w)}" title="Put it back">${esc(w)} ${icon("undo", "i-xs")}</button>`).join("")}</div>` : ""}
      ${res.missing.length ? `<p class="st-hint">${icon("info", "i-xs")} Not in this unit, added as your own: ${esc(res.missing.join(", "))}</p>` : ""}
      ${ownBox("Add your own words…", "Words from another unit or book, or your own — mixed in.")}
      <small class="st-hint">${picking ? "Tap words to add or remove them." : `${esc(WORD_MODES[c.mode].hint)}. Tap × to leave a word out.`}</small>
    </div>`;
}

/** Add typed or pasted own words to the plan. */
function addOwn(text) {
  const p = as.plan;
  const before = p.words?.length || 0;
  p.words = addOwnWords(p.words || [], text || "");
  if (p.words.length === before) { $("asPlan").querySelector("[data-own]")?.focus(); return; }
  renderPlan();
  $("asPlan").querySelector("[data-own]")?.focus();
}

function defaultSkills(p) {
  return p.kind === "quiz" ? LENGTHS.quiz.skills : LENGTHS[p.length]?.skills || LENGTHS.standard.skills;
}

function onPlanClick(e) {
  const p = as.plan;
  if (!p) return;
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.kind) p.kind = b.dataset.kind;
  if (b.dataset.level) { p.levelId = b.dataset.level; p.greek = ["A_SENIOR", "B_SENIOR", "C_SENIOR"].includes(p.levelId); }
  if (b.dataset.src) p.source = b.dataset.src === "unit" ? { kind: "unit", bookId: p.source?.bookId || context().bookId || "CPP1", units: p.source?.units?.length ? p.source.units : [context().unit || 1] } : b.dataset.src === "topic" ? { kind: "topic", topic: p.grammar?.join(", ") || "" } : { kind: "current" };
  if (b.dataset.book) p.source = { ...p.source, bookId: b.dataset.book };
  if (b.dataset.unit) {
    const u = Number(b.dataset.unit);
    const units = p.source.units || [];
    p.source.units = p.kind === "test" || p.kind === "quiz" ? (units.includes(u) ? units.filter((x) => x !== u) : [...units, u].sort()) : [u];
    if (!p.source.units.length) p.source.units = [u];
  }
  if (b.dataset.skill) {
    const cur = [...(p.skills || defaultSkills(p))];
    const k = b.dataset.skill;
    p.skills = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    if (!p.skills.length) p.skills = [k];
  }
  if (b.dataset.style) p.style = b.dataset.style;
  if (b.dataset.grammar) { const g = b.dataset.grammar; p.grammar = p.grammar?.includes(g) ? p.grammar.filter((x) => x !== g) : [...(p.grammar || []), g]; }
  if (b.dataset.step) {
    const name = b.closest("[data-stepper]")?.dataset.stepper;
    const d = Number(b.dataset.step);
    if (name === "count") p.count = Math.max(3, Math.min(15, (p.count || dictationDefaults(p.levelId || "B_SENIOR").count) + d));
    // Auto ↔ 3 … 12 questions in each part.
    if (name === "items") p.items = !p.items ? (d > 0 ? 3 : undefined) : p.items + d < 3 ? undefined : Math.min(12, p.items + d);
    if (name === "wcount") { const c = planChoice(p); p.vocab = { ...c, count: Math.max(3, Math.min(60, c.count + d)) }; }
  }
  // Which words
  if (b.dataset.wmode) {
    const c = planChoice(p);
    const m = b.dataset.wmode;
    // "I'll choose" starts from the words chosen now, so the teacher only adds or removes a few.
    p.vocab = { ...c, mode: m, ...(m === "pick" && c.mode !== "pick" ? { only: (resolveWords(p)?.words || []).map((w) => w.english), except: [] } : {}), ...(["some", "mix"].includes(m) && !["some", "mix"].includes(c.mode) ? { count: Math.max(3, resolveWords(p)?.words.length || 12) } : {}) };
  }
  if (b.dataset.wsec) {
    const c = planChoice(p);
    const secs = c.sections.includes(b.dataset.wsec) ? c.sections.filter((x) => x !== b.dataset.wsec) : [...c.sections, b.dataset.wsec];
    p.vocab = { ...c, sections: secs.length ? secs : [b.dataset.wsec] };
  }
  if (b.dataset.wout) { const c = planChoice(p); p.vocab = { ...c, except: [...c.except, b.dataset.wout] }; }
  if (b.dataset.win) { const c = planChoice(p); p.vocab = { ...c, except: c.except.filter((w) => w.toLowerCase() !== b.dataset.win.toLowerCase()) }; }
  if (b.dataset.wtoggle) {
    const c = planChoice(p);
    const w = b.dataset.wtoggle;
    const has = c.only.some((x) => x.toLowerCase() === w.toLowerCase());
    p.vocab = { ...c, only: has ? c.only.filter((x) => x.toLowerCase() !== w.toLowerCase()) : [...c.only, w] };
  }
  if (b.hasAttribute("data-own-add")) { addOwn($("asPlan").querySelector("[data-own]")?.value); return; }
  if (b.dataset.ownDel !== undefined) p.words = (p.words || []).filter((_, i) => i !== Number(b.dataset.ownDel));
  if (b.hasAttribute("data-make")) { make(true); return; }
  if (b.hasAttribute("data-open")) { make(false); return; }
  // A new class, kind or source settles the word defaults again (e.g. worksheets fit the class).
  if (b.dataset.kind || b.dataset.level || b.dataset.src || b.dataset.book || b.dataset.unit) as.plan = completePlan(p, context());
  renderPlan();
  refreshKeyWords();
}
function onPlanInput(e) {
  if (e.target.dataset.topic !== undefined) as.plan.source = { kind: "topic", topic: e.target.value };
  if (e.target.dataset.title !== undefined) as.plan.title = e.target.value;
  refreshSummary();
}

/* ── Hand-off ─────────────────────────────────────────────────────── */
function pickerState(p) {
  const src = p.source || {};
  // Words the teacher named ("… plus the words crater, lava") go in as their own words, mixed in.
  const own = (p.words || []).map((w) => ({ english: w.english, greek: w.greek || "" }));
  if (src.kind === "unit") {
    // The words the plan shows are the words the maker gets: plain "key words" / "all" stay live choices,
    // anything finer (a number, a mix, words left out, my choice) goes over as exactly those words.
    const res = resolveWords(p);
    const c = res?.choice || planChoice(p);
    const plain = !c.except.length;
    const focusMode = c.mode === "all" && plain ? "all" : c.mode === "key" && plain && res?.keys.size ? "key" : "pick";
    return {
      kind: "unit", bookId: src.bookId, units: src.units?.length ? src.units : [1], sections: c.sections, focusMode,
      picked: (res?.words || []).map((w) => w.english.toLowerCase()),
      own: [...own, ...(res?.missing || []).map((english) => ({ english, greek: "" }))],
    };
  }
  if (src.kind === "topic") return { kind: "topic", topic: src.topic || p.grammar?.join(", ") || "", own };
  return { kind: "current", own };
}

/** Worksheets: the teacher's named words join the Step 2 list (with the coursebook's details when a book has them). */
function addPlanWords(p) {
  const have = new Set(state.words.map((w) => w.english.trim().toLowerCase()).filter(Boolean));
  const add = (p.words || []).filter((w) => !have.has(w.english.toLowerCase()));
  if (!add.length) return 0;
  state.words = state.words.filter((w) => w.english.trim());
  for (const w of add) {
    const hit = lookupCoursebookWord(w.english, state.cpp.bookId, state.cpp.unit);
    state.words.push(hit ? { ...coursebookEntryToWord(hit), ...(w.greek ? { greek: w.greek } : {}) } : makeWord({ english: w.english, greek: w.greek || "" }));
  }
  return add.length;
}

/** Test settings from the plan: a preset length, or one part per chosen skill (two for repeated skills). */
export function planToTestSpec(p) {
  const levelId = p.levelId || "B_SENIOR";
  const length = p.kind === "quiz" ? "quiz" : LENGTHS[p.length] ? p.length : "standard";
  const spec = testDefaults(levelId, length);
  if (p.skills?.length) {
    const seen = {};
    spec.parts = p.skills.map((s) => {
      seen[s] = (seen[s] || 0) + 1;
      const preset = presetParts("full", levelId).filter((x) => x.skill === s);
      return makePart(s, (preset[seen[s] - 1] || preset[0])?.task || defaultTask(s, levelId), levelId);
    });
  }
  // "5 questions each": every part with questions gets that many.
  if (p.items) spec.parts.forEach((part) => { if (part.items > 1) part.items = p.items; });
  return { ...spec, difficulty: p.difficulty || "level", grammar: p.grammar || [], versions: p.versions || 1, greek: p.greek !== false, topic: p.note || "", title: p.title || "", pictures: p.pictures !== false };
}

/** "… and revise earlier words": the words this class met before and is due to review join as the teacher's own (class memory, asked once). */
async function withReview(p, pk) {
  if (!p.review || !(await askClassMemory())) return pk;
  const mem = classMemoryFor(p.levelId);
  const have = [...(pk.own || []), ...(pk.picked || []).map((english) => ({ english }))];
  const add = reviewWords(mem, { exclude: have, n: p.kind === "dictation" ? 4 : 6 });
  if (!add.length) { toast(mem.items ? "No earlier words are due for review yet for this class." : "Nothing saved for this class yet, so there are no earlier words to review.", "info", { ms: 3200 }); return pk; }
  toast(`Review words added: ${add.map((w) => w.english).join(", ")}.`, "ok", { ms: 3200 });
  return { ...pk, own: [...(pk.own || []), ...add.map((w) => ({ english: w.english, greek: w.greek || "" }))] };
}

async function make(generate) {
  const p = as.plan;
  if (!p?.kind) { toast("Tell me what to make first — a test, a quiz, a read-aloud dictation or worksheets (Lingo Launcher + Dictation).", "warn"); return; }
  if (!p.levelId) { toast("Which class is it for? Choose it in the plan.", "warn"); return; }
  if (p.source?.kind === "unit" && (!p.source.bookId || !p.source.units?.length)) { toast("Choose the book and the unit in the plan.", "warn"); return; }
  if (p.source?.kind === "topic" && !String(p.source.topic || "").trim()) { toast("Type the topic or grammar point.", "warn"); return; }
  try {
    if (p.kind === "test" || p.kind === "quiz") {
      applyTestPreset({ spec: planToTestSpec(p), picker: await withReview(p, pickerState(p)) });
      actions.go("tests");
      if (generate) await generateTestNow();
    } else if (p.kind === "dictation") {
      const d = dictationDefaults(p.levelId);
      renderDictationView();
      applyDictationPreset({ levelId: p.levelId, spec: { ...d, style: p.style || d.style, count: p.count || d.count, grammar: p.grammar || [], difficulty: p.difficulty || "level", greek: p.greek !== false, topic: p.note || "", source: p.writer || d.source, pictures: p.pictures !== false }, picker: await withReview(p, pickerState(p)) });
      actions.go("dictation");
      if (generate) await generateDictationNow();
    } else {
      await makeWorksheets(p, generate);
    }
  } catch (e) { aiErrorToast(e); }
}

/** Worksheets: a coursebook unit loads its words into Steps 1–2; a topic becomes a freeform brief. */
async function makeWorksheets(p, generate) {
  state.profileId = p.levelId;
  if (p.source?.kind === "unit") {
    state.source = "cpp";
    state.inputMode = "structured";
    state.cpp.bookId = p.source.bookId;
    state.cpp.unit = p.source.units[0];
    state.cpp.pages = "";
    // The words the plan shows (key words, all, a number, a mix, my choice…), then the teacher's own.
    const res = resolveWords(p);
    const rows = (res?.words || []).map((w) => CPP_WORDBANK.find((e) => e.id === w.id)).filter(Boolean);
    if (rows.length) state.words = rows.map((e) => coursebookEntryToWord(e));
    else loadPoolWords({ silent: true, force: true });
    const added = addPlanWords({ ...p, words: [...(p.words || []), ...(res?.missing || []).map((english) => ({ english, greek: "" }))] });
    emit("setup", "words", "level");
    actions.go("words");
    toast(`The unit’s words are ready${added ? `, with your ${added === 1 ? "word" : `${added} words`} added` : ""}. Have a quick look, then press Continue to choose the exercises.`, "info", { ms: 5000 });
    return;
  }
  if (p.source?.kind === "current" && p.words?.length) {
    const added = addPlanWords(p);
    emit("setup", "words", "level");
    actions.go("words");
    toast(`Your word list is ready${added ? `, with your ${added === 1 ? "word" : `${added} words`} added` : ""}.`, "info", { ms: 4000 });
    return;
  }
  if (p.source?.kind === "topic") {
    state.source = "custom";
    state.custom = { bookTitle: "Grammar practice", unit: 1, pages: "" };
    state.inputMode = "freeform";
    // Named words are part of the brief.
    state.freeform = `Worksheets on ${p.source.topic} for ${CLASS_PROFILES[p.levelId].label} (${CLASS_PROFILES[p.levelId].cefr}). Choose ${targetText(p.levelId)} words that practise it naturally.${p.grammar?.length ? ` Grammar focus: ${p.grammar.join(", ")}.` : ""}${p.difficulty && p.difficulty !== "level" ? ` Make it ${p.difficulty === "easier" ? "a little easier" : "a little harder"} than usual.` : ""}${p.words?.length ? ` Include these words: ${p.words.map((w) => w.english).join(", ")}.` : ""}`;
  }
  emit("setup", "words", "level");
  actions.go("exercises");
  if (generate) await runGenerate("full");
}

export function renderAssistantView() {
  if (!built) build();
  renderMessages();
  renderPlan();
  setTimeout(() => $("asText")?.focus(), 50);
}

/** From the Home screen: open the assistant and send the teacher's request. */
export function askAssistant(text) {
  actions.go("assistant");
  if (String(text || "").trim()) send(text);
}
