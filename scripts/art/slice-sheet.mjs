#!/usr/bin/env node
/* Cuts picture sheets (3 × 2 grid, 1536 × 1024) into single pictures.
   Input:  art-brief/pictures/sheets-incoming/<sheet id>.png   (ids and cell order: art-brief/pictures/sheets.json)
   Output: art-brief/pictures/incoming/<job file>.png           (1024 × 1024, transparent, item centred)
   How: the drawn shapes are found (transparent background, or flat #FF00FF magenta), nearby parts are merged
   (a singer and her music notes, two apples), and each shape goes to the cell its centre lies in — so items
   that drift a little are still cut correctly. A cell is FLAGGED (→ redraw it as a single image) when it is
   empty, spills far into a neighbouring cell, or touches another cell's item. Flags: sheets-flagged.json.
   Processed sheets move to sheets-done/.
   Usage: node scripts/art/slice-sheet.mjs            (all sheets in sheets-incoming/)
          node scripts/art/slice-sheet.mjs <sheet id> [--force]   (--force overwrites existing pictures) */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT } from "../lib/env.mjs";

const DIR = path.join(ROOT, "art-brief", "pictures");
const IN = path.join(DIR, "sheets-incoming");
const DONE = path.join(DIR, "sheets-done");
const OUT = path.join(DIR, "incoming");
const FLAGS = path.join(DIR, "sheets-flagged.json");
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const wanted = args.filter((a) => !a.startsWith("--"));
const { grid, sheets } = JSON.parse(fs.readFileSync(path.join(DIR, "sheets.json"), "utf8"));
const byId = new Map(sheets.map((s) => [s.id, s]));
const W = grid.width;
const H = grid.height;
const C = grid.cell;
const F = 4;              // analysis downsampling
const MW = W / F;
const MH = H / F;
const DILATE = 4;         // ×F px: parts closer than ~16 px belong together
const MIN_AREA = 0.004 * (C / F) * (C / F); // ignore specks
const SPILL = 0.14 * C;   // how far an item may cross its cell edge

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DONE, { recursive: true });
let flags = fs.existsSync(FLAGS) ? JSON.parse(fs.readFileSync(FLAGS, "utf8")) : [];

function readRGBA(file) {
  const head = fs.readFileSync(file).subarray(0, 64);
  const alpha = head[25] === 6 || head[25] === 4 || fs.readFileSync(file).includes(Buffer.from("tRNS"));
  const raw = execFileSync(ffmpegPath, ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: W * H * 4 + 1024 });
  if (!alpha) {
    // Flat magenta background → transparent (with a soft edge for anti-aliased borders).
    for (let i = 0; i < raw.length; i += 4) {
      const d = Math.abs(raw[i] - 255) + raw[i + 1] + Math.abs(raw[i + 2] - 255);
      if (d < 120) raw[i + 3] = 0;
      else if (d < 200) raw[i + 3] = Math.min(raw[i + 3], Math.round(((d - 120) / 80) * 255));
    }
  }
  return raw;
}

