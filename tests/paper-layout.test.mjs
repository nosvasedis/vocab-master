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
