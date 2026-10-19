/* Try the studio prompts (unit test, dictation, assistant) on a real model, through the spend ledger.
 * It builds the exact prompts the app sends, calls Gemini Flash-Lite once each, and runs the app's own
 * parsers on the replies, printing any problems. About $0.01 per run.
 *   node scripts/studio/try-studio.mjs --dry-run      (prompts and estimate only)
 *   node scripts/studio/try-studio.mjs [--only test|dictation|assistant] [--level B_SENIOR] [--book CPP2 --unit 4]
 * Results are written to work/studio/ (gitignored). */
import fs from "node:fs";
import path from "node:path";
import { requireEnv, ROOT } from "../lib/env.mjs";
import { createLedger, geminiCost } from "../lib/ledger.mjs";
import { getProfilePromptBlock } from "../../desktop/renderer/app.js";
import { buildUnitContext, unitWords } from "../../desktop/renderer/studio/unit-context.js";
import { testDefaults, testPrompt, buildTestDoc } from "../../desktop/renderer/studio/test-builder.js";
import { docProblems } from "../../desktop/renderer/studio/doc-model.js";
import { dictationDefaults, dictationPrompt, buildDictationDoc } from "../../desktop/renderer/studio/dictation.js";
import { assistantPrompt, mergeAiPlan, completePlan, planSummary } from "../../desktop/renderer/studio/assistant.js";

const MODEL = "gemini-2.5-flash-lite";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const dry = args.includes("--dry-run");
const only = opt("only", "");
const level = opt("level", "B_SENIOR");
const bookId = opt("book", "CPP2");
const unit = Number(opt("unit", 4));
const outDir = path.join(ROOT, "work", "studio");
const ledger = createLedger();

async function gemini(system, user, job) {
  const estimate = geminiCost(MODEL, { inTok: Math.ceil((system.length + user.length) / 3.5), outTok: 8000 });
  ledger.assertCanSpend("gemini", estimate, job);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": requireEnv("GEMINI_API_KEY") },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.35, maxOutputTokens: 16000 } }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${json.error?.message || ""}`);
  const u = json.usageMetadata || {};
  const inTok = u.promptTokenCount || 0;
  const outTok = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  const usd = geminiCost(MODEL, { inTok, outTok });
  ledger.record({ provider: "gemini", model: MODEL, inTok, outTok, usd, job });
  const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  console.log(`  ${job}: ${inTok} in / ${outTok} out tokens, $${usd.toFixed(4)}`);
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

const loadLesson = async (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "renderer", "lessons", p), "utf8")); } catch { return null; } };
fs.mkdirSync(outDir, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2));

if (!only || only === "test") {
  const spec = { ...testDefaults(level, "full"), source: { kind: "unit", bookId, units: [unit] } };
  const ctx = await buildUnitContext({ bookId, units: [unit], sections: ["BQ", "A", "B"] }, { loadLesson });
  const focus = unitWords(bookId, unit, ["A", "B"]).filter((w) => ctx.units[0].lessons.some((l) => l.keyWords.includes(w.english))).slice(0, 20);
  const pictureWords = focus.filter((w) => /^n/.test(w.type)).slice(0, 10).map((w) => w.english); // the app sends nouns with pictures first
  const { system, user } = testPrompt(spec, { unitContext: ctx, focusWords: focus, pictureWords, profileBlock: getProfilePromptBlock(level) });
  console.log(`Unit test prompt: ${system.length + user.length} chars, ${spec.parts.length} parts.`);
  if (!dry) {
    const reply = await gemini(system, user, "studio-try: unit test");
    const doc = buildTestDoc(spec, reply, { levelId: level, focusWords: focus, meta: { bookTitle: ctx.bookTitle, unit } });
    save("test-reply.json", reply);
    save("test-doc.json", doc);
    const probs = docProblems(doc);
    console.log(`  → ${doc.sections.length} parts, ${doc.meta.points} points; ${probs.length ? `problems:\n    ${probs.join("\n    ")}` : "no problems"}`);
  }
}

if (!only || only === "dictation") {
  const spec = { ...dictationDefaults(level), style: "gapped", grammar: ["past simple"] };
  const words = unitWords(bookId, unit, ["A"]).slice(0, 12);
  const { system, user } = dictationPrompt(spec, words, { profileBlock: getProfilePromptBlock(level) });
  console.log(`Dictation prompt: ${system.length + user.length} chars.`);
  if (!dry) {
    const reply = await gemini(system, user, "studio-try: dictation");
    const doc = buildDictationDoc(spec, reply, words, { meta: { bookTitle: "Primary Path", unit } });
    save("dictation-doc.json", doc);
    const s = doc.sections[0];
    console.log(`  → ${s.sentences.length} sentences; ${s.problems.length ? `problems: ${s.problems.join("; ")}` : "no problems"}`);
    s.sentences.forEach((x) => console.log(`    ${x.n}. ${x.gapped}   [${x.answers.join(", ")}]`));
  }
}

if (!only || only === "assistant") {
  const text = "θέλω κάτι σύντομο για τη Δ τάξη πάνω στον Present Perfect, με listening, και δύο εκδοχές";
  const { system, user } = assistantPrompt(text, { bookId, unit, level });
  if (!dry) {
    const ai = await gemini(system, user, "studio-try: assistant");
    const plan = completePlan(mergeAiPlan({}, ai), { bookId, unit, level });
    console.log(`  → ${planSummary(plan)}\n    reply: ${ai.reply || ""}`);
  }
}
console.log(`Gemini spend left: $${ledger.remaining("gemini").toFixed(3)}`);
