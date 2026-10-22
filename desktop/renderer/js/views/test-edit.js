/* Test Maker, Step 5 — everything on the paper can be changed.
 * A click opens the editor for what was clicked: the title, a part's instructions, the reading text, the word box,
 * a question (or the example), the writing task, the speaking cards, the listening script; on the teacher's pack,
 * the script, the speaking script and the model answer. A hovered question shows a small bar: Edit, and ✨ Remake —
 * Lingo rewrites just that question, with the teacher's wish or fresh. A part's heading has ✨ Rewrite part.
 * Every change keeps the part checked (reviseSection) and can be undone from its toast. */
import { esc, icon, toast, openDialog, plural } from "../ui.js";
import { SKILLS, TASKS, KNOBS, tfLabels, levelIndex, partOpts, taskFit } from "../../studio/tasks.js";
import { LETTER_HELP_TASKS } from "../../studio/doc-model.js";
import { letterHelpField } from "./letter-help-ui.js";
import { TEST_DEFAULTS } from "../../studio/levels.js";
import { reviseSection, fixItemsPrompt, applyItemFixes, makePart, specPoints, estimateMinutes } from "../../studio/test-builder.js";
import { remakePlan, remakeProblems, remakeRetryHint } from "../../studio/remake.js";
import { containsForm } from "../../studio/word-scope.js";
import { itemUses, placementOptions, testCoverage, planNewParts, newPartTasks, hasWord } from "../../studio/test-coverage.js";
import { planFromProposal, moveWords, resizePart, removePart, addPart, setTask, setOpt, syncPlan, fitTasks, placedWords } from "../../studio/word-plan.js";

const CSS = `
.pe-t { position: relative; cursor: pointer; border-radius: 6px; transition: background 140ms, box-shadow 140ms; }
.ex-item.pe-t, .st-sec .pe-t.st-task { margin-left: -6px; margin-right: -6px; padding-left: 6px; padding-right: 6px; }
.pe-t:hover { background: #f3f1ff; box-shadow: 0 0 0 1.5px #b7aefc; }
.pe-t.pe-busy { pointer-events: none; background: #f3f1ff; box-shadow: 0 0 0 1.5px #b7aefc; }
.pe-t.pe-busy > * { opacity: .35; }
.pe-t.pe-busy::after { content: "Lingo is rewriting…"; position: absolute; inset: 0; display: grid; place-items: center; font: 700 12px/1 "Segoe UI", sans-serif; color: #4b3fd6; letter-spacing: .01em; }
.pe-t.pe-flash { animation: pe-flash 1.4s ease-out; }
@keyframes pe-flash { 0% { background: #d9f7e9; box-shadow: 0 0 0 2px #34d399; } 100% { background: transparent; box-shadow: none; } }
.pe-bar { position: absolute; top: -13px; right: 4px; z-index: 6; display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: #fff; box-shadow: 0 6px 18px rgba(40, 30, 120, .18), 0 0 0 1px #e3defd; font: 650 12.5px/1 "Segoe UI", system-ui, sans-serif; white-space: nowrap; }
.pe-bar button { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: #3b2fc9; font: inherit; cursor: pointer; }
.pe-bar button:hover { background: #efedff; }
.pe-bar button.magic { color: #fff; background: linear-gradient(135deg, #6d5df6, #a855f7); }
.pe-bar button.magic:hover { filter: brightness(1.08); }
.pe-bar button.danger { color: #c2410c; }
.pe-bar button.danger:hover { background: #fff1e8; }
.pe-add { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin: 2mm 0 1mm; padding: 1.6mm; border: 1.5px dashed #b7aefc; border-radius: 8px; background: transparent; color: #4b3fd6; font: 650 12.5px/1 "Segoe UI", system-ui, sans-serif; cursor: pointer; opacity: .55; transition: opacity 140ms, background 140ms; }
.st-sec:hover .pe-add, .pe-add:focus-visible { opacity: 1; }
.pe-add:hover { background: #f3f1ff; }
.pe-add.pe-busy { pointer-events: none; opacity: 1; background: #f3f1ff; }
`;

