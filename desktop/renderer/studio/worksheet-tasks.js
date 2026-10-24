/* Vocab Master — the worksheet exercises (D01–D29 Dictation, L01–L13 Lingo Launcher practice) as a library, like the
 * Test Maker's (studio/tasks.js): what the children do, why, its kind (recognise → recall → create), the classes it
 * suits (fit, 0 = A Senior … 4 = E Senior), a tiny paper preview and the settings each exercise can have.
 * Pure data and helpers — app.js (class profiles, the smart mix, the prompt) and js/views/exercises.js (Step 3) read it.
 * Fit follows the Cambridge formats each class works towards (A ≈ Starters/Movers, B Movers, C Flyers, D A2 Key,
 * E B1 Preliminary) — see docs/research/exercise-design.md → "Worksheet exercises: one library with the Test Maker". */

import { levelIndex } from "./tasks.js";

export const WS_SHEETS = {
  dictation: { label: "Dictation", icon: "📝", note: "assessment — every unit word is tested here" },
  lingo: { label: "Lingo Launcher practice", icon: "🚀", note: "practice under the word table" },
};

/**
 * sheet · kind · fit [first, last] · knobs ("extras": the word box) · needs (a field of the word list) · trains ·
 * blurb (for teachers) · sample (the same shape as the Test Maker's previews: q, o + a, bank, pairs, hint, pics, list).
 */
