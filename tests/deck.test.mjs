import { test } from "node:test";
import assert from "node:assert/strict";
import { firstEmoji } from "../desktop/renderer/arcade/deck.js";

test("firstEmoji splits on whitespace, not on the letter s", () => {
  assert.equal(firstEmoji("🐶 🐱"), "🐶");
  assert.equal(firstEmoji("  👨‍👩‍👧‍👦  🏠 "), "👨‍👩‍👧‍👦");
  assert.equal(firstEmoji("sss"), "sss");
  assert.equal(firstEmoji(""), "");
  assert.equal(firstEmoji(null), "");
});
