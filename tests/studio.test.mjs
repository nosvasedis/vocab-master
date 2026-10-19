/* Dictation maker, unit test builder, teacher assistant and the shared document model (all pure parts). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { sentenceRange, parseLevel, DICTATION_DEFAULTS, LEVEL_IDS, GRAMMAR_MENU } from "../desktop/renderer/studio/levels.js";
import { unitWords, sectionCounts, buildUnitContext, unitContextPrompt, storyLines } from "../desktop/renderer/studio/unit-context.js";
import { dictationDefaults, maskTargets, bookSentences, buildDictationDoc, dictationPrompt, splitStrips, checkSentences, readAloudLines } from "../desktop/renderer/studio/dictation.js";
import { testDefaults, presetParts, testPrompt, buildTestDoc, estimateMinutes, specPoints, planProblems } from "../desktop/renderer/studio/test-builder.js";
import { makeVersionB, docPoints, answerKeyRows, normalizeItem, tfValue } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack, renderRunningStrips } from "../desktop/renderer/studio/doc-render.js";
import { parseRequest, completePlan, clarifyingQuestions, answerQuestion, mergeAiPlan, needsAi, planSummary } from "../desktop/renderer/studio/assistant.js";
import { TASKS, rubricFor, tfLabels } from "../desktop/renderer/studio/tasks.js";

const loadLesson = async (p) => { try { return JSON.parse(fs.readFileSync(new URL(`../desktop/renderer/lessons/${p}`, import.meta.url), "utf8")); } catch { return null; } };
const unit4 = unitWords("CPP2", 4, ["A"]);

/* ── Levels ───────────────────────────────────────────────────────── */
test("sentence lengths grow with the class and follow the length / difficulty nudges", () => {
  let prev = 0;
  for (const id of LEVEL_IDS) { const [min] = sentenceRange(id); assert.ok(min >= prev); prev = min; }
  const [a] = sentenceRange("C_SENIOR", "short", "easier");
  const [b] = sentenceRange("C_SENIOR");
  const [c] = sentenceRange("C_SENIOR", "long", "harder");
  assert.ok(a < b && b < c);
  for (const id of LEVEL_IDS) assert.ok(GRAMMAR_MENU[id].length >= 8 && DICTATION_DEFAULTS[id]);
});

test("class levels are read from English and Greek requests", () => {
  assert.equal(parseLevel("a test for E class"), "E_SENIOR");
  assert.equal(parseLevel("for my D senior group"), "D_SENIOR");
  assert.equal(parseLevel("τεστ για τη Β τάξη"), "B_SENIOR");
  assert.equal(parseLevel("Γ' τάξη"), "C_SENIOR");
  assert.equal(parseLevel("unit 4 test"), "");
});

/* ── Unit context ─────────────────────────────────────────────────── */
test("a unit's words come grouped by its printed sections, with lessons and stories", async () => {
  const counts = sectionCounts("CPP2", 4);
  assert.ok(counts.BQ > 5 && counts.A > 20 && counts.B > 10 && counts.WB > 10);
  const ctx = await buildUnitContext({ bookId: "CPP2", units: [4] }, { loadLesson });
  assert.equal(ctx.units[0].title, "How does our planet change?");
  assert.ok(ctx.units[0].lessons.length >= 2);
  assert.ok(ctx.units[0].lessons.some((l) => l.story.length));
  const prompt = unitContextPrompt(ctx);
  assert.match(prompt, /Big Question: "How does our planet change\?"/);
  assert.match(prompt, /Workbook words:/);
  assert.ok(prompt.length < 6000, "compact prompt");
  assert.deepEqual(storyLines({ scenes: [] }), []);
});

/* ── Dictation ────────────────────────────────────────────────────── */
test("dictation defaults follow the class level", () => {
  assert.equal(dictationDefaults("A_SENIOR").style, "classic");
  assert.equal(dictationDefaults("A_SENIOR").punctuationAloud, true);
  assert.ok(dictationDefaults("E_SENIOR").textWords > dictationDefaults("A_SENIOR").textWords);
  assert.equal(dictationDefaults("A_SENIOR").greek, true);
  assert.equal(dictationDefaults("E_SENIOR").greek, false);
});

