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

/**
 * Score one question answered on phones.
 * @param {{ answers: Object<string,{opt:number,at:number}>, players: string[], teamOf?: Object<string,number>,
 *   answer: number, startedAt: number, limitMs: number, streaks: Object<string,number>, teamCount?: number, nOpts?: number }} o
 * @returns {{ perPlayer: Object<string,{pts:number, correct:boolean, opt:number|null, streak:number}>, teamPts: number[], dist: number[], fastest: string|null }}
 * Team points are the average of the team's players (players who did not answer count as 0), so team size doesn't matter.
 */
export function scorePhoneRound({ answers = {}, players = [], teamOf = {}, answer, startedAt, limitMs, streaks = {}, teamCount = 0, nOpts = 4 }) {
  const perPlayer = {};
  const dist = Array.from({ length: nOpts }, () => 0);
  let fastest = null;
  let fastestMs = Infinity;
  for (const uid of players) {
    const a = answers[uid];
    const opt = a && Number.isInteger(a.opt) ? a.opt : null;
    if (opt != null && opt < nOpts) dist[opt]++;
    const correct = opt === answer;
    const streak = correct ? (streaks[uid] || 0) + 1 : 0;
    const elapsed = a ? Math.max(0, (a.at || startedAt) - startedAt) : limitMs;
    const pts = pointsFor({ correct, elapsedMs: elapsed, limitMs, streak });
    perPlayer[uid] = { pts, correct, opt, streak };
    if (correct && elapsed < fastestMs) { fastestMs = elapsed; fastest = uid; }
  }
  const teamPts = Array.from({ length: teamCount }, (_, t) => {
    const members = players.filter((uid) => teamOf[uid] === t);
    return members.length ? Math.round(members.reduce((s, uid) => s + perPlayer[uid].pts, 0) / members.length) : 0;
  });
  return { perPlayer, teamPts, dist, fastest };
}

/** Balanced team assignment: keep existing members, put newcomers in the smallest team. */
export function assignTeams(playerIds, current = {}, teamCount = 2) {
  const out = {};
  const sizes = Array.from({ length: teamCount }, () => 0);
  for (const uid of playerIds) if (Number.isInteger(current[uid]) && current[uid] < teamCount) { out[uid] = current[uid]; sizes[current[uid]]++; }
  for (const uid of playerIds) {
    if (uid in out) continue;
    const t = sizes.indexOf(Math.min(...sizes));
    out[uid] = t;
    sizes[t]++;
  }
  return out;
}