export const WS_TASKS = {
  D01: { sheet: "dictation", kind: "recall", fit: [0, 4], knobs: ["extras"], trains: ["Meaning", "Spelling"],
    blurb: "Short definitions with a gap and a box of this exercise's words. Children read the meaning and write the word — the Movers / Flyers “read the definition, write the word” task. For A Senior the definitions are very simple (“It's an animal. It gives us milk.”).",
    sample: { bank: ["track", "medal", "coach"], q: "A path where runners race: ________", a: "track" } },
  D02: { sheet: "dictation", kind: "recall", fit: [1, 4], needs: "derivatives", trains: ["Word families", "Word class"],
    blurb: "A sentence with a gap and a word of the same family in bold capitals; children write the form that fits. Word building the way Cambridge tests it — B Senior with easy endings (-er, -y), older classes with prefixes and suffixes.",
    sample: { q: "Did you win the swimming ________? COMPETE", a: "competition" } },
  D03: { sheet: "dictation", kind: "recognise", fit: [0, 4], trains: ["Words in context"],
    blurb: "A sentence with a gap and two or three words in brackets; only one fits. Children must understand the whole sentence — a calm, fair start for every class.",
    sample: { q: "Athletes train every day to stay in ________.", o: ["track", "shape", "limb"], a: 1 } },
  D04: { sheet: "dictation", kind: "recall", fit: [1, 4], trains: ["Phrases", "Recall without help"],
    blurb: "A phrase or sentence with one word missing and no help at all; children recall it from the context. True recall — a stretch for A Senior, who do better with a word box (Definition + word bank).",
    sample: { q: "Run four times around the ________.", a: "track" } },
  D05: { sheet: "dictation", kind: "recognise", fit: [0, 4], needs: "antonyms", trains: ["Opposites"],
    blurb: "A word and three options in brackets; children choose its opposite. Uses only the opposites in your word list, so it checks what the class learned (big ↔ small for A Senior, ancient ↔ modern later).",
    sample: { q: "ancient", o: ["modern", "wooden", "noisy"], a: 0 } },
  D06: { sheet: "dictation", kind: "recognise", fit: [1, 4], needs: "synonyms", trains: ["Synonyms", "Meaning"],
    blurb: "A word and three options; children choose the one that means the same. Same-meaning words are a step after opposites — from B Senior, and only with the synonyms in your word list.",
    sample: { q: "contest", o: ["sequence", "competition", "limb"], a: 1 } },
  D07: { sheet: "dictation", kind: "recall", fit: [3, 4], trains: ["Word parts", "Spelling"],
    blurb: "Word parts with plus signs (in + spire + ation); children put them together and write the word. Looking inside long words — for D–E Senior, who meet prefixes and suffixes in A2–B1 texts.",
    sample: { q: "in + spire + ation = ________", a: "inspiration" } },
  D08: { sheet: "dictation", kind: "recall", fit: [2, 4], trains: ["Meaning in context", "Easily confused words"],
    blurb: "One wrong word in [brackets] — a real word that doesn't fit the meaning. Children write the unit word that does. They must understand the sentence and then recall the right word (the Test Maker's “Find the wrong word”).",
    sample: { q: "The runners ran around the [limb] twice.", a: "track" } },
  D09: { sheet: "dictation", kind: "recall", fit: [3, 4], trains: ["Accuracy", "Word forms"],
    blurb: "A sentence with one grammar mistake around a unit word (wrong form, wrong ending); children write the right form. Trains the eye they need to check their own writing — for D–E Senior.",
    sample: { q: "She wants to competing in the race tomorrow.", a: "compete" } },
  D10: { sheet: "dictation", kind: "recall", fit: [2, 4], needs: "derivatives", trains: ["Word building", "Prefixes and suffixes"],
    blurb: "The ending or beginning is given (add -ion to compete); children build and write the new word. A guided first step into word formation for C–E Senior.",
    sample: { q: "Add -ition to “compete”: ________", a: "competition" } },
  D11: { sheet: "dictation", kind: "recognise", fit: [0, 3], trains: ["Word groups", "Thinking about meaning"],
    blurb: "Four words; three belong together and children circle the odd one. Makes them think about what each word means — playful and quick for A–D Senior.",
    sample: { o: ["track", "stadium", "court", "pizza"], a: 3 } },
  D12: { sheet: "dictation", kind: "recognise", fit: [0, 3], trains: ["Reading for meaning", "Clues"],
    blurb: "A short riddle (“Runners race on me…”) with three options in brackets. Children read the clues to find the word — the old Starters riddle, loved by A–D Senior.",
    sample: { q: "Runners race on me around the stadium.", o: ["limb", "sequence", "track"], a: 2 } },
  D13: { sheet: "dictation", kind: "recognise", fit: [0, 4], trains: ["Meaning"],
    blurb: "Words on the left, kid-friendly meanings in a lettered list; children write the letter. A calm check that they know what each word means.",
    sample: { pairs: [["compete", "take part in a race"], ["medal", "a prize for the winner"], ["coach", "a sports teacher"]] } },
  D14: { sheet: "dictation", kind: "recall", fit: [3, 4], trains: ["Words in a text", "Reading for meaning"],
    blurb: "One short paragraph with numbered gaps and no word box; children recall each word from the whole text. Reading and vocabulary together — the open-cloze idea of A2 Key / B1 Preliminary, for D–E Senior.",
    sample: { text: "Before the big race, the athletes walked onto the (1) ________ to warm up.", q: "(1)", a: "track" } },
  D15: { sheet: "dictation", kind: "recognise", fit: [0, 4], trains: ["Meaning in use", "Checking facts"],
    blurb: "Statements that use the unit words; children write T or F. The false ones use a word with the wrong meaning, so they must really know it.",
    sample: { q: "When you compete, you take part in a race.", a: "T" } },
  D16: { sheet: "dictation", kind: "recognise", fit: [0, 4], trains: ["Word groups", "Organising vocabulary"],
    blurb: "A box of unit words and two or three group headings (Sports places / Body parts); children write every word in its group. Sorting makes them think about meaning.",
    sample: { bank: ["track", "arm", "stadium", "leg"], q: "Sports places:", a: "track, stadium" } },
  D17: { sheet: "dictation", kind: "recall", fit: [2, 4], trains: ["Collocations", "Natural English"],
    blurb: "One half of a fixed phrase is given and children write the partner word (overcome a ________). Collocations are where Greek learners slip — a C–E Senior task (the Test Maker's “Word partners”).",
    sample: { q: "win a gold ________", a: "medal" } },
  D18: { sheet: "dictation", kind: "recognise", fit: [4, 4], trains: ["Register", "Formal and informal"],
    blurb: "Two ways to say it in brackets — formal or everyday; children choose the one that fits the situation. Register matters from B1 (emails to a friend vs. a school notice), so it is for E Senior.",
    sample: { q: "The ceremony will ________ at 8 p.m. (notice)", o: ["kick off", "commence"], a: 1 } },
  D19: { sheet: "dictation", kind: "recall", fit: [3, 4], trains: ["Precise meaning", "Spelling"],
    blurb: "A precise definition and no word box or letter help; children write the word. Pure meaning-recall — for D–E Senior (younger classes: Definition + word bank).",
    sample: { q: "A natural or artificial arm or leg: ________", a: "limb" } },
  D20: { sheet: "dictation", kind: "recall", fit: [3, 4], trains: ["Accuracy", "Using words correctly"],
    blurb: "Each sentence uses a unit word wrongly; children write the whole sentence again, correctly. Rewriting is harder than spotting — for D–E Senior.",
    sample: { q: "Please sequence me to your new coach.", a: "Please introduce me to your new coach." } },
  D21: { sheet: "dictation", kind: "recognise", fit: [1, 4], trains: ["Sequence", "Steps of a process"],
    blurb: "Three or four short steps of one everyday event, mixed up (a, b, c); children write them in order. The unit words carry the steps — like Movers / Flyers story order, from B Senior.",
    sample: { list: ["Then step onto the track.", "First, warm up.", "Finally, compete."], a: "b, a, c" } },
  D22: { sheet: "dictation", kind: "recall", fit: [1, 4], trains: ["Meaning", "Spelling"],
    blurb: "Crossword-style clues with the number of letters; children write the word. The letter count helps spelling — from B Senior.",
    sample: { q: "A path where athletes run races (5 letters)", hint: "_ _ _ _ _", a: "track" } },
  D23: { sheet: "dictation", kind: "recall", fit: [3, 4], trains: ["Relationships between words", "Reasoning"],
    blurb: "Word is to word as word is to ____ (hot is to cold as up is to ____). Children must see the link (opposite, part of, used for) — analogies in “A is to B” form are hard before about 12, so they are for D–E Senior.",
    sample: { q: "Arm is to body as wheel is to ________.", a: "bike" } },
  D24: { sheet: "dictation", kind: "recognise", fit: [3, 4], trains: ["Easily confused words", "Spelling"],
    blurb: "Two words that look or sound alike in brackets (quiet / quite, inspiration / respiration); children choose the right one. For D–E Senior, who meet more look-alike words.",
    sample: { q: "Her story was a great ________ to us.", o: ["inspiration", "respiration"], a: 0 } },
  D25: { sheet: "dictation", kind: "recall", fit: [0, 2], needs: "pictures", trains: ["Spelling", "Naming things"],
    blurb: "The app's own pictures with a short clue; children write the word — Cambridge “look and write”. Pictures carry the meaning, the strongest way for young classes to remember words.",
    sample: { pics: ["🏃"], q: "(an oval path for runners)", a: "track" } },
  D26: { sheet: "dictation", kind: "recall", fit: [0, 2], trains: ["Spelling", "Word shape"],
    blurb: "The word's letters mixed up, with a short clue; children write the word. Playful spelling practice — the Starters unjumble task.",
    sample: { q: "ckrat (a path for running races)", a: "track" } },
  D27: { sheet: "dictation", kind: "recall", fit: [0, 2], trains: ["Spelling"],
    blurb: "The word with two or three letters missing and a clue (t _ a _ k); children complete it. Gentle spelling recall for young classes.",
    sample: { q: "t _ a _ k (a path for running races)", a: "track" } },
  D28: { sheet: "dictation", kind: "recall", fit: [1, 4], trains: ["Spelling", "Checking your writing"],
    blurb: "One unit word in [brackets] is misspelt (a real learner mistake); children write it correctly. Trains the spelling Greek learners trip on — from B Senior.",
    sample: { q: "The runners ran around the [trak].", a: "track" } },
  D29: { sheet: "dictation", kind: "create", fit: [1, 4], trains: ["Using words", "Writing sentences"],
    blurb: "A unit word and an idea from the children's lives; they write their own sentence that shows what the word means. Using a word yourself is what makes it stick.",
    sample: { q: "TRACK — your school", a: "Our school has a track where we run every Friday." } },

  L01: { sheet: "lingo", kind: "recall", fit: [0, 4], knobs: ["extras"], trains: ["Words in context"],
    blurb: "New sentences with a gap and a box of this exercise's words; children write the right word. The classic, fair practice task for every class.",
    sample: { bank: ["track", "medal", "coach"], q: "You run four times around the ________.", a: "track" } },
  L02: { sheet: "lingo", kind: "recognise", fit: [0, 4], trains: ["Words in context"],
    blurb: "Each sentence has two words in brackets; children circle the one that fits. Quick, confidence-building practice right under the word table.",
    sample: { q: "My teacher is a great ________ to all her students.", o: ["inspiration", "track"], a: 0 } },
  L03: { sheet: "lingo", kind: "recognise", fit: [1, 4], needs: "synonyms", trains: ["Synonyms"],
    blurb: "A word and three options; children choose the one that means the same. Only the synonyms in your word list — from B Senior.",
    sample: { q: "compete", o: ["race", "rest", "forget"], a: 0 } },
  L04: { sheet: "lingo", kind: "recognise", fit: [0, 4], needs: "antonyms", trains: ["Opposites"],
    blurb: "A word and three options; children choose its opposite. Only the opposites in your word list — fine from A Senior (big ↔ small).",
    sample: { q: "active", o: ["lazy", "fast", "strong"], a: 0 } },
  L05: { sheet: "lingo", kind: "recall", fit: [1, 4], knobs: ["extras"], trains: ["Phrases", "Words that go together"],
    blurb: "Phrases with a gap and a box of this exercise's words; children complete each phrase. Practice with the word's usual partners — from B Senior.",
    sample: { bank: ["shape", "medal", "race"], q: "exercise every morning to stay in ________", a: "shape" } },
  L06: { sheet: "lingo", kind: "recognise", fit: [2, 4], trains: ["Word class"],
    blurb: "Children label each word noun, verb or adjective. Knowing the word class helps them build sentences and word families — from C Senior, when the class has met the terms.",
    sample: { q: "compete", o: ["noun", "verb", "adjective"], a: 1 } },
  L07: { sheet: "lingo", kind: "recall", fit: [2, 4], needs: "derivatives", trains: ["Word families"],
    blurb: "A word and its word class; children write the family form asked for (compete → competition). Uses the derivatives in your word list — from C Senior.",
    sample: { q: "compete (v.) → ________ (n.)", a: "competition" } },
  L08: { sheet: "lingo", kind: "recall", fit: [0, 4], trains: ["Word order", "Building sentences"],
    blurb: "The words of a sentence, mixed up; children write the sentence. Word order with the unit words — a Starters / Movers favourite that suits every class (longer sentences for older ones).",
    sample: { q: "around / ran / track / the / they", a: "They ran around the track." } },
  L09: { sheet: "lingo", kind: "recognise", fit: [0, 3], trains: ["Word groups"],
    blurb: "Four words; three share a link and children circle the odd one. Light, fun practice — groups by meaning for young classes, by word class for older ones.",
    sample: { o: ["track", "medal", "stadium", "introduce"], a: 3 } },
  L10: { sheet: "lingo", kind: "create", fit: [1, 4], trains: ["Talking about yourself", "Using words"],
    blurb: "Questions about the children's own lives that use the unit words; they answer in a full sentence. Personal, so the words stick — from B Senior.",
    sample: { q: "Who is a big inspiration in your life?", a: "My grandma is a big inspiration to me." } },
  L11: { sheet: "lingo", kind: "recognise", fit: [0, 4], trains: ["Meaning", "Thinking about the word"],
    blurb: "Yes / no questions that check real understanding (Do athletes compete in a stadium?). Quick, and children must think about what the word means.",
    sample: { q: "Do athletes compete in a stadium?", a: "Yes" } },
  L12: { sheet: "lingo", kind: "recall", fit: [1, 4], trains: ["Spelling"],
    blurb: "One unit word in [brackets] is misspelt; children write it correctly. Spelling practice with the mistakes Greek learners really make — from B Senior.",
    sample: { q: "She won the swimming [competion].", a: "competition" } },
  L13: { sheet: "lingo", kind: "recognise", fit: [2, 4], trains: ["Meaning in use", "Collocations"],
    blurb: "Two sentences, A and B, use the same word; only one uses it correctly. Knowing how a word is used, not just its translation — from C Senior.",
    sample: { q: "A. They ran around the track.  B. They ran around the tracking.", o: ["A", "B"], a: 0 } },
};

