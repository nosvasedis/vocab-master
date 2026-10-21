/* Step 3 fine-tuning of the worksheet (Lingo Launcher + Dictation sheet): it changes only what the teacher
 * nudged, rides on the plan, reaches the AI prompt and the checks, and never reshuffles the exercise mix. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  configureAi, generateWorksheets, regenerateDictationOnly, pickGenerationPlan, validateWorksheet,
  normalizeTune, isDefaultTune, tunedProfile, buildTuneBlock, CLASS_PROFILES, fitTunedWordBank,
} from "../desktop/renderer/app.js";
import { parseRequest, completePlan, clarifyingQuestions, answerQuestion, needsAi } from "../desktop/renderer/studio/assistant.js";

test("normalizeTune keeps sane values and drops nonsense", () => {
  assert.deepEqual(normalizeTune(null), { items: 0, length: "class", level: "class", extras: 0 });
  assert.deepEqual(normalizeTune({ items: 7, length: "longer", level: "harder", extras: 2 }), { items: 7, length: "longer", level: "harder", extras: 2 });
  assert.deepEqual(normalizeTune({ items: 99, length: "huge", level: "??", extras: -3 }), { items: 0, length: "class", level: "class", extras: 0 });
  assert.equal(isDefaultTune({}), true);
  assert.equal(isDefaultTune({ extras: 1 }), false);
});

test("tunedProfile changes items, sentence length and word banks; defaults leave the class profile alone", () => {
  const base = CLASS_PROFILES.B_SENIOR;
  const same = tunedProfile("B_SENIOR", null);
  assert.equal(same.itemsPerExercise, base.itemsPerExercise);
  assert.equal(same.maxSentenceWords, base.maxSentenceWords);
  const t = tunedProfile("B_SENIOR", { items: 8, length: "shorter", extras: 2 });
  assert.equal(t.itemsPerExercise, 8);
  assert.equal(t.maxSentenceWords, base.maxSentenceWords - 2);
  assert.equal(t.wordBankSize, base.wordBankSize + 2);
  assert.ok(tunedProfile("A_SENIOR", { length: "shorter" }).maxSentenceWords >= 5, "never below 5 words");
  assert.equal(CLASS_PROFILES.B_SENIOR.itemsPerExercise, base.itemsPerExercise, "the shared profile is not mutated");
});

test("the tune block is empty on defaults and names every nudge otherwise", () => {
  assert.equal(buildTuneBlock("C_SENIOR", null), "");
  const block = buildTuneBlock("C_SENIOR", { items: 4, length: "longer", level: "easier", extras: 1 });
  assert.match(block, /TEACHER FINE-TUNING/);
  assert.match(block, /~4/);
  assert.match(block, /LONGER/);
  assert.match(block, /SLIGHTLY EASIER/);
  assert.match(block, /1 extra word that/);
});

test("the plan carries the tune (and only when it differs from the class defaults)", () => {
  const plain = pickGenerationPlan("B_SENIOR", {});
  assert.equal("tune" in plain, false);
  const tuned = pickGenerationPlan("B_SENIOR", { tune: { items: 7, level: "harder" } });
  assert.deepEqual(tuned.tune, { items: 7, length: "class", level: "harder", extras: 0 });
  const custom = pickGenerationPlan("B_SENIOR", { exerciseMode: "custom", customDictationTypes: ["D01", "D03"], customLingoTypes: ["L01"], tune: { extras: 2 } });
  assert.deepEqual(custom.dictationTypes, ["D01", "D03"]);
  assert.equal(custom.tune.extras, 2);
});

test("validation follows the tuned item count", () => {
  const items = (n) => Array.from({ length: n }, (_, i) => ({ number: i + 1, prompt: "I can see the ________ here.", answer: "lava", testsWords: ["lava"] }));
  const sheet = (tune) => ({
    meta: { classProfile: "B_SENIOR" },
    generationPlan: { dictationTypes: ["D04"], lingoTypes: [], dictationExerciseCount: 1, lingoPracticeCount: 0, ...(tune ? { tune } : {}) },
    lingoLauncher: { vocabulary: [], practice: [] },
    dictation: { exercises: [{ number: 1, typeId: "D04", instruction: "", wordBank: [], items: items(8) }] },
  });
  // Lines per exercise is a guideline: a big overshoot is a note, never a problem that blocks the sheet.
  const tooMany = (v) => v.notes.some((n) => /has 8 lines/.test(n)) && !v.issues.some((i) => /lines|items —/.test(i));
  assert.equal(tooMany(validateWorksheet(sheet(null))), true, "8 items is a lot for the B Senior default (5)");
  assert.equal(tooMany(validateWorksheet(sheet({ items: 8 }))), false, "the teacher asked for 8");
});

test("the tune reaches the AI prompt, and a rewrite uses the tune the teacher has now", async (t) => {
  const calls = [];
  configureAi({ provider: "chatgpt", chatgpt: async (req) => { calls.push(JSON.stringify(req)); throw new Error("stop here"); } });
  t.after(() => configureAi({ provider: "deepseek" }));
  const form = { classProfile: "B_SENIOR", inputMode: "freeform", freeform: "Farm animals and what they do", vocabRows: [], teacherHints: [] };
  const plan = pickGenerationPlan("B_SENIOR", { tune: { items: 6, level: "harder" } });
  await generateWorksheets(form, "key", { plan }).catch(() => {});
  assert.ok(calls.length >= 1);
  assert.match(calls[0], /TEACHER FINE-TUNING/);
  assert.match(calls[0], /SLIGHTLY HARDER/);

  calls.length = 0;
  const existing = {
    meta: { classProfile: "B_SENIOR", freeformKey: "farm animals and what they do" },
    generationPlan: { ...plan },
    lingoLauncher: { vocabulary: [{ number: 1, english: "cow", type: "n.", greek: "αγελάδα", emojis: "", collocation: "", derivatives: [], synonyms: [], antonyms: [] }], practice: [] },
    dictation: { exercises: [] },
  };
  await regenerateDictationOnly(form, "key", existing, { tune: { level: "easier" } }).catch(() => {});
  assert.ok(calls.length >= 1);
  assert.match(calls[0], /SLIGHTLY EASIER/);
  assert.doesNotMatch(calls[0], /SLIGHTLY HARDER/);
});

test("the assistant tells the two dictations apart, and asks when it can't", () => {
  const ctx = { bookId: "CPP2", unit: 4, level: "B_SENIOR" };
  assert.equal(parseRequest("dictation sheet for unit 3", ctx).kind, "worksheet");
  assert.equal(parseRequest("a read-aloud dictation for this unit", ctx).kind, "dictation");
  assert.equal(parseRequest("dictogloss for B senior", ctx).kind, "dictation");
  const bare = completePlan(parseRequest("a dictation for unit 4", ctx), ctx);
  assert.equal(bare.kind, undefined);
  const q = clarifyingQuestions(bare, ctx);
  assert.equal(q[0].id, "kind");
  assert.match(q[0].text, /Which dictation/);
  assert.deepEqual(q[0].options.map((o) => o.value), ["worksheet", "dictation"]);
  assert.equal(answerQuestion(bare, "kind", "worksheet").kind, "worksheet");
  // With a real key the app sent this to the AI, which guessed read-aloud instead of asking (2026-10-19).
  assert.equal(needsAi("a dictation for unit 4", parseRequest("a dictation for unit 4", ctx)), false);
  assert.equal(needsAi("something fun for my D class tomorrow", parseRequest("something fun for my D class tomorrow", ctx)), true);
  assert.equal(parseRequest("worksheets with pictures for A class", ctx).kind, "worksheet");
});

test("+N extra words: the bank is the exercise's answers plus exactly N non-answers", () => {
  // Real DeepSeek run (2026-10-19, CPP2 Unit 4, +2): the bank listed all 15 unit words plus 2 extras for 7 gaps.
  const unit = ["planet", "change", "clarification", "sequence", "order", "event", "migrate", "waterhole", "savanna", "south", "volcanic eruption", "explosion", "climate", "plant", "nectar"];
  const items = ["planet", "waterhole", "savanna", "climate", "explosion", "nectar", "plant"].map((answer, i) => ({ number: i + 1, prompt: `clue ${i}: ________`, answer }));
  const bank = fitTunedWordBank([...unit, "school", "family"], items, 2);
  assert.equal(bank.length, 9);
  for (const it of items) assert.ok(bank.includes(it.answer), it.answer);
  assert.deepEqual(bank.filter((w) => !items.some((it) => it.answer === w)).sort(), ["family", "school"]);
  assert.notDeepEqual(bank.slice(0, 7), items.map((it) => it.answer), "not in answer order");
  // A missing answer is added back.
  assert.ok(fitTunedWordBank(["planet", "school"], items, 1).includes("nectar"));
  assert.equal(buildTuneBlock("B_SENIOR", { extras: 2 }).includes("ONLY that exercise's answers plus these 2"), true);
});
