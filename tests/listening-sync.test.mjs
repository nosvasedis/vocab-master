/* Test Maker listening: the recording (the script the app's voices read) follows the questions. Questions added or
 * changed since the script was written are checked against it; a new script fits them all; questions taken out leave
 * extra details, and "Listen for the main idea" cuts its own numbered recording. */
import test from "node:test";
import assert from "node:assert/strict";
import { TASKS } from "../desktop/renderer/studio/tasks.js";
import { normalizeSection } from "../desktop/renderer/studio/doc-model.js";
import { makePart, reviseSection, applyItemFixes, scriptPrompt, applyScript } from "../desktop/renderer/studio/test-builder.js";
import { recordingState, unheardAnswers, answerHeard, cutGistRecording, itemKey } from "../desktop/renderer/studio/listening-sync.js";

const LEVEL = "C_SENIOR";
const plan = (task, n) => ({ ...makePart(TASKS[task].skill, task, LEVEL), id: "p1", items: n });
const part = (task, raw) => normalizeSection(plan(task, raw.items.length), raw, { levelId: LEVEL });
const doc = (s) => ({ meta: { title: "T", classProfile: LEVEL }, focusWords: [], sections: [s] });
const spec = (s) => ({ levelId: LEVEL, parts: [plan(s.task, s.items.length)], pictures: false, grammar: [] });

const gapRaw = () => ({
  script: [{ speaker: "Ms Park", text: "Hello class. On Tuesday bring your flute and a pencil." }, { speaker: "Ms Park", text: "The trip costs twelve euros and we meet at the station." }],
  example: { prompt: "Day: ________", answer: "Tuesday" },
  items: [{ prompt: "Bring your ________.", answer: "flute" }, { prompt: "Cost: € ________", answer: "12" }, { prompt: "We meet at the ________.", answer: "station" }],
});

test("a new script is written for the questions it has, and fits them", () => {
  const s = part("L-GAP", gapRaw());
  assert.equal(s.scriptFor.length, 4);
  assert.deepEqual(recordingState(s), { missing: [], unsure: [], dropped: 0, stale: false });
  // Numbers are heard as words too: "12" in "twelve".
  assert.equal(answerHeard(s, s.items[1]), true);
});

test("a question added by the teacher whose answer the script never says makes the recording out of date", () => {
  const s = part("L-GAP", gapRaw());
  const d = doc(s);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items.push({ prompt: "Wear your ________.", answer: "hat" }); });
  const st = recordingState(d.sections[0]);
  assert.deepEqual(st.missing, [4]);
  assert.equal(st.stale, true);
  assert.deepEqual(unheardAnswers(d.sections[0]), [{ n: 4, answer: "hat" }]);
});

test("a changed answer the script says still fits; one it doesn't is missing", () => {
  const s = part("L-GAP", gapRaw());
  const d = doc(s);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items[0] = { prompt: "Bring a ________.", answer: "pencil" }; });
  assert.equal(recordingState(d.sections[0]).stale, false);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items[2] = { prompt: "We meet at the ________.", answer: "museum" }; });
  assert.deepEqual(recordingState(d.sections[0]).missing, [3]);
});

test("a question taken out leaves an extra detail: the recording still fits", () => {
  const s = part("L-GAP", gapRaw());
  const d = doc(s);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items.splice(1, 1); });
  const st = recordingState(d.sections[0]);
  assert.equal(st.stale, false);
  assert.equal(st.dropped, 1);
});

test("a choice the script says in other words can't be told: it is 'unsure', not missing", () => {
  const s = part("L-MC", {
    script: [{ speaker: "Tom", text: "The museum opens at nine, but let's meet at half past." }, { speaker: "Ann", text: "Fine, see you then." }],
    items: [{ prompt: "When will they meet?", options: ["at 9:00", "at 9:30", "at 10:30"], answer: "at 9:30" }],
  });
  const d = doc(s);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items.push({ prompt: "Where do they go?", options: ["a zoo", "a park", "a farm"], answer: "a farm" }); });
  const st = recordingState(d.sections[0]);
  assert.deepEqual(st.missing, []);
  assert.deepEqual(st.unsure, [2]);
});

test("the options' order doesn't change a question's key (the app shuffles them)", () => {
  assert.equal(itemKey({ prompt: "Q", answer: "b", options: ["a", "b", "c"] }), itemKey({ prompt: "Q", answer: "b", options: ["c", "a", "b"] }));
});

test("a test made before the recording was tracked fits; its first edit is checked against it", () => {
  const s = part("L-GAP", gapRaw());
  delete s.scriptFor;
  assert.equal(recordingState(s).stale, false);
  const d = doc(s);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items.push({ prompt: "Wear your ________.", answer: "hat" }); });
  assert.deepEqual(recordingState(d.sections[0]).missing, [4]);
});

