/* Vocab Master — class memory (pure): what a class has already met, from the Library.
 *
 * Every saved worksheet unit (Lingo Launcher), read-aloud dictation and unit test is an "encounter" with its words.
 * From those, per class: when each word was first and last met, how often, and when it was last tested. The
 * review suggestion is spaced repetition in the Leitner style: after each encounter the gap before the next review
 * doubles (1 week, 2, 4, 8…), so a word met once three weeks ago is "due" and one met four times last week is not.
 * Words never tested come first, and words the current test already uses are left out.
 *
 * It only reads what the teacher saved; it runs only when the teacher has turned it on. */

const DAY = 86400000;
const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const when = (d) => { const t = new Date(d || 0).getTime(); return Number.isFinite(t) ? t : 0; };

/**
 * units: saved worksheet sessions ({ profileId, savedAt, label, data.lingoLauncher.vocabulary })
 * docs: saved tests and dictations ({ kind, meta.classProfile, savedAt, focusWords })
 * Returns { levelId, words: Map(key → { english, greek, met, firstAt, lastAt, testedAt, sources: [{ type, title, at }] }), items: n }
 */
export function buildClassMemory({ units = [], docs = [], levelId = "" } = {}) {
  const words = new Map();
  let items = 0;
  const add = (w, type, title, at) => {
    const english = String(w?.english || "").trim();
    if (!english || english.length > 40) return;
    const k = key(english);
    const e = words.get(k) || { english, greek: "", met: 0, firstAt: at, lastAt: 0, testedAt: 0, sources: [] };
    e.greek ||= String(w.greek || "").trim();
    e.met += 1;
    e.firstAt = Math.min(e.firstAt || at, at);
    e.lastAt = Math.max(e.lastAt, at);
    if (type === "test") e.testedAt = Math.max(e.testedAt, at);
    if (e.sources.length < 6) e.sources.push({ type, title, at });
    words.set(k, e);
  };
  for (const s of units) {
    if (levelId && s?.profileId !== levelId) continue;
    const at = when(s.savedAt);
    const list = s?.data?.lingoLauncher?.vocabulary || [];
    if (!list.length) continue;
    items++;
    const seen = new Set();
    list.forEach((w) => { if (!seen.has(key(w.english))) { seen.add(key(w.english)); add(w, "unit", s.label || "Worksheets", at); } });
  }
  for (const d of docs) {
    if (!d || (d.kind !== "test" && d.kind !== "dictation")) continue;
    if (levelId && d.meta?.classProfile !== levelId) continue;
    const at = when(d.savedAt || d.createdAt);
    const list = d.focusWords || [];
    if (!list.length) continue;
    items++;
    const seen = new Set();
    list.forEach((w) => { if (!seen.has(key(w.english))) { seen.add(key(w.english)); add(w, d.kind, d.meta?.title || (d.kind === "test" ? "Test" : "Dictation"), at); } });
  }
  return { levelId, words, items };
}

/** Days until a word is due again after `met` encounters: 7, 14, 28, 56 (capped at 8 weeks). */
export const reviewGap = (met) => 7 * 2 ** Math.min(3, Math.max(0, met - 1));

/**
 * Words worth bringing back now, most due first: [{ english, greek, met, lastAt, testedAt, due, why }].
 * exclude: words the new test or dictation already uses. n: how many.
 */
export function reviewWords(memory, { exclude = [], n = 8, now = Date.now() } = {}) {
  const skip = new Set(exclude.map((w) => key(w?.english ?? w)));
  const out = [];
  for (const [k, e] of memory?.words || []) {
    if (skip.has(k)) continue;
    const days = (now - e.lastAt) / DAY;
    const due = days / reviewGap(e.met);
    if (due < 1) continue;
    // Never tested comes first; then the most overdue; a word tested since it was last met waits a little longer.
    const score = due + (e.testedAt ? 0 : 1.5) - (e.testedAt && e.testedAt >= e.lastAt ? 0.5 : 0);
    out.push({ english: e.english, greek: e.greek, met: e.met, lastAt: e.lastAt, testedAt: e.testedAt, due: score, why: whyLine(e, days) });
  }
  return out.sort((a, b) => b.due - a.due || a.english.localeCompare(b.english)).slice(0, n);
}

const ago = (days) => (days < 1.5 ? "yesterday" : days < 13 ? `${Math.round(days)} days ago` : days < 60 ? `${Math.round(days / 7)} weeks ago` : `${Math.round(days / 30)} months ago`);
function whyLine(e, days) {
  const src = e.sources[e.sources.length - 1];
  return `Met ${e.met === 1 ? "once" : `${e.met} times`}, last ${ago(days)}${src ? ` (${src.title})` : ""}${e.testedAt ? "" : " · not tested yet"}`;
}

/** One short paragraph for an AI prompt: what this class has studied, what is due. Empty when nothing is known. */
export function memoryBrief(memory, review = [], { now = Date.now() } = {}) {
  if (!memory?.words?.size) return "";
  const all = [...memory.words.values()].sort((a, b) => b.lastAt - a.lastAt);
  const recent = all.filter((e) => now - e.lastAt < 14 * DAY).slice(0, 25).map((e) => e.english);
  const since = Math.min(...all.map((e) => e.firstAt).filter(Boolean));
  return [
    `CLASS MEMORY (from the teacher's saved worksheets, dictations and tests${since ? ` since ${new Date(since).toISOString().slice(0, 10)}` : ""}): the class has met ${all.length} words.`,
    recent.length ? `Met in the last two weeks: ${recent.join(", ")}.` : "",
    review.length ? `Due for review (spaced repetition): ${review.map((r) => r.english).join(", ")} — the teacher added them; recycle them naturally in texts and items next to the new words.` : "",
    "Texts and scripts may freely use words the class has met; do not teach them again.",
  ].filter(Boolean).join(" ");
}
