/* Try the Test Maker's writing parts on a real model, through the spend ledger: one test with every writing task
 * (each support level), rendered as the student paper, so the printed frames, starters and pictures can be checked.
 *   node scripts/studio/try-writing-parts.mjs [--level B_SENIOR] [--book CPP2 --unit 1] [--reply work/studio/writing-reply.json]
 * --reply reuses a saved reply (no AI call). Results are written to work/studio/ (gitignored). About $0.005 a run. */
import fs from "node:fs";
import path from "node:path";
import { requireEnv, ROOT } from "../lib/env.mjs";
import { createLedger, deepseekCost } from "../lib/ledger.mjs";

// The renderer loads its picture list with fetch(); serve it from disk.
const RENDERER = path.join(ROOT, "desktop", "renderer");
globalThis.fetch = ((real) => async (url, init) => {
  if (typeof url === "string" && url.startsWith("./")) {
    const file = path.join(RENDERER, url.slice(2));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response("", { status: 404 });
  }
  return real(url, init);
})(globalThis.fetch);

const { initPics } = await import("../../desktop/renderer/js/pics.js");
const { makePicFor } = await import("../../desktop/renderer/js/views/studio-common.js").catch(() => ({}));
const { picForWord } = await import("../../desktop/renderer/js/pics.js");
const { getProfilePromptBlock } = await import("../../desktop/renderer/app.js");
const { buildUnitContext, unitWords } = await import("../../desktop/renderer/studio/unit-context.js");
const { testDefaults, testPrompt, buildTestDoc, makePart } = await import("../../desktop/renderer/studio/test-builder.js");
const { renderStudentPaper } = await import("../../desktop/renderer/studio/doc-render.js");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const level = opt("level", "B_SENIOR");
const bookId = opt("book", "CPP2");
const unit = Number(opt("unit", 1));
const MODEL = "deepseek-chat";
const outDir = path.join(ROOT, "work", "studio");
fs.mkdirSync(outDir, { recursive: true });

await initPics();
const focus = unitWords(bookId, unit, ["BQ", "A", "B"]).slice(0, 30);
const types = new Map(focus.map((w) => [w.english.toLowerCase(), w.type]));
const picFor = makePicFor ? makePicFor(focus) : (w) => picForWord(w, types.get(String(w).toLowerCase()));
const pictureWords = focus.filter((w) => picFor(w.english)).map((w) => w.english).slice(0, 16);
const loadLesson = async (p) => { try { return JSON.parse(fs.readFileSync(path.join(RENDERER, "lessons", p), "utf8")); } catch { return null; } };
const unitContext = await buildUnitContext({ bookId, units: [unit], sections: ["BQ", "A", "B"] }, { loadLesson });

const spec = { ...testDefaults(level, "standard"), source: { kind: "unit", bookId, units: [unit] }, pictures: true };
const tasks = [["W-SENT", "full"], ["W-SENT", "none"], ["W-PICTURES", "full"], ["W-PICTURES", "some"], ["W-GUIDED", "full"], ["W-EMAIL", "some"], ["W-STORY", "some"], ["W-OPINION", "full"], ["W-MESSAGE", "some"]];
spec.parts = tasks.map(([task, support]) => ({ ...makePart("writing", task, level), opts: { support } }));

let reply;
const replyFile = opt("reply", "");
if (replyFile) reply = JSON.parse(fs.readFileSync(path.resolve(replyFile), "utf8"));
else {
  const ledger = createLedger();
  const t = testPrompt(spec, { unitContext, focusWords: focus, pictureWords, profileBlock: getProfilePromptBlock(level) });
  fs.writeFileSync(path.join(outDir, "writing-prompt.txt"), `${t.system}\n\n---\n\n${t.user}`);
  ledger.assertCanSpend("deepseek", deepseekCost(MODEL, { inTok: Math.ceil((t.system.length + t.user.length) / 3.5), outTok: 8192 }), "writing parts");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("DEEPSEEK_API_KEY")}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: t.system }, { role: "user", content: t.user }], response_format: { type: "json_object" }, temperature: 0.35, max_tokens: 8192 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${json.error?.message || ""}`);
  const inTok = json.usage?.prompt_tokens || 0;
  const outTok = json.usage?.completion_tokens || 0;
  ledger.record({ provider: "deepseek", model: MODEL, inTok, outTok, usd: deepseekCost(MODEL, { inTok, outTok }), job: "writing parts" });
  reply = JSON.parse(json.choices?.[0]?.message?.content || "{}");
  fs.writeFileSync(path.join(outDir, "writing-reply.json"), JSON.stringify(reply, null, 2));
}

const doc = buildTestDoc(spec, reply, { levelId: level, picFor, focusWords: focus, meta: { unit } });
doc.sections.forEach((s, i) => console.log(`Part ${i + 1} ${s.task} (${tasks[i][1]}): prompt=${JSON.stringify(s.task_prompt)}\n  frame=${JSON.stringify(s.frame)}\n  pictures=${JSON.stringify(s.pictures.map((p) => `${p.word}→${p.pic}`))} raw=${JSON.stringify(reply.sections?.[i]?.pictures)}\n  bank=${JSON.stringify(s.bank)}`));
fs.writeFileSync(path.join(outDir, "writing-paper.html"), renderStudentPaper(doc));
console.log(`Paper: ${path.join(outDir, "writing-paper.html")}`);
