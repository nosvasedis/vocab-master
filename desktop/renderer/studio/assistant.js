/* Vocab Master — teacher assistant brain (pure).
 * Turns a request ("test for Unit 4", "a test on Present Simple vs Present Continuous for E class",
 * "dictation, 8 sentences, past simple") into an editable plan, and asks at most two clarifying
 * questions. Clear requests are understood locally (free, instant); fuzzy ones go to a small AI call
 * that returns the same plan shape. The plan is handed to the Unit test, Dictation or worksheet makers. */
import { CPP_BOOKS } from "../coursebook-data.js";
import { parseLevel, GRAMMAR_MENU, LEVEL_IDS, BOOK_LEVEL, grammarLabel } from "./levels.js";
import { SKILLS, DICTATION_STYLES } from "./tasks.js";
import { parseOwnWords } from "./own-words.js";

export const KINDS = {
  test: { label: "Unit test", icon: "🧾" },
  quiz: { label: "Quick quiz", icon: "⚡" },
  dictation: { label: "Read-aloud dictation", icon: "🗣️" },
  worksheet: { label: "Worksheets (Lingo Launcher + Dictation)", icon: "📄" },
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
  return [...new Set(kept.map(grammarLabel))];
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

/* Two things are called "dictation" here: the worksheet's Dictation sheet (a vocabulary exercise set that comes
   with the Lingo Launcher) and the read-aloud dictation (the teacher reads, the class writes). */
const READ_ALOUD = /read[- ]?aloud|read (?:it )?(?:out|to them)|dictogloss|(?:running|gapped|picture|classic) dictation|υπαγόρευ/;
const SHEET_WORDS = /worksheet|φύλλο εργασίας|practice sheet|exercises|ασκήσεις|lingo launcher|dictation sheet|vocabulary dictation|word dictation/;

function findKind(t) {
  if (READ_ALOUD.test(t)) return "dictation";
  if (SHEET_WORDS.test(t)) return "worksheet";
  if (/dictation|ορθογραφ/.test(t)) {
    // Sentences or a grammar focus only make sense for a read-aloud dictation; otherwise ask which one.
    if (/\d{1,2}\s*(?:sentences|προτάσεις)|grammar|tense|past|present|future/.test(t)) return "dictation";
    return "";
  }
  if (/\bquiz\b|quick test|short test|μικρό τεστ/.test(t)) return "quiz";
  if (/\btest\b|exam|τεστ|διαγώνισμα|assessment|revision test|check/.test(t)) return "test";
  return "";
}

/**
 * Local reading of a request. context: { level, bookId, unit } (the unit open in the app).
 * Returns a partial plan; fields it can't tell are left undefined.
 */
/**
 * Words the teacher lists to include: "… plus the words crater, lava and ash", "also test: island, coast",
 * «… και τις λέξεις κρατήρας, lava». Returns the words and the request without them (so they aren't read as a topic).
 */
export function findOwnWords(text) {
  const src = String(text || "");
  const m = src.match(/\b(?:plus|also|add|adding|including|include|with|and)\s+(?:also\s+)?(?:test\s+)?(?:the\s+|these\s+|my\s+|some\s+)?(?:extra\s+|own\s+|other\s+)?words?\b\s*:?\s*([^.?!;]+)/i)
    || src.match(/\b(?:extra|own|other)\s+words?\s*:?\s*([^.?!;]+)/i)
    || src.match(/\bwords?\s*:\s*([^.?!;]+)/i)
    || src.match(/\b(?:also|plus)\s+(?:test|include|add|use)\s*:\s*([^.?!;]+)/i)
    || src.match(/(?:και\s+)?(?:τις\s+)?(?:λέξεις|λεξεις)\s*:?\s*([^.?!;]+)/i);
  if (!m) return { words: [], rest: src };
  const list = m[1].replace(/\s+(?:too|as well|also)\s*$/i, "");
  // "the words of unit 4" is about the unit's words, not a list.
  if (/^\s*(?:of|from|in|for)\b/i.test(list)) return { words: [], rest: src };
  const words = parseOwnWords(list.replace(/\s+(?:and|και|&)\s+/gi, ", "))
    .filter((w) => !/\d|\bunit\b|\bclass\b|\bsenior\b/i.test(w.english) && w.english.split(" ").length <= 4);
  return words.length ? { words, rest: src.replace(m[0], " ").replace(/\s+/g, " ").trim() } : { words: [], rest: src };
}

export function parseRequest(text, context = {}) {
  const own = findOwnWords(text);
  text = own.rest;
  const t = norm(text);
  const plan = {};
  const kind = findKind(t);
  if (kind) plan.kind = kind;
  else if (/dictation|ορθογραφ/.test(t)) plan.dictationChoice = true;
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
    if (grammar.length || topic.split(" ").length >= 2) plan.source = { kind: "topic", topic: grammar.length ? grammar.join(", ") : topic[0].toUpperCase() + topic.slice(1) };
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
  const style = /dictation|dictogloss/.test(t) && Object.keys(DICTATION_STYLES).find((s) => t.includes(s) || (s === "classic" && /normal dictation/.test(t)));
  if (style) { plan.style = style; plan.kind = "dictation"; delete plan.dictationChoice; }
  if (own.words.length) plan.words = own.words;
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
  if (!plan.kind && plan.dictationChoice) {
    qs.push({ id: "kind", text: "Which dictation do you mean?", options: [
      { label: "📄 The Dictation sheet (vocabulary exercises, with the Lingo Launcher)", value: "worksheet" },
      { label: "🗣️ A read-aloud dictation (I read, they write)", value: "dictation" },
    ] });
  } else if (!plan.kind) qs.push({ id: "kind", text: "What would you like me to make?", options: Object.entries(KINDS).map(([k, v]) => ({ label: `${v.icon} ${v.label}`, value: k })) });
  const src = plan.source;
  if (!src || (src.kind === "unit" && (!src.bookId || !src.units?.length))) {
    const opts = [];
    if (context.bookId && context.unit) opts.push({ label: `📘 The unit I’m working on (Primary Path ${context.bookId.slice(-1)}, Unit ${context.unit})`, value: { kind: "unit", bookId: context.bookId, units: [context.unit] } });
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
  else if (id === "topic") { const g = grammarLabel(value); p.source = { kind: "topic", topic: g }; p.grammar = [...new Set([...(p.grammar || []), g])]; }
  else p[id] = value;
  return p;
}

/** One-paragraph summary the assistant says back. */
export function planSummary(plan) {
  const kind = plan.kind === "test" && plan.source?.kind === "topic" ? "Test" : KINDS[plan.kind]?.label || "Something";
  const who = plan.levelId ? `${plan.levelId[0]} Senior` : "your class";
  const src = plan.source?.kind === "unit" && plan.source.bookId
    ? `Primary Path ${plan.source.bookId.slice(-1)}${plan.source.units?.length ? `, ${plan.source.units.length > 1 ? "Units" : "Unit"} ${plan.source.units.join(" & ")}` : ""}`
    : plan.source?.kind === "topic" ? `“${plan.source.topic || "a topic"}”` : plan.source?.kind === "current" ? "your current word list" : "";
  const bits = [];
  const skillList = (skills) => [...new Set(skills)].map((s) => { const n = skills.filter((x) => x === s).length; return `${n > 1 ? `${n}× ` : ""}${SKILLS[s].label.toLowerCase()}`; }).join(", ");
  if (plan.kind === "test" || plan.kind === "quiz") bits.push(plan.skills?.length ? skillList(plan.skills) : plan.length === "full" ? "all four skills" : plan.length === "quiz" ? "vocabulary, grammar and reading" : "listening, reading, vocabulary, grammar and writing");
  if (plan.kind === "dictation") bits.push(`${DICTATION_STYLES[plan.style || "classic"].label.toLowerCase()} style${plan.count ? `, ${plan.count} sentences` : ""}`);
  if (plan.grammar?.length) bits.push(`grammar: ${plan.grammar.join(", ")}`);
  if (plan.difficulty && plan.difficulty !== "level") bits.push(plan.difficulty === "easier" ? "a little easier" : "a little harder");
  if (plan.versions > 1) bits.push("versions A and B");
  if (plan.words?.length) bits.push(`also your words: ${plan.words.map((w) => w.english).join(", ")}`);
  return `${kind} for ${who}${src ? ` on ${src}` : ""}${bits.length ? ` — ${bits.join("; ")}` : ""}.`;
}

/** Small AI prompt that reads a fuzzy request into the same plan shape (used only when local parsing isn't enough). */
export function assistantPrompt(text, context = {}, plan = {}) {
  const system = `You help a Greek teacher of English (φροντιστήριο, classes A–E Senior, ages 8–14) plan a test, quiz, dictation or worksheet.
"worksheet" = the app's vocabulary sheets: a Lingo Launcher study sheet plus a Dictation sheet of vocabulary exercises (when the teacher says "dictation sheet" or means testing the unit's words, it is "worksheet"). "dictation" = a read-aloud dictation: the teacher reads sentences and the class writes them down.
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
  else if (ai.source?.kind === "topic" && ai.source.topic) p.source = { kind: "topic", topic: grammarLabel(ai.source.topic) };
  const skills = (ai.skills || []).filter((s) => SKILLS[s] && s !== "dictation");
  if (skills.length) p.skills = skills;
  if (Array.isArray(ai.grammar) && ai.grammar.length) p.grammar = [...new Set(ai.grammar.map(grammarLabel).filter(Boolean))].slice(0, 4);
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
  // A bare "dictation" is settled by asking "Which dictation do you mean?", not by the AI guessing.
  if (partial.dictationChoice && !partial.kind) return words > 14;
  if (!partial.kind && words > 3) return true;
  const understood = ["kind", "levelId", "source", "grammar", "skills", "length", "style", "count", "versions", "difficulty"].filter((k) => partial[k] !== undefined).length;
  return words > 14 && understood < 3;
}
