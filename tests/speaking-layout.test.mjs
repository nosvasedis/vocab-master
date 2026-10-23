/* Test Maker speaking parts on paper: picture cards hold their own pictures, a story's pictures run in order with
 * arrows, a discussion's options sit around the question, the Big Question is a banner, Student A and B differ. */
import test from "node:test";
import assert from "node:assert/strict";
import { TASKS } from "../desktop/renderer/studio/tasks.js";
import { normalizeSection, speakingPlan, speakingCardLabel } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { makePart } from "../desktop/renderer/studio/test-builder.js";

const PICS = { lion: "@w-lion", zebra: "@w-zebra", giraffe: "@w-giraffe", camel: "@w-camel", tent: "@w-tent", torch: "@w-torch" };
const picFor = (w) => PICS[String(w).toLowerCase()] || "";
const card = (title, extra = {}) => ({ title, student: `Talk about ${title}.`, keyWords: [], questions: ["What can you see?"], ...extra });
const part = (task, raw, level = "B_SENIOR") => normalizeSection({ ...makePart(TASKS[task].skill, task, level), id: "p1" }, raw, { levelId: level, picFor });
const paper = (s, layout = {}) => renderStudentPaper({ meta: { title: "T", layout }, sections: [{ ...s, points: 10 }] });

test("picture cards: each card gets the picture it names, the rest go to cards without one", () => {
  const s = part("S-PICTURE", { pictures: ["lion", "zebra", "giraffe"], cards: [card("The giraffe"), card("Animals"), card("The lion", { keyWords: ["mane"] })] });
  const plan = speakingPlan(s);
  assert.equal(plan.kind, "picture");
  assert.deepEqual(plan.cards.map((c) => c.pics.map((p) => p.word)), [["giraffe"], ["zebra"], ["lion"]]);
  assert.deepEqual(plan.pictures, []);
  const html = paper(s);
  assert.equal((html.match(/st-speak-card has-pic/g) || []).length, 3);
  assert.match(html, /st-speak-grid cols-3/);
  assert.doesNotMatch(html, /st-story-pics/);
});

test("picture cards: one card with several pictures takes two, a third goes in a strip", () => {
  const plan = speakingPlan(part("S-PICTURE", { pictures: ["lion", "zebra", "giraffe"], cards: [card("At the zoo")] }));
  assert.deepEqual(plan.cards[0].pics.map((p) => p.word), ["lion", "zebra"]);
  assert.deepEqual(plan.pictures.map((p) => p.word), ["giraffe"]);
});

test("story: the first card is the banner, the pictures run in order with arrows", () => {
  const s = part("S-STORY", { pictures: ["lion", "zebra", "giraffe", "camel"], cards: [card("A day out", { keyWords: ["lion"] }), card("You")] });
  const plan = speakingPlan(s);
  assert.equal(plan.kind, "story");
  assert.equal(plan.lead.card.title, "A day out");
  assert.equal(plan.cards.length, 1);
  const html = paper(s);
  assert.match(html, /st-speak-lead st-speak-story" data-card="0"/);
  assert.equal((html.match(/st-story-arrow/g) || []).length, 3);
  assert.match(html, /data-card="1"/);
});

test("talk together: the question in the middle of its pictures; without pictures a banner", () => {
  const raw = { pictures: ["lion", "zebra", "giraffe", "tent", "torch"], cards: [card("A camping trip", { keyWords: ["I think…"] })] };
  const html = paper(part("S-DISCUSS", raw));
  assert.match(html, /st-mindmap/);
  assert.equal((html.match(/<line /g) || []).length, 5);
  assert.match(html, /Useful phrases/);
  const plain = paper(part("S-DISCUSS", raw), { pictures: false });
  assert.doesNotMatch(plain, /st-mindmap|<img/);
  assert.match(plain, /st-speak-lead st-speak-discuss/);
});

test("Big Question banner, role-play A and B, and no cards", () => {
  assert.match(paper(part("S-BQ", { cards: [card("What is a hero?"), card("Your hero")] }, "D_SENIOR")), /st-speak-lead st-speak-bq[\s\S]*Big Question/);
  const role = paper(part("S-ROLE", { cards: [card("At the shop"), card("At the shop")] }, "C_SENIOR"));
  assert.match(role, /role-a[\s\S]*Student A[\s\S]*role-b[\s\S]*Student B/);
  assert.match(role, /You can say|st-speak-body/);
  assert.equal(speakingCardLabel("S-ROLE", 3), "Student B");
  assert.equal(speakingCardLabel("S-QUESTIONS", 3), "Card 4");
  assert.match(paper(part("S-QUESTIONS", { cards: [] }, "C_SENIOR")), /st-speak-none[\s\S]*Your teacher will talk with you/);
});

test("teacher's pack: each card's script carries its pictures and its card number", () => {
  const s = { ...part("S-PICTURE", { pictures: ["lion", "zebra"], cards: [card("The lion"), card("The zebra")] }), points: 10 };
  const html = renderTeacherPack({ meta: { title: "T" }, sections: [s] });
  assert.equal((html.match(/class="st-speak-t" data-card=/g) || []).length, 2);
  assert.equal((html.match(/st-speak-thumbs/g) || []).length, 2);
  assert.match(html, /Student’s card: Talk about The lion\./);
});

test("Word: every speaking set-up builds (cards, story, discussion, Big Question, role-play, none)", async () => {
  const { buildStudioDocx } = await import("../desktop/renderer/app.js");
  const sections = [
    part("S-PICTURE", { pictures: ["lion", "zebra", "giraffe"], cards: [card("The lion"), card("The zebra"), card("The giraffe")] }),
    part("S-STORY", { pictures: ["lion", "zebra", "giraffe", "camel"], cards: [card("A day out"), card("You")] }),
    part("S-DISCUSS", { pictures: ["lion", "zebra", "giraffe", "tent", "torch"], cards: [card("A trip")] }, "D_SENIOR"),
    part("S-BQ", { cards: [card("What is a hero?")] }, "D_SENIOR"),
    part("S-ROLE", { cards: [card("Shop"), card("Shop")] }, "C_SENIOR"),
    part("S-QUESTIONS", { cards: [] }, "C_SENIOR"),
  ].map((s) => ({ ...s, points: 10 }));
  const d = { meta: { title: "Speaking" }, sections };
  for (const which of ["student", "teacher"]) assert.ok((await buildStudioDocx({ doc: d, which })).size > 2000, which);
});