const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
/** A value safe inside a CSS attribute selector ("…"). */
const CSS_ESC = (s) => String(s).replace(/["\\]/g, (c) => `\\${c}`);
const WISHES = [["Another word", "build it on another word, not the same one"], ["Easier", "make it easier for this class"], ["Harder", "make it a bit harder"], ["Better wrong options", "write better wrong options"], ["Shorter", "make the sentence shorter"]];

/**
 * host: { root, doc(), view(), sheet(), spec(), ctx(): Promise<{ picFor, focus, pictureWords }>, profile(levelId, focus),
 *   ask(system, user), checkKeys(ids), commit(), rewritePart(id, wish) }
 */
export function mountTestEditing(host) {
  const targets = new WeakMap();
  let bar = null;
  let barFor = null;
  const busy = new Set();

  const mark = (el, data) => { if (el) { el.classList.add("pe-t"); targets.set(el, data); } };
  const A = (id) => host.doc()?.sections.find((s) => s.id === id);
  const label = (s) => `Part ${host.doc().sections.indexOf(s) + 1} · ${SKILLS[s.skill]?.label || ""} · ${TASKS[s.task]?.label || ""}`;

  /** Mark what can be edited on the paper just drawn. */
  function decorate() {
    const root = host.root;
    if (!host.doc()) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    bar = null; barFor = null;
    if (host.sheet() === "teacher") {
      root.querySelectorAll("section.st-key").forEach((secEl, i) => {
        const s = host.doc().sections[i];
        if (!s || s.skill === "dictation") return;
        mark(secEl.querySelector(".st-script"), { kind: "script", id: s.id });
        secEl.querySelectorAll(".st-speak-t").forEach((el) => mark(el, { kind: "speaking", id: s.id }));
        secEl.querySelectorAll(":scope > .st-sample").forEach((el) => mark(el, { kind: s.skill === "speaking" && s.cards?.length ? "speaking" : "sample", id: s.id }));
      });
      return;
    }
    const view = host.view();
    mark(root.querySelector(".ws-head"), { kind: "meta" });
    root.querySelectorAll("section.st-sec").forEach((secEl, i) => {
      const s = view.sections[i];
      if (!s || s.skill === "dictation") return;
      const id = s.id;
      mark(secEl.querySelector(".ex-head"), { kind: "rubric", id, rewrite: true });
      mark(secEl.querySelector(".st-audio"), { kind: "script", id });
      mark(secEl.querySelector(".st-passage"), { kind: "passage", id });
      mark(secEl.querySelector(".word-bank:not(.st-keywords)"), { kind: "bank", id });
      mark(secEl.querySelector(".match-defs"), { kind: "pairs", id });
      mark(secEl.querySelector(".st-sort"), { kind: "pairs", id });
      mark(secEl.querySelector(".st-example"), { kind: "example", id });
      [...secEl.querySelectorAll(".st-item:not(.st-example), .pic-card:not(.st-example)")].forEach((el, k) => {
        if (s.items[k]) mark(el, { kind: "item", id, ref: s.items[k], remake: true });
      });
      secEl.querySelectorAll(".st-task, .st-frame, .st-starters, .st-story-pics").forEach((el) => mark(el, { kind: "writing", id }));
      if (host.sheet() !== "B" && canAdd(s)) secEl.insertAdjacentHTML("beforeend", `<button type="button" class="pe-add" data-pe-add="${esc(id)}">＋ Add a question</button>`);
      secEl.querySelectorAll(".st-speak-card").forEach((el, k) => mark(el, { kind: "speaking", id, card: k }));
    });
  }

  /* ── The hover bar ── */
  function showBar(el) {
    if (barFor === el) return;
    bar?.remove();
    barFor = el;
    const d = targets.get(el);
    if (!d || busy.has(el)) { bar = null; return; }
    bar = document.createElement("div");
    bar.className = "pe-bar";
    bar.innerHTML = `<button type="button" data-pe-act="edit">✎ Edit</button>${d.remake ? `<button type="button" class="magic" data-pe-act="remake" title="Lingo writes this question again">✨ Remake</button>` : ""}${d.rewrite ? `<button type="button" class="magic" data-pe-act="rewrite" title="Lingo writes this whole part again">✨ Rewrite part</button>` : ""}${d.kind === "item" && canAdd(A(d.id)) ? `<button type="button" data-pe-act="add" title="Add a new question after this one">＋ Add after</button>` : ""}${d.kind === "item" ? `<button type="button" class="danger" data-pe-act="delete" title="Delete this question — the part renumbers and its points change">🗑 Delete</button>` : ""}`;
    el.appendChild(bar);
  }
  host.root.addEventListener("mouseover", (e) => {
    const el = e.composedPath().find((n) => n.classList?.contains("pe-t"));
    if (el) showBar(el);
  });
  host.root.addEventListener("mouseleave", () => { bar?.remove(); bar = null; barFor = null; }, true);
  host.root.addEventListener("click", (e) => {
    const path = e.composedPath();
    const addBtn = path.find((n) => n.dataset?.peAdd);
    if (addBtn) { addDialog(addBtn.dataset.peAdd); return; }
    const el = path.find((n) => n.classList?.contains("pe-t"));
    if (!el || busy.has(el)) return;
    const d = targets.get(el);
    const act = path.find((n) => n.dataset?.peAct)?.dataset.peAct || "edit";
    if (act === "add") { const s = A(d.id); if (s) addDialog(s.id, itemIndex(s, d.ref) + 1); return; }
    if (act === "remake") remakeDialog(d, el);
    else if (act === "rewrite") rewriteDialog(d);
    else if (act === "delete") deleteItem(d);
    else openEditor(d, el);
  });

  /* ── Changes, with undo ── */
  function snapshot() {
    return JSON.stringify({ sections: host.doc().sections, meta: host.doc().meta });
  }
  function done(before, message) {
    const doc = host.doc();
    host.commit();
    toast(message, "ok", { ms: 5000, actions: [{ label: "Undo", run: () => { if (host.doc() !== doc) return; Object.assign(doc, JSON.parse(before)); host.commit(); toast("Undone.", "info", { ms: 1600 }); } }] });
  }
  /** Change a part in the AI's shape and check it again. */
  async function revise(id, edit, message) {
    const before = snapshot();
    const ctx = await host.ctx().catch(() => ({}));
    // The test was closed or deleted meanwhile: nothing to change.
    if (!host.doc() || !reviseSection(host.doc(), host.spec(), id, edit, { picFor: ctx.picFor, focusWords: ctx.focus })) return;
    const s = A(id);
    done(before, s?.problems?.length ? `${message} — Lingo noticed something: see the orange note.` : message);
  }
  /**
   * Delete one question: the part is checked again, so the numbers, the letters of a matching list, the word
   * box, the points and the total all follow; Step 3 gets the new number of questions. Undo puts it back.
   */
  async function deleteItem(d) {
    const s = A(d.id);
    if (!s) return;
    if (s.items.length <= 1) { toast("A part needs at least one question — to drop the whole part, remove it in Step 3 (The parts).", "warn", { ms: 5000 }); return; }
    const idx = itemIndex(s, d.ref);
    const n = idx + 1;
    const doc = host.doc();
    const before = snapshot();
    const lc = (x) => String(x || "").trim().toLowerCase();
    const ctx = await host.ctx().catch(() => ({}));
    if (host.doc() !== doc) return;
    const ok = reviseSection(doc, host.spec(), d.id, (raw) => {
      if (!raw.items[idx]) return false;
      const [gone] = raw.items.splice(idx, 1);
      // Its answer leaves the word box too (unless another question still needs it).
      if (Array.isArray(raw.bank) && gone?.answer && !raw.items.some((it) => lc(it.answer) === lc(gone.answer))) {
        const at = raw.bank.findIndex((w) => lc(w) === lc(gone.answer));
        if (at >= 0) raw.bank.splice(at, 1);
      }
    }, { picFor: ctx.picFor, focusWords: ctx.focus });
    if (!ok) return;
    host.itemsChanged?.(d.id);
    host.commit();
    toast(`Question ${n} deleted — ${plural(A(d.id).items.length, "question")} left in this part.`, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => {
      if (host.doc() !== doc) return;
      Object.assign(doc, JSON.parse(before));
      host.itemsChanged?.(d.id);
      host.commit();
      toast("Question put back.", "info", { ms: 1600 });
    } }] });
  }

  /* ── Add questions: Lingo writes them (how many, where, which words, how hard, a wish) or the teacher does ── */
  const MAX_ITEMS = 12;
  function canAdd(s) { return !!s && TASKS[s.task]?.answer !== "open" && s.skill !== "dictation" && s.items.length < MAX_ITEMS; }

  async function addDialog(id, at = null) {
    const s = A(id);
    if (!canAdd(s)) { toast(`A part can have up to ${MAX_ITEMS} questions.`, "info"); return; }
    const pos = at == null ? s.items.length : Math.max(0, Math.min(s.items.length, at));
    const room = MAX_ITEMS - s.items.length;
    const ctx = await host.ctx().catch(() => ({}));
    const lc = (x) => String(x || "").trim().toLowerCase();
    const inPart = (w) => s.items.some((it) => lc(it.answer).includes(lc(w)) || lc(it.prompt).includes(lc(w)));
    // The unit words this part hasn't used yet come first.
    const words = [...(ctx.focus || [])].filter((w) => w?.english).sort((a, b) => Number(inPart(a.english)) - Number(inPart(b.english))).slice(0, 24);
    const choice = s.answerType === "choice";
    const tf = s.answerType === "tf";
    const match = s.answerType === "match";
    const where = `<div class="field"><label class="label" for="pa_pos">Where</label><select class="select" id="pa_pos">${Array.from({ length: s.items.length + 1 }, (_, k) => `<option value="${k}"${k === pos ? " selected" : ""}>${k === s.items.length ? "At the end" : k === 0 ? "At the start (before question 1)" : `After question ${k}`}</option>`).join("")}</select></div>`;
    const ansField = tf
      ? `<div class="field"><label class="label" for="pa_ans">Right answer</label><select class="select" id="pa_ans">${tfLabels(host.doc().meta.classProfile).map((l) => `<option>${esc(l)}</option>`).join("")}</select></div>`
      : field("pa_ans", match ? "Meaning" : "Right answer", "");
    openDialog({
      title: "Add a question", subtitle: label(s), iconName: "plus", tone: "brand", sheet: true,
      body: `<div class="pe-wishes pa-mode" role="tablist"><button type="button" class="chip active" data-pa-mode="ai">✨ Lingo writes it</button><button type="button" class="chip" data-pa-mode="me">✎ I'll write it</button></div>
        ${where}
        <div data-pa-panel="ai">
          <div class="field"><span class="label">How many</span><span class="stepper" id="pa_n"><button type="button" class="icon-btn sm" data-pa-step="-1" aria-label="Fewer">${icon("minus", "i-sm")}</button><b>1</b><button type="button" class="icon-btn sm" data-pa-step="1" aria-label="More">${icon("plus", "i-sm")}</button></span> <small class="st-hint">up to ${Math.min(5, room)}</small></div>
          ${words.length ? `<div class="field"><span class="label">Use these words <span class="opt">optional — or Lingo picks words this part hasn't used</span></span><div class="pe-wishes">${words.map((w) => `<button type="button" class="chip${inPart(w.english) ? " used" : ""}" data-pa-word="${esc(w.english)}" title="${inPart(w.english) ? "Already in this part" : "Not in this part yet"}">${esc(w.english)}</button>`).join("")}</div></div>` : ""}
          <div class="field"><span class="label">How hard</span><div class="pe-wishes" data-pa-level><button type="button" class="chip" data-pa-lv="easier">Easier</button><button type="button" class="chip active" data-pa-lv="same">Like the others</button><button type="button" class="chip" data-pa-lv="harder">Harder</button></div></div>
          <div class="field"><label class="label" for="pa_wish">Anything else? <span class="opt">optional</span></label><textarea class="textarea" id="pa_wish" rows="2" placeholder="e.g. about the picnic, a question with “Where”, a funny sentence"></textarea></div>
          ${s.script?.length || s.passage ? `<p class="st-hint">${icon("info", "i-xs")} New questions ask about details of the ${s.script?.length ? "recording" : "text"} that no other question asks about.</p>` : ""}
        </div>
        <div data-pa-panel="me" hidden>
          ${field("pa_prompt", match ? "Word" : "Question / sentence", "", { rows: 2, hint: match ? "" : "write the gap as ________" })}
          ${choice ? field("pa_opts", "Options", "", { rows: 4, hint: "one per line — the right answer must be one of them" }) : ""}
          ${ansField}
        </div>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-pa-go>${icon("sparkles", "i-sm")}<span>Add 1 question</span></button>`,
      onMount(root, close) {
        let mode = "ai";
        let n = 1;
        const go = root.querySelector("[data-pa-go]");
        const sync = () => {
          root.querySelector("#pa_n b").textContent = n;
          go.className = `btn ${mode === "ai" ? "btn-magic" : "btn-primary"}`;
          go.innerHTML = `${icon(mode === "ai" ? "sparkles" : "check", "i-sm")}<span>${mode === "ai" ? `Add ${n} question${n === 1 ? "" : "s"}` : "Add the question"}</span>`;
        };
        root.querySelectorAll("[data-pa-mode]").forEach((b) => b.addEventListener("click", () => {
          mode = b.dataset.paMode;
          root.querySelectorAll("[data-pa-mode]").forEach((x) => x.classList.toggle("active", x === b));
          root.querySelectorAll("[data-pa-panel]").forEach((p) => { p.hidden = p.dataset.paPanel !== mode; });
          sync();
        }));
        root.querySelectorAll("[data-pa-step]").forEach((b) => b.addEventListener("click", () => { n = Math.max(1, Math.min(Math.min(5, room), n + Number(b.dataset.paStep))); sync(); }));
        root.querySelectorAll("[data-pa-word]").forEach((b) => b.addEventListener("click", () => b.classList.toggle("active")));
        root.querySelectorAll("[data-pa-lv]").forEach((b) => b.addEventListener("click", () => root.querySelectorAll("[data-pa-lv]").forEach((x) => x.classList.toggle("active", x === b))));
        go.addEventListener("click", () => {
          const at2 = Number(root.querySelector("#pa_pos").value);
          if (mode === "me") {
            const v = (k) => root.querySelector(`#${k}`)?.value?.trim() ?? "";
            const item = { prompt: v("pa_prompt"), answer: v("pa_ans"), options: choice ? lines(v("pa_opts")) : undefined };
            if (!item.prompt && !match) { toast("Write the question.", "warn"); return; }
            if (!item.answer) { toast("Add the right answer.", "warn"); return; }
            if (choice && !item.options.some((o) => lc(o) === lc(item.answer))) { toast("The right answer must be one of the options.", "warn"); return; }
            close();
            addOwn(id, at2, item);
            return;
          }
          const picked = [...root.querySelectorAll("[data-pa-word].active")].map((b) => b.dataset.paWord);
          const lv = root.querySelector("[data-pa-lv].active")?.dataset.paLv || "same";
          close();
          addWithLingo(id, at2, n, { words: picked, level: lv, wish: root.querySelector("#pa_wish").value.trim() });
        });
        sync();
      },
    });
  }

  /** Insert items at a position (and keep Step 3's count in step); returns the doc snapshot taken before. */
  function insertItems(id, at, items, ctx) {
    const doc = host.doc();
    const before = snapshot();
    const ok = reviseSection(doc, host.spec(), id, (raw) => { raw.items.splice(at, 0, ...items); }, { picFor: ctx.picFor, focusWords: ctx.focus });
    if (!ok) return null;
    host.itemsChanged?.(id);
    return before;
  }
  function addedToast(doc, id, before, message, first) {
    host.commit();
    flash(id, first);
    toast(message, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => {
      if (host.doc() !== doc) return;
      Object.assign(doc, JSON.parse(before));
      host.itemsChanged?.(id);
      host.commit();
      toast("Taken out again.", "info", { ms: 1600 });
    } }] });
  }

  async function addOwn(id, at, item) {
    const ctx = await host.ctx().catch(() => ({}));
    const doc = host.doc();
    const before = insertItems(id, at, [item], ctx);
    if (!before) return;
    addedToast(doc, id, before, `Question ${at + 1} added.`, at + 1);
  }

  /**
   * strict: one new question per word, in order, each built on its word (with `answer`, the word is the right
   * answer); a question that doesn't use its word goes back to Lingo, and one that still doesn't is taken out again.
   * quiet: no toasts — returns { placed: [word], failed: [word], before } for the caller to report.
   */
  async function addWithLingo(id, at, count, { words = [], level = "same", wish = "", strict = false, answer = false, quiet = false } = {}) {
    const s = A(id);
    if (!s) return null;
    const doc = host.doc();
    const btn = host.root.querySelector(`[data-pe-add="${CSS_ESC(id)}"]`);
    btn?.classList.add("pe-busy");
    if (btn) btn.textContent = `Lingo is writing ${count === 1 ? "a new question" : `${count} new questions`}…`;
    const stop = quiet ? null : toast(`Lingo is writing ${count === 1 ? "a new question" : `${count} new questions`}…`, "info", { ms: 60000 });
    let before = null;
    try {
      const ctx = await host.ctx();
      if (host.doc() !== doc) return;
      // Placeholders hold the places; Lingo writes exactly those items, then the part is checked again.
      before = insertItems(id, at, Array.from({ length: count }, () => ({ prompt: "(a new question)", answer: "", options: s.answerType === "choice" ? ["?", "?"] : undefined })), ctx);
      if (!before) return;
      const ns = Array.from({ length: count }, (_, k) => at + k + 1);
      const others = A(id).items.filter((_, k) => !ns.includes(k + 1));
      const instruction = [
        `These are NEW questions added to the part. Each one is different from every other question (another word or another detail) — never a copy or a rewording of one of them.`,
        A(id).script?.length || A(id).passage ? `Each asks about a detail of the ${A(id).script?.length ? "script" : "text"} that no other question asks about.` : "",
        strict ? ns.map((n, k) => `Question ${n} MUST be built on the word "${words[k]}"${answer ? " and its right answer MUST be that word (a form of it that fits the sentence is fine)" : ""}.`).join(" ")
          : words.length ? `Build them on these words, one each where possible: ${words.join(", ")}.` : "Use words this part hasn't tested yet where you can.",
        level === "easier" ? "Make them a little easier than the others." : level === "harder" ? "Make them a little harder than the others." : "Make them as hard as the others.",
        s.answerType === "tf" ? "Mix the answers: about half one way, half the other, as in the rest of the part." : "",
        wish ? `The teacher's wish: ${wish}` : "",
        `The other questions (do not repeat): ${others.map((it) => it.prompt || it.answer).filter(Boolean).slice(0, 14).join(" | ")}`,
      ].filter(Boolean).join("\n");
      let missing = ns;
      for (let attempt = 0; attempt < 2 && missing.length; attempt++) {
        const { system, user } = fixItemsPrompt(host.spec(), A(id), missing, { profileBlock: host.profile(host.spec().levelId, ctx.focus), focusWords: ctx.focus, pictureWords: ctx.pictureWords, instruction });
        const why = strict ? missing.map((n) => `question ${n} must ${answer ? "have the answer" : "use the word"} "${words[ns.indexOf(n)]}"`).join("; ") : "";
        const reply = await host.ask(system, user, attempt ? `Write items ${missing.join(", ")} — real new questions with a right answer${s.answerType === "choice" ? " among the options" : ""}${why ? `; ${why}` : ""}.` : "");
        if (host.doc() !== doc) return;
        applyItemFixes(doc, host.spec(), id, reply, missing, { picFor: ctx.picFor, focusWords: ctx.focus });
        const sec = A(id);
        missing = ns.filter((n, k) => {
          const it = sec.items[n - 1];
          if (!it || it.prompt === "(a new question)" || !it.answer || it.answer === "?") return true;
          const family = (host.doc()?.focusWords || []).map((w) => w.english);
          return strict && (answer ? !hasWord(String(it.answer), words[k], family) : !itemUses(it, words[k], family));
        });
      }
      // Strict: the questions that came out right stay; the others are taken out again (from the last, so the
      // numbers of the earlier ones hold), and the caller says which words didn't make it.
      if (strict && missing.length && missing.length < ns.length) {
        const drop = [...missing].sort((a, b) => b - a);
        reviseSection(doc, host.spec(), id, (raw) => { drop.forEach((n) => raw.items.splice(n - 1, 1)); }, { picFor: ctx.picFor, focusWords: ctx.focus });
        host.itemsChanged?.(id);
        await host.checkKeys([id]);
        if (host.doc() !== doc) return null;
        host.commit();
        return { placed: words.filter((_, k) => !missing.includes(ns[k])), failed: words.filter((_, k) => missing.includes(ns[k])), before, first: at + 1 };
      }
      if (missing.length) {
        Object.assign(doc, JSON.parse(before));
        host.itemsChanged?.(id);
        host.commit();
        if (!quiet) toast("Lingo couldn’t write the new questions this time. Try again, or write one yourself (✎ I'll write it).", "warn", { ms: 7000 });
        return { placed: [], failed: words, before: null };
      }
      await host.checkKeys([id]);
      if (host.doc() !== doc) return null;
      if (quiet) { host.commit(); flash(id, at + 1); return { placed: words, failed: [], before, first: at + 1 }; }
      addedToast(doc, id, before, count === 1 ? `Question ${at + 1} is new.` : `Questions ${at + 1}–${at + count} are new.`, at + 1);
    } catch (e) {
      if (before && host.doc() === doc) { Object.assign(doc, JSON.parse(before)); host.itemsChanged?.(id); host.commit(); }
      if (quiet) throw e;
      toast(e?.message || "Lingo couldn’t add the questions.", "error");
    } finally {
      stop?.();
      btn?.classList.remove("pe-busy");
    }
  }

  /** The A-version item a paper item stands for (version B shuffles questions). */
  function itemIndex(s, ref) {
    if (host.sheet() !== "B") return ref.n - 1;
    const i = s.items.findIndex((it) => it.prompt === ref.prompt && it.answer === ref.answer);
    return i >= 0 ? i : ref.n - 1;
  }

  /* ── Editors ── */
  function form({ title, subtitle, iconName = "pencil", body, onSave, extraFoot = "", onMount }) {
    openDialog({
      title, subtitle, iconName, sheet: true, body,
      foot: `${extraFoot}<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>${icon("check", "i-sm")}Save</button>`,
      onMount(root, close) {
        const val = (id) => root.querySelector(`#${id}`)?.value ?? "";
        root.querySelector("[data-save]").addEventListener("click", async () => { if ((await onSave(val, root)) !== false) close(); });
        root.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) root.querySelector("[data-save]").click(); });
        onMount?.(root, close);
      },
    });
  }
  const field = (id, lab, value, { rows = 0, hint = "", attrs = "" } = {}) => `<div class="field"><label class="label" for="${id}">${lab}${hint ? ` <span class="opt">${hint}</span>` : ""}</label>${rows ? `<textarea class="textarea" id="${id}" rows="${rows}" ${attrs}>${esc(value || "")}</textarea>` : `<input class="input" id="${id}" value="${esc(value || "")}" autocomplete="off" ${attrs} />`}</div>`;

  function openEditor(d, el) {
    const doc = host.doc();
    if (d.kind === "meta") {
      return form({
        title: "The test’s title", iconName: "pencil",
        body: field("pe_title", "Title", doc.meta.title) + field("pe_sub", "Line under the title", doc.meta.subtitle, { hint: "optional" }),
        onSave: (v) => { const before = snapshot(); doc.meta.title = v("pe_title").trim() || doc.meta.title; doc.meta.subtitle = v("pe_sub").trim(); done(before, "Title saved."); },
      });
    }
    const s = A(d.id);
    if (!s) return;
    const sub = label(s);
    if (d.kind === "rubric") {
      return form({
        title: "Instructions", subtitle: sub,
        body: field("pe_rub", "What the children read", s.rubric, { rows: 2 }) + field("pe_rubel", "In Greek", s.rubricEl, { rows: 2, hint: "printed when Greek help is on" }),
        onSave: (v) => { const before = snapshot(); s.rubric = v("pe_rub").trim() || s.rubric; s.rubricEl = v("pe_rubel").trim(); done(before, "Instructions saved."); },
      });
    }
    if (d.kind === "passage") {
      return form({
        title: "The text", subtitle: sub,
        body: field("pe_ptitle", "Title", s.passageTitle, { hint: "optional" }) + field("pe_pass", "Text", s.passage, { rows: 12, hint: s.task === "R-GAP" || /\(\d+\)/.test(s.passage) ? "keep the gaps as (1) ________" : "" })
          + `<p class="st-hint">${icon("info", "i-xs")} The questions are checked against the text again when you save.</p>`,
        onSave: (v) => { if (!v("pe_pass").trim()) { toast("The text can’t be empty.", "warn"); return false; } revise(s.id, (raw) => { raw.passageTitle = v("pe_ptitle").trim(); raw.passage = v("pe_pass").trim(); }, "Text saved."); },
      });
    }
    if (d.kind === "bank") {
      return form({
        title: "The word box", subtitle: sub,
        body: field("pe_bank", "Words", s.bank.join("\n"), { rows: 8, hint: "one per line — the answers are always in it; words that fit no gap are extra words, and the instruction says how many" }),
        onSave: (v) => revise(s.id, (raw) => { raw.bank = lines(v("pe_bank")); raw.keepBank = true; }, "Word box saved.").then(() => host.itemsChanged?.(s.id)),
      });
    }
    if (d.kind === "pairs") {
      // Matching, a conversation's replies, missing sentences, or words and their groups — each pair is a question.
      const [title, left, right] = PAIR_LABELS[s.task] || PAIR_LABELS.default;
      const extras = Array.isArray(s.extras);
      return form({
        title, subtitle: sub,
        body: (s.task === "V-SORT" ? field("pe_groups", "Groups", (s.groups || []).join("\n"), { rows: 3, hint: "one per line — each word’s group must be one of them" }) : "")
          + `<div class="pe-pairs">${s.items.map((it, k) => `<div class="pe-pair"><span class="pe-n">${k + 1}</span><input class="input" id="pe_w${k}" value="${esc(it.prompt)}" aria-label="${left} ${k + 1}" /><input class="input" id="pe_m${k}" value="${esc(it.answer)}" aria-label="${right} ${k + 1}" /></div>`).join("")}</div>`
          + (extras ? field("pe_extras", "Extra sentences", s.extras.join("\n"), { rows: 3, hint: "one per line — they fit no gap" }) : ""),
        onSave: (v) => revise(s.id, (raw) => {
          s.items.forEach((_, k) => { raw.items[k] = { ...raw.items[k], prompt: v(`pe_w${k}`).trim(), answer: v(`pe_m${k}`).trim() }; });
          if (s.task === "V-SORT") raw.groups = lines(v("pe_groups"));
          if (extras) raw.extras = lines(v("pe_extras"));
        }, `${title} saved.`),
      });
    }
    if (d.kind === "item" || d.kind === "example") return itemEditor(s, d, el);
    if (d.kind === "writing") {
      // Picture tasks: the teacher can choose the pictures too (words that have a picture in the app).
      const pics = TASKS[s.task]?.needs?.includes("pictures");
      return form({
        title: "The writing task", subtitle: sub,
        body: field("pe_task", "The task", s.task_prompt, { rows: 3 }) + (pics ? field("pe_pics", "Pictures", (s.pictures || []).map((p) => p.word).join("\n"), { rows: 3, hint: "one word per line, in story order — words with a picture in the app" }) : "") + field("pe_frame", "Help points", s.frame.join("\n"), { rows: 4, hint: "one per line" }) + field("pe_sample", "Model answer", s.sample, { rows: 5, hint: "teacher’s pack" }),
        onSave: (v) => revise(s.id, (raw) => { raw.prompt = v("pe_task").trim(); if (pics) raw.pictures = lines(v("pe_pics")); raw.frame = lines(v("pe_frame")); raw.sample = v("pe_sample").trim(); }, "Writing task saved."),
      });
    }
    if (d.kind === "sample") {
      return form({
        title: "Model answer", subtitle: sub,
        body: field("pe_sample", "Model answer", s.sample, { rows: 8 }),
        onSave: (v) => revise(s.id, (raw) => { raw.sample = v("pe_sample").trim(); }, "Model answer saved."),
      });
    }
    if (d.kind === "script") {
      return form({
        title: "Listening script", subtitle: sub, iconName: "mic",
        body: field("pe_script", "What the speakers say", s.script.map((l) => `${l.speaker}: ${l.text}`).join("\n"), { rows: 12, hint: "one line each: Name: words" })
          + `<div class="field"><label class="label" for="pe_plays">The children hear it</label><select class="select" id="pe_plays"><option value="2"${s.plays !== 1 ? " selected" : ""}>twice</option><option value="1"${s.plays === 1 ? " selected" : ""}>once</option></select></div>`
          + `<p class="st-hint">${icon("info", "i-xs")} Every answer must still be said in the script. The audio is made again from the new script.</p>`,
        onSave: (v) => {
          const script = lines(v("pe_script")).map((l) => { const m = l.match(/^([^:]{1,24}):\s*(.+)$/); return m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: "Narrator", text: l }; });
          if (!script.length) { toast("The script can’t be empty.", "warn"); return false; }
          const plays = Number(v("pe_plays")) === 1 ? 1 : 2;
          revise(s.id, (raw) => { raw.script = script; }, "Script saved.").then(() => { const x = A(s.id); if (x) { x.plays = plays; host.commit(); } });
        },
      });
    }
    if (d.kind === "speaking") return speakingEditor(s, d.card);
  }

  /** What the pairs of a matching-like part are called: [editor title, left, right]. */
  const PAIR_LABELS = {
    default: ["Words and meanings", "Word", "Meaning"],
    "R-CONV": ["The conversation", "Line", "Reply"],
    "R-SENT": ["The missing sentences", "Gap", "Sentence"],
    "V-SORT": ["Words and groups", "Word", "Group"],
  };

  function itemEditor(s, d, el) {
    const example = d.kind === "example";
    const idx = example ? -1 : itemIndex(s, d.ref);
    const it = example ? s.example : s.items[idx];
    if (!it) return;
    const choice = s.answerType === "choice";
    const tf = s.answerType === "tf";
    const ans = tf ? `<div class="field"><label class="label" for="pe_ans">Right answer</label><select class="select" id="pe_ans">${tfLabels(host.doc().meta.classProfile).map((l, i) => `<option${it.tf === i ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` : field("pe_ans", s.answerType === "match" ? (PAIR_LABELS[s.task] || PAIR_LABELS.default)[2] : s.task === "V-USE" ? "Model sentence" : s.task === "V-SORT" ? "Group" : "Right answer", it.answer);
    // Letter help for this one question (the tasks whose letter boxes the app makes).
    let help = null;
    if (LETTER_HELP_TASKS.includes(s.task)) {
      const plan = host.spec().parts.find((p) => p.id === s.id);
      const o = partOpts(plan || { task: s.task }, host.spec().levelId);
      let rootEl = null;
      help = letterHelpField({
        task: s.task, reveal: it.reveal, partMode: s.task === "V-FORM" ? o.family : o.hint,
        answer: () => rootEl?.querySelector("#pe_ans")?.value ?? it.answer, prompt: () => rootEl?.querySelector("#pe_prompt")?.value ?? it.prompt,
      });
      const mount = help.mount;
      help.mount = (root) => { rootEl = root; mount(root); };
    }
    form({
      title: example ? "The example" : `Question ${it.n}`, subtitle: label(s),
      body: field("pe_prompt", s.answerType === "match" ? (PAIR_LABELS[s.task] || PAIR_LABELS.default)[1] : s.task === "V-GREEK" ? "Greek meaning" : s.task === "V-SORT" ? "Word" : "Question / sentence", it.prompt, { rows: 3, hint: /_{3,}/.test(it.prompt || "") ? "the gap is ________" : "" })
        + (choice ? field("pe_opts", "Options", it.options.join("\n"), { rows: 4, hint: "one per line — the right answer must be one of them" }) : "")
        + ans + (help?.html || ""),
      extraFoot: example ? "" : `<button type="button" class="btn btn-magic" data-pe-remake>${icon("sparkles", "i-sm")}Remake with Lingo</button>`,
      onMount(root, close) { help?.mount(root); root.querySelector("[data-pe-remake]")?.addEventListener("click", () => { close(); remakeDialog(d, el); }); },
      onSave: (v) => {
        const item = { prompt: v("pe_prompt").trim(), answer: v("pe_ans").trim(), options: choice ? lines(v("pe_opts")) : undefined, evidence: it.evidence, ...(help ? { reveal: help.value() } : it.reveal !== undefined ? { reveal: it.reveal } : {}) };
        if (choice && !item.options.some((o) => o.toLowerCase() === item.answer.toLowerCase())) { toast("The right answer must be one of the options.", "warn"); return false; }
        if (!item.answer) { toast("Add the right answer.", "warn"); return false; }
        revise(s.id, (raw) => { if (example) raw.example = item; else raw.items[idx] = item; }, example ? "Example saved." : `Question ${it.n} saved.`);
      },
    });
  }

  function speakingEditor(s, focusCard = -1) {
    const role = s.task === "S-ROLE";
    const cards = s.cards.length ? s.cards : [{ title: "", student: "", keyWords: [], questions: [], followUps: [], model: "" }];
    form({
      title: "Speaking cards", subtitle: label(s), iconName: "mic",
      body: field("pe_warm", "Warm-up questions", (s.warmup || []).join("\n"), { rows: 2, hint: "one per line" })
        + cards.map((c, k) => `<fieldset class="pe-card" data-card="${k}"><legend>${role ? `Student ${k % 2 ? "B" : "A"}` : `Card ${k + 1}`}</legend>
          ${field(`pe_ct${k}`, "Title", c.title)}${field(`pe_cs${k}`, "What the student reads", c.student, { rows: 2 })}
          ${field(`pe_ck${k}`, "Key words", c.keyWords.join(", "), { hint: "commas" })}
          ${field(`pe_cq${k}`, "Teacher’s questions", c.questions.join("\n"), { rows: 3, hint: "one per line" })}
          ${field(`pe_cf${k}`, "Follow-up questions", c.followUps.join("\n"), { rows: 2, hint: "one per line" })}
          ${field(`pe_cm${k}`, role ? "Model dialogue" : "Model answer", c.model, { rows: 3 })}</fieldset>`).join(""),
      onMount(root) { if (focusCard >= 0) root.querySelector(`[data-card="${focusCard}"]`)?.scrollIntoView({ block: "center" }); },
      onSave: (v) => revise(s.id, (raw) => {
        raw.warmup = lines(v("pe_warm"));
        raw.cards = cards.map((_, k) => ({ title: v(`pe_ct${k}`).trim(), student: v(`pe_cs${k}`).trim(), keyWords: v(`pe_ck${k}`).split(",").map((x) => x.trim()).filter(Boolean), questions: lines(v(`pe_cq${k}`)), followUps: lines(v(`pe_cf${k}`)), model: v(`pe_cm${k}`).trim() }));
      }, "Speaking cards saved."),
    });
  }

  /* ── Lingo remakes one question ── */
  function remakeDialog(d, el) {
    const s = A(d.id);
    if (!s) return;
    const idx = itemIndex(s, d.ref);
    const it = s.items[idx];
    if (!it) return;
    const shown = `${it.prompt || ""}${it.options?.length ? ` — ${it.options.join(" / ")}` : ""}`.trim() || it.answer;
    openDialog({
      title: `Remake question ${it.n}`, subtitle: label(s), iconName: "sparkles", tone: "brand", size: "sm",
      body: `<p class="pe-now">${esc(shown)}</p>
        <div class="field"><label class="label" for="pe_wish">What should change? <span class="opt">optional</span></label>
          <textarea class="textarea" id="pe_wish" rows="2" placeholder="e.g. use the word “island”, ask about the second paragraph, make the wrong options closer"></textarea></div>
        <div class="pe-wishes">${WISHES.map(([l, w]) => `<button type="button" class="chip" data-wish="${esc(w)}">${esc(l)}</button>`).join("")}</div>`,
      foot: `<button type="button" class="btn btn-ghost" data-fresh>${icon("shuffle", "i-sm")}Surprise me</button><span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-go>${icon("sparkles", "i-sm")}Remake</button>`,
      onMount(root, close) {
        const box = root.querySelector("#pe_wish");
        root.querySelectorAll("[data-wish]").forEach((b) => b.addEventListener("click", () => {
          b.classList.toggle("active");
          const picked = [...root.querySelectorAll("[data-wish].active")].map((x) => x.dataset.wish);
          const typed = box.value.split(";").map((x) => x.trim()).filter((x) => x && !WISHES.some(([, w]) => w === x));
          box.value = [...typed, ...picked].join("; ");
        }));
        root.querySelector("[data-fresh]").addEventListener("click", () => { close(); remake(s.id, idx, "", el); });
        root.querySelector("[data-go]").addEventListener("click", () => { close(); remake(s.id, idx, box.value.trim(), el); });
        box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector("[data-go]").click(); } });
      },
    });
  }

  /** opts: { quiet } (no toast; the caller reports), { answer } (the new question must have this word as its answer). */
  async function remake(id, idx, wish, el, opts = {}) {
    const s = A(id);
    const n = idx + 1;
    if (!s?.items[idx]) return false;
    el ||= itemEl(id, n);
    if (el) { busy.add(el); el.classList.add("pe-busy"); }
    bar?.remove(); bar = null; barFor = null;
    const before = snapshot();
    const doc0 = host.doc();
    const restore = () => { if (host.doc() === doc0) Object.assign(doc0, JSON.parse(before)); };
    try {
      const ctx = await host.ctx();
      const spec = host.spec();
      // The wish becomes precise rules built from the question itself, and checks on the answer: a reply that
      // ignores the wish (the same word again, the same sentence) goes back to Lingo with the reason, up to 3 tries.
      const original = JSON.parse(JSON.stringify(s.items[idx]));
      const plan = remakePlan({ wish, item: original, siblings: s.items.filter((_, k) => k !== idx), candidates: ctx.focus || [] });
      if (opts.answer) {
        plan.instruction += `
The right answer MUST be "${opts.answer}" (a form of it that fits the sentence is fine): the question tests that word.`;
        plan.checks.answer = opts.answer;
      }
      let problems = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const sec = A(id);
        const { system, user } = fixItemsPrompt(spec, sec, [n], { profileBlock: host.profile(spec.levelId, ctx.focus), focusWords: ctx.focus, pictureWords: ctx.pictureWords, instruction: plan.instruction });
        const reply = await host.ask(system, user, attempt ? remakeRetryHint(problems) : "");
        if (host.doc() !== doc0) return false; // the test was closed, deleted or rewritten meanwhile
        const changed = applyItemFixes(host.doc(), spec, id, reply, [n], { picFor: ctx.picFor, focusWords: ctx.focus });
        const now = A(id)?.items[idx];
        problems = changed.length ? remakeProblems(original, now, plan.checks) : ["no new question came back"];
        // "baker" is not "bake": the answer must be the word itself when another chosen word is its longer form.
        if (changed.length && opts.answer && !problems.length && !hasWord(String(now?.answer || ""), opts.answer, (host.doc()?.focusWords || []).map((w) => w.english))) problems.push(`the answer must be "${opts.answer}" itself, not another word of its family`);
        // A new question with its own fault (answer not among the options, a word outside the list) is not done either.
        if (changed.length) problems.push(...(A(id)?.problems || []).filter((p) => p.startsWith(`item ${n}:`)).map((p) => p.replace(/^item \d+: /, "")));
        if (!problems.length) break;
        restore();
      }
      if (problems.length) {
        if (!opts.quiet) toast(`Lingo didn’t manage it (${problems[0]}). Try other words in the box, or edit the question yourself.`, "warn", { ms: 7000 });
        return false;
      }
      await host.checkKeys([id]);
      if (host.doc() !== doc0) return false;
      if (!opts.quiet) done(before, `Question ${n} is new.`);
      flash(id, n);
      return true;
    } catch (e) {
      restore();
      if (!opts.quiet) toast(e?.message || "Lingo couldn’t remake that question.", "error");
      else throw e;
      return false;
    } finally {
      if (el) { busy.delete(el); el.classList.remove("pe-busy"); }
    }
  }

  /** A question on the paper (A version), for the busy look while Lingo rewrites it. */
  function itemEl(id, n) {
    const i = host.view()?.sections.findIndex((x) => x.id === id);
    const secEl = host.root.querySelectorAll("section.st-sec")[i];
    return host.sheet() === "B" ? null : secEl?.querySelectorAll(".st-item:not(.st-example), .pic-card:not(.st-example)")[n - 1] || null;
  }

  /** Light up a question after a change (on the paper just redrawn). */
  function flash(id, n) {
    const i = host.view()?.sections.findIndex((s) => s.id === id);
    const secEl = host.root.querySelectorAll("section.st-sec")[i];
    const item = secEl?.querySelectorAll(".st-item:not(.st-example), .pic-card:not(.st-example)")[host.sheet() === "B" ? -1 : n - 1];
    if (item) { item.classList.add("pe-flash"); item.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  function rewriteDialog(d) {
    const s = A(d.id);
    if (!s) return;
    openDialog({
      title: "Rewrite this part", subtitle: label(s), iconName: "sparkles", tone: "brand", size: "sm",
      body: `<p class="st-hint">Lingo writes the whole part again — new questions${s.passage ? ", a new text" : s.script?.length ? ", a new script" : ""}. You can undo it.</p>
        <div class="field"><label class="label" for="pe_pwish">Anything to change? <span class="opt">optional</span></label>
        <textarea class="textarea" id="pe_pwish" rows="2" placeholder="e.g. a story about a school trip, more questions about animals"></textarea></div>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-go>${icon("sparkles", "i-sm")}Rewrite part</button>`,
      onMount(root, close) {
        root.querySelector("[data-go]").addEventListener("click", async () => {
          const wish = root.querySelector("#pe_pwish").value.trim();
          close();
          const before = snapshot();
          const docId = host.doc()?.id;
          const secEl = host.root.querySelectorAll("section.st-sec")[host.view().sections.findIndex((x) => x.id === s.id)];
          secEl?.classList.add("pe-t", "pe-busy");
          const ok = await host.rewritePart(s.id, wish);
          secEl?.classList.remove("pe-busy");
          if (ok) toast("That part is new.", "ok", { ms: 5000, actions: [{ label: "Undo", run: () => { const d = host.doc(); if (!d || d.id !== docId) return; Object.assign(d, JSON.parse(before)); host.commit(); } }] });
        });
      },
    });
  }

  /* ── Put words on the test, where the teacher decides (from the word check) ── */
  // Vocabulary tasks whose answer is the word itself: a word put there must be the right answer.
  const ANSWER_TASKS = new Set(["V-PIC", "V-MC", "V-SPELL", "V-BANK", "V-DEF", "V-FIX", "V-GREEK", "V-PICREAD"]);
  const FIT_LABEL = { best: "Best fit", ok: "Fits", rewrite: "Only by writing the part again", nopic: "No picture", recommended: "Recommended", new: "New" };
  // How many words a new part takes: a little more than the class's usual part, never a crowded one.
  const perPartFor = (levelId) => Math.max(6, Math.min(10, (TEST_DEFAULTS[levelId]?.items || 5) + 3));
  // A test usually checks about this many words well; beyond it, a second test or a dictation serves better.
  const COMFORT_PARTS = 2;

  /**
   * The word(s), then where: a NEW vocabulary part (or parts) built on them, or an existing part — each says how well
   * the words fit and why — and how: a new question (and where), the question(s) it replaces (each says if it is the
   * only test of a chosen word), or the part written again. For new parts the dialog proposes the parts (task types
   * that suit the class, pictures where every word has one), shows what the test becomes (parts, points, minutes),
   * and, when the words are many, the amount that keeps the test a test. Lingo writes it; every word is checked
   * afterwards, and one toast says where each word is now — from the word check itself — with Undo for all of it.
   */
  async function placeWords(words, { part = null } = {}) {
    const doc = host.doc();
    if (!doc || !words?.length) return;
    const ctx = await host.ctx().catch(() => ({}));
    const hasPicture = (w) => !!ctx.picFor?.(w);
    const all = words.map((w) => (typeof w === "string" ? { english: w } : w)).filter((w) => w.english);
    const spec = host.spec();
    const levelIdx = levelIndex(spec.levelId);
    const perPart = perPartFor(spec.levelId);
    // Many words: the dialog starts from what one test checks well (the first ones, in priority order); "All" is a tap.
    const comfortN = perPart * COMFORT_PARTS;
    const on = new Set(all.slice(0, all.length > comfortN ? comfortN : all.length).map((w) => w.english));
    // plan: the new parts (and additions to parts already on the test) — Lingo's proposal until the teacher changes
    // it (custom), then theirs. sel: words picked in the plan, to move together.
    const st = { part, mode: "add", at: null, replace: [], wish: "", plan: null, sig: "", custom: false, sel: new Set() };
    const chosenWords = () => all.filter((w) => on.has(w.english));
    const chosen = () => chosenWords().map((w) => w.english);
    const options = () => placementOptions(host.doc(), chosen().length ? chosen() : all.map((w) => w.english), { tasks: TASKS, maxItems: MAX_ITEMS, hasPicture });
    const room = (o) => MAX_ITEMS - (A(o.id)?.items.length || 0);
    const used = () => host.doc().sections.map((s) => s.task);
    const tasksFor = (words) => newPartTasks(levelIdx, { tasks: TASKS, pictures: words.length > 0 && words.every(hasPicture) });
    const needsPictures = (t) => !!TASKS[t]?.needs?.includes("pictures");
    const fallbackTask = (p) => tasksFor(p.words).find((t) => !needsPictures(t)) || "V-BANK";
    // Every vocabulary exercise of Step 3 (as its exercise library shows them): the ones made for this class first,
    // then the ones for older or younger classes; a picture exercise only while every word of the part has a picture.
    const VOCAB_TASKS = Object.keys(TASKS).filter((t) => TASKS[t].skill === "vocabulary");
    const taskOptions = (p) => {
      const pics = p.words.length > 0 && p.words.every(hasPicture);
      const opt = (t) => {
        const off = needsPictures(t) && !pics;
        const fit = taskFit(t, spec.levelId);
        return `<option value="${t}"${t === p.task ? " selected" : ""}${off ? " disabled" : ""}>${esc(TASKS[t].label)}${off ? " — needs a picture for every word" : fit.fit !== "great" ? ` — ${fit.fit === "stretch" ? "a stretch" : "easy"}` : ""}</option>`;
      };
      const great = VOCAB_TASKS.filter((t) => taskFit(t, spec.levelId).fit === "great");
      const other = VOCAB_TASKS.filter((t) => !great.includes(t));
      return `<optgroup label="Made for ${esc(host.doc().meta.classLabel || "this class")}">${great.map(opt).join("")}</optgroup>${other.length ? `<optgroup label="For older or younger classes">${other.map(opt).join("")}</optgroup>` : ""}`;
    };
    // Step 3’s settings for the exercise (letter help, how many choices, extra words in the box …).
    const OPT_KNOBS = ["hint", "family", "options", "extras"];
    const knobsFor = (p) => {
      const o = partOpts({ task: p.task, opts: p.opts || {} }, spec.levelId);
      return (TASKS[p.task]?.knobs || []).filter((k) => OPT_KNOBS.includes(k) && KNOBS[k]).map((k) => `<div class="pw-knob"><span>${esc(KNOBS[k].label)}</span><div class="pw-knob-chips" role="radiogroup" aria-label="${esc(KNOBS[k].label)}">${KNOBS[k].values.map(([v, label]) => `<button type="button" class="chip${String(o[k]) === String(v) ? " active" : ""}" data-pw-opt="${esc(p.key)}" data-k="${k}" data-v="${esc(String(v))}" role="radio" aria-checked="${String(o[k]) === String(v)}">${esc(label)}</button>`).join("")}</div></div>`).join("");
    };
    /** The plan for the chosen words: Lingo's proposal, or the teacher's own (kept in step with the chosen words). */
    const newPlan = () => {
      const sig = chosen().join("|");
      if (!st.custom && (!st.plan || st.sig !== sig)) {
        st.plan = planFromProposal(planNewParts(chosenWords(), { levelIdx, tasks: TASKS, perPart, hasPicture, used: used() }));
        st.sig = sig;
      } else if (st.custom) st.plan = syncPlan(st.plan, chosen());
      st.plan = fitTasks(st.plan, { hasPicture, fallback: fallbackTask, needsPictures }).plan;
      return st.plan;
    };
    /** A change the teacher makes to the plan: from now on it is theirs. */
    const edit = (next) => { st.plan = next; st.custom = true; st.sel.clear(); };
    /** Parts already on the test that can take new questions for these words (vocabulary parts with room first). */
    const roomyParts = () => options().filter((o) => o.canAdd && room(o) > 0 && (o.fit === "best" || o.fit === "ok"));
    const roomLeft = (p) => { const o = options().find((x) => x.id === p.id); return o ? room(o) : 0; };
    // Is the new part the better answer? When the existing parts can't take the words without crowding.
    const newIsBest = (opts, n) => n > 5 || !opts.some((o) => o.fit === "best" && o.canAdd && room(o) >= n);
    const pick = () => {
      const opts = options();
      const n = chosen().length;
      if (st.part == null || (st.part !== "new" && (!opts[st.part] || opts[st.part].fit === "nopic"))) {
        const ok = (o) => o.canAdd && room(o) >= n;
        st.part = newIsBest(opts, n) ? "new" : (opts.find((o) => o.fit === "best" && ok(o)) || opts.find((o) => o.fit !== "rewrite" && ok(o)) || opts.find((o) => o.fit !== "rewrite" && o.canReplace))?.part ?? "new";
      }
      if (st.part === "new") return { opts, o: null, n };
      const o = opts[st.part];
      // The mode the part allows (enough room, enough questions), the place at the end, and the questions safest to replace.
      const canAdd = o.canAdd && room(o) >= n;
      const canReplace = o.canReplace && o.items.length >= n;
      if (o.fit === "rewrite") st.mode = "rewrite";
      else if (st.mode === "add" && !canAdd) st.mode = canReplace ? "replace" : "rewrite";
      else if (st.mode === "replace" && !canReplace) st.mode = canAdd ? "add" : "rewrite";
      if (st.at == null || st.at > o.items.length) st.at = o.items.length;
      st.replace = st.replace.filter((x) => o.items.some((it) => it.n === x)).slice(0, n);
      if (st.mode === "replace" && !st.picked && st.replace.length < n) {
        // Only questions that are no word's only test are picked for the teacher; the rest they pick themselves.
        const order = o.items.filter((it) => !it.only.length).sort((a, b) => a.tests.length - b.tests.length);
        for (const it of order) if (st.replace.length < n && !st.replace.includes(it.n)) st.replace.push(it.n);
        st.replace.sort((a, b) => a - b);
      }
      return { opts, o, n };
    };
    const cov = () => new Map(testCoverage(host.doc()).words.map((w) => [w.english.toLowerCase(), w]));
    const tone = { tested: "cov-good", seen: "cov-warn", missing: "cov-bad" };
    /** What the test becomes with these new parts: parts, points, minutes now → then. */
    const sizeAfter = (plan) => {
      const extra = plan.parts.filter((p) => p.kind === "new" && p.words.length).map((p) => ({ ...makePart("vocabulary", p.task, spec.levelId), items: p.words.length }));
      const adds = new Map(plan.parts.filter((p) => p.kind === "existing").map((p) => [p.id, p.words.length]));
      const now = { parts: spec.parts.length, points: specPoints(spec), minutes: estimateMinutes(spec) };
      const then = { ...spec, parts: [...spec.parts.map((p) => (adds.has(p.id) ? { ...p, items: (p.items || 0) + adds.get(p.id) } : p)), ...extra] };
      return { now, then: { parts: then.parts.length, points: specPoints(then), minutes: estimateMinutes(then) } };
    };

    function newHtml(n) {
      const plan = newPlan();
      const size = sizeAfter(plan);
      const comfort = Math.min(all.length, comfortN);
      const roomy = roomyParts();
      const newParts = plan.parts.filter((p) => p.kind === "new");
      const chip = (w) => `<button type="button" class="pw-chip${st.sel.has(w) ? " on" : ""}" draggable="true" data-pw-chip="${esc(w)}" aria-pressed="${st.sel.has(w)}" title="Tap to pick · drag to move">${esc(w)}</button>`;
      const partCard = (p) => {
        const isNew = p.kind === "new";
        const k = newParts.indexOf(p);
        const max = isNew ? MAX_ITEMS : roomLeft(p);
        const over = !isNew && p.words.length > max;
        const t = isNew ? p.task : A(p.id)?.task;
        const head = isNew
          ? `<span class="pw-n">${k + 1}</span><span class="pw-card-t">New part</span>
            <select class="select sm" data-pw-task="${esc(p.key)}" aria-label="Kind of exercise for new part ${k + 1}">${taskOptions(p)}</select>`
          : `<span class="pw-n">${icon("plus", "i-xs")}</span><span class="pw-card-t">Add to Part ${p.part + 1} · ${esc(TASKS[t]?.label || "")}</span>`;
        const long = isNew && p.words.length > perPart + 2;
        return `<div class="pw-new-part${over ? " over" : ""}" data-skill="vocabulary" data-pw-drop="${esc(p.key)}">
          <div class="pw-new-head">${head}
            <span class="pw-size-ctl" role="group" aria-label="Size">
              <button type="button" class="pw-step" data-pw-size="${esc(p.key)}" data-d="-1" aria-label="One question fewer"${p.words.length ? "" : " disabled"}>−</button>
              <b>${plural(p.words.length, "question")}</b>
              <button type="button" class="pw-step" data-pw-size="${esc(p.key)}" data-d="1" aria-label="One question more"${p.words.length >= max ? " disabled" : ""}>+</button>
            </span>
            <button type="button" class="pw-x" data-pw-remove="${esc(p.key)}" aria-label="Remove this part" title="Remove (its words are left out for now)">${icon("x", "i-xs")}</button>
          </div>
          ${isNew ? knobsFor(p) : ""}
          <div class="pw-new-words">${p.words.length ? p.words.map(chip).join("") : `<span class="pw-empty">Drag words here, or pick words and choose “Move to”.</span>`}</div>
          ${over ? `<p class="pw-hint warn">${icon("alert", "i-xs")}<span>Part ${p.part + 1} has room for ${plural(max, "more question")} — move ${p.words.length - max} of these words elsewhere.</span></p>`
            : long ? `<p class="pw-note">A long part — about ${perPart} questions is easier on the children.</p>`
            : isNew && p.words.length && p.words.length < 3 ? `<p class="pw-note">A short part — Step 3 parts have at least 3 questions; add words or move these to another part.</p>`
            : isNew && ANSWER_TASKS.has(t) ? `<p class="pw-note">Each word is the answer to its question.</p>`
            : isNew && ["V-FORM", "V-FAMMC", "V-OPP", "V-OPPW", "V-SYN"].includes(t) ? `<p class="pw-note">Each word is the word in CAPITALS; the answer is its ${t === "V-SYN" ? "match" : t.startsWith("V-OPP") ? "opposite" : "other form"}.</p>` : ""}
        </div>`;
      };
      const spare = `<div class="pw-new-part pw-spare" data-pw-drop="spare">
          <div class="pw-new-head"><span class="pw-card-t">Left out for now</span><small>${plural(plan.spare.length, "word")} · not put on the test</small></div>
          <div class="pw-new-words">${plan.spare.length ? plan.spare.map(chip).join("") : `<span class="pw-empty">Drag a word here to leave it out.</span>`}</div>
        </div>`;
      const targets = [
        ...newParts.map((p, k) => `<option value="${esc(p.key)}">New part ${k + 1} · ${esc(TASKS[p.task]?.label || "")}</option>`),
        `<option value="new">A new part</option>`,
        ...roomy.map((o) => `<option value="part:${esc(o.id)}">Part ${o.part + 1} · ${esc(TASKS[o.task]?.label || "")} (room for ${room(o)})</option>`),
        `<option value="spare">Leave out for now</option>`,
      ].join("");
      const bar = st.sel.size ? `<div class="pw-movebar"><b>${plural(st.sel.size, "word")} picked</b>
          <select class="select sm" data-pw-move aria-label="Move the picked words to"><option value="">Move to…</option>${targets}</select>
          <button type="button" class="pk-clear" data-pw-unpick>Clear</button></div>`
        : `<p class="pw-note">Drag words between parts, or tap words to pick them and choose where they go. − / + makes a part smaller or bigger.</p>`;
      const existingDrops = roomy.filter((o) => !plan.parts.some((p) => p.kind === "existing" && p.id === o.id));
      const drops = existingDrops.length ? `<div class="pw-drops"><small>Or add to a part already on the test:</small>${existingDrops.map((o) => `<button type="button" class="pw-drop" data-pw-drop="part:${esc(o.id)}">Part ${o.part + 1} · ${esc(TASKS[o.task]?.label || "")} <small>room for ${room(o)}</small></button>`).join("")}</div>` : "";
      const nNew = newParts.filter((p) => p.words.length).length;
      const partsList = `${bar}<div class="pw-new-list">${plan.parts.map(partCard).join("")}
          <button type="button" class="pw-add-part" data-pw-drop="new">${icon("plus", "i-xs")}${st.sel.size ? `A new part with the ${plural(st.sel.size, "picked word")}` : "Add a part"}</button>
          ${plan.spare.length || st.custom ? spare : ""}</div>${drops}`;
      const many = all.length > comfort;
      const presets = many ? `<div class="pw-presets">
          <button type="button" class="chip${!st.custom && n === comfort && chosen().every((w, i) => w === all[i].english) ? " active" : ""}" data-pw-first="${comfort}">${icon("star", "i-xs")}The first ${comfort} <small>${plural(Math.ceil(comfort / perPart), "part")}</small></button>
          <button type="button" class="chip${!st.custom && n === all.length ? " active" : ""}" data-pw-first="${all.length}">All ${all.length} <small>${plural(planNewParts(all, { levelIdx, tasks: TASKS, perPart, hasPicture }).length, "part")}</small></button>
        </div>` : "";
      const advice = many ? `<p class="pw-hint">${icon("info", "i-xs")}<span><b>${all.length} words are more than one test checks well.</b> ${plural(Math.ceil(comfort / perPart), "new part")} with the first ${comfort} (your own words first, then the ones not on the test at all, in the unit’s order) keeps it a test. The rest can go in a second test or a dictation — or tap words above to choose others.</span></p>` : "";
      const long = size.then.minutes - size.now.minutes;
      return `${advice}${presets}
        <div class="pw-size"><span><b>${size.now.parts} → ${size.then.parts}</b> parts</span><span><b>${size.now.points} → ${size.then.points}</b> points</span><span class="${size.then.minutes > 60 ? "warn" : ""}"><b>≈${size.now.minutes} → ${size.then.minutes}</b> min</span>${long > 0 ? `<small>+${long} min</small>` : ""}</div>
        ${n ? `<div class="pw-plan-head"><span class="label">${st.custom ? "Your plan" : "Lingo’s plan"}</span>${st.custom ? `<button type="button" class="pk-clear" data-pw-reset>Back to Lingo’s plan</button>` : ""}</div>${partsList}` : ""}
        <p class="pw-hint">${icon("check", "i-xs")}<span>${plan.parts.some((p) => p.kind === "existing" && p.words.length) ? "The questions already on the test stay as they are." : "Nothing already on the test changes."}${nNew ? ` The new ${nNew > 1 ? "parts go" : "part goes"} after the vocabulary parts; Step 3 shows ${nNew > 1 ? "their" : "its"} words.` : ""} Every word is checked when Lingo has written it.</span></p>`;
    }

    function body() {
      const { opts, o, n } = pick();
      const c = cov();
      const wordsHtml = all.map((w) => {
        const x = c.get(w.english.toLowerCase());
        const where = x ? (x.status === "tested" ? `tested in ${x.tested.map((t) => `Part ${t.part + 1}`).join(", ")}` : x.status === "seen" ? `only appears in ${x.seen.map((p) => `Part ${p + 1}`).join(", ")}` : "not on the test") : "";
        return `<button type="button" class="pw-word ${tone[x?.status] || ""}${on.has(w.english) ? " on" : ""}" data-pw-word="${esc(w.english)}" aria-pressed="${on.has(w.english)}"${all.length === 1 ? " disabled" : ""}>${all.length > 1 ? `<span class="pw-box">${icon(on.has(w.english) ? "check" : "plus", "i-xs")}</span>` : ""}<b>${esc(w.english)}</b>${w.greek ? `<small>${esc(w.greek)}</small>` : ""}${all.length <= 12 ? `<em>${esc(where)}</em>` : ""}</button>`;
      }).join("");
      const newBest = newIsBest(opts, n);
      const newCard = `<button type="button" class="pw-part pw-part-new fit-${newBest ? "best" : "ok"}${st.part === "new" ? " active" : ""}" data-pw-part="new" data-skill="vocabulary">
          <span class="pw-part-ico">${icon("plus")}</span>
          <span class="pw-part-t"><small>${n > perPart + 2 ? "New parts" : "A new part"} · Vocabulary</small><b>${n > perPart + 2 ? "New vocabulary parts" : "A new vocabulary part"} on ${n === 1 ? "this word" : "these words"}</b><span>One question for each word, in an exercise that suits ${esc(host.doc().meta.classLabel || "the class")}. Nothing already on the test changes.</span></span>
          <span class="pw-fit">${newBest ? FIT_LABEL.recommended : FIT_LABEL.new}</span></button>`;
      const partsHtml = opts.map((p) => {
        const s = A(p.id);
        const fitText = p.fit === "best" && !(p.canAdd && room(p) >= n) ? (p.canReplace ? "Only by replacing" : FIT_LABEL.rewrite) : FIT_LABEL[p.fit];
        return `<button type="button" class="pw-part fit-${p.fit}${p.part === st.part ? " active" : ""}" data-pw-part="${p.part}" data-skill="${esc(p.skill)}"${p.fit === "nopic" ? " disabled" : ""}>
          <span class="pw-part-ico">${SKILLS[p.skill]?.icon || ""}</span>
          <span class="pw-part-t"><small>Part ${p.part + 1} · ${esc(SKILLS[p.skill]?.label || "")} · ${plural(s?.items.length || 0, "question")}${p.canAdd && p.fit !== "rewrite" ? ` · room for ${room(p)} more` : ""}</small><b>${esc(TASKS[p.task]?.label || "")}</b><span>${esc(p.note)}</span></span>
          <span class="pw-fit">${esc(fitText)}</span></button>`;
      }).join("");
      let how = "";
      if (st.part === "new") how = newHtml(n);
      else {
        const full = !(o.canAdd && room(o) >= n);
        const modeBtn = (k, ico, text, ok, why) => `<button type="button" class="chip${st.mode === k ? " active" : ""}" data-pw-mode="${k}"${ok ? "" : ` disabled title="${esc(why)}"`}>${icon(ico, "i-xs")}${text}</button>`;
        how = `<div class="field"><span class="label">How?</span><div class="pw-modes" role="radiogroup" aria-label="How">
          ${modeBtn("add", "plus", n > 1 ? `Add ${n} new questions` : "Add a new question", o.fit !== "rewrite" && !full, o.fit === "rewrite" ? o.note : `This part has room for ${room(o)} more question${room(o) === 1 ? "" : "s"} — a new part takes them all.`)}
          ${modeBtn("replace", "refresh", n > 1 ? `Replace ${n} questions` : "Replace a question", o.canReplace && o.items.length >= n, o.fit === "rewrite" ? o.note : `This part has only ${plural(o.items.length, "question")}.`)}
          ${modeBtn("rewrite", "sparkles", "Write the part again", true, "")}</div></div>`;
        if (st.mode === "add") {
          how += `<div class="field"><label class="label" for="pw_at">Where</label><select class="select" id="pw_at" data-pw-at>${Array.from({ length: o.items.length + 1 }, (_, k) => `<option value="${k}"${k === st.at ? " selected" : ""}>${k === o.items.length ? "At the end" : k === 0 ? "At the start (before question 1)" : `After question ${k}`}</option>`).join("")}</select></div>
          <p class="pw-hint">${icon("info", "i-xs")}<span>${n > 1 ? `One new question for each word, in this order: ${esc(chosen().join(", "))} —` : "Lingo writes one new question"} ${ANSWER_TASKS.has(o.task) ? "with the word as the right answer" : "built on the word"}. The other questions stay as they are.</span></p>`;
        } else if (st.mode === "replace") {
          how += `<div class="field"><span class="label">${n > 1 ? `Which ${n} questions? <span class="opt">${st.replace.length} of ${n} picked — one word each, in order</span>` : "Which question?"}</span>
          <div class="pw-items">${o.items.map((it) => {
            const sel = st.replace.includes(it.n);
            const tag = it.only.length ? `<span class="pw-tag warn">${icon("alert", "i-xs")}only question for ${esc(it.only.join(", "))}</span>` : it.tests.length ? `<span class="pw-tag">also tested elsewhere: ${esc(it.tests.join(", "))}</span>` : `<span class="pw-tag good">${icon("check", "i-xs")}safe to replace</span>`;
            return `<button type="button" class="pw-item${sel ? " active" : ""}" data-pw-item="${it.n}" aria-pressed="${sel}"><span class="pw-n">${it.n}</span><span class="pw-item-t">${esc(it.text || "—")}</span>${tag}${sel && n > 1 ? `<span class="pw-gets">→ ${esc(chosen()[st.replace.indexOf(it.n)] || "")}</span>` : ""}</button>`;
          }).join("")}</div></div>
          ${st.replace.some((x) => o.items.find((it) => it.n === x)?.only.length) ? `<p class="pw-hint warn">${icon("alert", "i-xs")}<span>A question you picked is the only test of another chosen word — that word would no longer be tested.</span></p>` : ""}`;
        } else {
          how += `<p class="pw-hint">${icon("info", "i-xs")}<span>Lingo writes the whole of Part ${o.part + 1} again — new questions${A(o.id)?.passage ? " and a new text" : A(o.id)?.script?.length ? " and a new script" : ""} — with ${n > 1 ? "these words" : "the word"} in it. The words it tests now may change. You can undo it.</span></p>
          <div class="field"><label class="label" for="pw_wish">Anything else? <span class="opt">optional</span></label><textarea class="textarea" id="pw_wish" rows="2" data-pw-wish placeholder="e.g. keep it about the school trip">${esc(st.wish)}</textarea></div>`;
        }
      }
      const count = all.length > 1 ? `<p class="pw-lead"><b>${n} of ${all.length}</b> chosen — tap a word to leave it out or put it back.${all.length > 6 ? ` <button type="button" class="pk-clear" data-pw-all>All</button><button type="button" class="pk-clear" data-pw-none>None</button>` : ""}</p>` : "";
      return `${count}<div class="pw-words${all.length > 12 ? " many" : ""}">${wordsHtml}</div>
        <div class="field"><span class="label">Where?</span><div class="pw-parts">${newCard}${partsHtml}</div></div>${how}`;
    }
    /** What the plan's Go does: the new parts, the additions to parts already on the test, and the words they place. */
    const planRun = () => {
      const plan = newPlan();
      const parts = plan.parts.filter((p) => p.kind === "new" && p.words.length).map((p) => ({ task: p.task, words: p.words, opts: { ...(p.opts || {}) } }));
      const extra = plan.parts.filter((p) => p.kind === "existing" && p.words.length).map((p) => ({ id: p.id, part: p.part, words: p.words, answer: ANSWER_TASKS.has(A(p.id)?.task) }));
      const over = plan.parts.some((p) => p.kind === "existing" && p.words.length > roomLeft(p));
      return { parts, extra, words: placedWords(plan), over };
    };
    const goLabel = () => {
      const { o, n } = pick();
      if (!n) return "Choose a word";
      if (st.part === "new") {
        const r = planRun();
        const k = r.parts.length;
        const where = [k > 1 ? `${k} new parts` : k ? "a new part" : "", ...r.extra.map((x) => `Part ${x.part + 1}`)].filter(Boolean);
        if (!r.words.length) return "Put a word in a part";
        return k && !r.extra.length ? (k > 1 ? `Add ${k} new parts (${r.words.length} words)` : `Add a new part (${plural(r.words.length, "word")})`) : `Put ${plural(r.words.length, "word")} in ${where.join(" and ")}`;
      }
      if (st.mode === "add") return n > 1 ? `Add ${n} questions to Part ${o.part + 1}` : `Add the question to Part ${o.part + 1}`;
      if (st.mode === "replace") return n > 1 ? `Replace questions ${st.replace.join(", ")}` : `Replace question ${st.replace[0] ?? ""}`;
      return `Write Part ${o.part + 1} again`;
    };
    /** "spare", "new", a plan part's key, or "part:<id>" (a part already on the test) → a moveWords target. */
    const target = (v) => {
      if (!v || v === "spare" || v === "new") return v;
      if (v.startsWith("part:")) { const o = options().find((x) => x.id === v.slice(5)); return o ? { id: o.id, part: o.part } : "spare"; }
      return v;
    };
    const newTask = () => { const t = tasksFor([]); const fresh = t.filter((x) => !used().includes(x) && !newPlan().parts.some((p) => p.task === x)); return fresh[0] || t[0] || "V-BANK"; };
    const moveTo = (words, v, at = null) => { if (words.length) edit(moveWords(newPlan(), words, target(v), { task: newTask(), at })); };

    openDialog({
      title: all.length > 1 ? `Put ${all.length} words on the test` : `Put “${all[0].english}” on the test`,
      subtitle: "You choose where — Lingo writes it, then every word is checked", iconName: "target", tone: "brand", sheet: true, size: "pw-sheet",
      body: `<div class="pw-dialog" data-pw></div>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-pw-go>${icon("sparkles", "i-sm")}<span></span></button>`,
      onMount(root, close) {
        const box = root.querySelector("[data-pw]");
        const go = root.querySelector("[data-pw-go]");
        const draw = () => {
          const y = box.closest(".dialog-body")?.scrollTop || 0;
          box.innerHTML = body();
          go.querySelector("span").textContent = goLabel();
          const { n } = pick();
          const r = st.part === "new" ? planRun() : null;
          go.disabled = !n || (r ? !r.words.length || r.over : st.mode === "replace" && st.replace.length !== n);
          const scroller = box.closest(".dialog-body");
          if (scroller) scroller.scrollTop = y;
        };
        box.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b || b.disabled) return;
          const words = b.dataset.pwWord !== undefined || b.dataset.pwAll !== undefined || b.dataset.pwNone !== undefined || b.dataset.pwFirst;
          if (b.dataset.pwWord) { if (on.has(b.dataset.pwWord)) on.delete(b.dataset.pwWord); else on.add(b.dataset.pwWord); }
          if (b.dataset.pwAll !== undefined) all.forEach((w) => on.add(w.english));
          if (b.dataset.pwNone !== undefined) on.clear();
          // A preset starts again from Lingo's plan for those words.
          if (b.dataset.pwFirst) { on.clear(); all.slice(0, Number(b.dataset.pwFirst)).forEach((w) => on.add(w.english)); st.custom = false; st.plan = null; st.sel.clear(); }
          if (words) { st.replace = []; st.picked = false; }
          if (b.dataset.pwPart) { st.part = b.dataset.pwPart === "new" ? "new" : Number(b.dataset.pwPart); st.at = null; st.replace = []; st.picked = false; if (st.mode === "rewrite") st.mode = "add"; }
          if (b.dataset.pwMode) st.mode = b.dataset.pwMode;
          if (b.dataset.pwItem) {
            // Picked by hand: kept exactly (pick() only fills in a choice the teacher hasn't made).
            const k = Number(b.dataset.pwItem);
            const n = chosen().length;
            st.picked = true;
            if (st.replace.includes(k)) st.replace = st.replace.filter((x) => x !== k);
            else st.replace = (n === 1 ? [k] : [...st.replace, k].slice(-n)).sort((a, z) => a - z);
          }
          // The teacher's plan: pick words, move them, size and remove parts.
          if (b.dataset.pwChip) { const w = b.dataset.pwChip; if (st.sel.has(w)) st.sel.delete(w); else st.sel.add(w); }
          if (b.dataset.pwUnpick !== undefined) st.sel.clear();
          if (b.dataset.pwReset !== undefined) { st.custom = false; st.plan = null; st.sel.clear(); }
          if (b.dataset.pwSize) edit(resizePart(newPlan(), b.dataset.pwSize, Number(b.dataset.d), { max: (() => { const p = newPlan().parts.find((x) => x.key === b.dataset.pwSize); return p?.kind === "existing" ? roomLeft(p) : MAX_ITEMS; })() }));
          if (b.dataset.pwRemove) edit(removePart(newPlan(), b.dataset.pwRemove));
          if (b.dataset.pwOpt) { const k = b.dataset.k; const v = KNOBS[k]?.values.find(([x]) => String(x) === b.dataset.v)?.[0]; if (v !== undefined) edit(setOpt(newPlan(), b.dataset.pwOpt, k, v)); }
          // "Add a part" / a part already on the test: the picked words go there (an empty new part when none are picked).
          if (b.dataset.pwDrop && !b.dataset.pwChip) {
            if (st.sel.size) moveTo([...st.sel], b.dataset.pwDrop);
            else if (b.dataset.pwDrop === "new") edit(addPart(newPlan(), newTask()));
            else if (b.dataset.pwDrop.startsWith("part:")) toast("Pick words first (tap them), or drag words onto the part.", "info", { ms: 2600 });
          }
          draw();
        });
        box.addEventListener("change", (e) => {
          if (e.target.dataset.pwAt !== undefined) st.at = Number(e.target.value);
          if (e.target.dataset.pwTask !== undefined) { edit(setTask(newPlan(), e.target.dataset.pwTask, e.target.value)); draw(); }
          if (e.target.dataset.pwMove !== undefined && e.target.value) { moveTo([...st.sel], e.target.value); draw(); }
        });
        box.addEventListener("input", (e) => { if (e.target.dataset.pwWish !== undefined) st.wish = e.target.value; });
        // Drag a word (or all the picked words, when it is one of them) onto a part, a word in it, or "Left out".
        let dragged = [];
        box.addEventListener("dragstart", (e) => {
          const c = e.target.closest?.("[data-pw-chip]");
          if (!c) return;
          const w = c.dataset.pwChip;
          dragged = st.sel.has(w) ? [...st.sel] : [w];
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", dragged.join(", "));
          box.classList.add("pw-dragging");
        });
        box.addEventListener("dragend", () => { dragged = []; box.classList.remove("pw-dragging"); box.querySelectorAll(".pw-over").forEach((x) => x.classList.remove("pw-over")); });
        box.addEventListener("dragover", (e) => {
          const t = dragged.length && e.target.closest?.("[data-pw-drop]");
          if (!t) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          box.querySelectorAll(".pw-over").forEach((x) => x !== t && x.classList.remove("pw-over"));
          t.classList.add("pw-over");
        });
        box.addEventListener("drop", (e) => {
          const t = dragged.length && e.target.closest?.("[data-pw-drop]");
          if (!t) return;
          e.preventDefault();
          // Dropped on a word: in front of it; else at the end.
          const before = e.target.closest?.("[data-pw-chip]");
          const part = newPlan().parts.find((p) => p.key === t.dataset.pwDrop);
          const at = before && part ? part.words.filter((w) => !dragged.includes(w)).indexOf(before.dataset.pwChip) : null;
          moveTo(dragged, t.dataset.pwDrop, at != null && at >= 0 ? at : null);
          dragged = [];
          box.classList.remove("pw-dragging");
          draw();
        });
        go.addEventListener("click", () => {
          const { o } = pick();
          if (!chosen().length) return;
          if (st.part === "new") {
            const r = planRun();
            if (!r.words.length || r.over) return;
            close();
            runPlacement(r.words, { mode: "new", parts: r.parts, extra: r.extra });
            return;
          }
          const plan = { id: o.id, part: o.part, mode: st.mode, at: st.at, replace: [...st.replace], wish: st.wish.trim(), answer: ANSWER_TASKS.has(o.task) };
          close();
          runPlacement(chosen(), plan);
        });
        draw();
      },
    });
  }

  /** Do what the teacher chose, then report from the word check where each word really is now (one Undo for all). */
  async function runPlacement(words, plan) {
    const docId = host.doc()?.id;
    const same = () => host.doc()?.id === docId;
    const undo = host.undoPoint();
    const before = snapshot();
    const n = words.length;
    const what = n > 1 ? `${n} words` : `“${words[0]}”`;
    const stop = toast(plan.mode === "new" ? `Lingo is writing ${[plan.parts.length > 1 ? `${plan.parts.length} new parts` : plan.parts.length ? "a new part" : "", ...(plan.extra || []).map((x) => `questions in Part ${x.part + 1}`)].filter(Boolean).join(" and ")} with ${what}…` : plan.mode === "rewrite" ? `Lingo is writing Part ${plan.part + 1} again with ${what}…` : `Lingo is writing ${n > 1 ? `${n} questions` : "the question"} with ${what} in Part ${plan.part + 1}…`, "info", { ms: 300000 });
    const failed = [];
    let newIds = [];
    try {
      if (plan.mode === "new") {
        // Words the teacher sent to parts already on the test: new questions at the end of the part, 5 a request.
        for (const x of plan.extra || []) {
          for (let k = 0; k < x.words.length; k += 5) {
            const batch = x.words.slice(k, k + 5);
            const res = await addWithLingo(x.id, A(x.id)?.items.length || 0, batch.length, { words: batch, strict: true, answer: x.answer, quiet: true });
            if (!same()) return;
            if (!res) failed.push(...batch); else failed.push(...res.failed);
          }
        }
        const res = plan.parts.length ? await host.addWordParts(plan.parts) : { added: [], failed: [] };
        if (!res || !same()) return;
        res.failed.forEach((p) => failed.push(...p.words));
        newIds = res.added.map((a) => a.id);
        // Each new part is checked word by word: a word Lingo left out goes into a question of its part that tests
        // no chosen word (or a second question on the same word), with the word as the answer.
        for (const a of res.added) {
          const answer = ANSWER_TASKS.has(A(a.id)?.task);
          const idx = () => host.doc().sections.findIndex((s) => s.id === a.id);
          const missed = () => { const c = testCoverage(host.doc()); return a.words.filter((w) => !c.words.find((y) => y.english === w)?.tested.some((t) => t.part === idx())); };
          let miss = missed();
          // A part that came back short gets the missing questions added (checked word by word) …
          const short = Math.max(0, a.words.length - (A(a.id)?.items.length || 0));
          if (miss.length && short) {
            const k = Math.min(short, miss.length, 5);
            await addWithLingo(a.id, A(a.id).items.length, k, { words: miss.slice(0, k), strict: true, answer, quiet: true });
            if (!same()) return;
            miss = missed();
          }
          // … and a word still left out goes into a question that tests no chosen word (or repeats one), as the answer.
          for (const w of miss) {
            const opts = placementOptions(host.doc(), a.words, { tasks: TASKS, maxItems: MAX_ITEMS, hasPicture: () => true })[idx()];
            const spare = opts?.items.find((it) => !it.tests.some((t) => a.words.includes(t)) || (it.tests.length && !it.only.length && it.tests.every((t) => a.words.includes(t))));
            const ok = spare ? await remake(a.id, spare.n - 1, `use the word "${w}"${answer ? " as the right answer" : ""}`, null, { quiet: true, answer: answer ? w : "" }) : false;
            if (!same()) return;
            if (!ok) failed.push(w);
          }
        }
      } else if (plan.mode === "add") {
        // Up to 5 new questions a request (as in "Add a question"), each batch after the questions placed so far.
        let at = plan.at;
        for (let k = 0; k < n; k += 5) {
          const batch = words.slice(k, k + 5);
          const res = await addWithLingo(plan.id, at, batch.length, { words: batch, strict: true, answer: plan.answer, quiet: true });
          if (!same()) return;
          if (!res) { failed.push(...batch); continue; }
          failed.push(...res.failed);
          at += res.placed.length;
        }
      } else if (plan.mode === "replace") {
        for (let k = 0; k < n; k++) {
          const wish = `use the word "${words[k]}"${plan.answer ? " as the right answer" : ""}`;
          const ok = await remake(plan.id, plan.replace[k] - 1, wish, null, { quiet: true, answer: plan.answer ? words[k] : "" });
          if (!same()) return;
          if (!ok) failed.push(words[k]);
        }
      } else {
        const s = A(plan.id);
        const how = plan.answer || s?.skill === "vocabulary" ? "Each one must be the right answer to a question." : s?.passage || s?.script?.length ? "Put each one in the text, and ask a question whose answer is that word." : "";
        const ok = await host.rewritePart(plan.id, [`Use these words in this part: ${words.join(", ")}.`, how, plan.wish].filter(Boolean).join(" "));
        if (!ok) failed.push(...words);
      }
    } catch (e) {
      if (same()) undo();
      toast(e?.message || "Lingo couldn’t put the words on the test.", "error");
      return;
    } finally {
      stop?.();
    }
    if (!same()) return;
    host.commit();
    // The word check says where each word is now: that, not what Lingo was asked, is what the toast reports.
    const doc = host.doc();
    const extraIds = (plan.extra || []).map((x) => x.id);
    const where = new Set(plan.mode === "new" ? [...newIds, ...extraIds].map((id) => doc.sections.findIndex((s) => s.id === id)).filter((i) => i >= 0) : [plan.part]);
    const newAt = newIds.map((id) => doc.sections.findIndex((s) => s.id === id) + 1);
    const label = plan.mode !== "new" ? `Part ${plan.part + 1}` : [newIds.length > 1 ? `The new parts (${newAt.join(", ")})` : newIds.length ? `New Part ${newAt[0]}` : "", ...extraIds.map((id) => `Part ${doc.sections.findIndex((s) => s.id === id) + 1}`)].filter(Boolean).join(" and ") || "The test";
    const many = where.size > 1;
    const c = new Map(testCoverage(doc).words.map((w) => [w.english.toLowerCase(), w]));
    const tested = [];
    const only = [];
    for (const w of words) {
      if (failed.includes(w)) continue;
      const here = c.get(w.toLowerCase())?.tested.find((t) => where.has(t.part));
      if (here) tested.push(plan.mode === "new" && n > 3 ? `“${w}”` : `“${w}” (${plan.mode === "new" && many ? `Part ${here.part + 1}, ` : ""}question${here.items.length > 1 ? "s" : ""} ${here.items.join(", ")})`);
      else only.push(`“${w}”`);
    }
    const msg = [];
    if (tested.length) msg.push(tested.length > 6 ? `${label} now test${many ? "" : "s"} ${tested.length} of the words.` : `${label} now test${many ? "" : "s"} ${tested.join(", ")}.`);
    if (only.length) msg.push(`${only.slice(0, 8).join(", ")}${only.length > 8 ? ` and ${only.length - 8} more` : ""} ${only.length > 1 ? "are" : "is"} there now, but no question has ${only.length > 1 ? "them" : "it"} as the answer.`);
    if (failed.length) msg.push(`Lingo couldn’t place ${failed.slice(0, 8).map((w) => `“${w}”`).join(", ")}${failed.length > 8 ? ` and ${failed.length - 8} more` : ""} — they stay red in the word check; click one to try again.`);
    const changed = snapshot() !== before || newIds.length > 0;
    toast(msg.join(" ") || "Nothing changed.", failed.length || only.length ? "warn" : "ok", { ms: 10000, actions: changed ? [{ label: "Undo", run: () => { if (undo()) toast("Undone.", "info", { ms: 1600 }); } }] : [] });
  }

  return { decorate, placeWords };
}
