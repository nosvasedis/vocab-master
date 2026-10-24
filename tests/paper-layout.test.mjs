/* Papers: text size (all papers, Word too), spacing, the examples switch, and page flow (no half-empty pages). */
import test from "node:test";
import assert from "node:assert/strict";
import { TASKS } from "../desktop/renderer/studio/tasks.js";
import { testDefaults, makePart, buildTestDoc } from "../desktop/renderer/studio/test-builder.js";
import { renderStudentPaper, renderTeacherPack, STUDIO_PRINT_CSS } from "../desktop/renderer/studio/doc-render.js";
import { TEXT_SIZES, TEXT_SIZE_CSS, textSizeKey, scaledSize } from "../desktop/renderer/studio/text-size.js";
import { WORKSHEET_PRINT_CSS, buildStudioDocx } from "../desktop/renderer/app.js";

const docWith = (task, layout = {}) => {
  const t = TASKS[task];
  const part = { ...makePart(t.skill, task, "B_SENIOR"), id: "p1", items: 3 };
  const spec = { ...testDefaults("B_SENIOR"), parts: [part] };
  const items = [0, 1, 2].map((i) => ({ prompt: `The ________ is hot ${i}.`, options: ["lava", "snow", "ice"], answer: t.answer === "tf" ? "yes" : "lava" }));
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", passage: "A text.", example: { prompt: "EXAMPLE LINE", options: ["lava", "snow", "ice"], answer: t.answer === "tf" ? "yes" : "lava" }, items }] }, { levelId: "B_SENIOR", meta: {} });
  doc.meta.layout = layout;
  return doc;
};

test("text size: a class on the sheet, a zoom rule for each size, and scaled Word sizes", () => {
  assert.equal(textSizeKey("nonsense"), "standard");
  for (const k of Object.keys(TEXT_SIZES)) {
    assert.match(renderStudentPaper(docWith("V-MC", { textSize: k })), new RegExp(`class="worksheet studio-sheet density-standard text-${k}"`));
    if (k !== "standard") assert.ok(TEXT_SIZE_CSS.includes(`.worksheet.text-${k} > * { zoom: ${TEXT_SIZES[k].zoom}; }`));
  }
  assert.ok(WORKSHEET_PRINT_CSS.includes(TEXT_SIZE_CSS), "worksheets and tests share the rules");
  assert.equal(scaledSize(22, "large"), 25);
  assert.equal(scaledSize(22, "standard"), 22);
  assert.match(renderTeacherPack(docWith("V-MC", { textSize: "xlarge", density: "compact" })), /density-compact text-xlarge/);
});

test("the examples switch leaves out item 0 — except the first event of an order task", async () => {
  assert.match(renderStudentPaper(docWith("V-MC")), /EXAMPLE LINE/);
  assert.doesNotMatch(renderStudentPaper(docWith("V-MC", { examples: false })), /EXAMPLE LINE/);
  const order = docWith("R-ORDER", { examples: false });
  assert.ok(renderStudentPaper(order).includes("st-example"), "the order task keeps its first event");
  const withEx = await buildStudioDocx({ doc: docWith("V-MC"), which: "student" });
  const noEx = await buildStudioDocx({ doc: docWith("V-MC", { examples: false }), which: "student" });
  assert.ok(noEx.size < withEx.size, "the Word paper leaves it out too");
});

