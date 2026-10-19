/* Top Answers turns and scoring (createFeudFlow driven by the real players.js turn API).
   Regression: in Teams mode the first team used to open every round (after a steal the turn moved back to it). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFeudFlow } from "../desktop/renderer/arcade/games/feud.js";
import { newClass, createPlay, turnApi, current } from "../desktop/renderer/arcade/players.js";

const board = (n = 6) => ({ prompt: `Name ${n} things`, answers: Array.from({ length: n }, (_, i) => ({ text: `a${i}`, points: 30 - i * 5 })) });
const boards = (n = 6) => Array.from({ length: n }, () => board());

/** A class with members assigned to teams in turn: Ana→0, Ben→1, Cleo→2… */
function teamsGame(names, teamCount = 2, startTeam = 0) {
  const cls = newClass("A", names);
  cls.teamCount = teamCount;
  cls.players.forEach((p, i) => { cls.assign[p.id] = i % teamCount; });
  const play = createPlay({ mode: "teams", cls, teamCount, startTeam });
  return { play, turns: turnApi(play) };
}
const who = (play) => `${current(play).side.name}:${current(play).player?.name}`;

test("teams: the opening team rotates every round, whoever stole the last one", () => {
  const { play, turns } = teamsGame(["Ana", "Ben", "Cleo", "Dan"]);
  const flow = createFeudFlow(turns, boards());
  const openers = [];
  const outcomes = [
    () => { flow.found(0); flow.strike(); flow.strike(); flow.strike(); flow.found(1); }, // bank, 3 strikes, the other team steals
    () => { flow.found(0); flow.strike(); flow.strike(); flow.strike(); flow.strike(); }, // steal fails
    () => { for (let i = 0; i < 6; i++) flow.found(i); }, // board cleared
    () => { flow.strike(); flow.strike(); flow.strike(); }, // three strikes with nothing banked: no steal
    () => { flow.found(2); flow.revealAll(); }, // teacher reveals the rest
    () => { flow.found(0); flow.strike(); flow.strike(); flow.strike(); flow.revealAll(); }, // revealed mid-steal
  ];
  for (const play1 of outcomes) {
    openers.push(current(play).side.name);
    play1();
    assert.ok(flow.state.over, "round ended");
    flow.next();
  }
  assert.deepEqual(openers, ["Rockets", "Tigers", "Rockets", "Tigers", "Rockets", "Tigers"]);
});

test("teams: three teams take turns to open, starting from the game's first team", () => {
  const { play, turns } = teamsGame(["Ana", "Ben", "Cleo", "Dan", "Eve", "Finn"], 3, 1);
  const flow = createFeudFlow(turns, boards());
  const openers = [];
  for (let r = 0; r < 6; r++) {
    openers.push(current(play).side.name);
    flow.found(0); flow.strike(); flow.strike(); flow.strike(); flow.found(1); // steal every round
    flow.next();
  }
  assert.deepEqual(openers, ["Tigers", "Dolphins", "Rockets", "Tigers", "Dolphins", "Rockets"]);
});

test("teams: members take turns guessing; a steal is answered by the next team's next member", () => {
  const { play, turns } = teamsGame(["Ana", "Ben", "Cleo", "Dan"]); // Rockets: Ana, Cleo · Tigers: Ben, Dan
  const flow = createFeudFlow(turns, boards());
  assert.equal(who(play), "Rockets:Ana");
  flow.found(0);
  assert.equal(who(play), "Rockets:Cleo");
  flow.strike();
  assert.equal(who(play), "Rockets:Ana");
  flow.strike(); flow.strike();
  assert.equal(flow.state.stealing, true);
  assert.equal(who(play), "Tigers:Ben");
  flow.found(3); // Ben steals
  assert.equal(play.teams[1].score, 30, "the bank goes to the thieves");
  assert.equal(play.teams[0].score, 0);
  assert.equal(play.players.find((p) => p.name === "Ben").score, 30, "the member who stole scores too");
  flow.next();
  assert.equal(who(play), "Tigers:Dan", "Tigers open round 2 with the member who hasn't answered yet");
});

test("teams: a failed steal leaves the bank with the team that built it", () => {
  const { play, turns } = teamsGame(["Ana", "Ben"]);
  const flow = createFeudFlow(turns, boards());
  flow.found(0); flow.found(1); // 30 + 25
  flow.strike(); flow.strike(); flow.strike();
  assert.equal(current(play).side.name, "Tigers");
  const res = flow.strike();
  assert.equal(res.kind, "steal-lost");
  assert.deepEqual(play.teams.map((t) => t.score), [55, 0]);
});

test("teams: the last rounds count double and triple", () => {
  const { play, turns } = teamsGame(["Ana", "Ben"]);
  const flow = createFeudFlow(turns, boards());
  for (let r = 0; r < 4; r++) { flow.revealAll(); flow.next(); }
  assert.equal(flow.mult(), 2);
  flow.found(0); flow.revealAll(); // Rockets open round 5: 30 × 2
  flow.next();
  assert.equal(flow.mult(), 3);
  flow.found(0); flow.revealAll(); // Tigers open round 6: 30 × 3
  assert.deepEqual(play.teams.map((t) => t.score), [60, 90]);
  assert.equal(flow.next().kind, "done");
});

test("players: each guess scores for whoever said it and the turn moves on; a new round skips nobody", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo"]);
  const play = createPlay({ mode: "players", cls });
  const flow = createFeudFlow(turnApi(play), boards());
  const order = [];
  const step = (fn) => { order.push(current(play).player.name); fn(); };
  step(() => flow.found(0)); // Ana +30
  step(() => flow.strike()); // Ben
  step(() => flow.found(1)); // Cleo +25
  step(() => flow.strike());
  step(() => flow.strike()); // three strikes
  assert.equal(flow.state.over, true);
  flow.next();
  step(() => flow.found(0)); // round 2: Cleo, who hadn't had a second go
  assert.deepEqual(order, ["Ana", "Ben", "Cleo", "Ana", "Ben", "Cleo"]);
  assert.deepEqual(play.players.map((p) => p.score), [30, 0, 55]);
});

test("whole class: answers score for the class, no steals", () => {
  const play = createPlay({ mode: "class" });
  const flow = createFeudFlow(turnApi(play), boards());
  flow.found(0); flow.found(1);
  flow.strike(); flow.strike();
  assert.equal(flow.strike().kind, "out");
  assert.equal(play.classSide.score, 55);
});

test("every game starts with the next team, so one team doesn't always go first", () => {
  const firsts = [0, 1, 2, 3].map((g) => current(teamsGame(["Ana", "Ben", "Cleo", "Dan"], 2, g).play).side.name);
  assert.deepEqual(firsts, ["Rockets", "Tigers", "Rockets", "Tigers"]);
  const cls = newClass("A", ["Ana", "Ben", "Cleo"]);
  const p = createPlay({ mode: "players", cls, after: cls.players[1].id });
  assert.equal(current(p).player.name, "Cleo", "players carry on after whoever was up last game");
});