/** What the learner does — the same three kinds (and colours) as the Test Maker. */
export const WS_KINDS = {
  recognise: { label: "Recognise", hint: "Choose, match or decide — the answer is on the page." },
  recall: { label: "Recall", hint: "Write the word or the answer themselves." },
  create: { label: "Create", hint: "Write freely with the unit's words." },
};

/** The word-list field an exercise needs, as Step 2 names it. */
export const WS_NEEDS = {
  synonyms: { feature: "hasSynonyms", label: "synonyms" },
  antonyms: { feature: "hasAntonyms", label: "opposites" },
  derivatives: { feature: "hasDerivatives", label: "word families (derivatives)" },
  pictures: { feature: "hasPictures", label: "3+ words with word-bank pictures" },
};

/** Why an exercise can't be used with this word list ("" when it can). features: analyzeVocabFeatures(form). */
export function wsBlock(id, features = {}) {
  const need = WS_NEEDS[WS_TASKS[id]?.needs];
  if (!need) return "";
  if (need.feature === "hasPictures") {
    const n = Array.isArray(features.pictureWords) ? features.pictureWords.length : (features.hasPictures ? 3 : 0);
    return n >= 3 ? "" : "needs 3+ words that have word-bank pictures";
  }
  return features[need.feature] ? "" : `needs ${need.label} in your word list (Step 2)`;
}

