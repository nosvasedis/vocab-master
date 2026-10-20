/* Remaking one question or line: the teacher's wish becomes precise rules and checks (studio/remake.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { testedWords, contextWords, readWish, remakePlan, remakeProblems, wordForms } from "../desktop/renderer/studio/remake.js";
import { dictationPrompt, dictationDefaults } from "../desktop/renderer/studio/dictation.js";

const medicine = { prompt: "The doctor says I need ________ for my cough.", options: ["a medicine", "any medicine", "some medicine"], answer: "some medicine" };

test("the word a question is built on: what the options share, else the answer, else the sentence", () => {
  assert.deepEqual(testedWords(medicine), ["medicine"]);
  assert.deepEqual(testedWords({ prompt: "Can I have ________, please?", options: ["an information", "some information", "many informations"], answer: "some information" }), ["information"]);
  assert.deepEqual(testedWords({ prompt: "A ________ has a long neck.", answer: "giraffe" }), ["giraffe"]);
  assert.deepEqual(testedWords({ prompt: "She ________ swim very well.", options: ["can", "cans", "can to"], answer: "can" }), ["swim"]);
  assert.ok(contextWords(medicine).includes("doctor") && contextWords(medicine).includes("cough"));
  assert.ok(wordForms("city").includes("cities") && wordForms("medicines").includes("medicine"));
});

test("wishes are read from the chips and from typed words (English and Greek)", () => {
  assert.equal(readWish("build it on another word, not the same one").anotherWord, true);
  assert.equal(readWish("test a different word from the list").anotherWord, true);
  assert.equal(readWish("άλλη λέξη παρακαλώ").anotherWord, true);
  assert.equal(readWish("use the word island").use, "island");
  assert.equal(readWish("write better wrong options").options, true);
  assert.equal(readWish("make the sentence shorter").shorter, true);
  assert.equal(readWish("keep the word but write a new everyday situation").keepWord, true);
  assert.equal(readWish("make it easier").anotherWord, false);
});

test("“another word” names the word to drop, bans its forms and offers new words", () => {
  const plan = remakePlan({ wish: "build it on another word, not the same one", item: medicine, siblings: [{ prompt: "Can I have ________ water?", options: ["a water", "some water", "many waters"], answer: "some water" }], candidates: ["medicine", "bread", "information", "water", "juice"] });
  assert.match(plan.instruction, /built on the word "medicine"/);
  assert.match(plan.instruction, /do not use "medicine", "medicines"/);
  assert.match(plan.instruction, /bread, information, juice/);
  assert.ok(!/Pick the new word from these[^\n]*\bwater\b/.test(plan.instruction), "a word another question already tests is not offered");
  assert.match(plan.instruction, /already use "water"/);
  assert.deepEqual(plan.checks.banned.sort(), ["medicine", "medicines"]);
});

test("a reply that ignores the wish is caught, with a reason the AI can act on", () => {
  const { checks } = remakePlan({ wish: "another word", item: medicine });
  assert.match(remakeProblems(medicine, { prompt: "The nurse gives me ________ for my cold.", options: ["a medicine", "some medicine", "any medicines"], answer: "some medicine" }, checks)[0], /still uses "medicine"/);
  assert.deepEqual(remakeProblems(medicine, { prompt: "Can you give me ________ about the trip?", options: ["an information", "some information", "many informations"], answer: "some information" }, checks), []);
  // Surprise me: anything that is nearly the same goes back.
  const fresh = remakePlan({ wish: "", item: medicine }).checks;
  assert.ok(remakeProblems(medicine, { ...medicine }, fresh).length);
  // "use the word island"
  const use = remakePlan({ wish: "use the word island", item: medicine }).checks;
  assert.match(remakeProblems(medicine, { prompt: "I need ________ water.", options: ["a", "some", "many"], answer: "some" }, use)[0], /does not use the word "island"/);
  // Better wrong options: the same wrong options are not better.
  const opts = remakePlan({ wish: "write better wrong options", item: medicine }).checks;
  assert.match(remakeProblems(medicine, { ...medicine }, opts).join(" "), /wrong options are the same/);
  assert.deepEqual(remakeProblems(medicine, { ...medicine, options: ["a medicine", "some medicine", "a few medicine"] }, opts), []);
  // Shorter
  const short = remakePlan({ wish: "shorter", item: medicine }).checks;
  assert.match(remakeProblems(medicine, { ...medicine, prompt: "The doctor says that I really need ________ for my bad cough." }, short).join(" "), /not shorter/);
  // Keep the word, new situation
  const keep = remakePlan({ wish: "keep the word but write a new everyday situation", item: medicine }).checks;
  assert.equal(keep.use, "medicine");
});

test("“Make it again” tells the dictation writer which sentences to move away from", () => {
  const spec = dictationDefaults("B_SENIOR");
  const { user } = dictationPrompt(spec, [{ english: "lion" }, { english: "zebra" }, { english: "giraffe" }], { avoid: ["The lion is big."] });
  assert.match(user, /NEW version.*"The lion is big\."/);
  assert.ok(!dictationPrompt(spec, [{ english: "lion" }]).user.includes("NEW version"));
});