test("Lingo's new script fits every question, and gives the yes/no evidence", () => {
  const s = part("L-YN", {
    script: [{ speaker: "Kate", text: "My grandma lives on a farm with two cows." }, { speaker: "Ben", text: "Cool!" }],
    items: [{ prompt: "Kate's grandma lives in the city.", answer: "no", evidence: "lives on a farm" }, { prompt: "There are two cows.", answer: "yes", evidence: "two cows" }],
  });
  const d = doc(s);
  const sp = spec(s);
  reviseSection(d, sp, "p1", (raw) => { raw.items.push({ prompt: "Grandma has a dog.", answer: "yes" }); });
  assert.deepEqual(recordingState(d.sections[0]).unsure, [3]);
  const { system, user } = scriptPrompt(sp, d.sections[0], {});
  assert.match(system, /"evidence"/);
  assert.match(user, /THE QUESTIONS ON THE PAPER/);
  assert.match(user, /3\. Grandma has a dog\. → T/);
  assert.doesNotMatch(user, /THIS order|Items: exactly/);
  assert.match(user, /Keep the same speakers/);
  const ok = applyScript(d, sp, "p1", { script: [{ speaker: "Kate", text: "My grandma lives on a farm with two cows." }, { speaker: "Kate", text: "She has a dog called Max too." }, { speaker: "Ben", text: "Cool!" }], evidence: [{ n: 3, evidence: "She has a dog called Max" }] });
  assert.equal(ok, true);
  const after = d.sections[0];
  assert.equal(after.script.length, 3);
  assert.equal(after.items[2].evidence, "She has a dog called Max");
  assert.equal(recordingState(after).stale, false);
  assert.deepEqual(after.problems, []);
});

test("a reply without a script changes nothing", () => {
  const s = part("L-GAP", gapRaw());
  const d = doc(s);
  assert.equal(applyScript(d, spec(s), "p1", { script: [] }), false);
  assert.equal(d.sections[0].script.length, 2);
});

test("a question Lingo rewrote from the script fits it — unless its answer is never said", () => {
  const s = part("L-GAP", gapRaw());
  const d = doc(s);
  applyItemFixes(d, spec(s), "p1", { items: [{ n: 1, prompt: "Bring a ________ too.", answer: "pencil" }] }, [1]);
  assert.equal(recordingState(d.sections[0]).stale, false);
  applyItemFixes(d, spec(s), "p1", { items: [{ n: 2, prompt: "Bring a ________.", answer: "kite" }] }, [2]);
  assert.deepEqual(recordingState(d.sections[0]).missing, [2]);
  // Questions written for a recording that is made again afterwards are not trusted on their own.
  applyItemFixes(d, spec(s), "p1", { items: [{ n: 3, prompt: "Bring your ________.", answer: "lunch" }] }, [3], { trust: false });
  assert.deepEqual(recordingState(d.sections[0]).missing, [2, 3]);
});

test("Listen for the main idea: taking a question out cuts its recording and renumbers the rest", () => {
  const script = [
    { speaker: "Narrator", text: "Example." }, { speaker: "Leo", text: "Hi Gran, the bus is late." },
    { speaker: "Narrator", text: "Number 1." }, { speaker: "Mia", text: "The shop is closed today." },
    { speaker: "Narrator", text: "Number 2." }, { speaker: "Tom", text: "I love this song!" },
    { speaker: "Narrator", text: "Number 3." }, { speaker: "Ann", text: "Let's take the train." },
  ];
  const cut = cutGistRecording(script, 2);
  assert.deepEqual(cut.map((l) => l.text), ["Example.", "Hi Gran, the bus is late.", "Number 1.", "The shop is closed today.", "Number 2.", "Let's take the train."]);
  assert.equal(cutGistRecording(script, 5), null);
  assert.equal(cutGistRecording([{ speaker: "Leo", text: "No numbers here." }], 1), null);
  const { user } = scriptPrompt({ levelId: LEVEL, parts: [], grammar: [] }, part("L-GIST", { script, items: [{ prompt: "Why?", options: ["a", "b", "c"], answer: "a" }] }), {});
  assert.match(user, /"Number 1\."/);
});

test("a picture word that is never said is missing", () => {
  const s = part("L-PIC", { script: [{ speaker: "Mia", text: "I bought some grapes for the picnic." }, { speaker: "Dad", text: "Great." }], items: [{ prompt: "What did Mia buy?", options: ["banana", "grapes", "apple"], answer: "grapes" }] });
  assert.equal(answerHeard(s, s.items[0]), true);
  assert.equal(answerHeard(s, { ...s.items[0], answer: "apple" }), false);
});

test("new listening questions and their script come in one request", async () => {
  const { fixItemsPrompt } = await import("../desktop/renderer/studio/test-builder.js");
  const s = part("L-GAP", gapRaw());
  const { system, user } = fixItemsPrompt(spec(s), s, [3], { withScript: true });
  assert.match(system, /"script"/);
  assert.match(user, /ALSO RETURN "script"/);
  assert.doesNotMatch(user, /answerable from the script/);
  assert.doesNotMatch(fixItemsPrompt(spec(s), s, [3], {}).system, /"script"/);
});

test("a new script that still doesn't say an answer keeps that question flagged", () => {
  const s = part("L-GAP", gapRaw());
  const d = doc(s);
  reviseSection(d, spec(s), "p1", (raw) => { raw.items.push({ prompt: "Wear your ________.", answer: "hat" }); });
  applyScript(d, spec(s), "p1", { script: [{ speaker: "Ms Park", text: "On Tuesday bring your flute." }, { speaker: "Ms Park", text: "It costs twelve euros; meet at the station." }] });
  assert.deepEqual(recordingState(d.sections[0]).missing, [4]);
});
