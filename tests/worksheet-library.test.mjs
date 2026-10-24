/* Worksheets Step 3 as a library like the Test Maker's: every D/L exercise has a card (kind, class fit, preview), the
 * class profiles follow the fit ranges, and each exercise's own settings (lines, difficulty, word box, wish) reach the
 * prompt, the word boxes and the checks. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_PROFILES, EXERCISE_LABELS, EXERCISE_FAMILIES, pickGenerationPlan, buildSystemPrompt, validateWorksheet, normalizeWorksheetExercises,
  configureAi, generateWorksheets, regenerateLingoPracticeOnly,
} from "../desktop/renderer/app.js";
import {
  WS_TASKS, WS_KINDS, wsTaskFit, wsTasksFor, wsAllowed, wsBlock, planEntries, withEntries, settingsAt, itemsAt, cleanSettings, exerciseSettingsBlock,
} from "../desktop/renderer/studio/worksheet-tasks.js";

const LEVELS = ["A_SENIOR", "B_SENIOR", "C_SENIOR", "D_SENIOR", "E_SENIOR"];

test("every worksheet exercise has a library card, and every card is a real exercise", () => {
  assert.deepEqual(Object.keys(WS_TASKS).sort(), Object.keys(EXERCISE_LABELS).sort());
  for (const [id, t] of Object.entries(WS_TASKS)) {
    assert.equal(t.sheet, id.startsWith("D") ? "dictation" : "lingo", id);
    assert.ok(WS_KINDS[t.kind], `${id} kind`);
    assert.ok(Array.isArray(t.fit) && t.fit[0] <= t.fit[1] && t.fit[0] >= 0 && t.fit[1] <= 4, `${id} fit`);
    assert.ok(t.blurb.length > 40 && t.sample && t.trains?.length, `${id} card`);
    assert.equal(EXERCISE_FAMILIES[id], t.kind, `${id} kind is the engine's kind`);
  }
});

test("kinds say what the children do: writing the word is recall, writing your own sentence is create", () => {
  for (const id of ["D25", "D19", "D08", "D28", "D26", "D27", "L01", "L08", "L12"]) assert.equal(WS_TASKS[id].kind, "recall", id);
  for (const id of ["D03", "D13", "D15", "D11", "L02", "L11", "L13"]) assert.equal(WS_TASKS[id].kind, "recognise", id);
  for (const id of ["D29", "L10"]) assert.equal(WS_TASKS[id].kind, "create", id);
});

test("class fit follows the Cambridge levels (and the Test Maker's matching tasks)", () => {
  const great = (id, lv) => wsTaskFit(id, lv).fit === "great";
  assert.ok(great("L08", "A_SENIOR"), "word order is a Starters/Movers task");
  assert.ok(!great("D17", "A_SENIOR") && !great("D17", "B_SENIOR") && great("D17", "C_SENIOR"), "collocations from C (V-COLLOC)");
  assert.ok(!great("D06", "A_SENIOR") && great("D06", "B_SENIOR"), "synonyms after opposites");
  assert.ok(great("D11", "A_SENIOR") && !great("D11", "E_SENIOR"), "odd one out A–D (V-ODD)");
  assert.ok(!great("D23", "C_SENIOR") && great("D23", "D_SENIOR"), "analogies from about 12");
  assert.ok(!great("D25", "D_SENIOR") && great("D25", "A_SENIOR"), "look and write is for young classes");
  assert.equal(wsTaskFit("D18", "B_SENIOR").fit, "stretch");
  assert.equal(wsTaskFit("D26", "E_SENIOR").fit, "easy");
  assert.match(wsTaskFit("D23", "B_SENIOR").label, /A stretch · usually D–E Senior/);
  assert.deepEqual(wsTasksFor("dictation", "A_SENIOR").slice(0, 3).map((t) => wsTaskFit(t.id, "A_SENIOR").fit), ["great", "great", "great"]);
});

test("the class profiles' exercises are exactly the library's 'great for' ones, and their seed mixes fit", () => {
  LEVELS.forEach((lv, i) => {
    const p = CLASS_PROFILES[lv];
    assert.deepEqual(p.allowDictation, wsAllowed("dictation", i), lv);
    assert.deepEqual(p.allowLingo, wsAllowed("lingo", i), lv);
    for (const combo of p.seedCombos) for (const id of combo) assert.ok(p.allowDictation.includes(id), `${lv} seed ${id}`);
    for (const combo of p.seedLingo) for (const id of combo) assert.ok(p.allowLingo.includes(id), `${lv} seed ${id}`);
    assert.ok(p.allowDefinitionsInDictation !== false, `${lv}: D01 (definitions) is a class exercise, so definitions can't be forbidden`);
  });
});

test("Lingo's mix: only exercises made for the class, something to recognise and something to recall", () => {
  const features = { hasSynonyms: true, hasAntonyms: true, hasDerivatives: true, pictureWords: ["a", "b", "c"], hasPictures: true };
  for (const lv of LEVELS) {
    for (let k = 0; k < 25; k++) {
      const plan = pickGenerationPlan(lv, { forceRandom: true, vocabFeatures: features });
      for (const id of plan.dictationTypes) assert.equal(wsTaskFit(id, lv).fit, "great", `${lv} ${id}`);
      for (const id of plan.lingoTypes) assert.equal(wsTaskFit(id, lv).fit, "great", `${lv} ${id}`);
      const kinds = new Set(plan.dictationTypes.map((id) => WS_TASKS[id].kind));
      assert.ok(kinds.has("recognise") && kinds.has("recall"), `${lv}: ${plan.dictationTypes}`);
    }
  }
});

test("a hand-picked exercise for another class is kept (the badge says so), one the word list can't support is not", () => {
  const plan = pickGenerationPlan("A_SENIOR", { exerciseMode: "custom", customDictationTypes: ["D23", "D03", "D06"], customLingoTypes: ["L13"], vocabFeatures: { hasSynonyms: false } });
  assert.deepEqual(plan.dictationTypes, ["D23", "D03"]);
  assert.deepEqual(plan.lingoTypes, ["L13"]);
  assert.match(wsBlock("D06", { hasSynonyms: false }), /synonyms/);
  assert.equal(wsBlock("D06", { hasSynonyms: true }), "");
  assert.match(wsBlock("D25", { pictureWords: ["a"] }), /pictures/);
});

test("each exercise's settings: rows in, plan out, in step with the types", () => {
  let plan = { dictationTypes: ["D01", "D03"], lingoTypes: ["L01"], dictationExerciseCount: 2, lingoPracticeCount: 1, tune: { extras: 1 } };
  assert.deepEqual(planEntries(plan, "dictation"), [{ type: "D01" }, { type: "D03" }]);
  plan = withEntries(plan, "dictation", [{ type: "D03", level: 5, note: " a school trip " }, { type: "D01", items: 7, extras: 0 }, { type: "D29", level: 3, items: 99 }]);
  assert.deepEqual(plan.dictationTypes, ["D03", "D01", "D29"]);
  assert.equal(plan.dictationExerciseCount, 3);
  assert.equal(plan.exerciseMode, "custom");
  assert.equal(plan.signature, "D03+D01+D29|L01");
  assert.deepEqual(plan.tune, { extras: 1 }, "the fine-tuning stays");
  assert.deepEqual(settingsAt(plan, "dictation", 0), { level: 5, note: "a school trip" });
  assert.deepEqual(settingsAt(plan, "dictation", 1), { items: 7, extras: 0 });
  assert.deepEqual(settingsAt(plan, "dictation", 2), {}, "level 3 is the class level; 99 lines is out of range");
  assert.equal(itemsAt(plan, "dictation", 1, 5), 7);
  assert.equal(itemsAt(plan, "dictation", 0, 5), 5);
  assert.deepEqual(cleanSettings({ extras: "" }), {});
  const plain = withEntries(plan, "dictation", [{ type: "D03" }]);
  assert.equal(plain.settings, undefined, "no settings left: none stored");
});

test("the prompt carries each exercise's settings; lines and answer orders follow them", () => {
  const plan = withEntries(withEntries({}, "dictation", [{ type: "D01", items: 7, extras: 2 }, { type: "D15", items: 8, level: 1 }]), "lingo", [{ type: "L02", note: "about pets" }]);
  const block = exerciseSettingsBlock(plan, EXERCISE_LABELS);
  assert.match(block, /Dictation exercise 1 \(D01 Definition \+ word bank\): EXACTLY 7 items; its word box = the answers \+ EXACTLY 2 extra words/);
  assert.match(block, /Dictation exercise 2 \(D15 True \/ false\): EXACTLY 8 items; difficulty EASIER/);
  assert.match(block, /Lingo exercise 1 \(L02 Circle best word\): the teacher's wish: “about pets”/);
  const sys = buildSystemPrompt("B_SENIOR", plan);
  assert.ok(sys.includes(block.trim()));
  assert.equal(exerciseSettingsBlock({ dictationTypes: ["D01"], lingoTypes: ["L01"] }), "");
});

test("every exercise has a format rule for the AI", () => {
  const sys = buildSystemPrompt("E_SENIOR", { dictationTypes: ["D01"], lingoTypes: ["L01"], dictationExerciseCount: 1, lingoPracticeCount: 1 });
  for (const id of Object.keys(WS_TASKS)) assert.match(sys, new RegExp(`(- |[0-9]/)${id}[ /]`), `${id} has no format rule`);
});

const sheet = (plan) => ({
  meta: { classProfile: "B_SENIOR", layout: {} },
  generationPlan: plan,
  lingoLauncher: {
    vocabulary: ["planet", "savanna", "nectar", "climate", "plant", "south"].map((english) => ({ english })),
    practice: [{ number: 1, typeId: "L01", instruction: "", wordList: ["planet", "savanna"], items: [{ number: 1, prompt: "a ________ b", answer: "planet" }, { number: 2, prompt: "c ________", answer: "savanna" }] }],
  },
  dictation: { exercises: [{ number: 1, typeId: "D01", wordBank: ["nectar", "plants", "climate"], items: [{ number: 1, prompt: "sweet juice ________", answer: "nectar" }, { number: 2, prompt: "they grow ________", answer: "plants" }, { number: 3, prompt: "the weather ________", answer: "climate" }] }] },
});

test("an exercise's own word box wins over the worksheet's", () => {
  const plan = withEntries(withEntries({ tune: { extras: 1 } }, "dictation", [{ type: "D01", extras: 0 }]), "lingo", [{ type: "L01", extras: 2 }]);
  const d = normalizeWorksheetExercises(sheet(plan));
  assert.equal(d.dictation.exercises[0].wordBank.length, 3, "D01: one per gap, as set on the exercise");
  assert.equal(d.lingoLauncher.practice[0].wordList.length, 4, "L01: the answers + 2");
});

test("an exercise with its own number of lines is measured against it", () => {
  const plan = withEntries({}, "dictation", [{ type: "D01", items: 3 }]);
  const data = sheet(plan);
  data.dictation.exercises[0].items = Array.from({ length: 6 }, (_, i) => ({ number: i + 1, prompt: `line ${i} ________`, answer: ["nectar", "plants", "climate", "planet", "savanna", "south"][i] }));
  assert.ok(validateWorksheet(data).notes.some((n) => /Dictation 1 has 6 lines — you chose 3/.test(n)));
});

test("generation sends each exercise's settings; a Lingo-only rewrite keeps the Dictation's and takes the new Lingo ones", async (t) => {
  const calls = [];
  configureAi({ provider: "chatgpt", chatgpt: async (req) => { calls.push(JSON.stringify(req)); throw new Error("stop here"); } });
  t.after(() => configureAi({ provider: "deepseek" }));
  const form = { classProfile: "C_SENIOR", inputMode: "freeform", freeform: "Sports and the Olympic Games", vocabRows: [], teacherHints: [] };
  const plan = withEntries(withEntries({}, "dictation", [{ type: "D23", items: 4, note: "about the Olympics" }, { type: "D03" }]), "lingo", [{ type: "L01" }]);
  await generateWorksheets(form, "key", { plan }).catch(() => {});
  assert.match(calls[0], /D23 Analogy\): EXACTLY 4 items; the teacher's wish: “about the Olympics”/);
  assert.match(calls[0], /items per exercise, in order: 4, 5/);

  calls.length = 0;
  const existing = {
    meta: { classProfile: "C_SENIOR", freeformKey: "sports and the olympic games" },
    generationPlan: plan,
    lingoLauncher: { vocabulary: [{ number: 1, english: "medal", type: "n.", greek: "μετάλλιο", emojis: "", collocation: "", derivatives: [], synonyms: [], antonyms: [] }], practice: [] },
    dictation: { exercises: [{ number: 1, typeId: "D23", items: [] }, { number: 2, typeId: "D03", items: [] }] },
  };
  const next = withEntries(plan, "lingo", [{ type: "L08", level: 4 }]);
  await regenerateLingoPracticeOnly(form, "key", existing, { plan: next }).catch(() => {});
  assert.match(calls[0], /Dictation exercise 1 \(D23 Analogy\): EXACTLY 4 items/);
  assert.match(calls[0], /Lingo exercise 1 \(L08 Sentence order\): difficulty A BIT HARDER/);
});