const LETTERS = "ABCDE";

/** How well an exercise suits a class — the Test Maker's labels: "great", "stretch" (older classes) or "easy". */
export function wsTaskFit(id, levelId) {
  const t = WS_TASKS[id];
  if (!t) return { fit: "great", label: "", range: "" };
  const i = levelIndex(levelId);
  const [a, b] = t.fit;
  const range = a === b ? `${LETTERS[a]} Senior` : `${LETTERS[a]}–${LETTERS[b]} Senior`;
  if (i < a) return { fit: "stretch", label: `A stretch · usually ${range}`, range };
  if (i > b) return { fit: "easy", label: `Easy · usually ${range}`, range };
  return { fit: "great", label: `Great for ${LETTERS[i]} Senior`, range };
}

/** A sheet's exercises: best for the class first, then the rest in catalogue order. */
export function wsTasksFor(sheet, levelId = null) {
  const list = Object.entries(WS_TASKS).filter(([, t]) => t.sheet === sheet).map(([id, t]) => ({ id, ...t }));
  if (!levelId) return list;
  const rank = { great: 0, stretch: 1, easy: 2 };
  return list.map((t, i) => ({ t, i, r: rank[wsTaskFit(t.id, levelId).fit] })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.t);
}

/** The exercises made for a class (the smart mix's pool, and the class profile's allowDictation / allowLingo). */
export function wsAllowed(sheet, levelIndexValue) {
  return Object.entries(WS_TASKS)
    .filter(([, t]) => t.sheet === sheet && levelIndexValue >= t.fit[0] && levelIndexValue <= t.fit[1])
    .map(([id]) => id);
}

