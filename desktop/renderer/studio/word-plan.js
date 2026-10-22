/* Vocab Master — the teacher's own plan in "Put words on the test" (pure).
 * Lingo proposes new vocabulary parts for the words (planNewParts); the teacher can then move any word to another
 * new part, to an existing part that has room, or leave it out for now; make a part bigger or smaller; add or remove
 * a part. The plan: { parts: [{ key, kind: "new", task, words } | { key, kind: "existing", id, part, words }], spare: [] }
 * (spare: chosen words that are not placed yet). Every change returns a new plan. */

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A plan from Lingo's proposal ([{ task, words }]). */
export function planFromProposal(proposal = []) {
  return { parts: proposal.map((p) => ({ key: newKey(), kind: "new", task: p.task, words: [...p.words] })), spare: [] };
}

const clone = (plan) => ({ parts: plan.parts.map((p) => ({ ...p, words: [...p.words] })), spare: [...plan.spare] });
const without = (plan, words) => {
  const drop = new Set(words);
  plan.parts.forEach((p) => { p.words = p.words.filter((w) => !drop.has(w)); });
  plan.spare = plan.spare.filter((w) => !drop.has(w));
};

/**
 * Move words to a part (its key), to "spare" (left out for now), to "new" (a new part, task `task`), or to an existing
 * part not in the plan yet ({ id, part }). `at`: the place in the target part (default: the end).
 */
export function moveWords(plan, words, to, { task = "", at = null } = {}) {
  const next = clone(plan);
  const list = [...new Set(words)];
  if (!list.length) return next;
  without(next, list);
  if (to === "spare") { next.spare.push(...list); return dropEmpty(next); }
  let target = typeof to === "string" ? next.parts.find((p) => p.key === to) : null;
  if (to === "new") { target = { key: newKey(), kind: "new", task, words: [] }; next.parts.push(target); }
  else if (to && typeof to === "object") {
    target = next.parts.find((p) => p.kind === "existing" && p.id === to.id);
    if (!target) { target = { key: newKey(), kind: "existing", id: to.id, part: to.part, words: [] }; next.parts.push(target); }
  }
  if (!target) { next.spare.push(...list); return dropEmpty(next); }
  const k = at == null ? target.words.length : Math.max(0, Math.min(at, target.words.length));
  target.words.splice(k, 0, ...list);
  return dropEmpty(next);
}

/** Existing-part entries without words go away (a new part the teacher made stays, empty, until removed). */
function dropEmpty(plan) {
  plan.parts = plan.parts.filter((p) => p.words.length || p.kind === "new");
  return plan;
}

/**
 * One more or one fewer question in a part. Smaller: its last word is left out for now. Bigger: the first word left
 * out comes in, else the first word of the next new part (else of the part before it). `max`: the most a part takes.
 */
export function resizePart(plan, key, delta, { max = 12 } = {}) {
  const next = clone(plan);
  const i = next.parts.findIndex((p) => p.key === key);
  const p = next.parts[i];
  if (!p) return next;
  if (delta < 0) {
    if (p.words.length) next.spare.unshift(p.words.pop());
    return dropEmpty(next);
  }
  if (p.words.length >= max) return next;
  if (next.spare.length) { p.words.push(next.spare.shift()); return next; }
  const donor = [...next.parts.slice(i + 1), ...next.parts.slice(0, i).reverse()].find((d) => d.words.length > 1 || (d.kind === "existing" && d.words.length));
  if (donor) p.words.push(donor.words.shift());
  return dropEmpty(next);
}

/** A new, empty part at the end (the teacher fills it). */
export function addPart(plan, task) {
  const next = clone(plan);
  next.parts.push({ key: newKey(), kind: "new", task, words: [] });
  return next;
}

/** Remove a part from the plan: its words are left out for now. */
export function removePart(plan, key) {
  const next = clone(plan);
  const p = next.parts.find((x) => x.key === key);
  if (!p) return next;
  next.spare.push(...p.words);
  next.parts = next.parts.filter((x) => x.key !== key);
  return next;
}

/** Change a new part's exercise. */
export function setTask(plan, key, task) {
  const next = clone(plan);
  const p = next.parts.find((x) => x.key === key);
  if (p && p.kind === "new") p.task = task;
  return next;
}

/** Keep the plan in step with the chosen words: words no longer chosen go; newly chosen ones wait in "spare". */
export function syncPlan(plan, chosen) {
  const next = clone(plan);
  const keep = new Set(chosen);
  next.parts.forEach((p) => { p.words = p.words.filter((w) => keep.has(w)); });
  next.spare = next.spare.filter((w) => keep.has(w));
  const placed = new Set([...next.parts.flatMap((p) => p.words), ...next.spare]);
  chosen.forEach((w) => { if (!placed.has(w)) next.spare.push(w); });
  return dropEmpty(next);
}

/**
 * A new part's exercise must suit its words: the picture task only while every word has a picture. Returns the plan
 * with any such task changed (to `fallback(part)`) and the keys of the parts that changed.
 */
export function fitTasks(plan, { hasPicture = () => true, fallback = () => "V-BANK" } = {}) {
  const next = clone(plan);
  const changed = [];
  next.parts.forEach((p) => {
    if (p.kind === "new" && p.task === "V-PIC" && !p.words.every(hasPicture)) { p.task = fallback(p); changed.push(p.key); }
  });
  return { plan: next, changed };
}

/** The words the plan places (in parts), in order. */
export const placedWords = (plan) => plan.parts.flatMap((p) => p.words);
