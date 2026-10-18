#!/usr/bin/env node
/* Progress check for the picture set (art-brief/pictures). Reads jobs.json, looks at incoming/ and done/,
   validates every PNG (1024×1024, transparent or flat-magenta background), and writes PROGRESS.md with
   counts per phase, sheet progress (sheets.json), cells the slicer flagged for a single redraw, and the next
   jobs to make. Usage: node scripts/art/check-pictures.mjs */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";

const DIR = path.join(ROOT, "art-brief", "pictures");
const { jobs } = JSON.parse(fs.readFileSync(path.join(DIR, "jobs.json"), "utf8"));
const skipped = fs.existsSync(path.join(DIR, "skipped.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "skipped.json"), "utf8")) : [];
const skipIds = new Set(skipped.map((s) => s.id));
const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => !f.startsWith(".")) : []);
const incoming = list(path.join(DIR, "incoming"));
const done = new Set(list(path.join(DIR, "done")));
const byFile = new Map(jobs.map((j) => [j.file, j]));

/** PNG header: width, height, colour type (6 = RGBA, 4 = grey+alpha); tRNS chunk also means transparency. */
function pngInfo(file) {
  const b = fs.readFileSync(file);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47) return null;
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const colorType = b[25];
  const alpha = colorType === 6 || colorType === 4 || b.includes(Buffer.from("tRNS"));
  return { width, height, alpha };
}

const problems = [];
const unknown = [];
const ok = new Set(done);
// Imported pictures count as made: the originals in done/ may be deleted once the app has its WebP copies.
const PICS = path.join(ROOT, "desktop", "renderer", "assets", "pics");
for (const j of jobs) if (fs.existsSync(path.join(PICS, `${j.id}.webp`)) || fs.existsSync(path.join(PICS, "bank", `${j.id}.webp`))) ok.add(j.file);
for (const f of incoming) {
  const job = byFile.get(f);
  if (!job) { unknown.push(f); continue; }
  const info = pngInfo(path.join(DIR, "incoming", f));
  if (!info) { problems.push(`${f}: not a PNG`); continue; }
  if (info.width !== 1024 || info.height !== 1024) problems.push(`${f}: ${info.width}×${info.height} (needs 1024×1024)`);
  if (!info.alpha) problems.push(`${f}: no transparency — fine only if the background is flat #FF00FF magenta`);
  ok.add(f);
}

const phases = [0, 1, 2, 3, 4, 5];
const rows = phases.map((p) => {
  const pj = jobs.filter((j) => j.phase === p);
  const have = pj.filter((j) => ok.has(j.file)).length;
  const skip = pj.filter((j) => skipIds.has(j.id)).length;
  return { p, total: pj.length, have, skip, missing: pj.length - have - skip };
});
const missingJobs = jobs.filter((j) => !ok.has(j.file) && !skipIds.has(j.id));

// Sheet mode: which sheets are sliced, which flagged cells still need a single redraw, what to draw next.
const sheetsFile = path.join(DIR, "sheets.json");
const sheetData = fs.existsSync(sheetsFile) ? JSON.parse(fs.readFileSync(sheetsFile, "utf8")) : { sheets: [], singles: [] };
const sliced = new Set(list(path.join(DIR, "sheets-done")).map((f) => f.replace(/.png$/, "")));
const waiting = list(path.join(DIR, "sheets-incoming")).filter((f) => f.endsWith(".png"));
const flagsFile = path.join(DIR, "sheets-flagged.json");
const redraw = (fs.existsSync(flagsFile) ? JSON.parse(fs.readFileSync(flagsFile, "utf8")) : [])
  .filter((x) => !ok.has(x.file) && !skipIds.has(x.id));
const sheetsLeft = sheetData.sheets.filter((s) => !sliced.has(s.id) && s.cells.some((c) => !ok.has(c.file) && !skipIds.has(c.id)));
const singleIds = new Set(sheetData.singles);
const singlesLeft = missingJobs.filter((j) => singleIds.has(j.id));
const total = rows.reduce((s, r) => s + r.total, 0);
const have = rows.reduce((s, r) => s + r.have, 0);

const sheetMd = [
  "## Sheets", "",
  `**${sliced.size} / ${sheetData.sheets.length}** sheets sliced · ${waiting.length} waiting in sheets-incoming/ (run \`node scripts/art/slice-sheet.mjs\`) · ${singlesLeft.length} single pictures (phase 0 + characters) missing`, "",
  ...(redraw.length ? [`## Redraw as single images (${redraw.length})`, "", "The slicer could not cut these cleanly. Draw each one alone (1024×1024) as `incoming/<file>`.", "",
    ...redraw.map((x) => `- ${x.file} (sheet ${x.sheet}, cell ${x.cell}: ${x.reason})`), ""] : []),
  "## Next sheets", "",
  ...(sheetsLeft.length ? sheetsLeft.slice(0, 10).map((s) => `- ${s.id}: ${s.cells.map((c) => `${c.cell}=${c.id}`).join(", ")}`) : ["None left."]), "", "",
].join("\n");

const md = `# Picture progress (${new Date().toISOString().slice(0, 16).replace("T", " ")})

**${have} / ${total}** pictures made · ${skipIds.size} skipped · ${missingJobs.length} missing

| phase | made | skipped | missing | total |
|---|---|---|---|---|
${rows.map((r) => `| ${r.p} | ${r.have} | ${r.skip} | ${r.missing} | ${r.total} |`).join("\n")}

${sheetMd}
${problems.length ? `## Fix these (${problems.length})\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\n` : ""}${unknown.length ? `## Unknown files in incoming/ (rename to a job's \`file\` or delete)\n\n${unknown.map((u) => `- ${u}`).join("\n")}\n\n` : ""}## Next to make

${missingJobs.slice(0, 40).map((j) => `- ${j.file} (phase ${j.phase}${j.word ? `, "${j.word}"` : j.name ? `, ${j.name}` : ""})`).join("\n") || "Nothing — the set is complete. 🎉"}
`;
fs.writeFileSync(path.join(DIR, "PROGRESS.md"), md);
console.log(`${have}/${total} made · ${missingJobs.length} missing · ${problems.length} problem(s) · ${unknown.length} unknown file(s)`);
console.log(`  sheets: ${sliced.size}/${sheetData.sheets.length} sliced · ${waiting.length} waiting · ${redraw.length} flagged cell(s) to redraw singly · ${singlesLeft.length} singles missing`);
for (const r of rows) console.log(`  phase ${r.p}: ${r.have}/${r.total}${r.skip ? ` (${r.skip} skipped)` : ""}`);
if (problems.length) console.log(problems.slice(0, 20).map((p) => `  ! ${p}`).join("\n"));
if (unknown.length) console.log(`  ? unknown: ${unknown.slice(0, 10).join(", ")}`);
process.exitCode = problems.length || unknown.length ? 1 : 0;