test("gaps take the unit word in the form the sentence uses", () => {
  const m = maskTargets("The snow melts in spring and the rivers flow down.", ["melt", "flow down"], 2);
  assert.deepEqual(m.answers, ["melts", "flow down"]);
  assert.equal(m.gapped, "The snow ________ in spring and the rivers ________.");
  assert.deepEqual(maskTargets("My uncles are tall.", ["uncle"]).answers, ["uncles"]);
  assert.deepEqual(maskTargets("Nothing here.", ["volcano"]).answers, []);
});

test("free book sentences: one per word, in the word's own example, fitting the class", () => {
  const spec = dictationDefaults("B_SENIOR");
  const s = bookSentences(spec, unit4);
  assert.equal(s.length, spec.count);
  for (const x of s) assert.ok(x.targets.length === 1 && x.text.length > 5);
});

test("every dictation style builds a printable doc with a teacher copy", () => {
  const picFor = (w) => `@w-${w.replace(/\s+/g, "-")}`;
  for (const style of ["classic", "gapped", "running", "dictogloss", "picture"]) {
    const spec = { ...dictationDefaults("C_SENIOR"), style };
    const raw = { sentences: bookSentences(spec, unit4) };
    if (style === "running" || style === "dictogloss") raw.text = raw.sentences.map((x) => x.text).join(" ");
    const doc = buildDictationDoc(spec, raw, unit4, { meta: { bookTitle: "Cambridge Primary Paths 2", unit: 4 }, picFor });
    const sec = doc.sections[0];
    assert.equal(sec.style, style);
    assert.ok(readAloudLines(doc).length >= 1);
    const student = renderStudentPaper(doc);
    const teacher = renderTeacherPack(doc);
    assert.match(student, /Part 1/);
    assert.ok(teacher.includes(sec.sentences[0].text.slice(0, 15)) || teacher.includes(sec.text.slice(0, 15)), style);
    if (style === "gapped") { assert.ok(sec.sentences.every((x) => x.answers.length)); assert.match(student, /st-line inline/); assert.ok(!student.includes(sec.sentences[0].answers[0] + " ")); }
    if (style === "picture") { assert.equal(sec.pictures.length, sec.sentences.length); assert.ok(sec.sentences.every((x) => x.letter)); assert.match(student, /class="ws-pic"/); }
    if (style === "running") { assert.ok(sec.strips.length >= 2); assert.match(renderRunningStrips(doc), /st-strip/); }
    if (style === "dictogloss") assert.ok(sec.keyWords.length);
  }
});

test("dictation prompt carries the controls, and bad sentences are reported", () => {
  const spec = { ...dictationDefaults("D_SENIOR"), count: 7, grammar: ["past simple"], topic: "a school trip" };
  const { system, user } = dictationPrompt(spec, unit4.slice(0, 6));
  assert.match(user, /exactly 7 sentences/);
  assert.match(user, new RegExp(`each ${sentenceRange("D_SENIOR").join("–")} words`));
  assert.match(user, /past simple/);
  assert.match(user, /a school trip/);
  assert.match(system, /JSON/);
  const probs = checkSentences(spec, [{ text: "Η χιονισμένη μέρα.", targets: [] }], unit4);
  assert.ok(probs.some((p) => /Greek/.test(p)) && probs.some((p) => /no word from the list/.test(p)) && probs.some((p) => /1 of 7/.test(p)));
  assert.equal(splitStrips("One two three. Four five six. Seven eight nine.", 2).length, 3);
});

