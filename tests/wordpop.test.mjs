import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { matchProps, splitToken, onePicture } from "../desktop/renderer/lesson/wordmatch.js";
import { allLessonFiles } from "../scripts/lessons/lib/catalog.mjs";

const toks = (s) => s.split(/\s+/).filter(Boolean);

test("splitToken keeps punctuation outside the word", () => {
  assert.deepEqual(splitToken("“Hat,"), { lead: "“", core: "Hat", trail: "," });
  assert.deepEqual(splitToken("yo-yo!"), { lead: "", core: "yo-yo", trail: "!" });
});

test("matchProps: plurals, phrases, head words, one picture per prop", () => {
  const m = matchProps(toks("My two hats and your teddy bear sit by the houses."), [
    { emoji: "🎩", label: "hat" }, { emoji: "🧸", label: "teddy bear" }, { emoji: "🏠", label: "house" },
  ]);
  assert.equal(m.get(2).emoji, "🎩");   // "hats"
  assert.equal(m.get(6).emoji, "🧸");   // after "bear" (phrase end)
  assert.equal(m.get(10).emoji, "🏠");  // "houses."
  const once = matchProps(toks("The cat sees another cat."), [{ emoji: "🐱", label: "cat" }]);
  assert.deepEqual([...once.keys()], [1]);
  const head = matchProps(toks("Honey is a sweet food."), [{ emoji: "🍯", label: "sweet, sticky food" }]);
  assert.equal(head.get(4)?.emoji, "🍯");
});

/* With word pops, a picture is only seen if its word is in the line it belongs to. */
test("every prop in every lesson attaches to a word it is shown with", () => {
  const missing = [];
  const need = (props, texts, where) => {
    for (const p of props || []) {
      if (!texts.some((t) => matchProps(toks(String(t || "").replace(/_{2,}/g, " ")), [p]).size)) missing.push(`${where}: "${p.label}"`);
    }
  };
  for (const file of allLessonFiles()) {
    const L = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const s of L.scenes) {
      if (s.type === "story") for (const p of s.panels || []) {
        const lines = [p.caption, ...(p.speech || [])].filter(Boolean);
        need(p.props, lines.map((l) => l.text), `${L.id} ${s.id}/${p.id}`);
        for (const l of lines) need(l.props, [l.text], `${L.id} ${s.id}/${p.id}/${l.id}`);
      } else if (s.type === "hook") {
        const lines = [...(s.lines || []), s.question].filter(Boolean);
        need(s.props, lines.map((l) => l.text), `${L.id} ${s.id}`);
        for (const l of lines) need(l.props, [l.text], `${L.id} ${s.id}/${l.id}`);
      } else if (s.type === "check") {
        for (const it of s.items || []) need(it.props, [it.prompt?.text, it.explain?.text], `${L.id} ${s.id}/${it.id}`);
      } else {
        for (const l of [...(s.lines || []), ...(s.exitTicket || []), s.prompt, s.model].filter(Boolean)) need(l.props, [l.text], `${L.id} ${s.id}/${l.id}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

import { pickSpot } from "../desktop/renderer/lesson/wordmatch.js";

test("pops never land on quiz answers: a gap word above the options floats up, not down", () => {
  const options = [{ x: 160, y: 500, w: 780, h: 160 }, { x: 980, y: 500, w: 780, h: 160 }, { x: 160, y: 690, w: 780, h: 160 }, { x: 980, y: 690, w: 780, h: 160 }];
  const s = pickSpot({ cx: 1150, cy: 335, avoid: options });
  assert.ok(s.y < 335, `expected above the word, got y=${s.y}`);
});

test("pops avoid characters' faces and prefer below a high caption", () => {
  const faces = [{ x: 470, y: 800, w: 260, h: 260 }, { x: 1300, y: 800, w: 260, h: 260 }];
  const s = pickSpot({ cx: 900, cy: 230, avoid: faces });
  assert.ok(s.y > 230 && s.y + 140 < 800, `expected between caption and faces, got y=${s.y}`);
});

test("onePicture keeps one emoji and draws text-style emoji in colour", () => {
  assert.equal(onePicture("🧑🧑🏘"), "🧑");
  assert.equal(onePicture("🏘"), "🏘️");
  assert.equal(onePicture("🏘️"), "🏘️");
  assert.equal(onePicture("👨‍👩‍👧🏠"), "👨‍👩‍👧");
  assert.equal(onePicture("1️⃣2️⃣"), "1️⃣");
  assert.equal(onePicture(""), "");
});

test("every lesson picture is one colour emoji (no rebus runs that overflow pops and unit cards)", () => {
  const bad = [];
  const walk = (o, where) => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, where));
    if (!o || typeof o !== "object") return;
    if (typeof o.emoji === "string" && (o.label || o.wordId) && onePicture(o.emoji) !== o.emoji) bad.push(`${where} ${o.label || o.wordId} ${o.emoji}`);
    for (const v of Object.values(o)) walk(v, where);
  };
  for (const file of allLessonFiles()) { const l = JSON.parse(fs.readFileSync(file, "utf8")); walk(l.focusWords, l.id); walk(l.scenes, l.id); }
  const index = JSON.parse(fs.readFileSync(new URL("../desktop/renderer/lessons/index.json", import.meta.url), "utf8"));
  for (const l of index.lessons) if (l.hero && onePicture(l.hero) !== l.hero) bad.push(`${l.id} hero ${l.hero}`);
  assert.deepEqual(bad, []);
});