function slice(sheet, file) {
  const raw = readRGBA(file);
  // 1. Coarse mask of drawn pixels.
  const mask = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let n = 0;
    for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) if (raw[(((y * F + dy) * W) + x * F + dx) * 4 + 3] > 40) n++;
    mask[y * MW + x] = n >= 3 ? 1 : 0;
  }
  // 2. Dilate so the parts of one item join up.
  const dil = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!mask[y * MW + x]) continue;
    for (let dy = -DILATE; dy <= DILATE; dy++) for (let dx = -DILATE; dx <= DILATE; dx++) {
      const yy = y + dy; const xx = x + dx;
      if (yy >= 0 && yy < MH && xx >= 0 && xx < MW) dil[yy * MW + xx] = 1;
    }
  }
  // 3. Connected shapes.
  const label = new Int32Array(MW * MH).fill(-1);
  const comps = [];
  for (let start = 0; start < MW * MH; start++) {
    if (!dil[start] || label[start] >= 0) continue;
    const id = comps.length;
    const c = { id, area: 0, sx: 0, sy: 0, x0: MW, y0: MH, x1: -1, y1: -1 };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % MW; const y = (p / MW) | 0;
      if (mask[p]) { c.area++; c.sx += x; c.sy += y; if (x < c.x0) c.x0 = x; if (y < c.y0) c.y0 = y; if (x > c.x1) c.x1 = x; if (y > c.y1) c.y1 = y; }
      for (const q of [p - 1, p + 1, p - MW, p + MW]) {
        if (q < 0 || q >= MW * MH || label[q] >= 0 || !dil[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === MW - 1)) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    comps.push(c);
  }
  const big = comps.filter((c) => c.area >= MIN_AREA);
  // 4. Assign shapes to cells by centre.
  const cellOf = (c) => {
    const cx = (c.sx / c.area) * F; const cy = (c.sy / c.area) * F;
    return Math.min(grid.rows - 1, Math.floor(cy / C)) * grid.cols + Math.min(grid.cols - 1, Math.floor(cx / C)) + 1;
  };
  const groups = new Map();
  for (const c of big) { const k = cellOf(c); groups.set(k, [...(groups.get(k) || []), c]); }
  const boxOf = (cs) => ({ x0: Math.min(...cs.map((c) => c.x0)) * F, y0: Math.min(...cs.map((c) => c.y0)) * F, x1: (Math.max(...cs.map((c) => c.x1)) + 1) * F, y1: (Math.max(...cs.map((c) => c.y1)) + 1) * F });
  const boxes = new Map([...groups.entries()].map(([k, cs]) => [k, boxOf(cs)]));
  const results = [];
  for (const cell of sheet.cells) {
    const cs = groups.get(cell.cell);
    const col = (cell.cell - 1) % grid.cols; const row = Math.floor((cell.cell - 1) / grid.cols);
    const cb = { x0: col * C, y0: row * C, x1: (col + 1) * C, y1: (row + 1) * C };
    if (!cs) { results.push({ ...cell, flag: "empty cell (nothing drawn there)" }); continue; }
    const b = boxes.get(cell.cell);
    const spill = Math.max(cb.x0 - b.x0, cb.y0 - b.y0, b.x1 - cb.x1, b.y1 - cb.y1);
    if (spill > SPILL) { results.push({ ...cell, flag: `spills ${Math.round(spill)} px into a neighbouring cell` }); continue; }
    const touching = [...boxes.entries()].find(([k, o]) => k !== cell.cell && !(o.x1 + 8 < b.x0 || o.x0 > b.x1 + 8 || o.y1 + 8 < b.y0 || o.y0 > b.y1 + 8));
    if (touching) { results.push({ ...cell, flag: `touches the item in cell ${touching[0]}` }); continue; }
    // 5. Extract only this cell's shapes (neighbour fragments inside the box are left out).
    const ids = new Set(cs.map((c) => c.id));
    const pad = 6;
    const x0 = Math.max(0, b.x0 - pad); const y0 = Math.max(0, b.y0 - pad);
    const x1 = Math.min(W, b.x1 + pad); const y1 = Math.min(H, b.y1 + pad);
    const w = x1 - x0; const h = y1 - y0;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = x0 + x; const gy = y0 + y;
      const o = (y * w + x) * 4; const i = (gy * W + gx) * 4;
      const mine = ids.has(label[((gy / F) | 0) * MW + ((gx / F) | 0)]);
      buf[o] = raw[i]; buf[o + 1] = raw[i + 1]; buf[o + 2] = raw[i + 2]; buf[o + 3] = mine ? raw[i + 3] : 0;
    }
    const target = path.join(OUT, cell.file);
    if (fs.existsSync(target) && !FORCE) { results.push({ ...cell, kept: true }); continue; }
    // Centre on a square canvas with a 6% margin, then 1024 × 1024.
    const side = Math.ceil(Math.max(w, h) / 0.88);
    execFileSync(ffmpegPath, ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", "-",
      "-vf", `pad=${side}:${side}:(ow-iw)/2:(oh-ih)/2:color=black@0,scale=1024:1024:flags=lanczos`, "-frames:v", "1", "-pix_fmt", "rgba", target], { input: buf });
    results.push({ ...cell, ok: true });
  }
  const stray = [...groups.keys()].filter((k) => !sheet.cells.some((c) => c.cell === k));
  return { results, stray };
}

const files = fs.existsSync(IN) ? fs.readdirSync(IN).filter((f) => f.endsWith(".png")) : [];
const todo = files.filter((f) => !wanted.length || wanted.includes(path.basename(f, ".png")));
if (!todo.length) { console.log(`No sheets to slice in ${path.relative(ROOT, IN)}.`); process.exit(0); }
let ok = 0; let flagged = 0; let kept = 0;
for (const f of todo) {
  const id = path.basename(f, ".png");
  const sheet = byId.get(id);
  if (!sheet) { console.log(`? ${f}: not a sheet id from sheets.json — skipped`); continue; }
  const { results, stray } = slice(sheet, path.join(IN, f));
  flags = flags.filter((x) => x.sheet !== id);
  for (const r of results) {
    if (r.flag) { flags.push({ sheet: id, cell: r.cell, id: r.id, file: r.file, reason: r.flag }); flagged++; }
    else if (r.kept) kept++;
    else ok++;
  }
  fs.renameSync(path.join(IN, f), path.join(DONE, f));
  const bad = results.filter((r) => r.flag);
  console.log(`${id}: ${results.length - bad.length}/${results.length} cut${bad.length ? ` · redraw singly: ${bad.map((r) => `${r.file} (${r.flag})`).join("; ")}` : ""}${stray.length ? ` · extra drawing in unused cell(s) ${stray.join(", ")} ignored` : ""}`);
}
fs.writeFileSync(FLAGS, JSON.stringify(flags, null, 1) + "\n");
console.log(`Done: ${ok} cut · ${kept} already existed (kept) · ${flagged} flagged → redraw those as single images (list: ${path.relative(ROOT, FLAGS)})`);
