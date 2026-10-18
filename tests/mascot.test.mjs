import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POSES } from "../desktop/renderer/lesson/mascot.js";
import { lingoSVG, lingoBadge } from "../desktop/renderer/lesson/lingo-art.js";

test("every pose a scene asks Lingo for exists", () => {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== "vendor") walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  });
  walk("desktop/renderer");
  let seen = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/setPose\("([a-z]+)"\)/g)) { seen++; assert.ok(POSES[m[1]], `${f}: setPose("${m[1]}")`); }
  }
  assert.ok(seen > 10, "found the scenes' setPose calls");
  for (const p of ["idle", "talk", "wave", "cheer", "think", "point", "happy", "surprised", "proud", "listening", "encouraging"]) assert.ok(POSES[p], p);
});

test("the drawing has every part the rig moves, and ids are unique per drawing", () => {
  const a = lingoSVG();
  for (const cls of ["lg-root", "lg-breath", "lg-head-idle", "lg-head-talk", "lg-head", "lg-wing-l", "lg-wing-r", "lg-wing-l-in", "lg-wing-r-in",
    "lg-tuft-l", "lg-tuft-r", "lg-brow-l", "lg-brow-r", "lg-look", "lg-iris", "lg-lid", "lg-lid-low", "lg-blink", "lg-eye-open", "lg-eye-happy",
    "lg-cheeks", "lg-mouth", "lg-beak-low", "lg-tassel", "lg-shadow"]) {
    assert.ok(new RegExp(`class="[^"]*\\b${cls}\\b`).test(a), cls);
  }
  const ids = (s) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const idsA = ids(a);
  const idsB = ids(lingoBadge());
  assert.equal(new Set(idsA).size, idsA.length, "no repeated id inside one drawing");
  assert.ok(idsA.every((id) => !idsB.includes(id)), "two drawings never share an id");
  for (const m of a.matchAll(/url\(#([^)]+)\)/g)) assert.ok(idsA.includes(m[1]), `url(#${m[1]}) is defined`);
  assert.ok(!/<image|href="http/.test(a), "no external images");
});
