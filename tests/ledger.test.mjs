import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLedger, BudgetError, geminiCost, estimateGeminiTts } from "../scripts/lib/ledger.mjs";

function tmpLedger(caps = { gemini: 1 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
  return createLedger({ file: path.join(dir, "ledger.json"), caps, budgetDoc: path.join(dir, "BUDGET.md") });
}

test("records spend and reports what is left", () => {
  const l = tmpLedger({ gemini: 1 });
  l.record({ provider: "gemini", model: "m", usd: 0.4 });
  assert.equal(l.spent("gemini").toFixed(2), "0.40");
  assert.equal(l.remaining("gemini").toFixed(2), "0.60");
});

test("refuses a job that would cross the cap", () => {
  const l = tmpLedger({ gemini: 1 });
  l.record({ provider: "gemini", model: "m", usd: 0.9 });
  assert.throws(() => l.assertCanSpend("gemini", 0.2, "audio"), BudgetError);
  assert.doesNotThrow(() => l.assertCanSpend("gemini", 0.05));
});

test("unknown provider has no budget", () => {
  const l = tmpLedger({});
  assert.throws(() => l.assertCanSpend("mystery", 0.01), BudgetError);
});

test("gemini TTS pricing matches the table", () => {
  // 1M audio tokens on Flash batch = $4.50
  assert.equal(geminiCost("gemini-3.8-flash-tts", { outTok: 1e6, mode: "batch" }), 4.5);
  // 1 hour of Flash-Lite batch audio = 90k tokens × $3/M = $0.27
  assert.equal(estimateGeminiTts("gemini-3.8-flash-lite-tts", 3600).toFixed(2), "0.27");
});
