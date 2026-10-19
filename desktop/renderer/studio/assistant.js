/* Vocab Master — teacher assistant brain (pure).
 * Turns a request ("test for Unit 4", "a test on Present Simple vs Present Continuous for E class",
 * "dictation, 8 sentences, past simple") into an editable plan, and asks at most two clarifying
 * questions. Clear requests are understood locally (free, instant); fuzzy ones go to a small AI call
 * that returns the same plan shape. The plan is handed to the Unit test, Dictation or worksheet makers. */
import { CPP_BOOKS } from "../coursebook-data.js";
import { parseLevel, GRAMMAR_MENU, LEVEL_IDS, BOOK_LEVEL } from "./levels.js";
import { SKILLS, DICTATION_STYLES } from "./tasks.js";

export const KINDS = {
  test: { label: "Unit test", icon: "🧾" },
  quiz: { label: "Quick quiz", icon: "⚡" },
  dictation: { label: "Dictation", icon: "📝" },
  worksheet: { label: "Worksheets", icon: "📄" },
};

const ALL_GRAMMAR = LEVEL_IDS.flatMap((id) => GRAMMAR_MENU[id].map((g) => ({ g, id })));
const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/** Grammar topics named in a request (menu topics, or "X vs Y" phrases). */
export function findGrammar(text) {
  const t = norm(text);
  const out = [];
  for (const { g } of ALL_GRAMMAR) {
    const key = norm(g).replace(/\s*\([^)]*\)/g, "");
    if (key.length <= 3 || !t.includes(key) || out.some((x) => norm(x).includes(key))) continue;
    // "past simple" matches both "past simple (regular)" and "(irregular)": keep the plain name.
    const twins = ALL_GRAMMAR.filter((x) => norm(x.g).replace(/\s*\([^)]*\)/g, "") === key);
    out.push(twins.length > 1 && !t.includes(norm(g)) ? key : g);
  }
  // Longest match wins: "present simple vs present continuous" over its parts.
  const kept = out.filter((g) => !out.some((o) => o !== g && norm(o).includes(norm(g).replace(/\s*\([^)]*\)/g, ""))));
  const vs = t.match(/([a-z' ]{4,40}?)\s+(?:vs\.?|versus|and|or)\s+([a-z' ]{4,40}?)(?=\s+(?:for|test|worksheet|quiz|dictation|in|to|with)\b|[,.!?]|$)/);
  if (vs && /(present|past|future|perfect|continuous|simple|comparative|superlative|going to|will|can|must|some|any|much|many)/.test(vs[0]) && !kept.some((g) => norm(g).includes(norm(vs[1])))) {
    const left = vs[1].replace(/^.*\b(?:on|about|of|with)\s+/, "").replace(/^(?:a|an|the)\s+/, "").trim();
    const pair = `${left} vs ${vs[2].trim()}`;
    if (!kept.some((g) => norm(g) === norm(pair))) kept.push(pair);
  }
  return [...new Set(kept)];
}

/** Book and units named in a request: "PP2 unit 4", "Primary Path 3 units 2-3", "ενότητα 5", "book 1". */
export function findBookUnits(text) {
  const t = norm(text);
  let bookId = "";
  const b = t.match(/\b(?:pp|cpp|primary paths?|book)\s*([123])\b/);
  if (b) bookId = `CPP${b[1]}`;
  let units = [];
  // Greek letters are not word characters for \b, so the unit word is anchored by hand.
  const range = t.match(/(?:^|[^a-zα-ω])(?:units?|ενότητ(?:α|ες))\s*(\d)\s*(?:-|–|to|and|&|,|και)\s*(\d)\b/);
  if (range) {
    const [a, z] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    units = Array.from({ length: z - a + 1 }, (_, i) => a + i);
  } else {
    const one = t.match(/(?:^|[^a-zα-ω])(?:units?|ενότητα)\s*(\d)\b/);
    if (one) units = [Number(one[1])];
  }
  return { bookId, units: units.filter((u) => u >= 1 && u <= 9) };
}

