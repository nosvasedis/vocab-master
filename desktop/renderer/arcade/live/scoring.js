/* Lingo Live — scoring (pure; tested in Node).
   Kahoot-style: a right answer is worth 500–1000 depending on speed, plus a streak bonus. */

export const MAX_POINTS = 1000;

/** Points for one answer. elapsedMs = time from options shown to the team's answer. */
export function pointsFor({ correct, elapsedMs = 0, limitMs = 20000, streak = 0 } = {}) {
  if (!correct) return 0;
  const frac = limitMs > 0 ? Math.min(1, Math.max(0, elapsedMs / limitMs)) : 0;
  const base = Math.round(MAX_POINTS * (1 - 0.5 * frac));
  return base + streakBonus(streak);
}

/** Bonus for answering right several times in a row (streak counts this answer): 0, 100, 200 … max 500. */
export function streakBonus(streak) {
  return Math.min(500, Math.max(0, (streak - 1) * 100));
}

/** Rank teams by score; equal scores share a rank. Returns [{ index, score, rank }] best first. */
export function rankTeams(scores) {
  const rows = scores.map((score, index) => ({ index, score })).sort((a, b) => b.score - a.score || a.index - b.index);
  let rank = 0;
  let prev = null;
  rows.forEach((r, i) => {
    if (r.score !== prev) rank = i + 1;
    r.rank = rank;
    prev = r.score;
  });
  return rows;
}
