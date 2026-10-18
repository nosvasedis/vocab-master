/* Lingo Arcade — who is playing (pure, DOM-free; tested in Node).
   Three ways to play:
     • class    — everyone together, one class score (warm-ups, revision)
     • players  — named children take turns; each scores for themselves
     • teams    — 2–4 teams of named members; teams take turns, and inside a team the members take turns answering
                  (team score + each member's own points)
   Turns are fair: everyone present answers once before anyone answers again; absent children are skipped.
   The spinner picks at random among those who haven't had a turn yet. */

export const TEAM_PRESETS = [
  { name: "Rockets", emoji: "🚀", color: "#7b6bff" },
  { name: "Tigers", emoji: "🐯", color: "#ff8a4c" },
  { name: "Dolphins", emoji: "🐬", color: "#22c3ee" },
  { name: "Dragons", emoji: "🐉", color: "#34d399" },
];
// Player avatars: the same animals as the Lingo Live phones (drawn as pictures by js/pics.js avatarPic).
export const PLAYER_AVATARS = ["🦊", "🐼", "🐯", "🦁", "🐸", "🐵", "🐨", "🐰", "🐻", "🐧", "🦄", "🐙", "🐢", "🦉", "🐝", "🐬"];
export const PLAYER_COLORS = ["#ff8a4c", "#7b6bff", "#22c3ee", "#34d399", "#f2a900", "#ff5e7a", "#a855f7", "#14b8a6", "#ef4444", "#3b82f6", "#84cc16", "#ec4899"];
const CLASS_SIDE = { name: "Class", emoji: "⭐", color: "#ffd23f" };

const uid = () => Math.random().toString(36).slice(2, 9);