/* ── Unit test builder ────────────────────────────────────────────── */
function fakeReply(spec, { tf = null } = {}) {
  const words = ["volcano", "lava", "crust", "plate", "melt", "snowy", "stream"];
  return {
    sections: spec.parts.map((p) => {
      const t = TASKS[p.task];
      const items = Array.from({ length: p.items }, (_, i) => {
        const w = words[i % words.length];
        if (t.answer === "choice") return { prompt: `The ________ is hot ${i}.`, options: [w, "snow", "ice"], answer: w };
        if (t.answer === "tf") return { prompt: `Statement ${i}`, answer: tf ? tf[i % tf.length] : i % 2 ? "no" : "yes" };
        if (t.answer === "match") return { prompt: w, answer: `meaning ${i}` };
        return { prompt: `We saw the ________ (${i}).`, answer: w };
      });
      return { id: p.id, items, example: t.answer === "open" ? undefined : items[0], script: [{ speaker: "Mia", text: "Hello." }, { speaker: "Teacher", text: "Listen and tick the right picture." }], passage: "A short text (1) ________.", bank: ["stream"], prompt: "Write about a volcano.", frame: ["Where?"], sample: "Model.", prompts: ["Q1?"] };
    }),
  };
}

test("length presets and level defaults give sensible parts, points and minutes", () => {
  const quiz = testDefaults("A_SENIOR", "quiz");
  const full = testDefaults("E_SENIOR", "full");
  assert.equal(quiz.parts.length, 4);
  assert.equal(full.parts.length, 10);
  assert.ok(full.parts.some((p) => p.skill === "speaking") && full.parts.some((p) => p.skill === "listening"));
  assert.equal(testDefaults("A_SENIOR").parts.find((p) => p.skill === "vocabulary").task, "V-PIC");
  assert.ok(!presetParts("standard", "A_SENIOR", { pictures: false }).some((p) => TASKS[p.task].needs?.includes("pictures")));
  assert.ok(estimateMinutes(full) > estimateMinutes(quiz));
  assert.equal(specPoints(full), full.parts.reduce((n, p) => n + (TASKS[p.task].answer === "open" ? p.points : p.items), 0));
  assert.deepEqual(planProblems({ ...quiz, source: { kind: "unit" } }, { pictureWords: [], focusWords: [] }).length, 2);
});

test("the test prompt locks the plan: part ids, item counts, balanced T/F orders, picture words", async () => {
  const spec = { ...testDefaults("B_SENIOR", "full"), source: { kind: "unit", bookId: "CPP2", units: [4] }, grammar: ["present simple"] };
  const ctx = await buildUnitContext({ bookId: "CPP2", units: [4] }, { loadLesson });
  const { system, user } = testPrompt(spec, { unitContext: ctx, focusWords: unit4.slice(0, 12), pictureWords: ["volcano", "lava", "river"] });
  for (const p of spec.parts) assert.ok(user.includes(`id "${p.id}"`));
  assert.match(user, /TEST THESE WORDS/);
  assert.match(user, /Grammar focus[^\n]*present simple/);
  assert.match(user, /Answer each with "yes" or "no" in THIS order: (yes|no)(, (yes|no))+/);
  assert.match(user, /Picture words \(ONLY these can be pictures\): volcano, lava, river/);
  assert.match(system, /Cambridge Young Learners/);
  const one = testPrompt(spec, { unitContext: ctx, focusWords: unit4 }, [spec.parts[2].id]);
  assert.match(one.user, /LOCKED TEST PLAN \(1 part\)/);
});

test("the test doc: balanced choices, mixed T/F check, word scope, matching letters, points", () => {
  const spec = { ...testDefaults("C_SENIOR", "full"), source: { kind: "unit" } };
  const focus = ["volcano", "lava", "crust", "plate", "melt", "snowy", "stream"].map((english) => ({ english }));
  const doc = buildTestDoc(spec, fakeReply(spec, { tf: ["T"] }), { levelId: "C_SENIOR", focusWords: focus, meta: { unit: 4, bookTitle: "Cambridge Primary Paths 2" } });
  assert.equal(doc.meta.title, "Unit 4 Test");
  assert.equal(doc.sections.length, spec.parts.length);
  for (const s of doc.sections.filter((x) => x.answerType === "choice")) {
    const pos = s.items.map((it) => it.answerIndex);
    assert.ok(new Set(pos).size >= 2, `${s.task} positions ${pos}`);
  }
  const tfPart = doc.sections.find((s) => s.answerType === "tf");
  assert.ok(tfPart.problems.some((p) => /need a mix of T and F/.test(p)), "all-T key flagged");
  const match = doc.sections.find((s) => s.answerType === "match");
  assert.ok(match.items.every((it) => match.bank.find((b) => b.letter === it.letter)?.text === it.answer));
  const listening = doc.sections.find((s) => s.skill === "listening");
  assert.ok(!listening.script.some((l) => /^Listen/.test(l.text)), "narrator rubric line dropped");
  assert.equal(doc.meta.points, docPoints(doc));
  assert.ok(answerKeyRows(doc.sections[0]).every((r) => r.text));
  // Out-of-scope answers are reported.
  const odd = buildTestDoc(spec, fakeReply(spec), { levelId: "C_SENIOR", focusWords: [{ english: "volcano" }], meta: {} });
  assert.ok(odd.sections.some((s) => s.problems.some((p) => /not one of the tested words/.test(p))));
});

