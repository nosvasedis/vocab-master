/* Test Maker: the eight exercises added after the research round (docs/research/exercise-design.md → "Eight more"):
 * a conversation and missing sentences (lettered lists with extra sentences), read and tick the picture, is the word
 * used correctly, find the wrong word, put the words in groups, use the word in a sentence, and Greek → English. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { TASKS, partOpts } from "../desktop/renderer/studio/tasks.js";
import { normalizeSection, answerKeyRows, makeVersionB, sortRows } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { makePart, testDefaults, testPrompt, buildTestDoc, reviseSection, keyCheckPrompt, applyKeyCheck, greekLookup, problemTargets } from "../desktop/renderer/studio/test-builder.js";
import { testCoverage } from "../desktop/renderer/studio/test-coverage.js";
import { testPartColumns } from "../desktop/renderer/studio/item-columns.js";

const NEW = ["R-CONV", "R-SENT", "V-PICREAD", "V-RIGHT", "V-FIX", "V-SORT", "V-USE", "V-GREEK"];
const part = (task, raw, { level = "C_SENIOR", opts = {}, ...ctx } = {}) => normalizeSection({ ...makePart(TASKS[task].skill, task, level), id: "p1", items: raw.items.length, opts }, raw, { levelId: level, ...ctx });
const doc = (...sections) => ({ meta: { title: "T", classProfile: "C_SENIOR" }, focusWords: [], sections });

test("the new exercises are in the library with their settings", () => {
  for (const id of NEW) assert.ok(TASKS[id], id);
  assert.deepEqual(partOpts({ task: "R-CONV" }, "B_SENIOR"), { spare: 2 });
  assert.equal(partOpts({ task: "V-FIX" }, "C_SENIOR").hint, "none", "the wrong word is help enough");
  assert.equal(makePart("vocabulary", "V-USE", "C_SENIOR").pointsEach, 2, "own sentences are worth two points");
});

test("complete the conversation: replies lettered with the extra ones, the replier's name off the replies", () => {
  const s = part("R-CONV", {
    replier: "Ben",
    example: { prompt: "Mum: Hi Ben! Where are you going?", answer: "Ben: To the park with Leo." },
    items: [{ prompt: "Mum: Have you got your coat?", answer: "Yes, it's in my bag." }, { prompt: "Mum: When will you be back?", answer: "Before dinner, I promise." }],
    extras: ["I don't like apples.", "Yes, it's in my bag.", "At the station."],
  }, { opts: { spare: 2 } });
  assert.equal(s.example.answer, "To the park with Leo.");
  assert.deepEqual(s.extras, ["I don't like apples.", "At the station."], "an extra that is an answer is not an extra");
  assert.equal(s.bank.length, 5);
  assert.deepEqual(s.problems, []);
  const html = renderStudentPaper(doc(s));
  assert.ok(html.includes('<b>Ben:</b><span class="st-order-box"></span>'), "a box for the letter after the replier");
  assert.ok(html.includes("At the station."));
  assert.equal(testPartColumns({ ...s, items: Array(12).fill(s.items[0]) }), false, "a conversation never goes into columns");
  // Too few extra sentences: the part is written again (no item to fix).
  const short = part("R-CONV", { replier: "Ben", items: [{ prompt: "Mum: Hi.", answer: "Hi Mum." }], extras: [] }, { opts: { spare: 2 } });
  assert.match(short.problems.join(), /needs 2 extra sentences/);
  assert.equal(problemTargets(short).whole, true);
  // Version B shuffles the list; the extras stay in it.
  const b = makeVersionB(doc(s)).sections[0];
  assert.equal(b.bank.length, 5);
  assert.ok(b.items.every((it) => b.bank.find((x) => x.letter === it.letter)?.text === it.answer));
});

test("missing sentences: every gap must be in the text; the key gives letters", () => {
  const raw = {
    passage: "Bees live together. (0) ________ The queen lays the eggs. (1) ________ They fly from flower to flower. (2) ________",
    example: { prompt: "(0)", answer: "Each hive has one queen." },
    items: [{ prompt: "(1)", answer: "The other bees look for food." }, { prompt: "(2)", answer: "Then they bring it back to the hive." }],
    extras: ["Bees cannot see red.", "Spiders have eight legs.", "My cat sleeps a lot."],
  };
  const s = part("R-SENT", raw, { level: "E_SENIOR", opts: { spare: 3 } });
  assert.deepEqual(s.problems, []);
  assert.equal(s.bank.length, 6);
  assert.match(answerKeyRows(s)[0].text, /^[a-f] — The other bees/);
  const broken = part("R-SENT", { ...raw, passage: "Bees live together. (1) ________" }, { level: "E_SENIOR", opts: { spare: 3 } });
  assert.ok(broken.problems.some((p) => /missing the gap \(2\)/.test(p)));
  assert.equal(problemTargets(broken).whole, true);
});

test("read and tick the picture: three pictures, and a part problem when an option has none", () => {
  const pics = { apple: "@w-apple", banana: "@w-banana", grapes: "@w-grapes" };
  const picFor = (w) => pics[String(w).toLowerCase()] || "";
  const s = part("V-PICREAD", { items: [{ prompt: "It is yellow and monkeys love it.", options: ["apple", "banana", "grapes"], answer: "banana" }, { prompt: "It is red.", options: ["apple", "car", "grapes"], answer: "apple" }] }, { level: "A_SENIOR", picFor });
  assert.equal(s.items[0].optionPics.length, 3);
  assert.match(s.problems.join(), /item 2: every option must be a word from the picture list/);
});

test("is the word used correctly: yes/no or T/F by class, and the key is checked again by a second reader", () => {
  const raw = { items: [{ prompt: "I keep the milk in the FRIDGE.", answer: "yes" }, { prompt: "I wear a FRIDGE on my head.", answer: "yes" }, { prompt: "A CAMEL can walk in the desert.", answer: "yes" }, { prompt: "We SWIM in the sky.", answer: "no" }] };
  const s = part("V-RIGHT", raw, { level: "D_SENIOR" });
  assert.match(s.rubric, /Write T \(correct\) or F \(wrong\)/);
  assert.equal(part("V-RIGHT", raw, { level: "A_SENIOR" }).rubric, "Is the word in CAPITALS used correctly? Write yes or no.");
  const d = doc(s);
  const p = keyCheckPrompt(d);
  assert.match(p.user, /USAGE\nSENTENCES:\n1\. I keep the milk/);
  assert.match(p.system, /word in CAPITALS is used with a meaning that makes sense/);
  assert.equal(applyKeyCheck(d, { sections: [{ id: "p1", answers: ["yes", "no", "yes", "no"] }] }), 1);
  assert.equal(s.items[1].answer, "F");
  assert.match(s.problems.at(-1), /please check the sentences/);
});

test("find the wrong word: one word in brackets, never the answer itself; letter help when asked", () => {
  const s = part("V-FIX", { items: [{ prompt: "Bees make honey in their [nest].", answer: "hive" }, { prompt: "Camels live in the [desert].", answer: "desert" }, { prompt: "A bee can [sting] you.", answer: "stings" }, { prompt: "No brackets here.", answer: "seed" }] }, { opts: { hint: "first" } });
  assert.deepEqual(s.problems, [
    'item 2: the word in brackets ("desert") is already the right word — it must be a wrong word the answer replaces',
    'item 3: the word in brackets ("sting") is already the right word — it must be a wrong word the answer replaces',
    "item 4: the sentence needs exactly one wrong word in [brackets]",
  ]);
  assert.equal(s.items[0].hint, "h _ _ _");
  assert.ok(renderStudentPaper(doc(s)).includes("st-cells"));
});

test("put the words in groups: a column per group, the same lines in each, the example written in and crossed out", () => {
  const s = part("V-SORT", {
    groups: ["Animals", "Homes", "Food"],
    example: { prompt: "camel", answer: "animals" },
    items: [{ prompt: "bee", answer: "Animals" }, { prompt: "hive", answer: "Homes" }, { prompt: "nest", answer: "Homes" }, { prompt: "ant", answer: "Animals" }, { prompt: "worm", answer: "Animals" }],
  }, { level: "B_SENIOR" });
  assert.deepEqual(s.groups, ["Animals", "Homes"], "an empty group is dropped");
  assert.equal(s.example.answer, "Animals", "answers are written as their group");
  assert.deepEqual([...s.bank].sort(), ["ant", "bee", "camel", "hive", "nest", "worm"]);
  assert.equal(sortRows(s), 4, "as many lines as the biggest group (with the example)");
  assert.deepEqual(s.problems, []);
  const html = renderStudentPaper(doc(s));
  assert.ok(html.includes("<s>camel</s>") && html.includes('<span class="st-ex-ans">camel</span>'));
  assert.equal((html.match(/<th>/g) || []).length, 2);
  assert.ok(!html.includes('class="word-bank"'), "not the editable word box");
  assert.deepEqual(answerKeyRows(s), [{ n: "Animals", text: "bee, ant, worm" }, { n: "Homes", text: "hive, nest" }]);
  assert.ok(renderTeacherPack(doc(s)).includes("bee, ant, worm"));
  const one = part("V-SORT", { groups: ["Animals"], items: [{ prompt: "bee", answer: "Animals" }, { prompt: "bee", answer: "Animals" }] }, { level: "B_SENIOR" });
  assert.match(one.problems.join(" | "), /2 or 3 groups.*every word once/);
});

test("use the word in a sentence: a whole line each, a model in the key, 2 points each", () => {
  const s = part("V-USE", { example: { prompt: "BRAVE — a person you know", answer: "My sister is brave because she isn't afraid of dogs." }, items: [{ prompt: "NOISY — your street", answer: "My street is noisy because there are many cars." }, { prompt: "CAMEL — the desert", answer: "It is hot there." }] }, { opts: {} });
  assert.equal(s.points, 4);
  assert.match(s.problems.join(), /item 2: the model sentence doesn't use "camel"/);
  const html = renderStudentPaper(doc(s));
  assert.ok(html.includes('<b>NOISY — your street</b><span class="st-line full">'));
  const pack = renderTeacherPack(doc(s));
  assert.ok(pack.includes("e.g. My street is noisy") && pack.includes("2 points each"));
});

test("Greek → English: the Greek comes from the word list, never from the writer", () => {
  const words = [{ english: "hive", greek: "κυψέλη" }, { english: "city", greek: "πόλη" }, { english: "to grow", greek: "μεγαλώνω" }];
  const greekFor = greekLookup(words);
  assert.equal(greekFor("cities"), "πόλη");
  assert.equal(greekFor("grow"), "μεγαλώνω");
  const s = part("V-GREEK", { items: [{ prompt: "", answer: "hive" }, { prompt: "a place with many buildings", answer: "city" }, { prompt: "", answer: "rocket" }, { prompt: "μελισσοκομείο", answer: "hive" }] }, { greekFor, opts: { hint: "count" } });
  assert.deepEqual(s.items.map((it) => it.prompt), ["κυψέλη", "πόλη", "", "μελισσοκομείο"]);
  assert.deepEqual(s.problems, ['item 3: "rocket" has no Greek meaning in the word list — use a tested word that has one']);
});

test("a whole test with the new parts: prompt, doc, word check, Word file", async () => {
  const levelId = "C_SENIOR";
  const parts = NEW.filter((t) => t !== "V-PICREAD").map((t, i) => ({ ...makePart(TASKS[t].skill, t, levelId), id: `n${i}` }));
  const spec = { ...testDefaults(levelId), parts, source: { kind: "unit" } };
  const focusWords = [{ english: "hive", greek: "κυψέλη" }, { english: "camel", greek: "καμήλα" }, { english: "bee", greek: "μέλισσα" }];
  const { system, user } = testPrompt(spec, { focusWords });
  assert.match(system, /"replier": "", "extras": \[\], "groups": \[\]/);
  assert.match(user, /SPARE: "extras" = EXACTLY 2 extra sentences/);
  assert.match(user, /the tested words are the PROMPTS/);
  const reply = { sections: [
    { id: "n0", replier: "Ben", example: { prompt: "Mum: Hi!", answer: "Hi Mum!" }, items: [{ prompt: "Mum: Is the hive big?", answer: "Yes, it has many bees." }], extras: ["No, thanks.", "At six."] },
    { id: "n1", passage: "(0) ________ (1) ________", example: { prompt: "(0)", answer: "A." }, items: [{ prompt: "(1)", answer: "A camel can walk far." }], extras: ["B.", "C."] },
    { id: "n2", items: [{ prompt: "A BEE makes honey.", answer: "T" }] },
    { id: "n3", items: [{ prompt: "Bees live in a [nest].", answer: "hive" }] },
    { id: "n4", groups: ["Animals", "Homes"], example: { prompt: "camel", answer: "Animals" }, items: [{ prompt: "bee", answer: "Animals" }, { prompt: "hive", answer: "Homes" }] },
    { id: "n5", items: [{ prompt: "CAMEL — the desert", answer: "A camel can walk in the desert." }] },
    { id: "n6", items: [{ prompt: "", answer: "camel" }] },
  ] };
  const d = buildTestDoc(spec, reply, { levelId, focusWords });
  assert.equal(d.sections.find((s) => s.id === "n6").items[0].prompt, "καμήλα");
  const cov = testCoverage(d);
  assert.equal(cov.tested, 3, "every word counts as tested");
  // A teacher edit keeps the replier, the extras and the groups.
  reviseSection(d, spec, "n0", (raw) => { raw.items[0].answer = "Yes, very big."; }, { focusWords });
  const conv = d.sections.find((s) => s.id === "n0");
  assert.equal(conv.replier, "Ben");
  assert.deepEqual(conv.extras, ["No, thanks.", "At six."]);
  reviseSection(d, spec, "n4", (raw) => { raw.items[0].prompt = "ant"; }, { focusWords });
  assert.deepEqual(d.sections.find((s) => s.id === "n4").groups, ["Animals", "Homes"]);
  const student = renderStudentPaper(d);
  assert.ok(student.includes("st-sort") && student.includes("Ben:"));
  for (const which of ["student", "teacher"]) assert.ok((await buildStudioDocx({ doc: d, which })).size > 2000, which);
});

test("worksheets: Own sentence (D29) for B–E Senior, a writing line on paper and in Word, no false alarms", async () => {
  const { CLASS_PROFILES, EXERCISE_LABELS, EXERCISE_FAMILIES, renderDictation, buildDictationDocx, validateWorksheet, buildSystemPrompt } = await import("../desktop/renderer/app.js");
  assert.equal(EXERCISE_LABELS.D29, "Own sentence");
  assert.equal(EXERCISE_FAMILIES.D29, "productive");
  assert.ok(!CLASS_PROFILES.A_SENIOR.allowDictation.includes("D29"));
  for (const p of ["B_SENIOR", "C_SENIOR", "D_SENIOR", "E_SENIOR"]) assert.ok(CLASS_PROFILES[p].allowDictation.includes("D29"), p);
  const words = ["track", "stadium"];
  const data = {
    meta: { classProfile: "C_SENIOR", bookTitle: "Cambridge Primary Paths 2", unit: 4 },
    lingoLauncher: { vocabulary: words.map((english, i) => ({ number: i + 1, english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: [], synonyms: [], antonyms: [] })), practice: [] },
    dictation: { exercises: [{ number: 1, typeId: "D29", instruction: "", wordBank: [], items: [
      { number: 1, prompt: "TRACK — your school", answer: "Our school has a track where we run every Friday.", testsWords: ["track"] },
      { number: 2, prompt: "STADIUM — a match you saw", answer: "We watched a football match in a big stadium.", testsWords: ["stadium"] },
    ] }] },
  };
  const html = renderDictation(data);
  assert.ok(html.includes('<strong>TRACK — your school</strong><span class="own-line"></span>'));
  assert.ok(!html.replace(/data-answer="[^"]*"/g, "").includes("Our school has a track"), "the model is only in the key");
  const v = validateWorksheet(data);
  assert.deepEqual(v.issues.filter((x) => /Dictation (ex )?1/.test(x)), []);
  assert.ok(v.coverage.dictation.ok, "both words count as tested");
  assert.ok((await buildDictationDocx(data)).size > 2000);
  assert.match(buildSystemPrompt("C_SENIOR", { dictationTypes: ["D29"], lingoTypes: ["L01"], dictationExerciseCount: 1, lingoPracticeCount: 1 }), /D29 Own sentence: NO wordBank/);
});
