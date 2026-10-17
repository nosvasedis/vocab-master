import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createVoiceIndex } from "../desktop/renderer/arcade/voice-index.js";

const MANIFEST = path.join(import.meta.dirname, "..", "desktop", "renderer", "assets", "audio", "manifest.json");

test("voice index looks up keys and normalised text", () => {
  const idx = createVoiceIndex({ entries: { "w:1": { f: "ab/x.ogg", d: 0.8 } }, text: { family: "w:1" } });
  assert.equal(idx.has("w:1"), true);
  assert.equal(idx.has("w:2"), false);
  assert.equal(idx.keyForText("  Family! "), "w:1");
  assert.equal(idx.keyForText("families"), null);
});

test("empty manifest is safe", () => {
  const idx = createVoiceIndex(null);
  assert.equal(idx.size, 0);
  assert.equal(idx.keyForText("anything"), null);
});

test("every manifest entry points at a clip on disk (when audio is built)", (t) => {
  if (!fs.existsSync(MANIFEST)) return t.skip("no audio built yet");
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const dir = path.dirname(MANIFEST);
  const missing = Object.entries(m.entries).filter(([, e]) => !fs.existsSync(path.join(dir, e.f)));
  if (missing.length && !fs.existsSync(path.join(dir, Object.values(m.entries)[0]?.f || "x"))) return t.skip("clips not present in this checkout (gitignored)");
  assert.deepEqual(missing.slice(0, 5), []);
});