test("each part has its own example switch: it wins over the test's Examples switch, except an order task", async () => {
  const { showsExample } = await import("../desktop/renderer/studio/doc-model.js");
  const { reviseSection } = await import("../desktop/renderer/studio/test-builder.js");
  assert.equal(showsExample({ example: null }, {}), false, "no example, nothing to show");
  assert.equal(showsExample({ example: {} }, { examples: false }), false);
  assert.equal(showsExample({ example: {}, showExample: true }, { examples: false }), true, "the part's own switch wins");
  assert.equal(showsExample({ example: {}, showExample: false }, {}), false);
  assert.equal(showsExample({ example: {}, task: "R-ORDER", showExample: false }, { examples: false }), true, "the first event stays");

  const doc = docWith("V-MC", { examples: false });
  assert.doesNotMatch(renderStudentPaper(doc), /EXAMPLE LINE/);
  doc.sections[0].showExample = true;
  assert.match(renderStudentPaper(doc), /EXAMPLE LINE/, "shown on this part only");
  doc.meta.layout = { examples: true };
  doc.sections[0].showExample = false;
  assert.doesNotMatch(renderStudentPaper(doc), /EXAMPLE LINE/, "hidden on this part only");
  const order = docWith("R-ORDER", { examples: false });
  order.sections[0].showExample = false;
  assert.ok(renderStudentPaper(order).includes("st-example"), "an order task keeps its first event");

  // Word follows the part's switch too (the file is smaller without the example, bigger with it).
  const sizeOf = async (d) => (await buildStudioDocx({ doc: d, which: "student" })).size;
  const hidden = await sizeOf(docWith("V-MC", { examples: false }));
  const shown = docWith("V-MC", { examples: false });
  shown.sections[0].showExample = true;
  assert.ok(hidden < (await sizeOf(shown)), "the Word paper shows it when the part says so");
  const kept = docWith("V-MC");
  kept.sections[0].showExample = false;
  assert.ok((await sizeOf(kept)) < (await sizeOf(docWith("V-MC"))), "and leaves it out when the part says so");

  // Changing a part (Lingo's rewrite, a question edit) keeps the switch.
  const part = { ...makePart("grammar", "V-MC", "B_SENIOR"), id: "p1", items: 3 };
  const spec = { ...testDefaults("B_SENIOR"), parts: [part] };
  const again = buildTestDoc(spec, { sections: [{ id: "p1", passage: "", example: { prompt: "EXAMPLE LINE", options: ["lava", "snow", "ice"], answer: "lava" }, items: [0, 1, 2].map((i) => ({ prompt: `Sentence ${i} ____`, options: ["lava", "snow", "ice"], answer: "lava" })) }] }, { levelId: "B_SENIOR", meta: {} });
  again.sections[0].showExample = true;
  assert.equal(reviseSection(again, spec, "p1", (raw) => { raw.items[0].prompt = "Sentence 0 changed ____"; }), true);
  assert.equal(again.sections[0].showExample, true, "an edited part keeps its example switch");
});