test("rewriting one part keeps every other part as it was", () => {
  const spec = { ...testDefaults("B_SENIOR"), source: { kind: "unit" } };
  const first = buildTestDoc(spec, fakeReply(spec), { levelId: "B_SENIOR", meta: {} });
  const target = spec.parts[1].id;
  const reply = { sections: [{ ...fakeReply(spec).sections[1], items: fakeReply(spec).sections[1].items.map((it) => ({ ...it, prompt: `NEW ${it.prompt}` })) }] };
  const next = buildTestDoc(spec, reply, { levelId: "B_SENIOR", meta: {} }, first);
  assert.equal(next.id, first.id);
  assert.ok(next.sections.find((s) => s.id === target).items[0].prompt.startsWith("NEW"));
  for (const s of next.sections.filter((x) => x.id !== target)) assert.deepEqual(s, first.sections.find((x) => x.id === s.id));
});

test("version B reorders vocabulary and grammar items but keeps listening and reading in order", () => {
  const spec = { ...testDefaults("C_SENIOR", "full"), source: { kind: "unit" } };
  const a = buildTestDoc(spec, fakeReply(spec), { levelId: "C_SENIOR", meta: {} });
  let seed = 7;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const b = makeVersionB(a, rand);
  assert.equal(b.meta.version, "B");
  for (const [sa, sb] of a.sections.map((s, i) => [s, b.sections[i]])) {
    if (sa.skill === "listening" || sa.skill === "reading") assert.deepEqual(sa.items.map((x) => x.prompt), sb.items.map((x) => x.prompt));
    if (sa.answerType === "choice") sb.items.forEach((it) => assert.equal(it.options[it.answerIndex], it.answer));
    assert.equal(sa.points, sb.points);
  }
  const vocab = a.sections.filter((s) => s.skill === "grammar" || s.skill === "vocabulary").map((s) => s.items.map((x) => x.prompt).join("|"));
  const vocabB = b.sections.filter((s) => s.skill === "grammar" || s.skill === "vocabulary").map((s) => s.items.map((x) => x.prompt).join("|"));
  assert.notDeepEqual(vocab, vocabB);
});

test("items are cleaned for their answer type", () => {
  assert.equal(normalizeItem({ prompt: "x", options: ["a1", "b1"], answer: "b" }, "V-MC").item.answerIndex, 1);
  assert.match(normalizeItem({ prompt: "x", options: ["a1", "b1"], answer: "zzz" }, "V-MC").problems[0], /not among the options/);
  assert.equal(normalizeItem({ prompt: "x", answer: "True" }, "R-TF", { levelId: "D_SENIOR" }).item.answer, "T");
  assert.equal(normalizeItem({ prompt: "x", answer: "True" }, "R-TF", { levelId: "A_SENIOR" }).item.answer, "yes");
  assert.equal(tfValue("No."), 1);
  assert.deepEqual(tfLabels("B_SENIOR"), ["yes", "no"]);
  assert.match(rubricFor("R-TF", "E_SENIOR").en, /T \(true\)/);
});

