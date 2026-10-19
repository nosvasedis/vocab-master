/* Arcade avatars and team crests: saved with the class (vm_classes) as optional extra fields, old classes unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AVATARS, DEFAULT_AVATARS, COLORS, playerLook, teamCrest, setTeamCrest, shuffleAvatars, takenAvatars } from "../desktop/renderer/arcade/avatars.js";
import { newClass, createPlay } from "../desktop/renderer/arcade/players.js";

test("avatars: unique emoji, each drawn by a picture that ships with the app", () => {
  assert.equal(new Set(AVATARS.map((a) => a.emoji)).size, AVATARS.length);
  assert.ok(AVATARS.length >= 40);
  const pics = "desktop/renderer/assets/pics";
  for (const a of AVATARS) assert.ok(fs.existsSync(`${pics}/${a.pic}.webp`) || fs.existsSync(`${pics}/bank/${a.pic}.webp`), `${a.name}: ${a.pic}`);
  // The first sixteen are the Lingo Live phone animals, in the order old classes were given them.
  assert.deepEqual(DEFAULT_AVATARS, ["🦊", "🐼", "🐯", "🦁", "🐸", "🐵", "🐨", "🐰", "🐻", "🐧", "🦄", "🐙", "🐢", "🦉", "🐝", "🐬"]);
});

test("avatars: an old class keeps the animal and colour of each child's place; a saved choice wins", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo"]);
  assert.deepEqual(playerLook(cls, cls.players[1]), { emoji: "🐼", color: COLORS[1] });
  cls.players[1].avatar = "🤖";
  cls.players[1].color = "#34d399";
  assert.deepEqual(playerLook(cls, cls.players[1]), { emoji: "🤖", color: "#34d399" });
  cls.players[2].avatar = "not an avatar";
  cls.players[2].color = "red";
  assert.deepEqual(playerLook(cls, cls.players[2]), { emoji: "🐯", color: COLORS[2] }, "bad saved values fall back");
  const play = createPlay({ mode: "players", cls });
  assert.equal(play.players[1].emoji, "🤖");
  assert.equal(play.players[1].color, "#34d399");
});

test("avatars: Surprise gives everyone a different avatar while the class allows it", () => {
  const cls = newClass("A", Array.from({ length: 30 }, (_, i) => `Kid ${i}`));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  assert.equal(shuffleAvatars(cls, { rnd }), 30);
  assert.equal(new Set(cls.players.map((p) => p.avatar)).size, 30);
  assert.ok(cls.players.every((p) => COLORS.includes(p.color)));
  // Only some children: the others keep theirs and aren't repeated.
  const keep = cls.players[0].avatar;
  shuffleAvatars(cls, { ids: [cls.players[1].id], rnd });
  assert.equal(cls.players[0].avatar, keep);
  assert.notEqual(cls.players[1].avatar, keep);
  assert.ok(!takenAvatars(cls, cls.players[0].id).has(keep));
});

test("crests: defaults per team, saved crest fields are optional, and teams in play wear them", () => {
  const cls = newClass("A", ["Ana", "Ben", "Cleo", "Dan"]);
  assert.deepEqual(teamCrest(cls, 1), { emoji: "🐯", color: "#ff8a4c", shape: "shield" });
  setTeamCrest(cls, 1, { emoji: "🦈", shape: "star" });
  assert.deepEqual(cls.teamCrests[0], null, "teams before it stay unset");
  assert.deepEqual(teamCrest(cls, 1), { emoji: "🦈", color: "#ff8a4c", shape: "star" });
  cls.teamCrests[0] = { color: "#ec4899" };
  assert.deepEqual(teamCrest(cls, 0), { emoji: "🚀", color: "#ec4899", shape: "shield" });
  cls.assign = { [cls.players[0].id]: 0, [cls.players[1].id]: 1, [cls.players[2].id]: 0, [cls.players[3].id]: 1 };
  const play = createPlay({ mode: "teams", cls, teamNames: ["", "Sharks"] });
  assert.deepEqual(play.teams.map((t) => [t.name, t.emoji, t.color, t.shape]), [["Rockets", "🚀", "#ec4899", "shield"], ["Sharks", "🦈", "#ff8a4c", "star"]]);
  // The saved class is still the old shape plus optional fields.
  const json = JSON.parse(JSON.stringify(cls));
  assert.deepEqual(Object.keys(json).sort(), ["assign", "id", "name", "players", "teamCount", "teamCrests", "teamNames"]);
});
