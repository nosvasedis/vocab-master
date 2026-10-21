/* Saved files are named "<Product>, <book>, Unit <n>, pp. <pages>", and the pages stay importable by the
 * desktop shell from a live-updated copy (Electron's Node needs "type": "module" next to app.js). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { productFileName, bookShortName, pagesLabel, safeFileName } from "../desktop/renderer/studio/file-names.js";

test("products are named Product, CPPn, Unit n, pp. pages", () => {
  const meta = { bookTitle: "Cambridge Primary Path 1", unit: 5, pageRange: "40-41" };
  assert.equal(productFileName("Dictation", meta), "Dictation, CPP1, Unit 5, pp. 40-41");
  assert.equal(productFileName("Lingo Launcher", meta), "Lingo Launcher, CPP1, Unit 5, pp. 40-41");
  assert.equal(productFileName("Test", { bookTitle: "Cambridge Primary Paths 2", unit: "4" }), "Test, CPP2, Unit 4");
  assert.equal(productFileName("Answer Key", { ...meta, pageRange: "" }), "Answer Key, CPP1, Unit 5");
  assert.equal(productFileName("Test", { title: "Animals and food" }), "Test, Animals and food", "a topic test keeps its title");
  assert.equal(productFileName("", meta), "CPP1, Unit 5, pp. 40-41");
});

test("books and pages", () => {
  assert.equal(bookShortName("Primary Path 3"), "CPP3");
  assert.equal(bookShortName("Super Minds 2"), "Super Minds 2");
  assert.equal(pagesLabel("40–41"), "pp. 40-41");
  assert.equal(pagesLabel("p. 40"), "p. 40");
  assert.equal(pagesLabel(""), "");
  assert.equal(safeFileName("Test: B/C?"), "Test- B-C-");
});

test("the pages are ES modules for the shell (renderer/package.json)", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../desktop/renderer/package.json", import.meta.url), "utf8"));
  assert.equal(pkg.type, "module");
});

test("a dictation track is timed like the live reading", async () => {
  const { dictationTrack, dictationPause, RATE } = await import("../desktop/renderer/studio/audio-track.js");
  assert.equal(dictationPause({ text: "The cat is on the bed.", slow: false }), 1.2);
  assert.equal(dictationPause({ text: "The cat is on the bed.", slow: true }), 0.9 + 6 * 0.65);
  const clip = new Float32Array(RATE).fill(0.1); // 1 s
  const segs = [{ text: "The cat sat.", slow: false }, { text: "The cat sat.", slow: true }];
  const t = dictationTrack(segs, [clip, clip]);
  assert.ok(Math.abs(t.seconds - (0.6 + 1 + 1.2 + 1 + 0.9 + 3 * 0.65)) < 1e-9);
  assert.equal(t.samples.length, Math.ceil(t.seconds * RATE));
});