test("papers: Greek rubric on/off, examples, student box, teacher pack totals; Word files build", async () => {
  const spec = { ...testDefaults("B_SENIOR"), source: { kind: "unit" } };
  const doc = buildTestDoc(spec, fakeReply(spec), { levelId: "B_SENIOR", meta: { unit: 4 } });
  const html = renderStudentPaper(doc);
  assert.match(html, /class="ex-help-el" lang="el"/);
  assert.match(html, /st-example/);
  assert.match(html, /Name/);
  assert.ok(!renderStudentPaper({ ...doc, meta: { ...doc.meta, greek: false } }).includes("ex-help-el"));
  const pack = renderTeacherPack(doc);
  assert.match(pack, new RegExp(`Total</td><td>${docPoints(doc)}`));
  assert.match(pack, /Script \(track 1\)/);
  for (const which of ["student", "teacher"]) {
    const blob = await buildStudioDocx({ doc, which });
    assert.ok((await blob.arrayBuffer()).byteLength > 5000);
  }
});

/* ── Assistant ────────────────────────────────────────────────────── */
test("the assistant understands clear requests without AI", () => {
  const ctx = { bookId: "CPP2", unit: 4, level: "B_SENIOR" };
  const a = completePlan(parseRequest("test for Unit 4", ctx), ctx);
  assert.deepEqual([a.kind, a.source.bookId, a.source.units, a.levelId], ["test", "CPP2", [4], "B_SENIOR"]);
  const b = completePlan(parseRequest("A test on Present Simple vs Present Continuous for E class", ctx), ctx);
  assert.deepEqual([b.kind, b.levelId, b.source.kind], ["test", "E_SENIOR", "topic"]);
  assert.deepEqual(b.grammar, ["present simple vs present continuous"]);
  assert.ok(b.skills.filter((s) => s === "grammar").length === 2);
  const c = parseRequest("PP3 units 2-3 listening and reading test, two versions", ctx);
  assert.deepEqual([c.source.bookId, c.source.units, c.skills, c.versions], ["CPP3", [2, 3], ["listening", "reading"], 2]);
  const d = parseRequest("Dictation for this unit, 8 sentences, past simple", ctx);
  assert.deepEqual([d.kind, d.count, d.grammar], ["dictation", 8, ["past simple"]]);
  assert.deepEqual(parseRequest("τεστ για την ενότητα 5", ctx).source.units, [5]);
  assert.equal(parseRequest("running dictation for B senior", ctx).style, "running");
  assert.equal(needsAi("test for Unit 4", parseRequest("test for Unit 4", ctx)), false);
  assert.equal(needsAi("I want something nice for my D class tomorrow", parseRequest("I want something nice for my D class tomorrow", ctx)), true);
  assert.match(planSummary(a), /Unit test for B Senior on Primary Paths 2, Unit 4/);
});

test("the assistant asks at most two questions, answered by chips", () => {
  const ctx = { bookId: "CPP2", unit: 4, level: "" };
  let plan = completePlan({}, { ...ctx, bookId: "", unit: 0 });
  const qs = clarifyingQuestions(plan, {});
  assert.ok(qs.length <= 2 && qs[0].id === "kind");
  plan = completePlan(answerQuestion(plan, "kind", "dictation"), ctx);
  const q2 = clarifyingQuestions(plan, ctx);
  assert.equal(q2[0].id, "source");
  assert.ok(q2[0].options[0].label.includes("Unit 4"));
  plan = completePlan(answerQuestion(plan, "source", q2[0].options[0].value), ctx);
  assert.equal(plan.levelId, "B_SENIOR", "book's level fills in the class");
  assert.equal(clarifyingQuestions(plan, ctx).length, 0);
});

test("AI plan readings are validated before use", () => {
  const p = mergeAiPlan({}, { kind: "test", levelId: "Z_SENIOR", source: { kind: "unit", bookId: "CPP9", units: [3] }, skills: ["listening", "dancing"], versions: 2, count: 99, style: "classic" });
  assert.equal(p.kind, "test");
  assert.equal(p.levelId, undefined);
  assert.equal(p.source, undefined);
  assert.deepEqual(p.skills, ["listening"]);
  assert.equal(p.versions, 2);
  assert.equal(p.count, 15);
});
