/* Dictation maker, unit test builder, teacher assistant and the shared document model (all pure parts). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { sentenceRange, parseLevel, DICTATION_DEFAULTS, LEVEL_IDS, GRAMMAR_MENU } from "../desktop/renderer/studio/levels.js";
import { unitWords, sectionCounts, buildUnitContext, unitContextPrompt, storyLines } from "../desktop/renderer/studio/unit-context.js";
import { dictationDefaults, maskTargets, bookSentences, buildDictationDoc, dictationPrompt, splitStrips, checkSentences, readAloudLines } from "../desktop/renderer/studio/dictation.js";
import { testDefaults, presetParts, makePart, testPrompt, buildTestDoc, keyCheckPrompt, applyKeyCheck, estimateMinutes, specPoints, planProblems, planNotes, taskBlock, taskForSource, fitPartsToSource, defaultTitle } from "../desktop/renderer/studio/test-builder.js";
import { makeVersionB, docPoints, answerKeyRows, normalizeItem, tfValue, normalizeSection, repairOrderItem } from "../desktop/renderer/studio/doc-model.js";
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
  const spec = { ...dictationDefaults("D_SENIOR"), count: 7, grammar: ["Past Simple"], topic: "a school trip" };
  const { system, user } = dictationPrompt(spec, unit4.slice(0, 6));
  assert.match(user, /exactly 7 sentences/);
  assert.match(user, new RegExp(`each ${sentenceRange("D_SENIOR").join("–")} words`));
  assert.match(user, /Past Simple/);
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
  const spec = { ...testDefaults("B_SENIOR", "full"), source: { kind: "unit", bookId: "CPP2", units: [4] }, grammar: ["Present Simple"] };
  const ctx = await buildUnitContext({ bookId: "CPP2", units: [4] }, { loadLesson });
  const { system, user } = testPrompt(spec, { unitContext: ctx, focusWords: unit4.slice(0, 12), pictureWords: ["volcano", "lava", "river"] });
  for (const p of spec.parts) assert.ok(user.includes(`id "${p.id}"`));
  assert.match(user, /TEST THESE WORDS/);
  assert.match(user, /Grammar focus[^\n]*Present Simple/);
  assert.match(user, /Answer each with "yes" or "no" in THIS order: (yes|no)(, (yes|no))+/);
  assert.match(user, /Picture words \(ONLY these can be pictures\): volcano, lava, river/);
  assert.match(system, /Cambridge Young Learners/);
  const one = testPrompt(spec, { unitContext: ctx, focusWords: unit4 }, [spec.parts[2].id]);
  assert.match(one.user, /LOCKED TEST PLAN \(1 part\)/);
  // Real DeepSeek run (2026-10-19) keyed "no" for things the script said: each statement must fit its answer.
  assert.match(user, /a "no" statement changes one detail[^\n]*script clearly says otherwise/);
  // A real E-class grammar test (2026-10-19) repeated four Part 1 sentences in Part 3.
  assert.match(user, /never reuse a sentence or item from another part/);
  assert.match(user, /a "no" statement changes one detail[^\n]*text clearly says otherwise/);
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
  assert.deepEqual(b.grammar, ["Present Simple vs Present Continuous"]);
  assert.ok(b.skills.filter((s) => s === "grammar").length === 2);
  const c = parseRequest("PP3 units 2-3 listening and reading test, two versions", ctx);
  assert.deepEqual([c.source.bookId, c.source.units, c.skills, c.versions], ["CPP3", [2, 3], ["listening", "reading"], 2]);
  const d = parseRequest("Dictation for this unit, 8 sentences, past simple", ctx);
  assert.deepEqual([d.kind, d.count, d.grammar], ["dictation", 8, ["Past Simple"]]);
  assert.deepEqual(parseRequest("τεστ για την ενότητα 5", ctx).source.units, [5]);
  assert.equal(parseRequest("running dictation for B senior", ctx).style, "running");
  assert.equal(needsAi("test for Unit 4", parseRequest("test for Unit 4", ctx)), false);
  assert.equal(needsAi("I want something nice for my D class tomorrow", parseRequest("I want something nice for my D class tomorrow", ctx)), true);
  assert.match(planSummary(a), /Unit test for B Senior on Primary Path 2, Unit 4/);
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

test("grammar names are written the ELT way: Present Simple, Second Conditional", async () => {
  const { grammarLabel } = await import("../desktop/renderer/studio/levels.js");
  assert.equal(grammarLabel("present simple vs present continuous"), "Present Simple vs Present Continuous");
  assert.equal(grammarLabel("past simple versus past continuous"), "Past Simple vs Past Continuous");
  assert.equal(grammarLabel("second conditional"), "Second Conditional");
  assert.equal(grammarLabel("there is / there are"), "There is / there are");
  for (const id of LEVEL_IDS) for (const g of GRAMMAR_MENU[id]) {
    assert.equal(g[0], g[0].toUpperCase(), g);
    assert.ok(!/\b(present|past|future) (simple|continuous|perfect)\b/.test(g), `tense names are capitalised: ${g}`);
  }
});

test("put-in-order jumbles always hold exactly the answer's words", () => {
  // A real DeepSeek reply jumbled "a / earthquake / There / was" for "There was an earthquake."
  const bad = { prompt: "a / earthquake / There / was", answer: "There was an earthquake." };
  assert.equal(repairOrderItem(bad), true);
  assert.deepEqual(bad.prompt.split(" / ").sort(), ["There", "an", "earthquake", "was"].sort());
  assert.notEqual(bad.prompt, "There / was / an / earthquake");
  const good = { prompt: "lava / hot / The / is", answer: "The lava is hot." };
  assert.equal(repairOrderItem(good), false);
  assert.equal(good.prompt, "lava / hot / The / is");
  const s = normalizeSection({ id: "g", task: "G-ORDER", items: 1 }, { items: [{ ...bad, prompt: "a / earthquake / There / was" }], example: { prompt: "is / It / big", answer: "It is big." } });
  assert.ok(s.items[0].prompt.split(" / ").includes("an"));
  assert.equal(s.example.prompt, "is / It / big");
});

test("true/false items carry the AI's evidence; a quote not in the text is flagged", () => {
  const raw = {
    script: [{ speaker: "Anna", text: "The elephants migrate to find water." }, { speaker: "Leo", text: "The old female elephant leads the herd." }],
    items: [
      { prompt: "The elephants migrate to find water.", answer: "no", evidence: "The elephants migrate to find water" },
      { prompt: "A young elephant leads the herd.", answer: "no", evidence: "the old female elephant leads the herd" },
      { prompt: "They swim to the sea.", answer: "yes", evidence: "they swim to the sea" },
    ],
  };
  const s = normalizeSection({ id: "l", task: "L-YN", items: 3 }, raw, { levelId: "B_SENIOR" });
  assert.equal(s.items[0].evidence, "The elephants migrate to find water");
  assert.ok(s.problems.some((p) => /check the answer to item 3 against the script/.test(p)), s.problems.join("; "));
  const spec = { ...testDefaults("B_SENIOR", "full"), source: { kind: "topic" }, topic: "animals" };
  assert.match(testPrompt(spec, {}).user, /"evidence": the exact words of the script/);
});

test("yes/no keys are re-answered from the text: disagreements are corrected and flagged", () => {
  const spec = { ...testDefaults("B_SENIOR", "full"), source: { kind: "unit" } };
  const doc = buildTestDoc(spec, fakeReply(spec), { levelId: "B_SENIOR", meta: {} });
  const tf = doc.sections.filter((s) => s.answerType === "tf");
  assert.ok(tf.length);
  const { system, user } = keyCheckPrompt(doc);
  assert.match(system, /Judge only by the text/);
  for (const s of tf) assert.ok(user.includes(`PART id "${s.id}"`) && user.includes(`1. ${s.items[0].prompt}`));
  assert.equal(keyCheckPrompt(doc, ["nope"]), null);
  const first = tf[0];
  const answers = first.items.map((it) => (it.tf === 0 ? "yes" : "no"));
  answers[1] = first.items[1].tf === 0 ? "no" : "yes";
  assert.equal(applyKeyCheck(doc, { sections: [{ id: first.id, answers }] }), 1);
  assert.equal(first.items[1].answer, answers[1]);
  assert.ok(first.problems.some((p) => /corrected for item 2/.test(p)));
  // A reply of the wrong length changes nothing.
  assert.equal(applyKeyCheck(doc, { sections: [{ id: first.id, answers: ["no"] }] }), 0);
});

test("matching: the example's meaning is in the lettered list, so its letter shows and Word builds", async () => {
  // Real run (2026-10-19): the example had no letter, the paper showed "0 planet" with no answer and Word export crashed.
  const spec = { ...testDefaults("B_SENIOR"), source: { kind: "unit" }, parts: [makePart("vocabulary", "V-MATCH", "B_SENIOR")] };
  const reply = { sections: [{ id: spec.parts[0].id, example: { prompt: "planet", answer: "a big round thing in space" }, items: ["volcano", "earthquake", "migrate", "savanna", "worried"].map((w, i) => ({ prompt: w, answer: `meaning ${i}` })) }] };
  const doc = buildTestDoc(spec, reply, { levelId: "B_SENIOR", meta: { unit: 4 } });
  const s = doc.sections[0];
  assert.equal(s.bank.length, 6);
  assert.equal(s.bank.find((b) => b.letter === s.example.letter)?.text, "a big round thing in space");
  for (const it of s.items) assert.equal(s.bank.find((b) => b.letter === it.letter)?.text, it.answer);
  const b = makeVersionB(doc, Math.random);
  assert.equal(b.sections[0].bank.find((x) => x.letter === b.sections[0].example.letter)?.text, "a big round thing in space");
  for (const which of ["student", "teacher"]) assert.ok((await buildStudioDocx({ doc, which })).size > 1000);
});

test("unit tests only offer the tasks the Step 1 source supports", () => {
  const topic = { kind: "topic", hasUnit: false, pictureWords: 0 };
  const unit = { kind: "unit", hasUnit: true, pictureWords: 12 };
  const ownList = { kind: "words", hasUnit: false, pictureWords: 2 };
  // A grammar point or topic has no word list: no picture tasks, no Big Question.
  for (const id of ["L-PIC", "V-PIC", "W-PICTURES", "S-PICTURE", "S-BQ"]) assert.ok(taskBlock(id, topic), id);
  for (const id of Object.keys(TASKS)) assert.equal(taskBlock(id, unit), "", id);
  assert.match(taskBlock("V-PIC", ownList), /3\+ chosen words with pictures/);
  assert.equal(taskBlock("S-BQ", ownList), "needs a coursebook unit");
  assert.equal(taskForSource("vocabulary", "A_SENIOR", topic), "V-BANK");
  assert.equal(taskForSource("speaking", "A_SENIOR", topic), "S-QUESTIONS");
  assert.equal(taskForSource("vocabulary", "A_SENIOR", unit), "V-PIC");

  const spec = testDefaults("A_SENIOR", "full");
  const ids = spec.parts.map((p) => p.id);
  const changed = fitPartsToSource(spec.parts, "A_SENIOR", topic);
  assert.ok(changed.length >= 3);
  assert.deepEqual(spec.parts.map((p) => p.id), ids, "parts keep their ids and order");
  assert.ok(spec.parts.every((p) => !taskBlock(p.task, topic)));
  const writing = spec.parts.find((p) => p.skill === "writing" && p.task === "W-GUIDED");
  assert.ok(writing.words && writing.points, "an open task keeps its words and points");
  assert.equal(fitPartsToSource(spec.parts, "A_SENIOR", topic).length, 0, "nothing to change twice");
});

test("unit test plan checks follow the source: topic or grammar, words, pictures", () => {
  const base = testDefaults("C_SENIOR", "standard");
  const topicSpec = { ...base, parts: presetParts("standard", "C_SENIOR"), source: { kind: "topic" }, topic: "", grammar: [] };
  assert.match(planProblems(topicSpec).join(" "), /Type the topic, or choose the grammar/);
  assert.equal(planProblems({ ...topicSpec, grammar: ["Past Simple (regular verbs)"] }).length, 0, "grammar alone is enough");
  assert.equal(planProblems({ ...topicSpec, topic: "my town" }).length, 0, "a topic alone is enough");
  const a = { ...testDefaults("A_SENIOR", "standard"), source: { kind: "words" } };
  const words = [{ english: "lava" }, { english: "ash" }];
  assert.match(planProblems(a, { focusWords: words, pictureWords: ["lava"] }).join(" "), /Part \d \(Look and write \(pictures\)\) needs 3\+ chosen words with pictures/);
  assert.match(planProblems({ ...a, parts: [makePart("speaking", "S-BQ", "A_SENIOR")] }, { focusWords: words }).join(" "), /needs a coursebook unit/);
  assert.equal(planProblems({ ...a, parts: [makePart("speaking", "S-BQ", "A_SENIOR")] }, { focusWords: words, hasUnit: true }).length, 0);
  // More one-word answers than chosen words is a note, not a blocker.
  const v = { ...a, parts: [makePart("vocabulary", "V-BANK", "A_SENIOR")] };
  assert.match(planNotes(v, { focusWords: words }).join(" "), /5 questions but only 2 words/);
  assert.deepEqual(planNotes({ ...v, source: { kind: "topic" } }, { focusWords: words }), []);
  assert.equal(defaultTitle({ kind: "unit", units: [4] }), "Unit 4 Test");
  assert.equal(defaultTitle({ kind: "unit", units: [3, 4] }), "Units 3, 4 Test");
  assert.equal(defaultTitle({ kind: "topic" }), "");
});

test("the test prompt's grammar and topic lines fit the source", async () => {
  const spec = { ...testDefaults("B_SENIOR", "quiz"), source: { kind: "unit" } };
  const ctx = await buildUnitContext({ bookId: "CPP2", units: [4] }, { loadLesson });
  assert.match(testPrompt(spec, { unitContext: ctx, focusWords: unit4 }).user, /Grammar: the grammar the unit's example sentences show/);
  // A word list with no coursebook unit has no example sentences to lean on.
  const own = testPrompt({ ...spec, source: { kind: "words" }, topic: "a day at the zoo" }, { focusWords: unit4 }).user;
  assert.match(own, /Grammar: what this class already knows/);
  assert.match(own, /The texts and scripts are about: a day at the zoo/);
  assert.doesNotMatch(own, /other words of the unit/);
  // A topic test with only grammar chosen.
  const g = testPrompt({ ...spec, source: { kind: "topic" }, topic: "", grammar: ["Present Continuous"] }, {}).user;
  assert.match(g, /Topic: everyday situations/);
  assert.match(g, /Grammar focus[^\n]*Present Continuous/);
  assert.doesNotMatch(g, /UNIT CONTEXT|TEST THESE WORDS/);
  const t = testPrompt({ ...spec, source: { kind: "topic" }, topic: "my town", grammar: [] }, {}).user;
  assert.match(t, /Topic: my town/);
  assert.doesNotMatch(t, /Context the teacher wants/);
});
