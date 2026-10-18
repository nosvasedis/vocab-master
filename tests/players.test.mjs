/* Lingo Arcade players & turns: modes, fair rotation, teams with members, spinner, scores. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNames, newClass, addPlayers, balanceTeams, createPlay, current, nextTurn, nextMember, award, sides, spin, choose, rankPlayers } from "../desktop/renderer/arcade/players.js";

const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const names = (play, n) => Array.from({ length: n }, () => { const c = current(play).player?.name; nextTurn(play); return c; });

test("names: pasted lists are split, trimmed and de-duplicated", () => {
  assert.deepEqual(parseNames("Maria, Nikos\n eleni ;Maria\t\tGiorgos"), ["Maria", "Nikos", "eleni", "Giorgos"]);
  const c = newClass("B Senior", ["Maria"]);
  assert.equal(addPlayers(c, ["maria", "Nikos"]).length, 1);
  assert.deepEqual(c.players.map((p) => p.name), ["Maria", "Nikos"]);
});

test("class mode: one class score, no players", () => {
  const play = createPlay({ mode: "class" });
  assert.equal(current(play).player, null);
  award(play, 10);
  assert.deepEqual(sides(play).map((s) => s.score), [10]);
});

test("players mode: everyone answers once before anyone repeats; absent children are skipped", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo", "Dan"]);
  const absent = new Set([cls.players[2].id]); // Cleo is away
  const play = createPlay({ mode: "players", cls, absent });
  assert.deepEqual(names(play, 6), ["Ana", "Ben", "Dan", "Ana", "Ben", "Dan"]);
  assert.equal(sides(play).length, 3);
});

test("players mode: points go to the player who is up", () => {
  const cls = newClass("A", ["Ana", "Ben"]);
  const play = createPlay({ mode: "players", cls });
  award(play, 5); nextTurn(play); award(play, 3);
  assert.deepEqual(rankPlayers(play).map((p) => [p.name, p.score, p.rank]), [["Ana", 5, 1], ["Ben", 3, 2]]);
});

test("teams mode: teams alternate, members rotate inside their team, uneven teams are fine", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo", "Dan", "Eve"]);
  const [a, b, c, d, e] = cls.players.map((p) => p.id);
  cls.assign = { [a]: 0, [b]: 1, [c]: 0, [d]: 1, [e]: 0 }; // 3 vs 2
  const play = createPlay({ mode: "teams", cls, teamCount: 2 });
  const order = Array.from({ length: 8 }, () => { const { side, player } = current(play); nextTurn(play); return `${side.name}:${player.name}`; });
  assert.deepEqual(order, ["Rockets:Ana", "Tigers:Ben", "Rockets:Cleo", "Tigers:Dan", "Rockets:Eve", "Tigers:Ben", "Rockets:Ana", "Tigers:Dan"]);
});

test("teams mode: the team and its answering member both score", () => {
  const cls = newClass("A", ["Ana", "Ben"]);
  cls.assign = { [cls.players[0].id]: 0, [cls.players[1].id]: 1 };
  const play = createPlay({ mode: "teams", cls, teamNames: ["Owls"] });
  award(play, 10);
  assert.equal(play.teams[0].name, "Owls");
  assert.equal(play.teams[0].score, 10);
  assert.equal(play.players[0].score, 10);
});

test("teams mode: players without a team are spread evenly; empty teams are dropped", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo", "Dan"]);
  const play = createPlay({ mode: "teams", cls, teamCount: 2 });
  assert.deepEqual(play.teams.map((t, i) => play.players.filter((p) => p.team === i).length), [2, 2]);
  const solo = newClass("B", ["Ana", "Ben"]);
  solo.assign = { [solo.players[0].id]: 0, [solo.players[1].id]: 0 };
  assert.equal(createPlay({ mode: "teams", cls: solo, teamCount: 3 }).teams.length, 1);
});

test("balanceTeams spreads players evenly", () => {
  const cls = newClass("A", ["a", "b", "c", "d", "e", "f", "g"]);
  balanceTeams(cls, cls.players.map((p) => p.id), 3, seq(0.1, 0.7, 0.3, 0.9, 0.5, 0.2));
  const sizes = [0, 1, 2].map((t) => Object.values(cls.assign).filter((x) => x === t).length).sort();
  assert.deepEqual(sizes, [2, 2, 3]);
});

test("spinner: picks among those who haven't answered this round", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo"]);
  const play = createPlay({ mode: "players", cls });
  nextTurn(play); // Ana has answered
  const { pick, pool } = spin(play, () => 0);
  assert.equal(pool.length, 3);
  assert.notEqual(pick.name, "Ana");
  assert.equal(current(play).player.name, pick.name);
});

test("choose: the teacher can hand the turn to a player or a team", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo"]);
  cls.assign = { [cls.players[0].id]: 0, [cls.players[1].id]: 1, [cls.players[2].id]: 1 };
  const play = createPlay({ mode: "teams", cls });
  assert.equal(choose(play, { team: 1 }).side.name, "Tigers");
  assert.equal(choose(play, { player: cls.players[2].id }).player.name, "Cleo");
});

test("nextMember: the same team answers again with its next member", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo", "Dan"]);
  const [a, b, c, d] = cls.players.map((p) => p.id);
  cls.assign = { [a]: 0, [b]: 1, [c]: 0, [d]: 1 };
  const play = createPlay({ mode: "teams", cls });
  assert.equal(current(play).player.name, "Ana");
  assert.equal(nextMember(play).player.name, "Cleo");
  assert.equal(current(play).side.name, "Rockets");
  assert.equal(nextMember(play).player.name, "Ana");
});

test("too few players falls back to the whole class", () => {
  assert.equal(createPlay({ mode: "players", cls: newClass("A", []) }).mode, "class");
  assert.equal(createPlay({ mode: "teams", cls: newClass("A", ["Ana"]) }).mode, "class");
});
