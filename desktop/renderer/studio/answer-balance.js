/* Vocab Master — balanced answer keys (pure, DOM-free).
 * True/False, Yes/No and A/B exercises must never be all one answer, and the right option in
 * "(a / b / c)" choices must not sit in the same place on every line. Used by the worksheet
 * engine (app.js), the dictation maker and the unit test builder. */

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, "").replace(/\s+/g, " ").trim();
const same = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** Two-answer exercise types and their two answers, in the order the app prints them. */
export const BINARY_TYPES = {
  D15: ["T", "F"],
  L11: ["Yes", "No"],
  L13: ["A", "B"],
  TF: ["T", "F"],
  YN: ["Yes", "No"],
};

/** 0 / 1 for the first / second answer of a binary type, -1 when the answer is neither. */
export function binaryValue(typeId, answer) {
  const a = String(answer ?? "").trim().toLowerCase().replace(/[.!]$/, "");
  const pair = BINARY_TYPES[typeId];
  if (!pair) return -1;
  if (pair[0] === "T") return /^(t|true)$/.test(a) ? 0 : /^(f|false)$/.test(a) ? 1 : -1;
  if (pair[0] === "Yes") return /^(y|yes)$/.test(a) ? 0 : /^(n|no)$/.test(a) ? 1 : -1;
  return a === "a" ? 0 : a === "b" ? 1 : -1;
}

/** How many of the less common answer a set of n items needs (5 items → at least 2 of each). */
export function minorityNeeded(n) {
  return n < 3 ? 0 : Math.ceil(n / 4);
}

function runTooLong(arr, max) {
  let run = 1;
  for (let i = 1; i < arr.length; i++) {
    run = arr[i] === arr[i - 1] ? run + 1 : 1;
    if (run > max) return true;
  }
  return false;
}

function shuffled(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A random answer order for n items with both answers well represented (split as evenly as n allows)
 * and no answer three times in a row. values: the two answers, e.g. ["T", "F"].
 */
export function balancedPattern(values, n, rand = Math.random) {
  if (n <= 0) return [];
  const [a, b] = values;
  const big = Math.ceil(n / 2);
  const firstIsBig = rand() < 0.5;
  const base = Array.from({ length: n }, (_, i) => ((i < big) === firstIsBig ? a : b));
  for (let t = 0; t < 60; t++) {
    const p = shuffled(base, rand);
    if (!runTooLong(p, 2)) return p;
  }
  return Array.from({ length: n }, (_, i) => (i % 2 ? b : a));
}

/** Choice positions for n items with k options each, spread evenly (1-based, as told to the AI). */
export function balancedPositions(n, k = 3, rand = Math.random) {
  const base = Array.from({ length: n }, (_, i) => (i % k) + 1);
  for (let t = 0; t < 60; t++) {
    const p = shuffled(base, rand);
    if (!runTooLong(p, 2)) return p;
  }
  return base;
}

/**
 * Balance report for a binary exercise. `flip` lists item indexes (spread out, from the majority answer)
 * whose answer must change to reach a sensible mix; empty when the mix is already fine.
 */
export function binaryBalance(typeId, items = []) {
  const vals = items.map((it) => binaryValue(typeId, it?.answer));
  const counted = vals.filter((v) => v >= 0);
  const counts = [counted.filter((v) => v === 0).length, counted.filter((v) => v === 1).length];
  const n = counted.length;
  const need = minorityNeeded(n);
  const minority = counts[0] <= counts[1] ? 0 : 1;
  const missing = Math.max(0, need - counts[minority]);
  const flip = [];
  if (missing) {
    const majority = 1 - minority;
    const pool = vals.map((v, i) => (v === majority ? i : -1)).filter((i) => i >= 0);
    // Take every other majority item so the flipped ones don't bunch together.
    const step = Math.max(1, Math.floor(pool.length / missing));
    for (let i = step >> 1; i < pool.length && flip.length < missing; i += step) flip.push(pool[i]);
  }
  return { counts, n, ok: missing === 0, flip, flipTo: BINARY_TYPES[typeId]?.[minority] ?? "" };
}

const AB_PROMPT = /^\s*A[.)]\s*([\s\S]*?)\s+B[.)]\s*([\s\S]*?)\s*$/;