/** kind per exercise id (the old EXERCISE_FAMILIES). */
export const WS_KIND_OF = Object.fromEntries(Object.entries(WS_TASKS).map(([id, t]) => [id, t.kind]));

/* ── Each exercise's own settings (Step 3), like a Test Maker part ─────────────────────────────── */

/** The difficulty steps of one exercise (the Test Maker's five), with what they ask of the AI. */
export const WS_LEVELS = [
  null,
  { label: "Easier", guide: "very familiar everyday contexts, short simple sentences, strong context clues; wrong options clearly different in meaning" },
  { label: "A bit easier", guide: "familiar contexts and simple sentences; one wrong option may be a near miss, the others are clearly wrong" },
  { label: "For the class", guide: "" },
  { label: "A bit harder", guide: "fewer obvious clues; wrong options close in meaning or form (same word class); slightly longer, still class-level sentences" },
  { label: "Challenging", guide: "all the options are very close — one detail of meaning, form or collocation decides; learners must read the whole sentence" },
];
export const WS_ITEMS = [3, 10];
export const WS_EXTRAS = [[0, "None · one per gap"], [1, "+1"], [2, "+2"], [3, "+3"]];

/** One exercise's settings, cleaned: { items?, level?, extras?, note? } (absent = follow the worksheet). */
export function cleanSettings(s) {
  const out = {};
  const items = Number(s?.items);
  if (Number.isFinite(items) && items >= WS_ITEMS[0] && items <= WS_ITEMS[1]) out.items = Math.round(items);
  const level = Number(s?.level);
  if (Number.isFinite(level) && level >= 1 && level <= 5 && Math.round(level) !== 3) out.level = Math.round(level);
  const extras = Number(s?.extras);
  if (Number.isFinite(extras) && extras >= 0 && extras <= 3 && s?.extras !== undefined && s?.extras !== null && s?.extras !== "") out.extras = Math.round(extras);
  const note = String(s?.note || "").trim().slice(0, 160);
  if (note) out.note = note;
  return out;
}

