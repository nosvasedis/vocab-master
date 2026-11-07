/* Vocab Master — does a gapped sentence read right once its answer is in the gap? (pure, DOM-free)
 *
 * The AI writes gap sentences for worksheets and tests; now and then the words AROUND the gap don't fit the answer:
 * "My ________ works on a farm." → farmer (nobody has their own farmer: "The farmer works on a farm."),
 * "She ate a ________." → apple ("an apple"), "I saw two ________." → elephant ("two elephants"),
 * "the ________" → "the station" written as the answer (the the station). The answer itself is right, so nothing
 * else catches it — but the sentence a child reads is wrong English. Here:
 *   - gapFitProblem: what is wrong around the gap ("" when nothing), said for the AI fixer and the teacher.
 *   - SENTENCE_RULES / sentenceRulesBlock: the same rules told to the writer up front (worksheets, tests, fixes,
 *     remakes), so most of these never get written.
 * Only sure, mechanical mistakes are flagged — a sentence that is merely plain is not a problem. */

const GAP = /_{3,}/;
const CHOICE = /\(([^()]*\/[^()]*)\)/;

/** Words that start with a vowel letter but a consonant sound (a uniform, a European, a one-way street). */
const CONSONANT_SOUND = /^(uni(?!n|mp|mag)|unanim|use|usu|usa|ura|ure|uri|uro|uten|uter|util|eu|ewe|one\b|once|ouija)/;
/** Words that start with a silent h (an hour, an honest girl). */
const SILENT_H = /^(hour|honest|honou?r|heir)/;

/** Does a word start with a vowel SOUND (so it takes "an")? null when it can't tell (a number, a symbol). */
export function vowelSound(word) {
  const w = String(word || "").toLowerCase().replace(/^[^a-z0-9]+/, "");
  if (!w || /^\d/.test(w)) return null;
  if (SILENT_H.test(w)) return true;
  if (/^[aeiou]/.test(w)) return !CONSONANT_SOUND.test(w);
  return false;
}

