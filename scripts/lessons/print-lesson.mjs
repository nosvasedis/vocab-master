#!/usr/bin/env node
/* Print a lesson as a readable script (for human review): node scripts/lessons/print-lesson.mjs CPP1-U1-BQ [...] */
import fs from "node:fs";
import path from "node:path";
import { LESSONS_DIR } from "./lib/catalog.mjs";
import { lessonPath } from "../../desktop/renderer/lesson/schema.js";

const props = (list) => (list || []).length ? ` [${list.map((p) => `${p.emoji} ${p.label}`).join(" · ")}]` : "";
for (const id of process.argv.slice(2)) {
  const [book, u, section] = id.split("-");
  const l = JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, lessonPath(book, Number(u.slice(1)), section)), "utf8"));
  const out = [`\n===== ${l.id} — ${l.title} (${l.profile}) setting=${l.setting}`];
  out.push(`CAST: ${Object.entries(l.cast).map(([k, c]) => `${k}=${c.emoji || ""}${c.name} (${c.persona})`).join("; ")}`);
  out.push(`WORDS: ${l.focusWords.map((f) => `${f.english} ${f.emoji} — ${f.kidDefinition} | ${f.examples?.[0] || ""}`).join("\n       ")}`);
  for (const s of l.scenes) {
    out.push(`-- ${s.type}${s.backdrop ? ` @${s.backdrop}` : ""}${props(s.props)}`);
    for (const x of s.lines || []) out.push(`   ${x.text}${props(x.props)}`);
    if (s.question) out.push(`   Q: ${s.question.text}`);
    for (const p of s.panels || []) {
      out.push(`   [${p.id} @${p.backdrop}] ${(p.characters || []).map((c) => c.who).join("+")}${props(p.props)}`);
      if (p.caption) out.push(`      (${p.caption.text})`);
      for (const sp of p.speech || []) out.push(`      ${sp.who}: ${sp.text}`);
    }
    for (const it of s.items || []) {
      const opts = it.options.map((o, k) => (k === it.answer ? `*${o}*` : o)).join(" / ");
      out.push(`   ${it.kind}: ${it.prompt.text}${props(it.props)}\n      → ${opts}\n      ✓ ${it.explain?.text || ""}`);
    }
    if (s.type === "practice") out.push(`   game=${s.game}`);
    if (s.type === "speak") out.push(`   ${s.prompt.text} | frames: ${(s.frames || []).join(" / ")} | model: ${s.model?.text || ""}`);
    if (s.type === "recap") out.push(`   badge ${s.badge?.emoji} ${s.badge?.name} | exit: ${(s.exitTicket || []).map((e) => e.text).join(" / ")}`);
  }
  console.log(out.join("\n"));
}