const SHEET_KEYS = { dictation: ["dictationTypes", "dictationExerciseCount"], lingo: ["lingoTypes", "lingoPracticeCount"] };

/** A sheet's exercises as rows: [{ type, items?, level?, extras?, note? }]. */
export function planEntries(plan, sheet) {
  const [typesKey] = SHEET_KEYS[sheet];
  const settings = plan?.settings?.[sheet] || [];
  return (plan?.[typesKey] || []).map((type, i) => ({ type, ...cleanSettings(settings[i]) }));
}

/** The plan with a sheet's exercises replaced (types, count, settings and signature kept in step). */
export function withEntries(plan, sheet, entries) {
  const [typesKey, countKey] = SHEET_KEYS[sheet];
  const next = { ...(plan || {}), exerciseMode: "custom" };
  next[typesKey] = entries.map((e) => e.type);
  next[countKey] = entries.length;
  const settings = { ...(plan?.settings || {}) };
  const list = entries.map(({ type: _t, ...rest }) => cleanSettings(rest));
  if (list.some((s) => Object.keys(s).length)) settings[sheet] = list;
  else delete settings[sheet];
  if (Object.keys(settings).length) next.settings = settings;
  else delete next.settings;
  next.signature = `${(next.dictationTypes || []).join("+")}|${(next.lingoTypes || []).join("+")}`;
  return next;
}

/** One exercise's settings (cleaned), or {}. */
export function settingsAt(plan, sheet, i) {
  return cleanSettings(plan?.settings?.[sheet]?.[i]);
}

/** How many lines one exercise should have: its own number, else the worksheet's. */
export function itemsAt(plan, sheet, i, fallback) {
  return settingsAt(plan, sheet, i).items || fallback;
}

/**
 * The prompt lines for the exercises the teacher set up one by one ("" when none has its own settings).
 * labels: { D01: "Definition + word bank", … }.
 */
export function exerciseSettingsBlock(plan, labels = {}) {
  const lines = [];
  for (const sheet of ["dictation", "lingo"]) {
    planEntries(plan, sheet).forEach((e, i) => {
      const bits = [];
      if (e.items) bits.push(`EXACTLY ${e.items} items`);
      if (e.level) bits.push(`difficulty ${WS_LEVELS[e.level].label.toUpperCase()}: ${WS_LEVELS[e.level].guide}`);
      if (e.extras !== undefined && WS_TASKS[e.type]?.knobs?.includes("extras")) bits.push(e.extras ? `its word box = the answers + EXACTLY ${e.extras} extra word${e.extras > 1 ? "s" : ""} that fit no gap` : "its word box = exactly the answers, no extra words");
      if (e.note) bits.push(`the teacher's wish: “${e.note}”`);
      if (bits.length) lines.push(`- ${sheet === "dictation" ? "Dictation" : "Lingo"} exercise ${i + 1} (${e.type}${labels[e.type] ? ` ${labels[e.type]}` : ""}): ${bits.join("; ")}`);
    });
  }
  if (!lines.length) return "";
  return `

EXERCISE SETTINGS — mandatory (the teacher set these exercises up one by one; they override the class profile and the worksheet's fine-tuning for that exercise only):
${lines.join("\n")}`;
}