function findKind(t) {
  if (/dictation|υπαγόρευ|ορθογραφ|dictogloss|running dictation/.test(t)) return "dictation";
  if (/\bquiz\b|quick test|short test|μικρό τεστ/.test(t)) return "quiz";
  if (/worksheet|φύλλο εργασίας|practice sheet|exercises|ασκήσεις|lingo launcher/.test(t)) return "worksheet";
  if (/\btest\b|exam|τεστ|διαγώνισμα|assessment|revision test|check/.test(t)) return "test";
  return "";
}

/**
 * Local reading of a request. context: { level, bookId, unit } (the unit open in the app).
 * Returns a partial plan; fields it can't tell are left undefined.
 */
export function parseRequest(text, context = {}) {
  const t = norm(text);
  const plan = {};
  const kind = findKind(t);
  if (kind) plan.kind = kind;
  const level = parseLevel(text);
  if (level) plan.levelId = level;
  const { bookId, units } = findBookUnits(text);
  const grammar = findGrammar(text);
  if (grammar.length) plan.grammar = grammar;
  if (units.length || bookId) {
    const book = bookId || context.bookId || "";
    plan.source = { kind: "unit", bookId: book, units: units.length ? units : context.unit ? [context.unit] : [] };
  } else if (/this unit|current unit|my words|my word list|αυτή την ενότητα/.test(t) && context.bookId) {
    plan.source = { kind: "unit", bookId: context.bookId, units: [context.unit] };
  } else if (grammar.length || /\babout\b|\bon\b|topic|θέμα/.test(t)) {
    const topic = text.replace(/\b(make|create|write|give me|i need|please|a|an|the|test|quiz|worksheet|dictation|for|class|senior|level|[a-e] class)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (grammar.length || topic.split(" ").length >= 2) plan.source = { kind: "topic", topic: grammar.length ? grammar.join(", ") : topic };
  }
  const skills = Object.keys(SKILLS).filter((s) => s !== "dictation" && new RegExp(`\\b${s}\\b`).test(t));
  if (/four skills|4 skills|all skills|όλες τις δεξιότητες/.test(t)) plan.length = "full";
  else if (skills.length) plan.skills = skills;
  if (/\bshort\b|quick|20 min/.test(t)) plan.length = "quiz";
  if (/\bfull\b|long|60 min|1 hour/.test(t)) plan.length = "full";
  if (/two versions|2 versions|version b|a and b versions|a\/b|δύο εκδοχές/.test(t)) plan.versions = 2;
  if (/easier|easy|weak|πιο εύκολ/.test(t)) plan.difficulty = "easier";
  if (/harder|challeng|strong|πιο δύσκολ/.test(t)) plan.difficulty = "harder";
  if (/in greek|greek instructions|ελληνικ/.test(t)) plan.greek = true;
  if (/no greek|without greek|english only/.test(t)) plan.greek = false;
  const n = t.match(/\b(\d{1,2})\s*(sentences|items|questions|προτάσεις|ερωτήσεις)\b/);
  if (n) plan.count = Number(n[1]);
  const style = Object.keys(DICTATION_STYLES).find((s) => t.includes(s) || (s === "classic" && /normal dictation/.test(t)));
  if (style) { plan.style = style; plan.kind ||= "dictation"; }
  return plan;
}

/** Fill a partial plan with sensible defaults (the app's open unit and class). */
export function completePlan(partial = {}, context = {}) {
  // No default kind: when the teacher hasn't said what to make, the assistant asks.
  const plan = { difficulty: "level", versions: 1, grammar: [], ...partial };
  if (plan.source?.kind === "unit") {
    plan.source.bookId ||= context.bookId || (plan.levelId ? Object.keys(BOOK_LEVEL).find((b) => BOOK_LEVEL[b] === plan.levelId) : "") || "";
    if (!plan.source.units?.length && context.unit && plan.source.bookId === context.bookId) plan.source.units = [context.unit];
  }
  if (!plan.levelId) plan.levelId = (plan.source?.kind === "unit" && BOOK_LEVEL[plan.source.bookId]) || context.level || "";
  // A grammar / topic test (no coursebook unit) leans on grammar, with reading and writing around it.
  if ((plan.kind === "test" || plan.kind === "quiz") && plan.source?.kind === "topic" && !plan.skills?.length) {
    plan.skills = plan.kind === "quiz" ? ["grammar", "grammar", "vocabulary"] : ["grammar", "grammar", "vocabulary", "reading", "writing"];
  }
  if (plan.kind === "quiz") plan.length ||= "quiz";
  if (plan.kind === "test") plan.length ||= plan.skills?.length ? "custom" : "standard";
  if (plan.greek === undefined && plan.levelId) plan.greek = ["A_SENIOR", "B_SENIOR", "C_SENIOR"].includes(plan.levelId);
  return plan;
}

/** At most two questions for what the plan still lacks, each with tap-to-answer chips. */
export function clarifyingQuestions(plan, context = {}) {
  const qs = [];
  if (!plan.kind) qs.push({ id: "kind", text: "What would you like me to make?", options: Object.entries(KINDS).map(([k, v]) => ({ label: `${v.icon} ${v.label}`, value: k })) });
  const src = plan.source;
  if (!src || (src.kind === "unit" && (!src.bookId || !src.units?.length))) {
    const opts = [];
    if (context.bookId && context.unit) opts.push({ label: `📘 ${CPP_BOOKS[context.bookId]?.title.replace("Cambridge ", "")} · Unit ${context.unit}`, value: { kind: "unit", bookId: context.bookId, units: [context.unit] } });
    if (src?.kind === "unit" && src.bookId && !src.units?.length) for (let u = 1; u <= 9; u++) opts.push({ label: `Unit ${u}`, value: { kind: "unit", bookId: src.bookId, units: [u] } });
    else Object.keys(CPP_BOOKS).forEach((b) => opts.push({ label: `📗 Primary Path ${b.slice(-1)}…`, value: { kind: "unit", bookId: b, units: [] } }));
    if (plan.kind !== "dictation") opts.push({ label: "💡 A grammar point or topic", value: { kind: "topic", topic: "" } });
    qs.push({ id: "source", text: src?.bookId && !src.units?.length ? `Which unit of Primary Path ${src.bookId.slice(-1)}?` : "Which book and unit (or which topic)?", options: opts.slice(0, 11) });
  }
  if (!plan.levelId && qs.length < 2) qs.push({ id: "levelId", text: "Which class is it for?", options: LEVEL_IDS.map((id) => ({ label: `${id[0]} Senior`, value: id })) });
  if (src?.kind === "topic" && !src.topic && qs.length < 2) qs.push({ id: "topic", text: "Which grammar point or topic? (type it, or tap one)", options: (GRAMMAR_MENU[plan.levelId] || GRAMMAR_MENU.B_SENIOR).slice(0, 6).map((g) => ({ label: g, value: g })) });
  return qs.slice(0, 2);
}

/** Apply a tapped answer to the plan. */
export function answerQuestion(plan, id, value) {
  const p = { ...plan };
  if (id === "source") p.source = typeof value === "object" ? { ...value } : value;
  else if (id === "topic") { p.source = { kind: "topic", topic: value }; p.grammar = [...new Set([...(p.grammar || []), value])]; }
  else p[id] = value;
  return p;
}

/** One-paragraph summary the assistant says back. */
export function planSummary(plan) {
  const kind = plan.kind === "test" && plan.source?.kind === "topic" ? "Test" : KINDS[plan.kind]?.label || "Something";
  const who = plan.levelId ? `${plan.levelId[0]} Senior` : "your class";
  const src = plan.source?.kind === "unit" && plan.source.bookId
    ? `${CPP_BOOKS[plan.source.bookId]?.title.replace("Cambridge ", "")}${plan.source.units?.length ? `, ${plan.source.units.length > 1 ? "Units" : "Unit"} ${plan.source.units.join(" & ")}` : ""}`
    : plan.source?.kind === "topic" ? `“${plan.source.topic || "a topic"}”` : plan.source?.kind === "current" ? "your current word list" : "";
  const bits = [];
  const skillList = (skills) => [...new Set(skills)].map((s) => { const n = skills.filter((x) => x === s).length; return `${n > 1 ? `${n}× ` : ""}${SKILLS[s].label.toLowerCase()}`; }).join(", ");
  if (plan.kind === "test" || plan.kind === "quiz") bits.push(plan.skills?.length ? skillList(plan.skills) : plan.length === "full" ? "all four skills" : plan.length === "quiz" ? "vocabulary, grammar and reading" : "listening, reading, vocabulary, grammar and writing");
  if (plan.kind === "dictation") bits.push(`${DICTATION_STYLES[plan.style || "classic"].label.toLowerCase()} style${plan.count ? `, ${plan.count} sentences` : ""}`);
  if (plan.grammar?.length) bits.push(`grammar: ${plan.grammar.join(", ")}`);
  if (plan.difficulty && plan.difficulty !== "level") bits.push(plan.difficulty === "easier" ? "a little easier" : "a little harder");
  if (plan.versions > 1) bits.push("versions A and B");
  return `${kind} for ${who}${src ? ` on ${src}` : ""}${bits.length ? ` — ${bits.join("; ")}` : ""}.`;
}

/** Small AI prompt that reads a fuzzy request into the same plan shape (used only when local parsing isn't enough). */
export function assistantPrompt(text, context = {}, plan = {}) {
  const system = `You help a Greek teacher of English (φροντιστήριο, classes A–E Senior, ages 8–14) plan a test, quiz, dictation or worksheet.
Read the teacher's request (English or Greek) and return ONLY JSON:
{ "kind": "test|quiz|dictation|worksheet", "levelId": "A_SENIOR|B_SENIOR|C_SENIOR|D_SENIOR|E_SENIOR|", "source": { "kind": "unit|topic", "bookId": "CPP1|CPP2|CPP3|", "units": [n], "topic": "" }, "skills": ["listening|reading|vocabulary|grammar|writing|speaking"], "grammar": ["..."], "length": "quiz|standard|full|", "difficulty": "easier|level|harder", "versions": 1, "style": "classic|gapped|running|dictogloss|picture|", "count": 0, "note": "anything else the teacher asked for, short", "reply": "one friendly sentence to the teacher (in the teacher's language)" }
Books: CPP1 = Cambridge Primary Path 1 (A Senior), CPP2 = Primary Path 2 (B Senior), CPP3 = Primary Path 3 (C Senior). Leave a field empty when the teacher didn't say it.`;
  const user = `Open in the app now: ${context.bookId ? `${context.bookId} Unit ${context.unit}` : "no unit"}, class ${context.level || "not chosen"}.
Plan so far: ${JSON.stringify(plan)}
Teacher: ${text}`;
  return { system, user };
}

/** Merge the AI's reading into a plan, ignoring invalid values. */
export function mergeAiPlan(plan, ai = {}) {
  const p = { ...plan };
  if (KINDS[ai.kind]) p.kind = ai.kind;
  if (LEVEL_IDS.includes(ai.levelId)) p.levelId = ai.levelId;
  if (ai.source?.kind === "unit" && CPP_BOOKS[ai.source.bookId]) p.source = { kind: "unit", bookId: ai.source.bookId, units: (ai.source.units || []).map(Number).filter((u) => u >= 1 && u <= 9) };
  else if (ai.source?.kind === "topic" && ai.source.topic) p.source = { kind: "topic", topic: String(ai.source.topic) };
  const skills = (ai.skills || []).filter((s) => SKILLS[s] && s !== "dictation");
  if (skills.length) p.skills = skills;
  if (Array.isArray(ai.grammar) && ai.grammar.length) p.grammar = ai.grammar.map(String).slice(0, 4);
  if (["quiz", "standard", "full"].includes(ai.length)) p.length = ai.length;
  if (["easier", "level", "harder"].includes(ai.difficulty)) p.difficulty = ai.difficulty;
  if (Number(ai.versions) === 2) p.versions = 2;
  if (DICTATION_STYLES[ai.style]) p.style = ai.style;
  if (Number(ai.count) > 0) p.count = Math.min(15, Number(ai.count));
  if (ai.note) p.note = String(ai.note).slice(0, 200);
  return p;
}

/** Does the local reading need the AI? (No kind, or a long request the rules only partly understood.) */
export function needsAi(text, partial) {
  const words = norm(text).split(" ").length;
  if (!partial.kind && words > 3) return true;
  const understood = ["kind", "levelId", "source", "grammar", "skills", "length", "style", "count", "versions", "difficulty"].filter((k) => partial[k] !== undefined).length;
  return words > 14 && understood < 3;
}