const DETERMINERS = new Set(["a", "an", "the", "my", "your", "his", "her", "its", "our", "their", "this", "that", "these", "those", "every", "each", "another"]);
const POSSESSIVES = new Set(["my", "your", "his", "her", "our", "their"]);
const ONE = new Set(["a", "an", "one", "every", "each", "another"]);
const MANY = new Set(["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "many", "several", "these", "those", "both", "few"]);
const IRREGULAR_PLURALS = new Set(["people", "children", "men", "women", "feet", "teeth", "mice", "geese", "sheep", "fish", "deer", "police", "cattle", "clothes", "jeans", "trousers", "glasses", "scissors", "shorts", "pyjamas", "news"]);

/**
 * People nobody "has" (a job or a role, not a relation): "my teacher", "my doctor", "my coach" are fine,
 * "my farmer", "my pilot", "my astronaut" are not.
 */
const NOT_OWNED = new Set(`farmer firefighter fireman firewoman pilot astronaut soldier sailor scientist explorer inventor archaeologist
astronomer biologist actor actress singer dancer musician artist painter writer author poet photographer journalist reporter
waiter waitress chef baker butcher builder zookeeper lifeguard footballer athlete champion winner loser pirate king queen prince
princess knight president shopkeeper cashier librarian postman postwoman policeman policewoman fisherman fisherwoman engineer
architect detective spy tourist visitor passenger stranger customer climber diver surfer skier traveller traveler magician clown
juggler acrobat referee goalkeeper ranger vet-nurse mail-carrier`.split(/\s+/).filter(Boolean));
const NOT_OWNED_PHRASES = ["police officer", "zoo keeper", "film star", "pop star", "bus driver", "taxi driver", "train driver", "shop assistant", "mail carrier", "fire fighter", "tour guide"];

const words = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
const singular = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(ches|shes|xes|ses|zes)$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w);

/** The noun entries of a word list, by their headword (lower case). */
function nounHeads(vocab) {
  const out = new Map();
  for (const v of vocab || []) {
    const e = String(v?.english || "").trim().toLowerCase();
    if (!e || e.includes(" ")) continue;
    const t = String(v?.type || "").toLowerCase();
    if (/^(n\b|noun|pl)/.test(t) || /\bnoun\b|\bn\b/.test(t)) out.set(e, v);
  }
  return out;
}

/**
 * The text around the gap of a line: { before, after } — the words before and after the "________" (or, for a line
 * whose options stand where the word goes, "(a / b)"). null when the line has no gap.
 */
export function gapContext(text) {
  const t = String(text || "");
  let m = t.match(GAP);
  if (!m) m = t.match(CHOICE);
  if (!m) return null;
  const before = t.slice(0, m.index);
  // "… ________ (track / shape / limb)": the options after the gap are not the next word.
  const after = t.slice(m.index + m[0].length).replace(/^\s*\([^()]*\/[^()]*\)/, "");
  return { before, after };
}

/**
 * What is wrong around the gap once the answer is in it ("" when nothing). text: the line or sentence with ONE
 * gap; answer: the right word or phrase; options: a choice line's options (the article before the gap must not rule
 * any of them out); vocab: the word list (to know which answers are nouns).
 */
export function gapFitProblem(text, answer, { options = [], vocab = [] } = {}) {
  const ctx = gapContext(text);
  const ans = String(answer ?? "").trim();
  // A list of answers or a whole sentence is not a word in a gap.
  if (!ctx || !ans || /[\/,;]/.test(ans) || ans.length > 40) return "";
  const prev = words(ctx.before).slice(-1)[0] || "";
  const prev2 = words(ctx.before).slice(-2)[0] || "";
  const next = words(ctx.after)[0] || "";
  const aw = words(ans);
  if (!aw.length) return "";
  // A single letter is a matching key ("passion ________" → C) — unless it is the article "a" before a word.
  if (/^[a-z]$/i.test(ans) && !(ans === "a" && next)) return "";
  const first = aw[0];
  const last = aw[aw.length - 1];
  const q = (w) => `"${w}"`;

  // The answer is itself an article: it must fit the word after the gap ("________ apple" → an).
  if ((first === "a" || first === "an") && aw.length === 1 && next) {
    const v = vowelSound(next);
    if (v !== null && (first === "an") !== v) return `"${ans}" doesn't fit before ${q(next)} — it needs "${v ? "an" : "a"}"; write the sentence so the answer fits the word after the gap`;
    return "";
  }
  // Two articles or possessives in a row: "the ________" with the answer "the station".
  if (DETERMINERS.has(prev) && /^(a|an|the|my|your|his|her|its|our|their)$/.test(first) && aw.length > 1) {
    return `the sentence already has ${q(prev)} before the gap and the answer starts with ${q(first)} ("${prev} ${ans}") — the answer is only the word itself, or take ${q(prev)} out of the sentence`;
  }
  // The same word twice: "on ________" → "on time" is fine, "the ________" + "the" is not.
  if (prev && prev === first && !/^\d+$/.test(prev)) return `${q(prev)} comes twice ("${prev} ${ans}") — the word before the gap is already part of the answer`;
  if (next && next === last && aw.length > 1) return `${q(next)} comes twice ("${ans} ${next}") — the word after the gap is already part of the answer`;

  // One thing vs many: "a ________" + "apples", "two ________" + "apple".
  const nouns = nounHeads(vocab);
  if (aw.length === 1) {
    if (ONE.has(prev) && !(prev === "a" && prev2 === "such") && /s$/.test(first) && !/(ss|us|is)$/.test(first)) {
      const head = singular(first);
      if (nouns.has(head) && !nouns.has(first)) return `${q(`${prev} ________`)} is for one thing, but the answer ${q(ans)} is plural — use "${head}" or change the words before the gap`;
    }
    if (MANY.has(prev) && !(prev2 === "a" && prev === "few") && nouns.has(first) && !/s$/.test(first) && !IRREGULAR_PLURALS.has(first)) {
      return `${q(`${prev} ________`)} needs a plural, but the answer is ${q(ans)} — make the answer plural or change the words before the gap`;
    }
  }

  // a / an before the gap must fit the answer…
  if (prev === "a" || prev === "an") {
    const v = vowelSound(first);
    if (v !== null && (prev === "an") !== v) return `${q(`${prev} ________`)} doesn't fit the answer ${q(ans)} (it is "${v ? "an" : "a"} ${ans}") — change the words around the gap so they fit, or use "the"`;
    // …and must not rule out any option (a choice where "an" leaves only one word that starts with a vowel).
    const opts = (options || []).map((o) => String(o || "").trim()).filter((o) => o && words(o).length <= 3);
    if (opts.length >= 2) {
      const out = opts.filter((o) => { const s = vowelSound(words(o)[0]); return s !== null && (prev === "an") !== s; });
      if (out.length) return `${q(prev)} before the gap gives the answer away — ${out.map(q).join(", ")} can't follow "${prev}", so write "the" or change the sentence so every option could fit`;
    }
  }

  // "My ________ works on a farm." → farmer: a job or role nobody "has" can't follow my / your / his …
  if (POSSESSIVES.has(prev)) {
    const phrase = aw.join(" ");
    const head = singular(last);
    if (NOT_OWNED.has(head) || NOT_OWNED.has(last) || NOT_OWNED_PHRASES.some((p) => phrase === p || phrase === `${p}s`)) {
      return `${q(`${prev[0].toUpperCase()}${prev.slice(1)} ________`)} sounds wrong with ${q(ans)} (people don't have their own ${ans}) — write "The ________" or "A ________", or change the sentence`;
    }
  }
  return "";
}

/** A gap problem from gapFitProblem (so the fixers know these lines can be rewritten safely). */
export const GAP_FIT_PROBLEM = /doesn't fit the answer|doesn't fit before|already has "[^"]+" before the gap|comes twice|gives the answer away — |is for one thing, but the answer|needs a plural, but the answer|sounds wrong with "[^"]+" \(people don't have/;

/**
 * What every sentence the AI writes must be — told to the writer (worksheets, tests, fixes, remakes) so most
 * problems are never written. Short lines: they travel in many prompts.
 */
export const SENTENCE_RULES = [
  "Every sentence is natural, correct English that a careful native-speaking teacher would print — read it once with the answer in the gap: it must sound right and make sense.",
  "The words around a gap fit the answer exactly: a/an agree with it (an apple, a uniform); singular or plural agree (two apples, one apple; the verb too); never two articles (\"the ________\" + \"the station\").",
  "my / your / his / her / our / their only with people and things you really have (my mum, my teacher, my bike) — never with a job or a role nobody owns: \"The farmer works on a farm.\", never \"My farmer…\"; \"The pilot flies the plane.\", never \"My pilot…\".",
  "Prefer \"the\" or a rephrase to \"a/an\" right before a gap: \"an ________\" tells the answer starts with a vowel.",
  "The context points to ONE answer: not \"I like ________.\" (anything fits) but \"I wear a ________ on my head when I ride my bike.\" (helmet). A clue that needs the MEANING beats one that repeats part of the word (\"The ________ works on a farm\" leans on farm → farmer; better \"The ________ grows vegetables and looks after the cows.\").",
  "Sentences are true and sensible for children (no fish climbing trees, no \"the hospital is a kind of animal\"), in the present real world unless a story says otherwise; each one about one clear situation.",
  "Names: short, easy and varied (Tom, Anna, Nick, Eleni, Leo, Mia) — never the same name in every line.",
];

/** The rules as a prompt block. */
export const sentenceRulesBlock = (heading = "SENTENCE QUALITY (every line, every option, every text)") => `${heading}:\n${SENTENCE_RULES.map((r) => `- ${r}`).join("\n")}`;

/**
 * The sentence around a numbered gap of a text — "(3) ________" in "We went to (3) ________ zoo." — so a passage's
 * gaps can be checked like single lines. "" when the text has no such gap.
 */
export function passageGapSentence(passage, n) {
  const text = String(passage || "");
  const re = new RegExp(`\\(\\s*${n}\\s*\\)\\s*_{3,}`);
  const m = text.match(re);
  if (!m) return "";
  // The other gaps of the text stand as plain words: they are not this item's gap.
  const startCut = Math.max(text.lastIndexOf(".", m.index), text.lastIndexOf("!", m.index), text.lastIndexOf("?", m.index), text.lastIndexOf("\n", m.index)) + 1;
  const tail = text.slice(m.index + m[0].length);
  const endRel = tail.search(/[.!?\n]/);
  const sentence = `${text.slice(startCut, m.index)}________${endRel < 0 ? tail : tail.slice(0, endRel + 1)}`;
  return sentence.replace(/\(\s*\d+\s*\)\s*_{3,}/g, "…").replace(/\s+/g, " ").trim();
}