/** Clean a typed or pasted list of names ("Maria, Nikos\nEleni") → unique trimmed names. */
export function parseNames(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").split(/[\n,;\t]+/)) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 24);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** A new saved class: { id, name, players: [{ id, name }], teamCount, assign: { playerId: teamIndex }, teamNames: [] }. */
export function newClass(name = "My class", names = []) {
  return { id: uid(), name: String(name).trim().slice(0, 30) || "My class", players: names.map((n) => ({ id: uid(), name: n })), teamCount: 2, assign: {}, teamNames: [] };
}

/** Add names to a class (duplicates ignored); returns the new player ids. */
export function addPlayers(cls, names) {
  const have = new Set(cls.players.map((p) => p.name.toLowerCase()));
  const added = [];
  for (const n of names) {
    if (have.has(n.toLowerCase())) continue;
    const p = { id: uid(), name: n };
    cls.players.push(p);
    have.add(n.toLowerCase());
    added.push(p.id);
  }
  return added;
}

/** Spread players over n teams as evenly as possible, in random order. */
export function balanceTeams(cls, ids, n, rnd = Math.random) {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const assign = { ...cls.assign };
  order.forEach((id, k) => { assign[id] = k % n; });
  cls.assign = assign;
  return assign;
}

/** Any player without a (valid) team joins the smallest team. */
export function fillTeams(cls, ids, n) {
  const size = Array.from({ length: n }, () => 0);
  for (const id of ids) { const t = cls.assign[id]; if (Number.isInteger(t) && t >= 0 && t < n) size[t]++; }
  for (const id of ids) {
    const t = cls.assign[id];
    if (Number.isInteger(t) && t >= 0 && t < n) continue;
    const smallest = size.indexOf(Math.min(...size));
    cls.assign[id] = smallest;
    size[smallest]++;
  }
  return cls.assign;
}

/**
 * Start a game's line-up.
 * @param {{ mode: "class"|"players"|"teams", cls?: object, absent?: Set<string>, teamCount?: number, teamNames?: string[] }} cfg
 */
export function createPlay({ mode = "class", cls = null, absent = new Set(), teamCount = 2, teamNames = [] } = {}) {
  const roster = (cls?.players || []).filter((p) => !absent.has(p.id));
  const usePlayers = mode !== "class" && roster.length >= (mode === "teams" ? 2 : 1);
  const m = usePlayers ? mode : "class";
  const n = Math.max(2, Math.min(4, teamCount));
  const players = usePlayers
    // A child keeps the same animal and colour whoever is away (their place in the class list).
    ? roster.map((p) => { const i = cls.players.indexOf(p); return { id: p.id, name: p.name, emoji: PLAYER_AVATARS[i % PLAYER_AVATARS.length], color: PLAYER_COLORS[i % PLAYER_COLORS.length], score: 0, turns: 0, right: 0, team: null }; })
    : [];
  let teams = [];
  if (m === "teams") {
    fillTeams(cls, players.map((p) => p.id), n);
    teams = TEAM_PRESETS.slice(0, n).map((t, i) => ({ ...t, name: teamNames[i] || t.name, score: 0 }));
    for (const p of players) p.team = cls.assign[p.id];
    // A team nobody is in can't take turns: drop it (and renumber).
    const used = teams.map((_, i) => players.some((p) => p.team === i));
    const map = new Map();
    teams = teams.filter((t, i) => { if (used[i]) map.set(i, map.size); return used[i]; });
    for (const p of players) p.team = map.get(p.team);
  }
  const play = { mode: m, players, teams, classSide: { ...CLASS_SIDE, score: 0 }, team: 0, player: null, had: new Set(), lastOf: {} };
  if (m !== "class") startTurn(play);
  return play;
}

/** Everyone who can answer now: in teams mode, the active team's members. */
function pool(play) {
  if (play.mode === "players") return play.players;
  if (play.mode === "teams") return play.players.filter((p) => p.team === play.team);
  return [];
}

/** Choose the active team's (or the class's) next player: the next in list order who hasn't answered this round. */
function startTurn(play) {
  const list = pool(play);
  if (!list.length) { play.player = null; return; }
  let fresh = list.filter((p) => !play.had.has(p.id));
  if (!fresh.length) { list.forEach((p) => play.had.delete(p.id)); fresh = list; } // everyone has answered: new round
  // Carry on from whoever answered last for this team (or in the class list).
  const last = play.mode === "teams" ? play.lastOf[play.team] : play.player;
  const cur = list.findIndex((p) => p.id === last);
  const after = [...list.slice(cur + 1), ...list.slice(0, cur + 1)].find((p) => fresh.includes(p)) || fresh[0];
  play.player = after.id;
}

/** Whose turn is it? → { side, player } (player null in class mode). */
export function current(play) {
  const player = play.players.find((p) => p.id === play.player) || null;
  return { side: activeSide(play), player };
}

/** The scoring side that is "up": the class, the active player, or the active team. */
export function activeSide(play) {
  if (play.mode === "class") return play.classSide;
  if (play.mode === "teams") return play.teams[play.team];
  return play.players.find((p) => p.id === play.player) || play.players[0];
}

/** Scoreboard sides: [class], every player, or the teams. */
export function sides(play) {
  if (play.mode === "class") return [play.classSide];
  return play.mode === "teams" ? play.teams : play.players;
}

/** Points for whoever is up (the team and its answering member, or the player). */
export function award(play, points) {
  const side = activeSide(play);
  if (!side) return null;
  side.score += points;
  const p = play.players.find((x) => x.id === play.player);
  if (p && play.mode === "teams") p.score += points;
  if (p && points > 0) p.right += 1;
  return side;
}

/** The turn is over: mark who answered, move to the next team (teams mode) and the next fair player. */
export function nextTurn(play) {
  if (play.mode === "class") return current(play);
  const p = play.players.find((x) => x.id === play.player);
  if (p) { p.turns += 1; play.had.add(p.id); play.lastOf[play.team] = p.id; }
  if (play.mode === "teams" && play.teams.length) play.team = (play.team + 1) % play.teams.length;
  startTurn(play);
  return current(play);
}

/** The same team answers again, with its next member (Top Answers: team members take turns guessing). */
export function nextMember(play) {
  if (play.mode !== "teams") return nextTurn(play);
  const p = play.players.find((x) => x.id === play.player);
  if (p) { p.turns += 1; play.had.add(p.id); play.lastOf[play.team] = p.id; }
  startTurn(play);
  return current(play);
}

/** Make a given player (or team, by index) the one who's up — the teacher taps a name or a team. */
export function choose(play, { player = null, team = null } = {}) {
  if (team != null && play.mode === "teams" && play.teams[team]) { play.team = team; startTurn(play); }
  if (player != null) {
    const p = play.players.find((x) => x.id === player);
    if (p) { play.player = p.id; if (play.mode === "teams") play.team = p.team; }
  }
  return current(play);
}

/** The spinner: a random player among those up now who haven't answered this round. Returns { pick, pool } for the animation. */
export function spin(play, rnd = Math.random) {
  const list = pool(play);
  if (!list.length) return { pick: null, pool: [] };
  let fresh = list.filter((p) => !play.had.has(p.id));
  if (!fresh.length) fresh = list;
  const pick = fresh[Math.floor(rnd() * fresh.length)];
  play.player = pick.id;
  return { pick, pool: list };
}

/** Players ranked by score (ties: more right answers first), with 1-based ranks that share ties. */
export function rankPlayers(play) {
  const list = [...play.players].sort((a, b) => b.score - a.score || b.right - a.right || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = null;
  return list.map((p, i) => { if (!prev || p.score !== prev.score) rank = i + 1; prev = p; return { ...p, rank }; });
}
