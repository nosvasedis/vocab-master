/* Game results — one record per show or game (class, date, each question, who played, the words missed),
   kept on this computer and saved as a CSV the teacher opens in Excel. No student accounts: nicknames and
   team names only. The CSV and the record helpers are pure (tested in Node); saveResultsCsv needs a page. */
import { safeFileName } from "../studio/file-names.js";

const KEY = "vm_game_results_v1";
const KEEP = 40;

/**
 * @typedef {{ n: number, kind?: string, prompt?: string, answer?: string, word?: string, right: number, answered: number, of: number }} ResultQuestion
 * @typedef {{ name: string, team?: string, points: number, right?: number, answered?: number }} ResultRow
 * @typedef {{ id: string, game: string, title?: string, className?: string, date: string, mode?: string,
 *   questions?: ResultQuestion[], players?: ResultRow[], teams?: ResultRow[], missed?: string[] }} ResultRecord
 */

/** Words to review: each question's word, how often it was missed, most missed first. */
export function missedWords(rec) {
  const map = new Map();
  for (const q of rec.questions || []) {
    if (!q.word) continue;
    const m = map.get(q.word) || { word: q.word, missed: 0, asked: 0 };
    m.missed += Math.max(0, (q.of || 0) - (q.right || 0));
    m.asked += q.of || 0;
    map.set(q.word, m);
  }
  for (const w of rec.missed || []) {
    const m = map.get(w) || { word: w, missed: 0, asked: 0 };
    m.missed++;
    map.set(w, m);
  }
  return [...map.values()].filter((m) => m.missed > 0).sort((a, b) => b.missed - a.missed || a.word.localeCompare(b.word));
}

/** One CSV cell. Text a spreadsheet would run as a formula (a nickname like "=1+1") is kept as text. */
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells) => cells.map(csvCell).join(",");
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "");

/** The whole record as CSV: a heading block, the questions, the players / teams, the words to review. */
export function resultsCsv(rec) {
  const lines = [];
  const d = new Date(rec.date);
  const when = Number.isNaN(d.getTime()) ? rec.date : `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  lines.push(row([`${rec.game} results`]));
  if (rec.className) lines.push(row(["Class", rec.className]));
  lines.push(row(["Date", when]));
  if (rec.title) lines.push(row(["Words", rec.title]));
  if (rec.mode) lines.push(row(["Played", rec.mode]));
  const qs = rec.questions || [];
  if (qs.length) {
    const asked = qs.reduce((s, q) => s + (q.of || 0), 0);
    const right = qs.reduce((s, q) => s + (q.right || 0), 0);
    lines.push(row(["Right overall", pct(right, asked)]));
    lines.push("");
    lines.push(row(["Question", "Type", "Question text", "Answer", "Word", "Right", "Answered", "Out of", "% right"]));
    for (const q of qs) lines.push(row([q.n, q.kind || "", q.prompt || "", q.answer || "", q.word || "", q.right, q.answered, q.of, pct(q.right, q.of)]));
  }
  const people = rec.players || [];
  if (people.length) {
    const hasTeam = people.some((p) => p.team);
    lines.push("");
    lines.push(row(["Rank", "Player", ...(hasTeam ? ["Team"] : []), "Points", "Right", "Answered", ...(qs.length ? ["Out of"] : [])]));
    [...people].sort((a, b) => b.points - a.points).forEach((p, i) => lines.push(row([i + 1, p.name, ...(hasTeam ? [p.team || ""] : []), p.points, p.right ?? "", p.answered ?? "", ...(qs.length ? [qs.length] : [])])));
  }
  const teams = rec.teams || [];
  if (teams.length) {
    lines.push("");
    lines.push(row(["Rank", "Team", "Points", ...(teams.some((t) => t.right != null) ? ["Questions right"] : [])]));
    [...teams].sort((a, b) => b.points - a.points).forEach((t, i) => lines.push(row([i + 1, t.name, t.points, ...(t.right != null ? [t.right] : [])])));
  }
  const miss = missedWords(rec);
  lines.push("");
  lines.push(row(["Words to review", "Times missed", ...(miss.some((m) => m.asked) ? ["Times asked"] : [])]));
  if (miss.length) miss.forEach((m) => lines.push(row([m.word, m.missed, ...(m.asked ? [m.asked] : [])])));
  else lines.push(row(["(none — every word was answered right)"]));
  // A byte-order mark so Excel reads Greek and accents as UTF-8; Windows line ends.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "Lingo Live, B Senior, 2026-10-21 10-30.csv" */
export function resultsFileName(rec) {
  const d = new Date(rec.date);
  const stamp = Number.isNaN(d.getTime()) ? "" : `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}-${String(d.getMinutes()).padStart(2, "0")}`;
  return `${safeFileName([rec.game, rec.className, stamp].filter(Boolean).join(", "))}.csv`;
}

/** A new record with an id and today's date. */
export function newRecord(fields) {
  const date = fields.date || new Date().toISOString();
  return { id: `r${Date.parse(date).toString(36)}${Math.random().toString(36).slice(2, 6)}`, date, ...fields };
}

/** Keep a record on this computer (newest first, the last 40; a record kept again replaces itself). */
export function keepResults(rec, storage = globalThis.localStorage) {
  const list = listResults(storage).filter((r) => r.id !== rec.id);
  list.unshift(rec);
  try { storage?.setItem(KEY, JSON.stringify(list.slice(0, KEEP))); } catch { /* storage full or unavailable */ }
  return list.slice(0, KEEP);
}

export function listResults(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((r) => r && r.id && r.game) : [];
  } catch { return []; }
}

/** Save the record as a CSV file (the desktop app shows its Save window; a browser downloads it). */
export function saveResultsCsv(rec) {
  const blob = new Blob([resultsCsv(rec)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = resultsFileName(rec);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
