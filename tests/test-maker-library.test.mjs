/* Test Maker: the exercise library (task types, level fit, part settings) and the unit reading texts. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { TASKS, KINDS, KNOBS, SKILLS, taskFit, partOpts, knobDefault, tasksFor, defaultTask, secondTask } from "../desktop/renderer/studio/tasks.js";
import { READING_TEXTS, readingText, textsFor, textUnitWords, wordCount } from "../desktop/renderer/studio/reading-texts.js";
import { testDefaults, makePart, testPrompt, buildTestDoc, presetParts, suggestText, textWords, levelGuide, reviseSection } from "../desktop/renderer/studio/test-builder.js";
import { normalizeSection, scramble, letterHint, familyHint, answerKeyRows, makeVersionB } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { LEVEL_IDS } from "../desktop/renderer/studio/levels.js";

test("every task explains itself: kind, class fit, blurb, preview, rubric and AI brief", () => {
  for (const [id, t] of Object.entries(TASKS)) {
    assert.ok(SKILLS[t.skill], id);
    assert.ok(KINDS[t.kind], `${id} kind`);
    assert.ok(Array.isArray(t.fit) && t.fit[0] <= t.fit[1] && t.fit[0] >= 0 && t.fit[1] <= 4, `${id} fit`);
    assert.ok(t.blurb?.length > 40, `${id} blurb`);
    assert.ok(t.sample, `${id} sample`);
    assert.ok(t.rubric && t.el && t.ai, `${id} rubric / el / ai`);
    for (const k of t.knobs || []) assert.ok(KNOBS[k], `${id} knob ${k}`);
  }
  // Every skill offers at least six exercises, and every class has at least two that suit it in every skill.
  for (const skill of ["listening", "reading", "vocabulary", "grammar", "writing", "speaking"]) {
    assert.ok(tasksFor(skill).length >= 6, skill);
    for (const lvl of LEVEL_IDS) assert.ok(tasksFor(skill).filter((t) => taskFit(t.id, lvl).fit === "great").length >= 2, `${skill} ${lvl}`);
  }
  // Defaults and second choices suit their class.
  for (const lvl of LEVEL_IDS) for (const skill of ["listening", "reading", "vocabulary", "grammar", "writing", "speaking"]) {
    assert.equal(taskFit(defaultTask(skill, lvl), lvl).fit, "great", `${skill} default ${lvl}`);
    assert.equal(taskFit(secondTask(skill, lvl), lvl).fit, "great", `${skill} second ${lvl}`);
  }
});

test("class fit labels and the library order put the class's exercises first", () => {
  assert.equal(taskFit("W-OPINION", "A_SENIOR").fit, "stretch");
  assert.equal(taskFit("V-FORM", "A_SENIOR").fit, "great", "word families start in A Senior");
  assert.equal(taskFit("V-SPELL", "E_SENIOR").fit, "easy");
  assert.match(taskFit("R-TF", "C_SENIOR").label, /Great for C Senior/);
  const order = tasksFor("vocabulary", "A_SENIOR").map((t) => taskFit(t.id, "A_SENIOR").fit);
  assert.deepEqual(order, [...order].sort((a, b) => ["great", "stretch", "easy"].indexOf(a) - ["great", "stretch", "easy"].indexOf(b)));
});

test("part settings fall back to the class defaults and reject unknown values", () => {
  assert.equal(knobDefault("hint", "A_SENIOR"), "first");
  assert.equal(knobDefault("hint", "E_SENIOR"), "none");
  const p = { ...makePart("reading", "R-MC", "B_SENIOR"), opts: { options: 7, length: "long" } };
  assert.deepEqual(partOpts(p, "B_SENIOR"), { text: "", genre: "any", length: "long", options: 3 });
  assert.deepEqual(textWords("A_SENIOR", "short"), [35, 64].map((n, i) => (i ? 65 : 35)));
  assert.ok(textWords("E_SENIOR", "long")[1] > textWords("A_SENIOR", "long")[1]);
  assert.match(levelGuide({ task: "R-TF", level: 5 }), /inference/);
  assert.match(levelGuide({ task: "W-GUIDED", level: 1 }), /simple sentences/);
});

test("every unit of every book has a fact text, a story and an everyday text at its level", () => {
  assert.equal(READING_TEXTS.length, 81);
  assert.equal(new Set(READING_TEXTS.map((t) => t.id)).size, 81);
  const range = { CPP1: [50, 95], CPP2: [60, 125], CPP3: [85, 160] };
  for (const book of ["CPP1", "CPP2", "CPP3"]) for (let u = 1; u <= 9; u++) {
    const list = textsFor(book, [u]);
    assert.deepEqual(list.map((t) => t.kind), ["fact", "story", "everyday"], `${book} U${u}`);
    for (const t of list) {
      const n = wordCount(t.text);
      assert.ok(n >= range[book][0] && n <= range[book][1], `${t.id}: ${n} words`);
      assert.ok(textUnitWords(t).length >= 2, `${t.id} uses the unit's words`);
      assert.ok(t.title && !/_{3,}/.test(t.text), t.id);
    }
  }
  assert.equal(readingText("CPP2-U4-fact").title, "How a Volcano Erupts");
  assert.ok(textUnitWords(readingText("CPP2-U4-fact")).includes("volcano"));
});

test("reading parts get different unit texts: a story for ordering and who-is-it", () => {
  const texts = textsFor("CPP1", [3]);
  const used = new Set();
  const a = suggestText("R-ORDER", texts, used); used.add(a);
  const b = suggestText("R-TF", texts, used); used.add(b);
  const c = suggestText("R-MC", texts, used); used.add(c);
  assert.equal(readingText(a).kind, "story");
  assert.equal(readingText(b).kind, "fact");
  assert.equal(new Set([a, b, c]).size, 3);
});

test("a part with a unit text: the prompt gives the text, the paper prints it exactly", () => {
  const part = { ...makePart("reading", "R-TF", "B_SENIOR"), id: "r1", opts: { text: "CPP2-U4-fact" } };
  const spec = { ...testDefaults("B_SENIOR"), parts: [part], source: { kind: "unit" } };
  const { user } = testPrompt(spec, { focusWords: [{ english: "volcano" }] });
  assert.match(user, /READING TEXT \(given/);
  assert.match(user, /How a Volcano Erupts/);
  const doc = buildTestDoc(spec, { sections: [{ id: "r1", passage: "Something the AI wrote anyway.", passageTitle: "Wrong", example: { prompt: "The plates move.", answer: "yes" }, items: Array.from({ length: 5 }, (_, i) => ({ prompt: `Statement ${i}`, answer: i % 2 ? "no" : "yes" })) }] }, { levelId: "B_SENIOR" });
  const s = doc.sections[0];
  assert.equal(s.passage, readingText("CPP2-U4-fact").text);
  assert.equal(s.passageTitle, "How a Volcano Erupts");
  assert.ok(renderStudentPaper(doc).includes("How a Volcano Erupts"));
  // A rewrite keeps the given text.
  const rw = testPrompt(spec, { rewrite: { wish: "harder", previous: [s] } }, ["r1"]);
  assert.match(rw.user, /keeps that text/);
});

test("text length, text type, recording, plays and choices reach the prompt", () => {
  const r = { ...makePart("reading", "R-MC", "C_SENIOR"), id: "r", opts: { length: "long", genre: "diary", options: 4 } };
  const l = { ...makePart("listening", "L-MC", "C_SENIOR"), id: "l", opts: { audio: "interview", plays: 1 } };
  const w = { ...makePart("writing", "W-GUIDED", "C_SENIOR"), id: "w", opts: { support: "full" } };
  const spec = { ...testDefaults("C_SENIOR"), parts: [r, l, w], source: { kind: "unit" } };
  const { user } = testPrompt(spec, {});
  assert.match(user, new RegExp(`${textWords("C_SENIOR", "long").join("–")} words, a diary`));
  assert.match(user, /"options" \(4\)/);
  assert.match(user, /an interview/);
  assert.match(user, /played ONCE/);
  assert.match(user, /Support: LOTS/);
  const doc = buildTestDoc(spec, { sections: [{ id: "l", script: [{ speaker: "A", text: "Hi." }], items: [] }, { id: "w", prompt: "Write.", bank: ["volcano", "lava"], frame: ["I think…"] }] }, { levelId: "C_SENIOR" });
  assert.equal(doc.sections.find((s) => s.id === "l").plays, 1);
  assert.deepEqual(doc.sections.find((s) => s.id === "w").bank, ["volcano", "lava"]);
});

test("the app makes the letter help: mixed-up letters, a first letter, a letter count", () => {
  const s = scramble("frog", () => 0);
  assert.notEqual(s.replace(/ · /g, ""), "frog");
  assert.deepEqual(s.split(" · ").sort(), ["f", "g", "o", "r"]);
  assert.equal(letterHint("gloves", "first"), "g _ _ _ _ _");
  assert.equal(letterHint("ice cream", "count"), "_ _ _   _ _ _ _ _ (8 letters)");
  assert.equal(letterHint("gloves", "none"), "");
  const sec = normalizeSection({ id: "v", task: "V-DEF", items: 2, opts: { hint: "count" } }, { items: [{ prompt: "On your hands.", answer: "gloves" }, { prompt: "Cold and white.", answer: "snow" }] }, { levelId: "E_SENIOR" });
  assert.equal(sec.items[0].hint, "_ _ _ _ _ _ (6 letters)");
  assert.ok(renderStudentPaper({ meta: {}, sections: [sec] }).includes("(6 letters)"));
  const spell = normalizeSection({ id: "s", task: "V-SPELL", items: 1 }, { items: [{ prompt: "It jumps.", answer: "frog" }] }, { levelId: "A_SENIOR" });
  assert.ok(spell.items[0].hint.includes(" · "));
});

test("put the events in order: the app numbers and mixes the events, and an edit keeps the key", () => {
  const events = ["Jack sells the cow.", "Mother throws the beans.", "A beanstalk grows.", "Jack climbs up.", "Jack takes the goose."];
  const raw = { passage: "Jack and his mother are poor. Jack sells the cow for beans…", example: { prompt: "Jack and his mother are poor.", answer: "" }, items: events.map((prompt) => ({ prompt, answer: "" })) };
  const sec = normalizeSection({ id: "o", task: "R-ORDER", items: 5 }, raw, { levelId: "A_SENIOR" });
  assert.equal(sec.example.answer, "1");
  assert.deepEqual(sec.items.map((it) => it.letter), ["a", "b", "c", "d", "e"]);
  assert.notDeepEqual(sec.items.map((it) => it.prompt), events, "mixed up");
  for (const it of sec.items) assert.equal(it.answer, String(events.indexOf(it.prompt) + 2));
  assert.equal(sec.problems.length, 0, sec.problems.join());
  assert.match(answerKeyRows(sec)[0].text, /^\d — /);
  // Changing one event keeps every number.
  const doc = { meta: { classProfile: "A_SENIOR" }, sections: [sec] };
  const before = sec.items.map((it) => `${it.prompt}=${it.answer}`);
  reviseSection(doc, { parts: [{ id: "o", task: "R-ORDER", items: 5 }] }, "o", (r) => { r.items[0].prompt = `${r.items[0].prompt}!`; });
  assert.deepEqual(doc.sections[0].items.map((it) => it.answer), before.map((x) => x.split("=")[1]));
});

test("every task renders on the paper, in the teacher's pack, version B and Word", async () => {
  const words = ["volcano", "lava", "crust", "plate", "melt", "snowy"];
  for (const [id, t] of Object.entries(TASKS)) {
    const part = { ...makePart(t.skill, id, "C_SENIOR"), id: "x" };
    const spec = { ...testDefaults("C_SENIOR"), parts: [part], source: { kind: "unit" } };
    const items = Array.from({ length: part.items }, (_, i) => {
      if (t.answer === "choice") return { prompt: `The ________ is hot ${i}.`, options: [words[i % 6], "snow", "ice", "rain"].slice(0, t.options || 3), answer: words[i % 6] };
      if (t.answer === "tf") return { prompt: `Statement ${i}`, answer: i % 2 ? "no" : "yes" };
      if (t.answer === "match") return { prompt: words[i % 6], answer: `meaning ${i}` };
      return { prompt: `We saw the ________ (${i}).`, answer: id === "R-ORDER" ? "" : words[i % 6] };
    });
    const reply = { sections: [{ id: "x", items, example: t.answer === "open" ? undefined : items[0], passage: "A text.", script: [{ speaker: "Mia", text: "Hello." }], prompt: "Write.", frame: ["Starter one…", "Starter two…"], sample: "Model.", cards: [{ title: "Card", student: "Talk.", questions: ["Q?"] }] }] };
    const doc = buildTestDoc(spec, reply, { levelId: "C_SENIOR" });
    assert.ok(renderStudentPaper(doc).length > 200, id);
    assert.ok(renderTeacherPack(doc).length > 200, id);
    doc.versionB = makeVersionB(doc);
    for (const which of ["student", "teacher"]) assert.ok((await buildStudioDocx({ doc, which })).size > 1000, `${id} ${which}`);
  }
});

test("each class's preset test uses exercises made for it", () => {
  for (const lvl of LEVEL_IDS) for (const len of ["quiz", "standard", "full"]) {
    for (const p of presetParts(len, lvl)) assert.equal(taskFit(p.task, lvl).fit, "great", `${lvl} ${len} ${p.task}`);
  }
});

test("word families work from A Senior: a class ladder in the prompt and the word printed inside the answer", () => {
  assert.equal(familyHint("It is a ________ day. (SUN)", "sunny", "root"), "s u n _ _");
  assert.equal(familyHint("She is very ________. (HAPPY)", "unhappy", "root"), "_ _ h a p p y");
  assert.equal(familyHint("He made a ________. (DECIDE)", "decision", "root"), "d _ _ _ _ _ _ _", "no exact root: first letter");
  assert.match(familyHint("x (SUN)", "sunny", "count"), /\(5 letters\)/);
  assert.equal(familyHint("x (SUN)", "sunny", "none"), "");
  assert.equal(knobDefault("family", "A_SENIOR"), "root");
  assert.equal(knobDefault("family", "E_SENIOR"), "none");
  const sec = normalizeSection({ id: "f", task: "V-FORM", items: 1 }, { example: { prompt: "My dad is a ________. (FARM)", answer: "farmer" }, items: [{ prompt: "It is a ________ day. (RAIN)", answer: "rainy" }] }, { levelId: "A_SENIOR" });
  assert.equal(sec.example.hint, "f a r m _ _");
  assert.equal(sec.items[0].hint, "r a i n _");
  assert.ok(renderStudentPaper({ meta: {}, sections: [sec] }).includes("r a i n _"));
  const prompt = (lvl) => testPrompt({ ...testDefaults(lvl), parts: [{ ...makePart("vocabulary", "V-FORM", lvl), id: "f" }], source: { kind: "unit" } }, {}).user;
  assert.match(prompt("A_SENIOR"), /CLASS LADDER — A Senior: ONE easy/);
  assert.match(prompt("E_SENIOR"), /CLASS LADDER — E Senior: B1 word formation/);
});