test("page flow: a test part may continue on the next page; what belongs together stays together", () => {
  assert.match(STUDIO_PRINT_CSS, /\.studio-sheet \.ex-block, \.studio-sheet \.key-block \{ break-inside: auto/);
  for (const sel of [".st-passage", ".word-bank", ".match-defs", ".st-example"]) assert.ok(STUDIO_PRINT_CSS.includes(`.studio-sheet ${sel}`), sel);
  assert.match(STUDIO_PRINT_CSS, /\.studio-sheet \.ex-head[^{]*\{ break-after: avoid/);
});

test("worksheets take the text size too (screen, print and Word)", async () => {
  const fs = await import("node:fs");
  const { renderLingoLauncher, renderDictation } = await import("../desktop/renderer/app.js");
  const fx = JSON.parse(fs.readFileSync(new URL("../desktop/smoke-fixture.json", import.meta.url), "utf8"));
  assert.match(renderLingoLauncher(fx.data, { textSize: "large" }), /class="worksheet lingo-sheet density-standard text-large"/);
  assert.match(renderDictation({ ...fx.data, meta: { ...fx.data.meta, textSize: "small" } }, {}), /text-small/);
});

test("header switches: every line can be turned off — on worksheets, tests and in Word", async () => {
  const fs = await import("node:fs");
  const { renderLingoLauncher } = await import("../desktop/renderer/app.js");
  const { headerOptions, HEADER_DEFAULTS } = await import("../desktop/renderer/studio/paper-header.js");
  const fx = JSON.parse(fs.readFileSync(new URL("../desktop/smoke-fixture.json", import.meta.url), "utf8"));
  const ws = (header) => renderLingoLauncher(fx.data, { layout: { schoolName: "Frontistirio Iris", header, lingo: { studentHeader: true } } });
  const full = ws({});
  assert.match(full, /Frontistirio Iris/);
  assert.match(full, /class="ws-book"/);
  assert.match(full, /<b>Date<\/b>/);
  const bare = ws({ school: false, book: false, unit: false, unitTitle: false, pages: false, class: false, date: false, classLine: false, extra: true, extraText: "Spring test · Ms V." });
  assert.doesNotMatch(bare, /Frontistirio Iris/);
  assert.doesNotMatch(bare, /class="ws-band-meta"/, "no empty right column");
  assert.doesNotMatch(bare, /<b>Date<\/b>/);
  assert.match(bare, /<b>Name<\/b>/);
  assert.match(bare, /Spring test · Ms V\./);
  assert.doesNotMatch(ws({ name: false, classLine: false, date: false, score: false }), /ws-student/, "all four off: no box");
  assert.equal(headerOptions({ studentHeader: false }).name, false, "the old Name & score switch still hides the box");
  assert.equal(HEADER_DEFAULTS.extra, false);

  // Tests: time, points and version follow their switches; the score box shows the total.
  const doc = docWith("V-MC", { header: { minutes: false } });
  doc.meta.minutes = 25; doc.meta.version = "A"; doc.meta.subtitle = "Unit 4";
  const html = renderStudentPaper(doc);
  assert.doesNotMatch(html, /25 min/);
  assert.match(html, /Version A/);
  assert.match(html, /3 points/);
  assert.match(html, /class="ws-total">3</);
  assert.doesNotMatch(renderStudentPaper({ ...doc, meta: { ...doc.meta, layout: { header: { points: false, version: false, title: false } } } }), /Version A|3 points|ws-title/);
  // Word: the same switches.
  const withAll = await buildStudioDocx({ doc: { ...doc, meta: { ...doc.meta, layout: {} } }, which: "student" });
  const without = await buildStudioDocx({ doc: { ...doc, meta: { ...doc.meta, layout: { header: { title: false, kind: false, points: false, version: false, minutes: false, name: false, classLine: false, date: false, score: false } } } }, which: "student" });
  assert.ok(without.size < withAll.size);
});

test("a unit test shows its book and unit once (on the right), and an old saved one is moved to match", async () => {
  const { relabelDoc } = await import("../desktop/renderer/studio/doc-model.js");
  const part = { ...makePart("vocabulary", "V-MC", "B_SENIOR"), id: "p1", items: 1 };
  const spec = { ...testDefaults("B_SENIOR"), source: { kind: "unit", bookId: "CPP2", units: [4] }, parts: [part] };
  const raw = { sections: [{ id: "p1", passage: "", example: null, items: [{ prompt: "The ____ is hot.", options: ["lava", "snow", "ice"], answer: "lava" }] }] };
  const doc = buildTestDoc(spec, raw, { levelId: "B_SENIOR", meta: { label: "Primary Path 2 · Unit 4", bookTitle: "Cambridge Primary Path 2", unit: 4 } });
  assert.equal(doc.meta.subtitle, "");
  assert.equal(doc.meta.label, "Primary Path 2 · Unit 4");
  const html = renderStudentPaper(doc);
  assert.doesNotMatch(html, /ws-kind">Primary Path/, "not under the title");
  assert.match(html, /class="ws-book">Cambridge Primary Path 2/);
  const saved = JSON.parse(JSON.stringify({ ...doc, meta: { ...doc.meta, label: "", subtitle: "Primary Path 2 · Unit 4" } }));
  relabelDoc(saved);
  assert.equal(saved.meta.subtitle, "", "an old saved test: the line under the title goes");
  assert.equal(saved.meta.label, "Primary Path 2 · Unit 4");
  const own = JSON.parse(JSON.stringify({ ...doc, meta: { ...doc.meta, label: "", subtitle: "Spring test · Ms V." } }));
  relabelDoc(own);
  assert.equal(own.meta.subtitle, "Spring test · Ms V.", "a subtitle the teacher wrote stays");
});