/** A/B items ("A. … B. …", answer A or B) — swap the two sentences of chosen items until the key is mixed. */
export function repairABItems(items = []) {
  const report = binaryBalance("L13", items);
  if (report.ok) return 0;
  let fixed = 0;
  for (const i of report.flip) {
    const it = items[i];
    const m = String(it?.prompt || "").match(AB_PROMPT);
    if (!m) continue;
    it.prompt = `A. ${m[2].trim()}  B. ${m[1].trim()}`;
    it.answer = binaryValue("L13", it.answer) === 0 ? "B" : "A";
    fixed++;
  }
  return fixed;
}

const CHOICE_GROUP = /\(([^)]*\/[^)]*)\)/g;

function choiceGroups(prompt) {
  return [...String(prompt || "").matchAll(CHOICE_GROUP)].map((m) => ({ full: m[0], index: m.index, options: m[1].split("/").map((s) => s.trim()).filter(Boolean) }));
}

/** Where the answer sits in an item's "(a / b / c)" choices: { pos, k } or null. Exact matches win over partial ones. */
export function choicePosition(prompt, answer) {
  for (const g of choiceGroups(prompt)) {
    if (g.options.length < 2) continue;
    let pos = g.options.findIndex((o) => norm(o) === norm(answer));
    if (pos < 0) pos = g.options.findIndex((o) => same(o, answer));
    if (pos >= 0) return { pos, k: g.options.length, group: g };
  }
  return null;
}

/** True when the right option is predictable: in the same place on every line, or ¾+ of lines with 4 or more. */
export function choicesPredictable(items = []) {
  const pos = items.map((it) => choicePosition(it?.prompt, it?.answer)).filter(Boolean).map((p) => p.pos);
  if (pos.length < 2) return false;
  if (pos.every((p) => p === pos[0])) return true;
  if (pos.length < 4) return false;
  const top = Math.max(...[0, 1, 2, 3, 4].map((p) => pos.filter((x) => x === p).length));
  return top / pos.length >= 0.75;
}

/**
 * Move each line's right option so positions are spread evenly across the exercise (other options keep
 * their order). Only runs when the positions are predictable, so calling it again changes nothing.
 * Returns the number of lines changed.
 */
export function rebalanceChoiceItems(items = [], rand = Math.random) {
  if (!choicesPredictable(items)) return 0;
  const idx = items.map((it, i) => (choicePosition(it?.prompt, it?.answer) ? i : -1)).filter((i) => i >= 0);
  const kMax = Math.max(...idx.map((i) => choicePosition(items[i].prompt, items[i].answer).k));
  const targets = balancedPositions(idx.length, kMax, rand);
  let changed = 0;
  idx.forEach((i, n) => {
    const it = items[i];
    const { pos, k, group } = choicePosition(it.prompt, it.answer);
    const want = (targets[n] - 1) % k;
    if (want === pos) return;
    const opts = [...group.options];
    const [ans] = opts.splice(pos, 1);
    opts.splice(want, 0, ans);
    const p = String(it.prompt);
    it.prompt = p.slice(0, group.index) + `(${opts.join(" / ")})` + p.slice(group.index + group.full.length);
    changed++;
  });
  return changed;
}

/** Plain-language summary of a key's mix, for the answer key and quality panel ("3 T · 2 F"). */
export function keyMixLabel(typeId, items = []) {
  const { counts } = binaryBalance(typeId, items);
  const [a, b] = BINARY_TYPES[typeId] || ["", ""];
  return `${counts[0]} ${a} · ${counts[1]} ${b}`;
}
