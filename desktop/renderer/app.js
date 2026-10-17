/* Vocab Master — core worksheet engine */
import {
  CPP_BOOKS,
  CPP_WORDBANK,
  resolveCoursebookId,
  getCppUnitStructure,
  parsePageRangeSpec,
  inferUnitFromPages,
  queryCoursebookWords,
  selectSmartCoursebookWords,
  lookupCoursebookWord,
} from "./coursebook-data.js";
import { sanitizeVocabField, rejectionNote } from "./vocab-quality.js";
import {
  buildArcadeDeck,
  buildDetectiveQuestions,
  buildTabooCard,
  maskWordInText,
} from "./arcade/deck.js";

const STORAGE_KEY = "lingo_maker_api_key";
const HISTORY_KEY = "lingo_maker_signatures";
const SAVES_KEY = "lingo_maker_saves";
const MAX_SAVES = 100;

/** Worksheet typography — preview, print, and .docx (Segoe UI covers Latin + Greek on Windows) */
const WORKSHEET_FONTS = {
  family: "Inter",
  css: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  display: '"Manrope", "Inter", "Segoe UI", Arial, sans-serif',
  docx: "Segoe UI",
  docxDisplay: "Segoe UI Black",
};

function worksheetDocxStyles() {
  return {
    default: {
      document: { run: { font: WORKSHEET_FONTS.docx, size: 22 } },
    },
  };
}

function wTextRun(TextRun, text, options = {}) {
  return new TextRun({ text, font: WORKSHEET_FONTS.docx, ...options });
}

const EXERCISE_FAMILIES = {
  D01: "recognition", D02: "productive", D03: "recognition", D04: "productive",
  D05: "productive", D06: "recognition", D07: "analysis", D08: "analysis",
  D09: "analysis", D10: "productive", D11: "analysis", D12: "analysis",
  D13: "recognition", D14: "productive", D15: "recognition", D16: "analysis",
  D17: "productive", D18: "recognition", D19: "recognition", D20: "productive",
  D21: "analysis", D22: "productive", D23: "analysis", D24: "recognition",
  D25: "recognition", D26: "productive", D27: "productive", D28: "analysis",
  L01: "productive", L02: "recognition", L03: "recognition", L04: "recognition",
  L05: "productive", L06: "analysis", L07: "productive", L08: "productive",
  L09: "analysis", L10: "productive", L11: "recognition", L12: "analysis", L13: "recognition",
};

const EXERCISE_LABELS = {
  D01: "Definition + word bank", D02: "Word stem collocation", D03: "Bracketed choice",
  D04: "Phrase completion", D05: "Opposite match", D06: "Synonym select",
  D07: "Word math", D08: "Sentence fixer", D09: "Grammar detective",
  D10: "Word formation", D11: "Odd one out", D12: "Mystery riddle",
  D13: "Matching columns", D14: "Cloze paragraph", D15: "True / false",
  D16: "Category sort", D17: "Collocation pair", D18: "Register choice",
  D19: "Definition (advanced)", D20: "Error correction", D21: "Sequencing",
  D22: "Crossword clue", D23: "Analogy", D24: "Minimal pair", D25: "Picture cue",
  D26: "Jumbled letters", D27: "Missing letters", D28: "Spelling check",
  L01: "Gap fill with list", L02: "Circle best word", L03: "Synonym match",
  L04: "Opposite pairs", L05: "Collocation match", L06: "Grammar labels",
  L07: "Derivative build", L08: "Sentence order", L09: "Odd one out (light)",
  L10: "Personalize prompt",
  L11: "Yes / No questions", L12: "Spelling check", L13: "Which sentence is right?",
};

const EXERCISE_DESCRIPTIONS = {
  D01: "Definitions with a gap — students pick answers from a shuffled word bank at the top.",
  D02: "Cambridge-style word formation: gap + bold related form at end — answer is a different form from the same family.",
  D03: "Sentence gap with (wrong / right / wrong) choices in brackets.",
  D04: "Finish a collocation or phrase — no hints, students recall the missing word.",
  D05: "Pick the true opposite from bracketed options. Needs antonyms in vocabulary.",
  D06: "Pick the correct synonym from bracketed options. Needs synonyms in vocabulary.",
  D07: "Combine or transform word parts to build the target word.",
  D08: "Wrong vocabulary word marked in [brackets] — students write the correct unit word.",
  D09: "Spot the grammar error or choose the correct form.",
  D10: "Build a new word from a given prefix, suffix, or root.",
  D11: "Circle the word that does not belong in the group.",
  D12: "Short riddle with 3 bracketed choices — clues must not give away the answer.",
  D13: "Match words in two columns (word ↔ definition or collocation).",
  D14: "One paragraph with several gaps — words recalled from context.",
  D15: "True or false statements about vocabulary in context.",
  D16: "Sort words into categories (e.g. sports / food). Uses a shuffled word bank.",
  D17: "Match each word to its natural collocation partner.",
  D18: "Choose formal vs informal / register-appropriate option.",
  D19: "Advanced definition task — precise meaning, no word bank.",
  D20: "Correct errors in sentences that use target vocabulary.",
  D21: "Put jumbled sentences or steps in the right order.",
  D22: "Crossword-style clues for vocabulary words.",
  D23: "Complete the analogy (word is to word as…).",
  D24: "Choose between similar-sounding or easily confused words.",
  D25: "Picture or emoji cue — optional paraphrase hint in brackets, never the answer word.",
  D26: "Unscramble the jumbled letters to make the unit word — a short clue in brackets helps.",
  D27: "Fill in the missing letters of the unit word (t _ a _ k) — a short clue helps.",
  D28: "One word in [brackets] is misspelt — students write it correctly.",
  L01: "Sentences with gaps — answers chosen from a shuffled word list.",
  L02: "Each sentence has (option A / option B) choices built in.",
  L03: "Match words to synonyms in brackets. Only for words with synonyms in vocab.",
  L04: "Match words to opposites in brackets. Only for words with antonyms in vocab.",
  L05: "Match headwords to collocation gaps (~5–6 items). Word list = only words in this exercise.",
  L06: "Label words by grammar category (noun, verb, etc.).",
  L07: "Build or identify a derivative form. Best when derivatives are in vocab.",
  L08: "Reorder words to make a correct sentence.",
  L09: "Odd one out: 4 words per line — exactly 3 share a link, 1 is different.",
  L10: "Personalize prompt using unit vocabulary.",
  L11: "Yes / No questions that check real understanding of the word (not just its definition).",
  L12: "One word in [brackets] is misspelt — students write it correctly.",
  L13: "Two sentences, A and B — only one uses the word correctly.",
};

const EXERCISE_EXAMPLES = {
  D01: 'A path or ground used for running races: ________ → track',
  D02: 'Did you win the swimming ________?  COMPETE → competition',
  D03: 'Athletes train every day to stay in ________. (track / shape / limb) → shape',
  D04: 'Run four times around the ________. → track',
  D05: 'ancient → (modern / wooden / noisy) → modern',
  D06: 'contest → (sequence / competition / limb) → competition',
  D07: 'in + spire + ation = ________ → inspiration',
  D08: 'The runners ran around the [limb] twice. → track',
  D09: 'She wants to competing in the race tomorrow. → compete',
  D10: 'Add -ition to "compete": ________ → competition',
  D11: 'track · stadium · court · introduce → introduce',
  D12: 'Runners race on me around the stadium. (limb / sequence / track) → track',
  D13: 'compete ________  (matches B. to take part in a race or contest)',
  D14: 'Before the big race, the athletes walked onto the (1) ________ to warm up…',
  D15: '( ) When you compete, you take part in a race or contest. → T',
  D16: 'Sports places: ________, ________  |  Body parts: ________, ________',
  D17: 'overcome a physical ________ → disability',
  D18: 'The ceremony will (kick off / commence) at 8 p.m. → commence',
  D19: 'A prosthetic or natural arm or leg of the body: ________ → limb',
  D20: 'Please sequence me to your new basketball coach. → Please introduce me…',
  D21: 'Order the steps: First warm up / Then step onto the track / Finally compete',
  D22: 'Across: 5 letters — A course where athletes run races: ________ → track',
  D23: 'Arm is to limb as stadium path is to ________. → track',
  D24: 'Her story was a great (inspiration / respiration) to us. → inspiration',
  D25: '🏃‍♀️🏟️ (oval path for runners) ________ → track',
  D26: 'ckrat (a path for running races) → track',
  D27: 't _ a _ k (a path for running races) → track',
  D28: 'The runners ran around the [trak]. → track',
  L01: 'You need to run four times around the ________ to finish the mile. → track',
  L02: 'My teacher is a great (inspiration / track) to all her students.',
  L03: 'compete (race / rest / forget) → race',
  L04: 'active (lazy / fast / strong) → lazy',
  L05: 'exercise every morning to ________ → stay in shape',
  L06: 'compete → verb  |  inspiration → noun',
  L07: 'compete (v.) → ________ (n.) → competition',
  L08: 'around / ran / track / the / they → They ran around the track.',
  L09: 'track, medal, stadium, introduce → introduce',
  L10: 'Who is a big inspiration in your life, and why?',
  L11: 'Do athletes compete in a stadium? → Yes',
  L12: 'She won the swimming [competion]. → competition',
  L13: 'A. They ran around the track.  B. They ran around the tracking. → A',
};

const BOOK_PRESETS = [
  "Cambridge Primary Paths 1",
  "Cambridge Primary Paths 2",
  "Cambridge Primary Paths 3",
  "Cambridge Primary Paths 4",
  "Super Minds 2",
  "Super Minds 3",
  "Super Minds 4",
  "Super Minds 5",
  "Prepare 1",
  "Prepare 2",
  "Prepare 3",
  "Prepare 4",
  "Eyes Open 1",
  "Eyes Open 2",
  "Eyes Open 3",
  "Think 1",
  "Think 2",
  "Go Getter 1",
  "Go Getter 2",
  "Go Getter 3",
  "Burlington Webkids 1",
  "Burlington Webkids 2",
  "Burlington Webkids 3",
  "Burlington Mind Trap 1",
  "Burlington Mind Trap 2",
];

/** Short student-facing task line shown under each exercise heading (print / preview / DOCX). */
const EXERCISE_STUDENT_INSTRUCTIONS = {
  D01: "Read each definition and write the correct word from the word bank.",
  D02: "Write a different form from the same word family in the gap. The bold word at the end is your clue — not the answer.",
  D03: "Choose the correct word from the options in brackets.",
  D04: "Write the missing word in each gap.",
  D05: "Choose the correct opposite from the options in brackets.",
  D06: "Choose the correct synonym from the options in brackets.",
  D07: "Use the word parts to build the correct word.",
  D08: "The word in [brackets] is wrong. Write the correct word from this unit on your answer sheet.",
  D09: "Find and correct the grammar mistake in each sentence.",
  D10: "Form a new word using the prefix, suffix, or root given.",
  D11: "Circle the word that does not belong in each group.",
  D12: "Read the riddle and choose the correct answer from the brackets.",
  D13: "Match each word to the correct letter from the definition list.",
  D14: "Fill in all the gaps in the paragraph with words from the unit.",
  D15: "Write T (true) or F (false) for each statement.",
  D16: "Sort the words from the word bank into the correct categories.",
  D17: "Complete each collocation with the missing word.",
  D18: "Choose the more formal or appropriate option in brackets.",
  D19: "Write the vocabulary word that fits each definition.",
  D20: "Each sentence has a vocabulary mistake. Write the corrected sentence on your answer sheet.",
  D21: "Put the sentences or steps in the correct order.",
  D22: "Solve the crossword-style clues.",
  D23: "Complete each analogy.",
  D24: "Choose the correct word from the similar options in brackets.",
  D25: "Look at the picture cue and write the correct word.",
  D26: "Unscramble the letters to make a word from the unit. The clue in brackets will help you.",
  D27: "Write the missing letters to complete each word. The clue in brackets will help you.",
  D28: "One word in [brackets] is spelt wrongly. Write it correctly on your answer sheet.",
  L01: "Fill in the gaps with words from the list.",
  L02: "Circle the best word in each sentence.",
  L03: "Choose the correct synonym from the options in brackets.",
  L04: "Choose the correct opposite from the options in brackets.",
  L05: "Match each headword to the collocation gap. Use the word list — ~5–6 items only.",
  L06: "Write the grammar category for each word (noun, verb, etc.).",
  L07: "Write the correct derivative form.",
  L08: "Put the words in the correct order to make a sentence.",
  L09: "Circle the odd one out in each group of four words.",
  L10: "Answer each question using words from the unit.",
  L11: "Read each question and write Yes or No.",
  L12: "One word in [brackets] is spelt wrongly. Write it correctly on your answer sheet.",
  L13: "Only one sentence is correct. Write A or B.",
};

function getStudentExerciseInstruction(ex) {
  const custom = String(ex?.instruction || "").trim();
  if (custom) return custom;
  return EXERCISE_STUDENT_INSTRUCTIONS[ex?.typeId] || EXERCISE_DESCRIPTIONS[ex?.typeId] || "";
}

const CLASS_PROFILES = {
  A_SENIOR: {
    id: "A_SENIOR", label: "A Senior", greekGrades: "3η / 4η / 5η Δημοτικού",
    cefr: "Early A1", ageRange: "9–10", defaultVocab: 6, maxSentenceWords: 7,
    minEmojis: 2, maxDerivatives: 1, allowDefinitionsInDictation: false,
    allowDictation: ["D01", "D03", "D04", "D06", "D13", "D15", "D17", "D25", "D26", "D27"],
    allowLingo: ["L01", "L02", "L04", "L05", "L09", "L11"],
    cognitiveMix: { recognition: 0.6, productive: 0.3, analysis: 0.1 },
    lingoPracticeWeights: [1, 0, 0],
    wordBankSize: 4, itemsPerExercise: 5,
    topics: "school, family, animals, sports, daily routine — concrete and visual",
    seedCombos: [["D01", "D03", "D04"], ["D13", "D03", "D04", "D15"]],
    seedLingo: [["L02"], ["L01"]],
  },
  B_SENIOR: {
    id: "B_SENIOR", label: "B Senior", greekGrades: "4η / 5η / 6η Δημοτικού",
    cefr: "A1", ageRange: "10–11", defaultVocab: 8, maxSentenceWords: 9,
    minEmojis: 2, maxDerivatives: 2, allowDefinitionsInDictation: false,
    allowDictation: ["D01", "D02", "D03", "D04", "D05", "D06", "D13", "D15", "D16", "D17", "D25", "D26", "D27", "D28"],
    allowLingo: ["L01", "L02", "L03", "L04", "L05", "L09", "L11"],
    cognitiveMix: { recognition: 0.5, productive: 0.35, analysis: 0.15 },
    lingoPracticeWeights: [0.8, 0.2, 0],
    wordBankSize: 5, itemsPerExercise: 5,
    topics: "school, family, hobbies, sports — simple familiar contexts",
    seedCombos: [["D01", "D03", "D04"], ["D01", "D02", "D03", "D17"]],
    seedLingo: [["L01"], ["L02", "L04"]],
  },
  C_SENIOR: {
    id: "C_SENIOR", label: "C Senior", greekGrades: "5η / 6η Δημοτικού · ίσως 1η Γυμνασίου",
    cefr: "A1–A2", ageRange: "11–12", defaultVocab: 8, maxSentenceWords: 11,
    minEmojis: 1, maxDerivatives: 3, allowDefinitionsInDictation: "simple",
    allowDictation: ["D01", "D02", "D03", "D04", "D05", "D06", "D08", "D11", "D12", "D13", "D16", "D17", "D25", "D26", "D27", "D28"],
    allowLingo: ["L01", "L02", "L03", "L04", "L05", "L09", "L11", "L12"],
    cognitiveMix: { recognition: 0.45, productive: 0.4, analysis: 0.15 },
    lingoPracticeWeights: [0.5, 0.5, 0],
    wordBankSize: 5, itemsPerExercise: 5,
    topics: "sports, health, school community, hobbies",
    seedCombos: [["D01", "D02", "D03", "D04"], ["D01", "D05", "D03", "D11", "D04"]],
    seedLingo: [["L01"], ["L02"]],
  },
  D_SENIOR: {
    id: "D_SENIOR", label: "D Senior", greekGrades: "6η Δημοτικού · 1η / 2α Γυμνασίου",
    cefr: "A2", ageRange: "12–13", defaultVocab: 8, maxSentenceWords: 13,
    minEmojis: 0, maxDerivatives: 4, allowDefinitionsInDictation: "short",
    allowDictation: ["D01","D02","D03","D04","D05","D06","D07","D08","D09","D10","D11","D12","D13","D15","D16","D17","D20","D21","D23","D25","D26","D27","D28"],
    allowLingo: ["L01","L02","L03","L04","L05","L06","L07","L08","L09","L11","L12","L13"],
    cognitiveMix: { recognition: 0.4, productive: 0.4, analysis: 0.2 },
    lingoPracticeWeights: [0.5, 0.5, 0],
    wordBankSize: 6, itemsPerExercise: 6,
    topics: "health, technology, social life, environment — teen-appropriate",
    seedCombos: [["D01", "D02", "D08"], ["D02", "D07", "D11", "D04", "D10"]],
    seedLingo: [["L01"], ["L02", "L05"]],
  },
  E_SENIOR: {
    id: "E_SENIOR", label: "E Senior", greekGrades: "1η / 2α / 3η Γυμνασίου",
    cefr: "B1", ageRange: "13–14", defaultVocab: 8, maxSentenceWords: 16,
    minEmojis: 0, maxDerivatives: 99, allowDefinitionsInDictation: true,
    allowDictation: Array.from({ length: 28 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`),
    allowLingo: ["L01","L02","L03","L04","L05","L06","L07","L08","L09","L10","L11","L12","L13"],
    cognitiveMix: { recognition: 0.35, productive: 0.4, analysis: 0.25 },
    lingoPracticeWeights: [0.3, 0.7, 0],
    wordBankSize: 6, itemsPerExercise: 6,
    topics: "opinions, social issues, abstract nouns — still age 13–14 appropriate",
    seedCombos: [["D02", "D10", "D14"], ["D08", "D11", "D07", "D20", "D23"]],
    seedLingo: [["L02", "L07"], ["L01", "L10"]],
  },
};

function getProfilePromptBlock(profileId) {
  const p = CLASS_PROFILES[profileId];
  if (!p) return "";
  return `CLASS PROFILE: ${p.label} (${p.greekGrades})
CEFR: ${p.cefr} | Age: ${p.ageRange}
Max sentence length: ${p.maxSentenceWords} words
Topics: ${p.topics}
Emojis per vocab item: prefer 1 emoji; use 2 only if one cannot convey the meaning (never 3+)
Greek translations required in Lingo Launcher only — NEVER in dictation prompts
Definitions in dictation: ${p.allowDefinitionsInDictation === true ? "allowed" : p.allowDefinitionsInDictation === false ? "FORBIDDEN" : p.allowDefinitionsInDictation + " only"}
Items per exercise: ~${p.itemsPerExercise}`;
}

function resolveProfileId(profileIdOrLabel) {
  if (!profileIdOrLabel) return "";
  if (CLASS_PROFILES[profileIdOrLabel]) return profileIdOrLabel;
  const match = Object.values(CLASS_PROFILES).find(
    (p) => p.label === profileIdOrLabel || p.id === profileIdOrLabel
  );
  return match?.id || "";
}

function buildWorksheetMeta(form, profileId, aiMeta = {}) {
  const id = resolveProfileId(profileId)
    || resolveProfileId(aiMeta?.classProfile)
    || resolveProfileId(form?.classProfile);
  const profile = CLASS_PROFILES[id];
  if (!profile) {
    throw new Error("Class profile missing — go to Step 1 and select a class profile, then try again.");
  }
  return {
    ...aiMeta,
    bookTitle: form.bookTitle || aiMeta.bookTitle || "",
    unit: Number(form.unit ?? aiMeta.unit ?? 0),
    pageRange: form.pageRange || aiMeta.pageRange || "",
    classProfile: id,
    classLabel: profile.label,
    greekGrades: profile.greekGrades,
    cefr: profile.cefr,
    ageRange: profile.ageRange,
  };
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickLingoCount(profile) {
  const w = profile.lingoPracticeWeights;
  const r = Math.random();
  if (w[2] && r < w[2]) return 2;
  if (r < w[0]) return 1;
  return 2;
}

function getSignatureHistory(profileId) {
  try {
    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    return all[profileId] || [];
  } catch {
    return [];
  }
}

function saveSignature(profileId, signature, saveId = null) {
  const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
  const list = all[profileId] || [];
  const entry = {
    signature,
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
    saveId,
  };
  const deduped = saveId ? list.filter((h) => (typeof h === "object" ? h.saveId : null) !== saveId) : list;
  deduped.unshift(entry);
  all[profileId] = deduped.slice(0, 12);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
}

function getAllSavedSessions(profileId = null) {
  try {
    const saves = JSON.parse(localStorage.getItem(SAVES_KEY) || "[]");
    return profileId ? saves.filter((s) => s.profileId === profileId) : saves;
  } catch {
    return [];
  }
}

function getSavedSession(id) {
  return getAllSavedSessions().find((s) => s.id === id) || null;
}

function isLocalStorageWritable() {
  try {
    const probe = "__lingo_storage_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function saveWorksheetSession(form, data, plan, options = {}) {
  if (!isLocalStorageWritable()) {
    throw new Error("Storage is blocked — open the tool through the app (or http://localhost:8787/ via start.bat), not as a file.");
  }
  if (!plan) throw new Error("Missing generation plan — cannot save session.");

  const saves = getAllSavedSessions();
  const reuseId = options.updateId && saves.some((s) => s.id === options.updateId) ? options.updateId : null;
  const id = reuseId || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const validation = options.validation || null;

  const entry = {
    id,
    profileId: form.classProfile,
    signature: plan.signature || "",
    savedAt: new Date().toISOString(),
    label: form.unit ? `Unit ${form.unit} · ${form.bookTitle}` : form.bookTitle || "Untitled unit",
    pageRange: form.pageRange,
    validationOk: validation ? validation.valid : true,
    validationIssues: validation?.issues?.slice(0, 8) || [],
    form: JSON.parse(JSON.stringify(form)),
    data: JSON.parse(JSON.stringify(data)),
    plan: JSON.parse(JSON.stringify(plan)),
  };

  const without = saves.filter((s) => s.id !== id);
  without.unshift(entry);
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(without.slice(0, MAX_SAVES)));
  } catch (err) {
    if (err?.name === "QuotaExceededError") {
      throw new Error("Storage full — delete old worksheets from History and try again.");
    }
    throw err;
  }
  if (plan.signature) saveSignature(form.classProfile, plan.signature, id);
  return id;
}

function deleteSavedSession(id) {
  localStorage.setItem(SAVES_KEY, JSON.stringify(getAllSavedSessions().filter((s) => s.id !== id)));
  try {
    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    Object.keys(all).forEach((pid) => {
      all[pid] = (all[pid] || []).filter((h) => (typeof h === "object" ? h.saveId : null) !== id);
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function buildSignature(dictTypes, lingoTypes) {
  return dictTypes.join("+") + "|" + lingoTypes.join("+");
}

function pickDistinctTypes(pool, count, cognitiveMix) {
  const targets = {
    recognition: Math.round(count * cognitiveMix.recognition),
    productive: Math.round(count * cognitiveMix.productive),
    analysis: count - Math.round(count * cognitiveMix.recognition) - Math.round(count * cognitiveMix.productive),
  };
  const byFamily = { recognition: [], productive: [], analysis: [] };
  pool.forEach((id) => {
    const f = EXERCISE_FAMILIES[id];
    if (f && byFamily[f]) byFamily[f].push(id);
  });
  const picked = [];
  const families = ["recognition", "productive", "analysis"];
  for (const fam of families) {
    const need = Math.max(1, targets[fam] || 0);
    const avail = byFamily[fam].filter((x) => !picked.includes(x));
    for (let i = 0; i < need && avail.length && picked.length < count; i++) {
      const t = randomChoice(avail);
      picked.push(t);
      avail.splice(avail.indexOf(t), 1);
    }
  }
  const remaining = shuffle(pool.filter((x) => !picked.includes(x)));
  while (picked.length < count && remaining.length) picked.push(remaining.pop());
  return picked.slice(0, count);
}

function pickGenerationPlan(profileId, options = {}) {
  const profile = CLASS_PROFILES[profileId];
  if (!profile) throw new Error("Invalid class profile");

  const features = options.vocabFeatures || {};

  if (options.exerciseMode === "custom") {
    const dictTypes = options.customDictationTypes || [];
    const lingoTypes = options.customLingoTypes || [];
    if (dictTypes.length || lingoTypes.length) {
      return buildPlanFromCustom(profile, dictTypes, lingoTypes, features);
    }
  }

  const history = getSignatureHistory(profileId);
  const recentSigs = history.slice(0, 3).map((h) => (typeof h === "string" ? h : h.signature));
  // Synonym/antonym exercises are impossible without synonyms/antonyms in the vocabulary.
  const dictPool = filterDictTypesByFeatures(profile.allowDictation, features);
  const seedOk = (combo) => combo.every((id) => dictPool.includes(id));
  // Only 3 cognitive families exist, and some profiles' pools span fewer.
  const poolFamilies = new Set(dictPool.map((d) => EXERCISE_FAMILIES[d])).size;
  const dictCount = options.dictationCount || randomChoice([3, 4, 5]);
  const lingoCount = options.lingoCount ?? pickLingoCount(profile);

  for (let attempt = 0; attempt < 40; attempt++) {
    let dictTypes;
    if (attempt < profile.seedCombos.length && !options.forceRandom) {
      const seeds = profile.seedCombos.filter((s) => s.length === dictCount && seedOk(s));
      dictTypes = seeds.length ? [...randomChoice(seeds)] : null;
    }
    if (!dictTypes || dictTypes.length !== dictCount) {
      dictTypes = pickDistinctTypes(dictPool, dictCount, profile.cognitiveMix);
    }
    dictTypes = maybeInjectRelatedTypes(dictTypes, dictPool, features, "dictation");
    if (dictTypes.length !== dictCount) continue;
    const uniqueFamilies = new Set(dictTypes.map((d) => EXERCISE_FAMILIES[d]));
    const minFamilies = Math.min(dictCount, poolFamilies);
    if (uniqueFamilies.size < minFamilies) continue;

    let lingoTypes = pickLingoTypesForPlan(profile, features, lingoCount);
    lingoTypes = maybeInjectRelatedTypes(lingoTypes, getLingoPoolForFeatures(profile, features), features, "lingo");
    lingoTypes = lingoTypes.slice(0, lingoCount);
    const signature = buildSignature(dictTypes, lingoTypes);
    if (recentSigs.includes(signature)) continue;

    return {
      dictationExerciseCount: dictCount,
      dictationTypes: dictTypes,
      lingoTypes,
      lingoPracticeCount: lingoCount,
      signature,
      exerciseMode: "random",
    };
  }

  let dictTypes = profile.seedCombos[0].length === dictCount && seedOk(profile.seedCombos[0])
    ? [...profile.seedCombos[0]]
    : pickDistinctTypes(dictPool, dictCount, profile.cognitiveMix);
  dictTypes = maybeInjectRelatedTypes(dictTypes, dictPool, features, "dictation");
  let lingoTypes = pickLingoTypesForPlan(profile, features, lingoCount);
  lingoTypes = maybeInjectRelatedTypes(lingoTypes, getLingoPoolForFeatures(profile, features), features, "lingo").slice(0, lingoCount);
  return {
    dictationExerciseCount: dictCount,
    dictationTypes: dictTypes,
    lingoTypes,
    lingoPracticeCount: lingoCount,
    signature: buildSignature(dictTypes, lingoTypes),
    exerciseMode: "random",
  };
}

function normalizeWord(w) {
  return (w || "").toLowerCase().replace(/[^a-z\s-]/g, "").trim();
}

function answerMatches(a, b) {
  const na = normalizeWord(a);
  const nb = normalizeWord(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/** True when list order reveals answers (positional or left-to-right subsequence). */
function wordListMatchesAnswerOrder(list, items) {
  if (!list?.length || !items?.length) return false;
  const answers = items.map((it) => it.answer).filter(Boolean);
  if (answers.length < 2) return false;

  const n = Math.min(list.length, answers.length);
  let positional = 0;
  for (let i = 0; i < n; i++) {
    if (answerMatches(list[i], answers[i])) positional++;
  }
  if (positional >= 2 && positional === n) return true;

  let listIdx = 0;
  let subseq = 0;
  for (const ans of answers) {
    while (listIdx < list.length && !answerMatches(list[listIdx], ans)) listIdx++;
    if (listIdx < list.length) {
      subseq++;
      listIdx++;
    } else break;
  }
  return subseq >= 2 && subseq === answers.length;
}

function shuffleListAwayFromAnswers(list, items) {
  if (!list || list.length < 2) return list;
  const answers = items?.map((it) => it.answer).filter(Boolean) || [];
  if (answers.length < 2) return shuffle([...list]);

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = shuffle([...list]);
    if (!wordListMatchesAnswerOrder(candidate, items)) return candidate;
  }
  const rotated = [...list];
  for (let r = 1; r < list.length; r++) {
    rotated.push(rotated.shift());
    if (!wordListMatchesAnswerOrder(rotated, items)) return [...rotated];
  }
  return [...list].reverse();
}

function dedupeWords(words) {
  const out = [];
  const seen = new Set();
  (words || []).forEach((w) => {
    const k = normalizeWord(w);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(String(w).trim());
  });
  return out;
}

/** All answer words for one dictation item (supports comma lists + testsWords). */
function flattenItemAnswers(item) {
  if (item.testsWords?.length) return item.testsWords.map((w) => String(w).trim()).filter(Boolean);
  const ans = (item.answer || "").trim();
  if (!ans) return [];
  if (ans.includes(",")) return ans.split(/,\s*/).map((w) => w.trim()).filter(Boolean);
  return [ans];
}

/** Flat list of every word students must place (category sort, etc.). */
function flattenExerciseAnswers(ex) {
  const words = [];
  ex.items?.forEach((item) => words.push(...flattenItemAnswers(item)));
  return words;
}

function itemsForAnswerOrderCheck(ex) {
  return flattenExerciseAnswers(ex).map((answer, i) => ({ number: i + 1, answer }));
}

function ensureCategorySortWordBank(ex) {
  if (ex.typeId !== "D16") return;
  const answers = dedupeWords(flattenExerciseAnswers(ex));
  if (!answers.length) return;
  if (!ex.wordBank?.length) {
    ex.wordBank = [...answers];
    return;
  }
  const bank = [...ex.wordBank];
  answers.forEach((a) => {
    if (!bank.some((w) => answerMatches(w, a))) bank.push(a);
  });
  ex.wordBank = dedupeWords(bank);
}

function normalizeD13Matching(ex) {
  if (ex.typeId !== "D13" || !ex.items?.length) return;

  // Already lettered (A., B., …) with letter answers in a non-trivial order: keep as is,
  // otherwise every re-render would reassign letters and break a printed answer key.
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bank = ex.wordBank || [];
  const answerIdx = ex.items.map((it) => LETTERS.indexOf(String(it.answer || "").trim().toUpperCase()));
  const alreadyLettered = ex.items.length >= 2
    && bank.length === ex.items.length
    && bank.every((w, i) => String(w).trim().toUpperCase().startsWith(`${LETTERS[i]}.`))
    && ex.items.every((it) => isSingleLetter(it.answer))
    && answerIdx.every((i) => i >= 0 && i < bank.length)
    && !answerIdx.every((idx, i) => idx === i);
  if (alreadyLettered) {
    ex.items.forEach((item) => {
      const word = String(item.prompt || "").replace(/\s*_+\s*$/, "").trim();
      if (!/_+/.test(item.prompt || "")) item.prompt = `${word} __________`;
      if (!item.testsWords?.length && word) item.testsWords = [word];
    });
    return;
  }

  const pairs = ex.items.map((item) => {
    const prompt = String(item.prompt || "").replace(/\s*_+\s*$/, "").trim();
    const answer = String(item.answer || "").trim();
    let def = "";

    if (!isSingleLetter(answer) && answer.length > 2) {
      def = answer;
    } else if (isSingleLetter(answer) && ex.wordBank?.length) {
      const idx = answer.toUpperCase().charCodeAt(0) - 65;
      if (ex.wordBank[idx]) def = stripMatchLetter(ex.wordBank[idx]);
    }
    return { prompt, def, item };
  });

  const prompts = pairs.map((p) => p.prompt);
  const bankDefs = (ex.wordBank || []).map(stripMatchLetter).filter(Boolean);
  const bankLooksLikePrompts = bankDefs.length > 0 && bankDefs.every((d) =>
    prompts.some((p) => answerMatches(d, p))
  );

  if (bankDefs.length && !bankLooksLikePrompts && pairs.every((p) => !p.def)) {
    pairs.forEach((p, i) => {
      const ans = String(p.item.answer || "").trim();
      if (isSingleLetter(ans)) {
        const idx = ans.toUpperCase().charCodeAt(0) - 65;
        p.def = stripMatchLetter(ex.wordBank[idx] || "");
      } else if (bankDefs[i]) {
        p.def = bankDefs[i];
      }
    });
  }

  if (bankLooksLikePrompts) ex.wordBank = [];

  if (pairs.some((p) => !p.def)) return;

  const defs = pairs.map((p) => p.def);
  let shuffled = shuffle([...defs]);
  for (let attempt = 0; attempt < 30; attempt++) {
    const same = shuffled.filter((d, i) => answerMatches(d, defs[i])).length;
    if (same < defs.length) break;
    shuffled = shuffle([...defs]);
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  ex.wordBank = shuffled.map((d, i) => `${letters[i]}. ${d}`);

  pairs.forEach((p) => {
    const letterIdx = shuffled.findIndex((d) => answerMatches(d, p.def));
    const letter = letters[letterIdx] || "?";
    p.item.prompt = `${p.prompt} __________`;
    p.item.answer = letter;
    if (!p.item.testsWords?.length && p.prompt) {
      p.item.testsWords = [p.prompt];
    }
  });
}

function normalizeD13Exercises(data) {
  data.dictation?.exercises?.forEach((ex) => normalizeD13Matching(ex));
  return data;
}

function normalizeWorksheetWordLists(data) {
  if (!data) return data;
  const dictShuffle = new Set(["D01", "D16"]);

  // Only reshuffle lists that give answers away — normalizing must be idempotent so the
  // preview, print, exports and answer key all show the same order.
  data.lingoLauncher?.practice?.forEach((ex) => {
    if (LINGO_WORDLIST_TYPES.has(ex.typeId) && ex.wordList?.length >= 2) {
      if (wordListMatchesAnswerOrder(ex.wordList, ex.items)) {
        ex.wordList = shuffleListAwayFromAnswers(ex.wordList, ex.items);
      }
    } else {
      ex.wordList = [];
    }
  });
  data.dictation?.exercises?.forEach((ex) => {
    if (ex.typeId === "D16") ensureCategorySortWordBank(ex);
    if (ex.wordBank?.length >= 2 && dictShuffle.has(ex.typeId)) {
      const orderItems = ex.typeId === "D16" ? itemsForAnswerOrderCheck(ex) : ex.items;
      if (wordListMatchesAnswerOrder(ex.wordBank, orderItems)) {
        ex.wordBank = shuffleListAwayFromAnswers(ex.wordBank, orderItems);
      }
    }
  });
  return data;
}

const SLASH_CHOICE_TYPES = new Set(["D03", "D05", "D06", "D12", "D18", "D24", "L02", "L03", "L04", "L05"]);
const NO_HINT_PAREN_TYPES = new Set(["D01", "D04", "D14", "D17", "D22", "L01"]);
const DICTATION_WORD_BANK_TYPES = new Set(["D01", "D13", "D16"]);
const BRACKET_CHOICE_TYPES = new Set(["D03", "D05", "D06", "D12", "D18", "D24", "L02", "L03", "L04", "L05"]);

function itemsHaveSlashChoices(ex) {
  return ex.items?.some((i) => /\([^)]*\/[^)]*\)/.test(i.prompt || "")) ?? false;
}

function getFirstBracketOption(prompt) {
  const m = (prompt || "").match(/\(([^)]*\/[^)]*)\)/);
  if (!m) return null;
  return m[1].split("/")[0].trim();
}

function bracketChoicesAlwaysFirst(items) {
  const bracketed = (items || []).filter((i) => /\([^)]*\/[^)]*\)/.test(i.prompt || ""));
  if (bracketed.length < 2) return false;
  return bracketed.every((i) => answerMatches(getFirstBracketOption(i.prompt), i.answer));
}

function shuffleBracketChoicesInPrompt(prompt, answer) {
  if (!prompt || !/\([^)]*\/[^)]*\)/.test(prompt)) return prompt;
  return prompt.replace(/\(([^)]*\/[^)]*)\)/g, (full, inner) => {
    const options = inner.split("/").map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) return full;
    let shuffled;
    for (let attempt = 0; attempt < 40; attempt++) {
      shuffled = shuffle([...options]);
      if (!answerMatches(shuffled[0], answer)) break;
    }
    if (answerMatches(shuffled[0], answer)) {
      const idx = shuffled.findIndex((o) => !answerMatches(o, answer));
      if (idx > 0) {
        [shuffled[0], shuffled[idx]] = [shuffled[idx], shuffled[0]];
      } else if (shuffled.length > 1) {
        shuffled.push(shuffled.shift());
      }
    }
    return `(${shuffled.join(" / ")})`;
  });
}

/** Split word bank into 1–3 rows so it fits A4 width. */
function chunkWordBank(words, maxPerRow = 5) {
  if (!words?.length) return [];
  const n = words.length;
  if (n <= maxPerRow) return [words];
  if (n <= maxPerRow * 2) {
    const mid = Math.ceil(n / 2);
    return [words.slice(0, mid), words.slice(mid)];
  }
  const perRow = Math.ceil(n / 3);
  const rows = [];
  for (let i = 0; i < n; i += perRow) rows.push(words.slice(i, i + perRow));
  return rows;
}



function stripMatchLetter(entry) {
  return String(entry || "").replace(/^[A-Z]\.\s*/i, "").trim();
}

function isSingleLetter(value) {
  return /^[A-Z]$/i.test(String(value || "").trim());
}

function answerVariants(answer) {
  const variants = [];
  (answer || "").split(/[/|,;]/).forEach((part) => {
    const p = part.trim();
    if (p) variants.push(p);
  });
  return variants.length ? variants : [(answer || "").trim()].filter(Boolean);
}

/** True when a bracket hint names or strongly leaks the target word (incl. farther/further-style variants). */
function hintTextRevealsAnswer(hint, answer) {
  if (!hint?.trim() || !answer?.trim()) return false;
  const hintLower = hint.toLowerCase();
  const hintNorm = normalizeWord(hint);
  const hintWords = hintLower.split(/[^a-z'-]+/).filter((w) => w.length >= 3);

  for (const variant of answerVariants(answer)) {
    const vNorm = normalizeWord(variant);
    const vLower = variant.toLowerCase();
    if (!vNorm) continue;

    if (hintWords.some((w) => w === vLower || answerMatches(w, variant))) return true;
    if (vNorm.length >= 4 && (hintNorm.includes(vNorm) || hintLower.includes(vLower))) return true;
  }
  return false;
}

function sanitizeExercisePrompt(prompt, answer, typeId) {
  if (!prompt) return prompt;
  if (typeId === "D25") {
    const result = prompt.replace(/\s*\(([^)]*)\)/g, (full, inner) => {
      const trimmed = inner.trim();
      if (!trimmed) return "";
      if (hintTextRevealsAnswer(trimmed, answer)) return "";
      return full;
    });
    return result.replace(/\s{2,}/g, " ").trim();
  }
  let result = prompt.replace(/\s*\(([^)]*)\)/g, (full, inner) => {
    const trimmed = inner.trim();
    if (!trimmed) return "";
    if (SLASH_CHOICE_TYPES.has(typeId) && trimmed.includes("/")) return full;
    if (NO_HINT_PAREN_TYPES.has(typeId)) {
      if (trimmed.includes("/")) return " ________";
      return "";
    }
    if (answerMatches(trimmed, answer)) return "";
    return full;
  });
  result = result.replace(/\s{2,}/g, " ").trim();
  if (typeId === "D01" && result && !/_+/.test(result)) {
    result = result.replace(/\s*\.?\s*$/, "") + " ________";
  }
  if ((typeId === "D04" || typeId === "D17") && result && !/_+/.test(result)) {
    result = result.replace(/\s*\.?\s*$/, "") + " __________";
  }
  if (typeId === "D13" && result && !/_+/.test(result)) {
    result = result.replace(/\s*\.?\s*$/, "") + " __________";
  }
  return result;
}

const STOP_PROMPT_TOKENS = new Set([
  "a", "an", "the", "to", "in", "on", "at", "of", "or", "as", "is", "it", "by", "if", "be", "do",
  "up", "so", "no", "am", "we", "he", "my", "me", "us", "for", "and", "but", "with", "from", "into",
]);

/** Strict whole-word check — avoids "a" in "into a glass" matching answer "water" or "match". */
function promptTokenIsAnswer(token, answer) {
  const t = normalizeWord(token);
  const a = normalizeWord(answer);
  if (!t || !a || t.length < 2) return false;
  if (STOP_PROMPT_TOKENS.has(t)) return false;
  return t === a;
}

function promptContainsAnswerText(prompt, answer, typeId) {
  if (!NO_HINT_PAREN_TYPES.has(typeId) || !prompt || !answer) return false;
  let text = prompt.replace(/_+/g, " ");
  text = text.replace(/\([^)]*\)/g, " ");
  if (answer.trim().includes(" ")) {
    const textNorm = normalizeWord(text);
    const answerNorm = normalizeWord(answer);
    return answerNorm.length > 0 && textNorm.includes(answerNorm);
  }
  const tokens = text.toLowerCase().split(/[^a-z'-]+/).filter(Boolean);
  return tokens.some((t) => promptTokenIsAnswer(t, answer));
}

function promptRevealsAnswer(prompt, answer, typeId) {
  if (!prompt || !answer) return false;
  const parenRe = /\(([^)]+)\)/g;
  let m;
  while ((m = parenRe.exec(prompt))) {
    const inner = m[1].trim();
    if (inner.includes("/")) {
      if (SLASH_CHOICE_TYPES.has(typeId) || typeId === "D01") continue;
      return true;
    }
    if (typeId === "D25") {
      if (hintTextRevealsAnswer(inner, answer)) return true;
      continue;
    }
    if (answerMatches(inner, answer)) return true;
    if (NO_HINT_PAREN_TYPES.has(typeId)) return true;
    if (typeId === "D02" && answerMatches(inner, answer)) return true;
  }
  return promptContainsAnswerText(prompt, answer, typeId);
}

/** Items are numbered by the layout (circled badge), so a typed "(1)", "1)", "1." or "1 -" prefix is redundant. */
function stripLeadingItemNumber(text) {
  return String(text ?? "").replace(/^\s*(?:\(\s*\d{1,2}\s*\)|\[\s*\d{1,2}\s*\]|\d{1,2}\s*[).:\-–])\s+(?![_＿])/, "");
}

function stripItemNumberPrefixes(data) {
  const strip = (ex) => ex.items?.forEach((item) => {
    if (typeof item.prompt === "string") item.prompt = stripLeadingItemNumber(item.prompt);
  });
  data?.dictation?.exercises?.forEach(strip);
  data?.lingoLauncher?.practice?.forEach(strip);
  return data;
}

/* ── Newer exercise types: jumbled / missing letters, spelling check, yes-no, A/B ── */
const SPELLING_CHECK_TYPES = new Set(["D28", "L12"]);
const letterKey = (w) => String(w || "").toLowerCase().replace(/[^a-z]/g, "").split("").sort().join("");

function splitPromptClue(prompt) {
  const m = String(prompt || "").match(/^(.*?)\s*(\([^)]*\))?\s*$/);
  return { head: (m?.[1] || "").trim(), clue: m?.[2] || "" };
}

function scrambleWord(word) {
  const letters = word.split("");
  for (let tries = 0; tries < 12; tries++) {
    const out = shuffle(letters).join("");
    if (out.toLowerCase() !== word.toLowerCase()) return out;
  }
  return letters.reverse().join("");
}

function maskWord(word) {
  const idx = [];
  for (let i = 1; i < word.length; i++) idx.push(i);
  const hide = new Set(shuffle(idx).slice(0, Math.max(2, Math.round(idx.length * 0.4))));
  return word.split("").map((ch, i) => (hide.has(i) ? "_" : ch)).join(" ");
}

/** Rebuild the letter puzzles from the answer so they are always solvable and never the plain word. */
function normalizeLetterPuzzles(data) {
  data?.dictation?.exercises?.forEach((ex) => {
    if (ex.typeId !== "D26" && ex.typeId !== "D27") return;
    ex.wordBank = [];
    ex.items?.forEach((item) => {
      const answer = String(item.answer || "").trim();
      if (!/^[A-Za-z]{3,}$/.test(answer)) return;
      const { head, clue } = splitPromptClue(item.prompt);
      const squashed = head.replace(/\s+/g, "");
      if (ex.typeId === "D26") {
        const ok = head && !/\s/.test(head) && letterKey(head) === letterKey(answer) && head.toLowerCase() !== answer.toLowerCase();
        if (!ok) item.prompt = scrambleWord(answer.toLowerCase()) + (clue ? " " + clue : "");
      } else {
        const fits = squashed.length === answer.length && head.includes("_")
          && [...squashed].every((c, i) => c === "_" || c.toLowerCase() === answer[i].toLowerCase());
        const shown = fits ? head.replace(/\s*_\s*/g, " _ ").replace(/\s{2,}/g, " ").trim() : maskWord(answer.toLowerCase());
        item.prompt = shown + (clue ? " " + clue : "");
      }
    });
  });
  return data;
}

function validateExtraTypes(data, issues) {
  const check = (ex, sheet) => {
    const t = ex.typeId;
    const label = sheet + " ex " + ex.number + " (" + t + ")";
    if (SPELLING_CHECK_TYPES.has(t)) {
      ex.items?.forEach((item) => {
        const m = String(item.prompt || "").match(/\[([^\]]+)\]/);
        if (!m) issues.push(label + " item " + item.number + ": misspelt word must be marked in [square brackets]");
        else if (normalizeWord(m[1]) === normalizeWord(item.answer)) issues.push(label + " item " + item.number + ": the bracketed word is already spelt correctly");
      });
    }
    if (t === "D26" || t === "D27") {
      ex.items?.forEach((item) => {
        if (!/^[A-Za-z]{3,}$/.test(String(item.answer || "").trim())) issues.push(label + " item " + item.number + ": answer must be a single unit word");
      });
    }
    if (t === "L11") {
      ex.items?.forEach((item) => {
        if (!/^(yes|no)$/i.test(String(item.answer || "").trim())) issues.push(label + " item " + item.number + ": answer must be Yes or No");
        if (!/\?\s*$/.test(String(item.prompt || "").trim())) issues.push(label + " item " + item.number + ": prompt must be a question");
      });
      const answers = (ex.items || []).map((i) => String(i.answer || "").trim().toLowerCase());
      if (answers.length >= 3 && new Set(answers).size === 1) issues.push(label + ": all answers are \"" + answers[0] + "\" — mix Yes and No");
    }
    if (t === "L13") {
      ex.items?.forEach((item) => {
        const p = String(item.prompt || "");
        if (!/A\.\s*\S/.test(p) || !/B\.\s*\S/.test(p)) issues.push(label + " item " + item.number + ": prompt needs \"A. … B. …\" sentences");
        if (!/^[AB]$/i.test(String(item.answer || "").trim())) issues.push(label + " item " + item.number + ": answer must be A or B");
      });
      const answers = (ex.items || []).map((i) => String(i.answer || "").trim().toUpperCase());
      if (answers.length >= 3 && new Set(answers).size === 1) issues.push(label + ": every answer is \"" + answers[0] + "\" — mix A and B");
    }
  };
  data?.dictation?.exercises?.forEach((ex) => check(ex, "Dictation"));
  data?.lingoLauncher?.practice?.forEach((ex) => check(ex, "Lingo"));
}

function normalizeWorksheetPrompts(data) {
  if (!data) return data;
  stripItemNumberPrefixes(data);
  data.dictation?.exercises?.forEach((ex) => {
    const bracketMode = itemsHaveSlashChoices(ex) || BRACKET_CHOICE_TYPES.has(ex.typeId);
    ex.items?.forEach((item) => {
      if (item.prompt && !bracketMode) {
        item.prompt = sanitizeExercisePrompt(item.prompt, item.answer, ex.typeId);
      }
    });
  });
  data.lingoLauncher?.practice?.forEach((ex) => {
    ex.items?.forEach((item) => {
      if (item.prompt) {
        item.prompt = sanitizeExercisePrompt(item.prompt, item.answer, ex.typeId);
      }
    });
  });
  return data;
}

function normalizeDictationWordBanks(data) {
  if (!data) return data;
  data.dictation?.exercises?.forEach((ex) => {
    if (itemsHaveSlashChoices(ex)) {
      ex.wordBank = [];
    } else if (!DICTATION_WORD_BANK_TYPES.has(ex.typeId)) {
      ex.wordBank = [];
    }
  });
  return data;
}

function normalizeBracketChoices(data) {
  if (!data) return data;
  const shuffleExercise = (ex) => {
    if (!BRACKET_CHOICE_TYPES.has(ex.typeId) && !itemsHaveSlashChoices(ex)) return;
    if (!bracketChoicesAlwaysFirst(ex.items)) return;
    ex.items?.forEach((item) => {
      if (item.prompt) {
        item.prompt = shuffleBracketChoicesInPrompt(item.prompt, item.answer);
      }
    });
  };
  data.dictation?.exercises?.forEach(shuffleExercise);
  data.lingoLauncher?.practice?.forEach(shuffleExercise);
  return data;
}

function normalizeWorksheetExercises(data) {
  if (data?.lingoLauncher?.vocabulary) {
    data.lingoLauncher.vocabulary = normalizeVocabulary(data.lingoLauncher.vocabulary);
  }
  normalizeDictationWordBanks(data);
  normalizeLetterPuzzles(data);
  normalizeD13Exercises(data);
  normalizeD02Exercises(data);
  normalizeL01Exercises(data);
  normalizeL05Exercises(data);
  normalizeD12Exercises(data);
  normalizeD15Exercises(data);
  normalizeD08Exercises(data);
  normalizeWorksheetWordLists(data);
  normalizeWorksheetPrompts(data);
  normalizeBracketChoices(data);
  return data;
}

function wordInAnswer(target, answer, vocab) {
  const t = normalizeWord(target);
  const a = normalizeWord(answer);
  if (!t || !a) return false;
  if (a.includes(t) || t.includes(a)) return true;
  const item = vocab.find((v) => normalizeWord(v.english) === t);
  if (!item) return a.includes(t.split(" ")[0]);
  for (const d of normalizeDerivativesList(item.derivatives)) {
    const text = typeof d === "string" ? d : d?.text;
    if (text && a.includes(normalizeWord(text))) return true;
  }
  const parts = t.split(/\s+/);
  if (parts.length > 1 && parts.some((p) => a.includes(p) && p.length > 3)) return true;
  return false;
}

function collectTestTargets(vocabulary) {
  const targets = [];
  const seen = new Set();
  const add = (label, kind, parent = null) => {
    const key = `${kind}:${normalizeWord(label)}`;
    if (!label?.trim() || seen.has(key)) return;
    seen.add(key);
    targets.push({ key, label: label.trim(), kind, parent });
  };

  (vocabulary || []).forEach((v) => {
    add(v.english, "headword");
    normalizeWordList(v.synonyms).forEach((s) => add(s, "synonym", v.english));
    antonymTexts(v.antonyms).forEach((a) => add(a, "antonym", v.english));
    normalizeDerivativesList(v.derivatives).forEach((d) => {
      const text = typeof d === "string" ? d : d?.text;
      if (text) add(text, "derivative", v.english);
    });
  });
  return targets;
}

function targetTestedInItem(target, item, vocabulary) {
  const answers = [...(item.testsWords || []), item.answer].filter(Boolean);
  return answers.some((ans) => {
    if (target.kind === "headword") return wordInAnswer(target.label, ans, vocabulary);
    if (answerMatches(target.label, ans)) return true;
    if (target.parent && wordInAnswer(target.parent, ans, vocabulary)) return true;
    return false;
  });
}

function computeDictationCoverage(vocabulary, dictation) {
  const targets = collectTestTargets(vocabulary);
  const wordMap = {};
  targets.forEach((t) => { wordMap[t.key] = []; });

  dictation?.exercises?.forEach((ex) => {
    ex.items?.forEach((item) => {
      targets.forEach((target) => {
        if (targetTestedInItem(target, item, vocabulary)) {
          if (!wordMap[target.key].includes(ex.typeId)) wordMap[target.key].push(ex.typeId);
        }
      });
    });
  });

  const missing = targets.filter((t) => !wordMap[t.key]?.length);
  const headwordMap = {};
  vocabulary?.forEach((v) => {
    const key = `headword:${normalizeWord(v.english)}`;
    headwordMap[v.english] = wordMap[key] || [];
  });

  return {
    targets,
    wordMap: headwordMap,
    targetMap: wordMap,
    missing,
    allCovered: missing.length === 0,
    ok: missing.length === 0,
  };
}

function computeLingoCoverage(vocabulary, practice) {
  const targets = collectTestTargets(vocabulary);
  const wordMap = {};
  vocabulary?.forEach((v) => { wordMap[v.english] = []; });

  practice?.forEach((ex) => {
    ex.items?.forEach((item) => {
      targets.forEach((target) => {
        if (targetTestedInItem(target, item, vocabulary)) {
          if (target.kind === "headword" && !wordMap[target.label]?.includes(ex.typeId)) {
            wordMap[target.label].push(ex.typeId);
          }
        }
      });
    });
  });

  const tested = Object.values(wordMap).filter((h) => h.length > 0).length;
  return {
    wordMap,
    testedCount: tested,
    totalHeadwords: vocabulary?.length || 0,
  };
}

/** @deprecated use computeDictationCoverage — kept for callers expecting shape */
function computeCoverage(vocabulary, dictation) {
  const dict = computeDictationCoverage(vocabulary, dictation);
  return {
    allWordsCovered: dict.allCovered,
    missing: dict.missing.map((m) => m.label),
    missingDetails: dict.missing,
    wordMap: dict.wordMap,
    doubleCoveragePct: 0,
    ok: dict.ok,
  };
}

function analyzeVocabFeatures(form) {
  const rows = form?.vocabRows || [];
  let hasSynonyms = false;
  let hasAntonyms = false;
  let hasDerivatives = false;
  rows.forEach((r) => {
    const t = r.fieldToggles || {};
    if (r.synonyms?.trim() && t.synonyms !== false) hasSynonyms = true;
    if (r.antonyms?.trim() && t.antonyms !== false) hasAntonyms = true;
    if (r.derivatives?.trim() && t.derivatives !== false) hasDerivatives = true;
  });
  return { hasSynonyms, hasAntonyms, hasDerivatives };
}

function analyzeVocabFeaturesFromData(vocabulary) {
  let hasSynonyms = false;
  let hasAntonyms = false;
  let hasDerivatives = false;
  (vocabulary || []).forEach((v) => {
    if (normalizeWordList(v.synonyms).length) hasSynonyms = true;
    if (antonymTexts(v.antonyms).length) hasAntonyms = true;
    if (normalizeDerivativesList(v.derivatives).length) hasDerivatives = true;
  });
  return { hasSynonyms, hasAntonyms, hasDerivatives };
}

const RELATED_EXERCISE_MAP = {
  hasSynonyms: { dictation: ["D06"], lingo: ["L03"] },
  hasAntonyms: { dictation: ["D05"], lingo: ["L04"] },
  hasDerivatives: { dictation: ["D02"], lingo: ["L07"] },
};

const LINGO_WORDLIST_TYPES = new Set(["L01", "L05"]);

function filterLingoTypesByFeatures(types, features = {}) {
  return types.filter((id) => {
    if (id === "L03" && !features.hasSynonyms) return false;
    if (id === "L04" && !features.hasAntonyms) return false;
    if (id === "L07" && !features.hasDerivatives) return false;
    return true;
  });
}

function filterDictTypesByFeatures(types, features = {}) {
  return types.filter((id) => {
    if (id === "D06" && !features.hasSynonyms) return false;
    if (id === "D05" && !features.hasAntonyms) return false;
    return true;
  });
}

function getLingoPoolForFeatures(profile, features) {
  const filtered = filterLingoTypesByFeatures(profile.allowLingo, features);
  if (filtered.length) return filtered;
  return profile.allowLingo.filter((id) => !["L03", "L04", "L07"].includes(id));
}

function pickLingoTypesForPlan(profile, features, count) {
  const pool = getLingoPoolForFeatures(profile, features);
  return shuffle(pool).slice(0, count);
}

function getSynonymWordsFromForm(form) {
  return (form.vocabRows || [])
    .filter((r) => r.synonyms?.trim() && r.fieldToggles?.synonyms !== false)
    .map((r) => ({ english: r.english, synonyms: normalizeWordList(r.synonyms) }));
}

function getAntonymWordsFromForm(form) {
  return (form.vocabRows || [])
    .filter((r) => r.antonyms?.trim() && r.fieldToggles?.antonyms !== false)
    .map((r) => ({ english: r.english, antonyms: antonymTexts(r.antonyms) }));
}

function getSynonymWordsFromVocabulary(vocabulary) {
  return (vocabulary || [])
    .filter((v) => normalizeWordList(v.synonyms).length)
    .map((v) => ({ english: v.english, synonyms: normalizeWordList(v.synonyms) }));
}

function getAntonymWordsFromVocabulary(vocabulary) {
  return (vocabulary || [])
    .filter((v) => antonymTexts(v.antonyms).length)
    .map((v) => ({ english: v.english, antonyms: antonymTexts(v.antonyms) }));
}

function getVocabWordsWithTypesFromForm(form) {
  return (form.vocabRows || [])
    .filter((r) => r.english?.trim())
    .map((r) => ({
      english: r.english.trim(),
      type: normalizeWordClass(r.type) || "unknown",
    }));
}

function getVocabWordsWithTypesFromVocabulary(vocabulary) {
  return (vocabulary || [])
    .filter((v) => v.english?.trim())
    .map((v) => ({
      english: v.english.trim(),
      type: normalizeWordClass(v.type) || inferWordClass(v.english, vocabulary),
    }));
}

function getPromptTargetWord(prompt) {
  const p = (prompt || "").trim();
  const m = p.match(/^(.+?)\s*\([^)]*\/[^)]*\)/);
  return m ? m[1].trim() : null;
}

function findVocabByEnglish(vocabulary, english) {
  if (!english) return null;
  const n = normalizeWord(english);
  return vocabulary.find((v) => {
    if (normalizeWord(v.english) === n) return true;
    return answerMatches(v.english, english);
  }) || null;
}

function lookupVocabEntry(word, vocabulary) {
  const headword = findVocabByEnglish(vocabulary, word);
  if (headword) return { entry: headword, role: "headword" };
  for (const v of vocabulary || []) {
    for (const d of normalizeDerivativesList(v.derivatives)) {
      const text = typeof d === "string" ? d : d?.text;
      if (text && answerMatches(text, word)) {
        return { entry: v, role: "derivative", derivativeText: text };
      }
    }
  }
  return null;
}

function normalizeWordClass(typeStr) {
  const t = String(typeStr || "").toLowerCase().replace(/\./g, "").trim();
  if (/^(n|noun)/.test(t)) return "noun";
  if (/^(v|verb|phr v)/.test(t)) return "verb";
  if (/^(adj)/.test(t)) return "adj";
  if (/^(adv)/.test(t)) return "adv";
  if (/^(prep)/.test(t)) return "prep";
  return "other";
}

function inferWordClass(word, vocabulary) {
  const hit = lookupVocabEntry(word, vocabulary);
  if (hit?.entry?.type) return normalizeWordClass(hit.entry.type);
  if (hit?.role === "derivative") {
    const d = normalizeDerivativesList(hit.entry.derivatives).find((der) => answerMatches(typeof der === "string" ? der : der?.text, word));
    const dtype = typeof d === "object" ? d?.type : "";
    if (dtype) return normalizeWordClass(dtype);
  }
  const w = String(word || "").toLowerCase();
  if (w.endsWith("ly") && w.length > 4) return "adv";
  if (/(tion|ment|ness|ity|ship|dom|ance|ence|ery|ory|ty|ist|ism)$/.test(w)) return "noun";
  if (/(ate|ify|ise|ize|en)$/.test(w) && w.length > 4) return "verb";
  if (/(ful|less|ous|ive|al|able|ible)$/.test(w)) return "adj";
  if (/y$/.test(w) && w.length > 4) return "adj";
  if (/(ed|ing)$/.test(w)) return "verb";
  return "other";
}

function wordsShareMorphology(a, b) {
  const strip = (w) => String(w || "").toLowerCase().replace(/(fulness|lessness|ful|less|ous|ive|ally|ly|ing|ed|er|est|ness|ity|s)$/i, "");
  const x = strip(a);
  const y = strip(b);
  return x.length >= 4 && x === y;
}

function groupHasAntonymPair(words, vocabulary) {
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const v = findVocabByEnglish(vocabulary, words[i]);
      if (v && antonymTexts(v.antonyms).some((ant) => answerMatches(ant, words[j]))) return [words[i], words[j]];
      const v2 = findVocabByEnglish(vocabulary, words[j]);
      if (v2 && antonymTexts(v2.antonyms).some((ant) => answerMatches(ant, words[i]))) return [words[j], words[i]];
    }
  }
  return null;
}

function describeL09WordClasses(words, vocabulary) {
  return words.map((w) => `${w} (${inferWordClass(w, vocabulary)})`).join(", ");
}

function parseCommaWordGroup(prompt) {
  return String(prompt || "").trim().split(",").map((s) => s.trim()).filter(Boolean);
}

function validateOddOneOutGroup(words, answer, vocabulary) {
  if (words.length !== 4) {
    return { ok: false, message: `need exactly 4 comma-separated words (got ${words.length})` };
  }
  if (!words.some((w) => answerMatches(w, answer))) {
    return { ok: false, message: `answer "${answer}" must be one of the 4 words` };
  }
  const antPair = groupHasAntonymPair(words, vocabulary);
  if (antPair) {
    return {
      ok: false,
      message: `do not put antonyms in the same group (${antPair[0]} / ${antPair[1]}) — only 1 word should stand out`,
    };
  }
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (wordsShareMorphology(words[i], words[j])) {
        return {
          ok: false,
          message: `do not pair related forms like "${words[i]}" and "${words[j]}" — students cannot tell which is odd`,
        };
      }
    }
  }
  const classes = words.map((w) => inferWordClass(w, vocabulary));
  const classCounts = {};
  classes.forEach((c) => { classCounts[c] = (classCounts[c] || 0) + 1; });
  const maxCount = Math.max(...Object.values(classCounts));
  const classSummary = describeL09WordClasses(words, vocabulary);
  if (maxCount !== 3) {
    const hint = maxCount === 4
      ? "use 3 words of the same type (usually nouns) + 1 different type (usually a verb) — e.g. artifact, treasure, jewel, excavate"
      : "pick 3 words that share one part of speech and 1 clear odd word — check each word's type in the vocabulary table";
    return {
      ok: false,
      message: `ambiguous group [${words.join(", ")}] (${classSummary}) — ${hint}`,
    };
  }
  const majorityClass = Object.keys(classCounts).find((c) => classCounts[c] === 3);
  const oddIndex = classes.findIndex((c) => c !== majorityClass);
  if (oddIndex < 0) {
    return { ok: false, message: `all 4 words appear to share the same type — need 1 clear odd word (${classSummary})` };
  }
  if (!answerMatches(words[oddIndex], answer)) {
    return {
      ok: false,
      message: `answer must be "${words[oddIndex]}" (the ${classes[oddIndex]} — odd word out), not "${answer}" (${classSummary})`,
    };
  }
  return { ok: true };
}

function splitPromptBodyAndChoices(prompt) {
  const m = String(prompt || "").match(/^(.+?)\s*(\([^)]*\/[^)]*\))\s*$/);
  if (m) return { body: m[1].trim(), choices: m[2] };
  return { body: String(prompt || "").trim(), choices: "" };
}

/** Sentence skeleton for duplicate detection (ignores bracket options and gaps). */
function promptSentenceKey(prompt) {
  return String(prompt || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/_+/g, "")
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectWorksheetPromptEntries(data) {
  const entries = [];
  data.lingoLauncher?.practice?.forEach((ex) => {
    ex.items?.forEach((item) => {
      const key = promptSentenceKey(item.prompt);
      if (key) entries.push({ key, raw: item.prompt, sheet: "lingo", exercise: ex.number, typeId: ex.typeId, item: item.number });
    });
  });
  data.dictation?.exercises?.forEach((ex) => {
    ex.items?.forEach((item) => {
      const key = promptSentenceKey(item.prompt);
      if (key) entries.push({ key, raw: item.prompt, sheet: "dictation", exercise: ex.number, typeId: ex.typeId, item: item.number });
    });
  });
  return entries;
}

function findCrossWorksheetDuplicatePrompts(data) {
  const entries = collectWorksheetPromptEntries(data);
  const byKey = new Map();
  const duplicates = [];
  entries.forEach((entry) => {
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, []);
    }
    byKey.get(entry.key).push(entry);
  });
  byKey.forEach((group, key) => {
    if (group.length < 2) return;
    const sheets = new Set(group.map((g) => g.sheet));
    if (sheets.size < 2) return;
    const lingo = group.find((g) => g.sheet === "lingo");
    const dict = group.find((g) => g.sheet === "dictation");
    duplicates.push({
      key,
      lingo,
      dictation: dict,
      message: `Lingo (${lingo?.typeId} ex ${lingo?.exercise} item ${lingo?.item}) repeats dictation (${dict?.typeId} ex ${dict?.exercise} item ${dict?.item}): "${(group[0].raw || "").slice(0, 90)}${(group[0].raw || "").length > 90 ? "…" : ""}"`,
    });
  });
  return duplicates;
}

const LINGO_GAP_TOKEN = "________________";

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Insert gap where the answer word belongs; avoid blind append-at-end when answer is in the sentence. */
function insertVocabGapInPrompt(prompt, answer) {
  let p = String(prompt || "").trim();
  if (!p || /_+/.test(p)) return p;
  const ans = String(answer || "").trim();
  if (!ans) {
    return `${p.replace(/\s*\.?\s*$/, "")} ${LINGO_GAP_TOKEN}`;
  }
  for (const variant of answerVariants(ans)) {
    const re = new RegExp(`\\b${escapeRegex(variant)}\\b`, "i");
    if (re.test(p)) {
      return p.replace(re, LINGO_GAP_TOKEN).replace(/\s{2,}/g, " ").trim();
    }
  }
  if (ans.includes(" ")) {
    const re = new RegExp(escapeRegex(ans), "i");
    if (re.test(p)) return p.replace(re, LINGO_GAP_TOKEN).replace(/\s{2,}/g, " ").trim();
  }
  return `${p.replace(/\s*\.?\s*$/, "")} ${LINGO_GAP_TOKEN}`;
}

function inferLingoGapPrompt(prompt, answer, vocabulary, typeId) {
  const p = String(prompt || "").trim();
  if (!p || /_+/.test(p)) return p;
  const inserted = insertVocabGapInPrompt(p, answer);
  const appendedOnly = inserted === `${p.replace(/\s*\.?\s*$/, "")} ${LINGO_GAP_TOKEN}`;
  if (!appendedOnly) return inserted;

  const entry = findVocabByEnglish(vocabulary, answer);
  const coll = entry?.collocation?.trim();
  if (coll && ["L01", "L05"].includes(typeId)) {
    const collWithGap = insertVocabGapInPrompt(coll, answer);
    if (/_+/.test(collWithGap) && collWithGap !== coll) {
      const gapIdx = collWithGap.search(/_+/);
      const afterGap = collWithGap.slice(gapIdx + collWithGap.match(/_+/)[0].length).trim();
      if (afterGap.length > 2 && p.split(/\s+/).length >= 4) {
        return insertVocabGapInPrompt(p, answer);
      }
    }
  }
  return inserted;
}

function lingoPromptCopiesCollocation(prompt, collocation, answer) {
  if (!collocation?.trim()) return false;
  const pKey = promptSentenceKey(prompt);
  const cKey = promptSentenceKey(collocation);
  if (!pKey || !cKey) return false;
  if (pKey === cKey) return true;
  const idealKey = promptSentenceKey(insertVocabGapInPrompt(collocation, answer));
  if (pKey === idealKey) return true;
  const bare = String(prompt || "").replace(/_+/g, "").trim().toLowerCase();
  const collLower = collocation.trim().toLowerCase();
  if (bare && (bare === collLower || collLower.startsWith(bare))) return true;
  return false;
}

function validateLingoGapItem(prompt, answer, vocabulary) {
  const p = String(prompt || "").trim();
  if (!/_+/.test(p)) {
    return "put the gap where the answer word goes — e.g. She feels ________________ of her work (not at the wrong end)";
  }
  const ans = String(answer || "").trim();
  if (ans) {
    const withoutGap = p.replace(/_+/g, " ");
    if (new RegExp(`\\b${escapeRegex(ans)}\\b`, "i").test(withoutGap)) {
      return `remove "${answer}" from the sentence — only the gap should mark where it goes`;
    }
    const entry = findVocabByEnglish(vocabulary, answer);
    if (entry?.collocation && lingoGapOnlyAtEndWhenMidCollocation(p, answer, entry.collocation)) {
      return `gap is at the end but "${answer}" belongs earlier in the phrase — e.g. "${insertVocabGapInPrompt(entry.collocation, answer)}"`;
    }
  }
  return null;
}

function lingoGapOnlyAtEndWhenMidCollocation(prompt, answer, collocation) {
  const collGap = insertVocabGapInPrompt(collocation, answer);
  if (!/_+/.test(collGap)) return false;
  const gapIdx = collGap.search(/_+/);
  const afterGap = collGap.slice(gapIdx + collGap.match(/_+/)[0].length).replace(/[.?!]+$/, "").trim();
  if (afterGap.length <= 2) return false;
  const p = String(prompt || "").trim();
  const pGap = p.search(/_+/);
  const pAfter = p.slice(pGap + p.match(/_+/)[0].length).replace(/[.?!]+$/, "").trim();
  return pAfter.length <= 2;
}

function findLingoCollocationDuplicates(data) {
  const issues = [];
  const vocab = data.lingoLauncher?.vocabulary || [];
  data.lingoLauncher?.practice?.forEach((ex) => {
    if (!["L01", "L05"].includes(ex.typeId)) return;
    ex.items?.forEach((item) => {
      const v = findVocabByEnglish(vocab, item.answer);
      if (!v?.collocation?.trim()) return;
      if (lingoPromptCopiesCollocation(item.prompt, v.collocation, item.answer)) {
        issues.push(
          `Lingo ex ${ex.number} (${ex.typeId}) item ${item.number}: copies vocabulary collocation "${v.collocation}" — write a NEW sentence at level, same word different context`
        );
      }
    });
  });
  return issues;
}

function buildDictationDistributionBlock(form, plan, vocabulary) {
  const profileId = resolveProfileId(form.classProfile);
  const profile = CLASS_PROFILES[profileId];
  if (!profile) return "";
  const vocab = vocabulary || [];
  const targets = collectTestTargets(vocab);
  const dictCount = plan?.dictationExerciseCount || plan?.dictationTypes?.length || 3;
  const perEx = profile.itemsPerExercise;
  const totalSlots = dictCount * perEx;
  return `
DICTATION COVERAGE DISTRIBUTION — mandatory:
- Unit vocabulary: ${vocab.length} headwords; ${targets.length} total test targets (headwords + listed synonyms/antonyms/derivatives)
- Dictation exercises: ${dictCount}; ~${perEx} items EACH (never more than ${perEx + 1} per exercise)
- Cover ALL ${targets.length} targets at least ONCE across the WHOLE dictation worksheet combined — NOT in every exercise, NOT all in one exercise
- Split words across exercises: e.g. 14 words + 4 exercises → ~3–4 items per exercise, different words in each
- D01: wordBank may list unit words, but only ~${perEx} gap items in that exercise — other words go in other exercise types
- Total dictation items should be roughly ${totalSlots} (±3), distributed evenly — never ${vocab.length} items in a single exercise`;
}

function buildWorksheetUniquenessBlock() {
  return `
WORKSHEET UNIQUENESS — mandatory:
- Lingo Launcher practice and Dictation must use COMPLETELY DIFFERENT sentences
- NEVER copy the same sentence, bracket frame, or definition from one worksheet to the other
- L01/L05: NEVER paste the vocabulary table collocation as the prompt — write a NEW sentence or phrase at class level (same word, different context)
- Put the gap WHERE the answer word belongs (middle of sentence if needed) — NOT always at the end
- If L02 uses "The museum has an ancient (X / Y)", dictation must NOT reuse that sentence — write a new context`;
}

function countDictationPromptWords(prompt, typeId) {
  if (SLASH_CHOICE_TYPES.has(typeId) || typeId === "D12") {
    return countWords(splitPromptBodyAndChoices(prompt).body);
  }
  return countWords(prompt);
}

const RIDDLE_GIVEAWAY_HINTS = [
  { answers: ["treasure"], leaks: ["gold", "jewels", "jewel", "pirates look for me", "valuable thing"] },
  { answers: ["helmet"], leaks: ["hard hat", "protect your head", "wear to protect your head"] },
  { answers: ["jewel"], leaks: ["jewelry", "jewellery", "shiny stone", "used in jewelry"] },
  { answers: ["shipwreck"], leaks: ["broken ship", "bottom of the sea", "ship at the bottom"] },
  { answers: ["artifact"], leaks: ["old object from the past", "find me in the ground", "object from the past"] },
];

function riddleBodyLeaksAnswer(prompt, answer) {
  const { body } = splitPromptBodyAndChoices(prompt);
  if (!body || !answer) return false;
  for (const variant of answerVariants(answer)) {
    if (promptContainsAnswerText(body, variant, "D01")) return true;
  }
  const bodyLower = body.toLowerCase();
  for (const rule of RIDDLE_GIVEAWAY_HINTS) {
    if (!rule.answers.some((a) => answerMatches(a, answer))) continue;
    if (rule.leaks.some((leak) => bodyLower.includes(leak.toLowerCase()))) return true;
  }
  return hintTextRevealsAnswer(body, answer);
}

function formatDictationItemHtml(item, typeId) {
  if (typeId === "D02" && item.stem) {
    const prompt = escapeHtml(stripLeadingItemNumber(item.prompt) || "");
    const stem = escapeHtml(String(item.stem).toUpperCase());
    return `${prompt}  <strong class="stem-word">${stem}</strong>`;
  }
  if (typeId === "D08" || typeId === "D28") {
    return renderD08PromptHtml(stripLeadingItemNumber(item.prompt));
  }
  if (typeId === "D11") {
    const words = parseCommaWordGroup(stripLeadingItemNumber(item.prompt));
    if (words.length >= 3) {
      return escapeHtml(words.join(" · "));
    }
  }
  return escapeHtml(stripLeadingItemNumber(item.prompt) || "");
}

function formatDictationItemPlain(item, typeId) {
  if (typeId === "D02" && item.stem) {
    return `${stripLeadingItemNumber(item.prompt) || ""}  ${String(item.stem).toUpperCase()}`;
  }
  if (typeId === "D11") {
    const words = parseCommaWordGroup(stripLeadingItemNumber(item.prompt));
    if (words.length >= 3) return words.join(" · ");
  }
  return stripLeadingItemNumber(item.prompt) || "";
}

function collectWordFamilyForms(vocabEntry) {
  if (!vocabEntry) return [];
  const forms = [String(vocabEntry.english || "").trim()].filter(Boolean);
  normalizeDerivativesList(vocabEntry.derivatives).forEach((d) => {
    const t = typeof d === "string" ? d : d?.text;
    if (t?.trim()) forms.push(t.trim());
  });
  return forms;
}

function findVocabEntryForFamily(word, vocabulary) {
  const hit = lookupVocabEntry(word, vocabulary);
  if (hit) return hit.entry;
  return (vocabulary || []).find((v) =>
    collectWordFamilyForms(v).some((f) => answerMatches(f, word))
  ) || null;
}

function wordsShareD02Family(stem, answer, vocabulary) {
  if (!stem?.trim() || !answer?.trim()) return false;
  if (d02StemSameAsAnswer(stem, answer)) return false;
  const entry = findVocabEntryForFamily(stem, vocabulary) || findVocabEntryForFamily(answer, vocabulary);
  if (entry) {
    const family = collectWordFamilyForms(entry);
    const stemIn = family.some((f) => answerMatches(f, stem));
    const ansIn = family.some((f) => answerMatches(f, answer));
    if (stemIn && ansIn) return true;
  }
  const s = normalizeWord(stem);
  const a = normalizeWord(answer);
  if (s.length >= 5 && a.length >= 5) {
    let i = 0;
    while (i < s.length && i < a.length && s[i] === a[i]) i++;
    if (i >= 5) return true;
  }
  return false;
}

function getD02WordFamiliesFromForm(form) {
  return (form?.vocabRows || [])
    .filter((r) => r.english?.trim())
    .map((r) => {
      const derivs = normalizeDerivativesList(r.derivatives).map((d) => d.text).filter(Boolean);
      return { headword: r.english.trim(), forms: [r.english.trim(), ...derivs] };
    });
}

function getD02WordFamiliesFromVocabulary(vocabulary) {
  return (vocabulary || [])
    .filter((v) => v.english?.trim())
    .map((v) => ({ headword: v.english.trim(), forms: collectWordFamilyForms(v) }));
}

function d02StemSameAsAnswer(stem, answer) {
  const s = normalizeWord(stem);
  const a = normalizeWord(answer);
  if (!s || !a) return false;
  return s === a;
}

function normalizeD02Items(ex) {
  if (ex.typeId !== "D02") return;
  delete ex.stemHeader;
  ex.items?.forEach((item) => {
    let prompt = String(item.prompt || "").trim();
    let stem = String(item.stem || "").trim();

    const rootMatch = prompt.match(/^ROOT:\s*([A-Za-z]+)\s*[-–—]\s*(.+)$/i);
    if (rootMatch) {
      stem = stem || rootMatch[1];
      prompt = rootMatch[2].trim();
    }

    const endStem = prompt.match(/^(.+?)\s+([A-Z]{3,})\s*$/);
    if (!stem && endStem && !/_+/.test(endStem[2])) {
      prompt = endStem[1].trim();
      stem = endStem[2];
    }

    stem = stem.replace(/^ROOT:\s*/i, "").toUpperCase().trim();
    if (!/_+/.test(prompt)) {
      prompt = prompt.replace(/\s*\.?\s*$/, "") + " ________________";
    }
    item.prompt = prompt.trim();
    if (stem) item.stem = stem;
  });
}

function normalizeD02Exercises(data) {
  data.dictation?.exercises?.forEach((ex) => normalizeD02Items(ex));
  return data;
}

function normalizeLingoGapItem(item, vocabulary, typeId) {
  const ans = String(item.answer || "").trim();
  let p = String(item.prompt || "").trim();
  if (!p || !ans) return;

  const withoutGap = p.replace(/_+/g, " ").trim();
  if (new RegExp(`\\b${escapeRegex(ans)}\\b`, "i").test(withoutGap)) {
    item.prompt = insertVocabGapInPrompt(withoutGap, ans);
    return;
  }
  if (!/_+/.test(p)) {
    item.prompt = inferLingoGapPrompt(p, ans, vocabulary, typeId);
  }
}

function normalizeL05Items(ex, vocabulary) {
  if (ex.typeId !== "L05") return;
  ex.items?.forEach((item) => {
    normalizeLingoGapItem(item, vocabulary, "L05");
  });
  const answers = dedupeWords((ex.items || []).map((i) => i.answer).filter(Boolean));
  if (answers.length) {
    const bank = (ex.wordList || []).filter((w) => answers.some((a) => answerMatches(w, a)));
    const list = bank.length >= answers.length ? bank : answers;
    ex.wordList = wordListMatchesAnswerOrder(list, ex.items) ? shuffleListAwayFromAnswers(list, ex.items) : list;
  }
}

function normalizeL05Exercises(data) {
  const vocab = data.lingoLauncher?.vocabulary || [];
  data.lingoLauncher?.practice?.forEach((ex) => normalizeL05Items(ex, vocab));
  return data;
}

function normalizeL01Items(ex, vocabulary) {
  if (ex.typeId !== "L01") return;
  ex.items?.forEach((item) => {
    normalizeLingoGapItem(item, vocabulary, "L01");
  });
}

function normalizeL01Exercises(data) {
  const vocab = data.lingoLauncher?.vocabulary || [];
  data.lingoLauncher?.practice?.forEach((ex) => normalizeL01Items(ex, vocab));
  return data;
}

/** Index of the correct option inside the first (a / b / c) group, or -1. */
function bracketAnswerPosition(prompt, answer) {
  const m = String(prompt || "").match(/\(([^)]*\/[^)]*)\)/);
  if (!m) return -1;
  const options = m[1].split("/").map((s) => s.trim()).filter(Boolean);
  const idx = options.findIndex((o) => answerMatches(o, answer));
  return idx < 0 ? -1 : (idx === options.length - 1 ? "last" : idx);
}

function normalizeD12Items(ex) {
  if (ex.typeId !== "D12") return;
  // The AI is told "(distractor / distractor / correct)", so shuffle only while the answer
  // position is predictable — never on every render (keeps print and preview identical).
  const positions = (ex.items || []).map((i) => bracketAnswerPosition(i.prompt, i.answer)).filter((p) => p !== -1);
  const predictable = positions.length === 1
    ? positions[0] === "last" || positions[0] === 0
    : positions.length >= 2 && positions.every((p) => p === positions[0]);
  if (!predictable) return;
  ex.items?.forEach((item) => {
    if (item.prompt && /\([^)]*\/[^)]*\)/.test(item.prompt)) {
      item.prompt = shuffleBracketChoicesInPrompt(item.prompt, item.answer);
    }
  });
}

function normalizeD12Exercises(data) {
  data.dictation?.exercises?.forEach((ex) => normalizeD12Items(ex));
  return data;
}

function normalizeD15Items(ex) {
  if (ex.typeId !== "D15") return;
  ex.items?.forEach((item) => {
    let p = String(item.prompt || "").trim();
    if (!p) return;
    if (!/^\(\s*\)/.test(p) && !/^T\s*\/\s*F\b/i.test(p)) {
      p = `( ) ${p}`;
    }
    item.prompt = p;
  });
}

function normalizeD15Exercises(data) {
  data.dictation?.exercises?.forEach((ex) => normalizeD15Items(ex));
  return data;
}

/** D08: exactly one [wrong word] in square brackets — not slash choices. */
function parseD08WrongWord(prompt) {
  const matches = [...String(prompt || "").matchAll(/\[([^\]]+)\]/g)];
  if (matches.length !== 1) return null;
  const word = matches[0][1].trim();
  if (!word || /\//.test(word)) return null;
  return word;
}

function renderD08PromptHtml(prompt) {
  const p = String(prompt || "");
  const parts = [];
  let last = 0;
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(p)) !== null) {
    parts.push(escapeHtml(p.slice(last, m.index)));
    parts.push(`<span class="d08-mark">[<strong class="d08-wrong">${escapeHtml(m[1])}</strong>]</span>`);
    last = m.index + m[0].length;
  }
  parts.push(escapeHtml(p.slice(last)));
  return parts.join("");
}

function normalizeD08Items(ex) {
  if (ex.typeId !== "D08") return;
  ex.items?.forEach((item) => {
    const answer = String(item.answer || "").trim();
    if (answer && !item.testsWords?.length) {
      item.testsWords = [answer];
    }
  });
}

function normalizeD08Exercises(data) {
  data.dictation?.exercises?.forEach((ex) => normalizeD08Items(ex));
  return data;
}

function validateD08Item(item, vocabulary) {
  const wrong = parseD08WrongWord(item.prompt);
  if (!wrong) {
    return "mark the wrong vocabulary word in [square brackets] — e.g. The [royalties] attended the ceremony.";
  }
  const answer = String(item.answer || "").trim();
  if (!answer) return "missing answer (the correct vocabulary word)";
  if (/\s/.test(answer)) {
    return `answer must be one correct word only — not a full sentence (got "${answer.slice(0, 40)}…")`;
  }
  if (answerMatches(wrong, answer)) {
    return `the word in [brackets] "${wrong}" must be wrong — it cannot match the answer`;
  }
  const tests = item.testsWords?.length ? item.testsWords : [answer];
  if (!tests.some((t) => answerMatches(t, answer))) {
    return "testsWords must list the vocabulary target tested by this item";
  }
  if (!lookupVocabEntry(answer, vocabulary)) {
    return `answer "${answer}" must be a unit vocabulary word (headword, derivative, synonym, or antonym)`;
  }
  return null;
}

function d08d20PromptMissingError(item) {
  const prompt = String(item.prompt || "").trim();
  const answer = String(item.answer || "").trim();
  if (!prompt || !answer) return false;
  if (answer.includes(" ")) {
    return normalizeWord(prompt) === normalizeWord(answer);
  }
  return prompt.toLowerCase().split(/[^a-z'-]+/).some((w) => answerMatches(w, answer));
}

function maybeInjectRelatedTypes(types, allowedPool, features, section) {
  const result = [...types];
  for (const [flag, ids] of Object.entries(RELATED_EXERCISE_MAP)) {
    if (!features[flag]) continue;
    const candidates = ids[section].filter((id) => allowedPool.includes(id) && !result.includes(id));
    if (!candidates.length || Math.random() > 0.55) continue;
    const pick = randomChoice(candidates);
    if (result.length >= 2) {
      result[Math.floor(Math.random() * result.length)] = pick;
    } else {
      result.push(pick);
    }
  }
  return [...new Set(result)].slice(0, types.length);
}

function buildPlanFromCustom(profile, dictTypes, lingoTypes, features = {}) {
  const dict = filterDictTypesByFeatures(dictTypes.filter((t) => profile.allowDictation.includes(t)), features);
  const lingo = filterLingoTypesByFeatures(lingoTypes.filter((t) => profile.allowLingo.includes(t)), features);
  return {
    dictationExerciseCount: dict.length,
    dictationTypes: dict,
    lingoTypes: lingo,
    lingoPracticeCount: lingo.length,
    signature: buildSignature(dict, lingo),
    exerciseMode: "custom",
  };
}

function countWords(text) {
  return (text || "").replace(/_+/g, "").split(/\s+/).filter(Boolean).length;
}

function hasGreek(text) {
  return /[\u0370-\u03FF\u1F00-\u1FFF]/.test(text || "");
}

function validateWorksheet(data) {
  const issues = [];
  const profile = CLASS_PROFILES[data.meta?.classProfile];
  const vocab = data.lingoLauncher?.vocabulary || [];
  if (!profile) issues.push("Invalid class profile");

  const teacherOwned = !!data.meta?.vocabFromTeacher;
  vocab.forEach((v, i) => {
    if (!teacherOwned && !v.greek?.trim()) issues.push(`Vocab #${i + 1}: missing Greek translation`);
    if (!teacherOwned && profile?.minEmojis > 0 && !(v.emojis || "").trim()) {
      issues.push(`Vocab "${v.english}": needs at least one emoji for ${profile.label}`);
    }
    normalizeDerivativesList(v.derivatives).forEach((d) => {
      const text = typeof d === "string" ? d : d?.text;
      const greek = typeof d === "object" ? d?.greek : "";
      if (!teacherOwned && text?.trim() && !greek?.trim()) {
        issues.push(`Vocab "${v.english}" derivative "${text}": missing Greek translation`);
      }
    });
    normalizeAntonymList(v.antonyms).forEach((a) => {
      if (!teacherOwned && a.text && !a.greek?.trim()) {
        issues.push(`Vocab "${v.english}" antonym "${a.text}": missing Greek translation`);
      }
    });
  });

  const plan = data.generationPlan;
  const exCount = data.dictation?.exercises?.length || 0;
  if (plan && exCount !== plan.dictationExerciseCount) {
    issues.push(`Dictation has ${exCount} exercises; expected ${plan.dictationExerciseCount}`);
  }

  data.dictation?.exercises?.forEach((ex) => {
    if (!profile?.allowDictation?.includes(ex.typeId)) {
      issues.push(`Exercise type ${ex.typeId} not allowed for ${profile?.label}`);
    }
    const maxItems = (profile?.itemsPerExercise || 5) + 1;
    const itemCount = ex.items?.length || 0;
    if (profile && itemCount > maxItems) {
      issues.push(`Dictation exercise ${ex.number} (${ex.typeId}): ${itemCount} items — max ~${profile.itemsPerExercise} per exercise; split words across other dictation exercises`);
    }
    if (ex.typeId === "D01" && profile && itemCount > profile.itemsPerExercise + 1) {
      issues.push(`Dictation exercise ${ex.number} (D01): ${itemCount} gap items — use ~${profile.itemsPerExercise} definitions here; test remaining words in other dictation exercises`);
    }
    ex.items?.forEach((item) => {
      if (hasGreek(item.prompt) || hasGreek(item.instruction)) {
        issues.push(`Greek found in dictation prompt (item ${item.number})`);
      }
      if (profile && countDictationPromptWords(item.prompt, ex.typeId) > profile.maxSentenceWords + 5) {
        issues.push(`Sentence too long in dictation (max ~${profile.maxSentenceWords} words)`);
      }
      if ((item.prompt || "").includes("<u>")) issues.push("Forbidden <u> tag in dictation");
      if (ex.typeId === "D12") {
        if (!/\([^)]*\/[^)]*\)/.test(item.prompt || "")) {
          issues.push(`Dictation ex ${ex.number} (D12) item ${item.number}: riddle needs 3 bracketed choices (wrong / wrong / correct)`);
        }
        if (riddleBodyLeaksAnswer(item.prompt, item.answer)) {
          issues.push(`Dictation ex ${ex.number} (D12) item ${item.number}: riddle gives away answer "${item.answer}" — use context clues, not definitions`);
        }
      } else if (promptRevealsAnswer(item.prompt, item.answer, ex.typeId)) {
        const d25hint = ex.typeId === "D25" && /\([^)]+\)/.test(item.prompt || "")
          ? " — use a paraphrase in brackets, never the answer word"
          : "";
        issues.push(`Dictation ex ${ex.number} (${ex.typeId}) item ${item.number}: prompt reveals answer "${item.answer}"${d25hint}`);
      }
    });
  });

  const practiceCount = data.lingoLauncher?.practice?.length || 0;
  if (plan && practiceCount !== plan.lingoPracticeCount) {
    issues.push(`Lingo practice: expected ${plan.lingoPracticeCount}, got ${practiceCount}`);
  }

  data.lingoLauncher?.practice?.forEach((ex) => {
    const vocab = data.lingoLauncher?.vocabulary || [];
    const lingoItemCount = ex.items?.length || 0;
    const lingoMax = (profile?.itemsPerExercise || 5) + 1;
    if (profile && lingoItemCount > lingoMax) {
      issues.push(`Lingo exercise ${ex.number} (${ex.typeId}): ${lingoItemCount} items — max ~${profile.itemsPerExercise}; test a subset only, not the whole unit`);
    }
    if (["L01", "L05"].includes(ex.typeId) && ex.wordList?.length >= 2) {
      if (wordListMatchesAnswerOrder(ex.wordList, ex.items)) {
        issues.push(`Lingo exercise ${ex.number}: word list is in answer order — must be shuffled`);
      }
    }
    if (ex.typeId === "L03" && ex.wordList?.length) {
      issues.push(`Lingo exercise ${ex.number} (L03): remove wordList — bracket choices only, no word bank`);
    }
    if (ex.typeId === "L04" && ex.wordList?.length) {
      issues.push(`Lingo exercise ${ex.number} (L04): remove wordList — bracket choices only, no word bank`);
    }
    if (ex.typeId === "L02" && ex.wordList?.length) {
      issues.push(`Lingo exercise ${ex.number} (L02): wordList must be empty`);
    }
    if (ex.typeId === "L03" && !getSynonymWordsFromVocabulary(vocab).length) {
      issues.push(`Lingo exercise ${ex.number} (L03): no vocabulary words have synonyms listed`);
    }
    if (ex.typeId === "L04" && !getAntonymWordsFromVocabulary(vocab).length) {
      issues.push(`Lingo exercise ${ex.number} (L04): no vocabulary words have antonyms listed`);
    }
    if (ex.typeId === "L05") {
      if (ex.wordList?.length > lingoItemCount + 2) {
        issues.push(`Lingo exercise ${ex.number} (L05): word list has ${ex.wordList.length} words — include only headwords used in this exercise (~${profile?.itemsPerExercise || 5}), not every unit word`);
      }
      ex.items?.forEach((item) => {
        const gapErr = validateLingoGapItem(item.prompt, item.answer, vocab);
        if (gapErr) {
          issues.push(`Lingo ex ${ex.number} (L05) item ${item.number}: ${gapErr}`);
        }
      });
    }
    if (ex.typeId === "L01") {
      ex.items?.forEach((item) => {
        const gapErr = validateLingoGapItem(item.prompt, item.answer, vocab);
        if (gapErr) {
          issues.push(`Lingo ex ${ex.number} (L01) item ${item.number}: ${gapErr}`);
        }
      });
    }
    if (ex.typeId === "L09") {
      ex.items?.forEach((item) => {
        const words = parseCommaWordGroup(item.prompt);
        const check = validateOddOneOutGroup(words, item.answer, vocab);
        if (!check.ok) {
          issues.push(`Lingo ex ${ex.number} (L09) item ${item.number}: ${check.message}`);
        }
      });
    }
    if (itemsHaveSlashChoices(ex) && bracketChoicesAlwaysFirst(ex.items)) {
      issues.push(`Lingo exercise ${ex.number}: bracket choices always put the correct answer first — shuffle options`);
    }
    ex.items?.forEach((item) => {
      const p = (item.prompt || "").trim();
      if (ex.typeId === "L03" || ex.typeId === "L04") {
        const hasChoices = p.includes("(") && p.includes("/");
        if (!hasChoices) {
          issues.push(`Exercise ${ex.number} (${ex.typeId}): prompt must include choice brackets, not just "${p}"`);
        }
        if (ex.wordList?.length && ex.wordList.some((w) => p === w || p === w.trim())) {
          issues.push(`Exercise ${ex.number} (${ex.typeId}): prompt cannot be only the target word "${p}"`);
        }
        const target = getPromptTargetWord(p);
        const v = findVocabByEnglish(vocab, target);
        if (ex.typeId === "L03") {
          const syns = normalizeWordList(v?.synonyms);
          if (!v || !syns.length) {
            issues.push(`Lingo ex ${ex.number} item ${item.number}: "${target || p}" has no synonyms in vocabulary — skip or use another exercise type`);
          } else if (!syns.some((s) => answerMatches(s, item.answer))) {
            issues.push(`Lingo ex ${ex.number} item ${item.number}: answer "${item.answer}" must be a listed synonym of "${v.english}" (${syns.join(", ")})`);
          }
        }
        if (ex.typeId === "L04") {
          const ants = antonymTexts(v?.antonyms);
          if (!v || !ants.length) {
            issues.push(`Lingo ex ${ex.number} item ${item.number}: "${target || p}" has no antonyms in vocabulary`);
          } else if (!ants.some((a) => answerMatches(a, item.answer))) {
            issues.push(`Lingo ex ${ex.number} item ${item.number}: answer "${item.answer}" must be a listed antonym of "${v.english}" (${ants.join(", ")})`);
          }
        }
      }
      if (promptRevealsAnswer(item.prompt, item.answer, ex.typeId)) {
        issues.push(`Lingo ex ${ex.number} (${ex.typeId}) item ${item.number}: prompt reveals answer "${item.answer}"`);
      }
    });
  });

  data.dictation?.exercises?.forEach((ex) => {
    if (ex.wordBank?.length && itemsHaveSlashChoices(ex)) {
      issues.push(`Dictation exercise ${ex.number}: remove word bank — bracket choices already list options per item`);
    }
    if (ex.typeId === "D01" && ex.wordBank?.length >= 2) {
      if (wordListMatchesAnswerOrder(ex.wordBank, ex.items)) {
        issues.push(`Dictation exercise ${ex.number}: word bank is in answer order — must be shuffled`);
      }
    }
    if (ex.typeId === "D16") {
      const needed = dedupeWords(flattenExerciseAnswers(ex));
      if (!ex.wordBank?.length) {
        issues.push(`Dictation exercise ${ex.number} (D16): needs a shuffled word bank with all words to sort`);
      } else {
        const missing = needed.filter((a) => !ex.wordBank.some((w) => answerMatches(w, a)));
        if (missing.length) {
          issues.push(`Dictation exercise ${ex.number} (D16): word bank missing — ${missing.join(", ")}`);
        }
        if (ex.wordBank.length >= 2 && wordListMatchesAnswerOrder(ex.wordBank, itemsForAnswerOrderCheck(ex))) {
          issues.push(`Dictation exercise ${ex.number} (D16): word bank is in category/gap order — must be shuffled`);
        }
      }
      if (!ex.items?.some((i) => /_+/.test(i.prompt || ""))) {
        issues.push(`Dictation exercise ${ex.number} (D16): each category line needs ________ gaps for words`);
      }
    }
    if (itemsHaveSlashChoices(ex) && bracketChoicesAlwaysFirst(ex.items)) {
      issues.push(`Dictation exercise ${ex.number}: bracket choices always put the correct answer first — shuffle options`);
    }
    if (ex.typeId === "D01" && !itemsHaveSlashChoices(ex) && ex.items?.some((i) => !/_+/.test(i.prompt || ""))) {
      issues.push(`Dictation exercise ${ex.number} (D01): each definition needs a ________ gap and a word bank at the top`);
    }
    if (ex.typeId === "D02") {
      ex.items?.forEach((item) => {
        if (!/_+/.test(item.prompt || "")) {
          issues.push(`Dictation ex ${ex.number} (D02) item ${item.number}: sentence needs a ________ gap`);
        }
        if (!item.stem?.trim()) {
          issues.push(`Dictation ex ${ex.number} (D02) item ${item.number}: missing stem field (uppercase root word shown at end)`);
        }
        if (/^ROOT:/i.test(item.prompt || "")) {
          issues.push(`Dictation ex ${ex.number} (D02) item ${item.number}: use stem field — no ROOT: prefix in prompt`);
        }
        if (item.stem && item.answer && d02StemSameAsAnswer(item.stem, item.answer)) {
          issues.push(`Dictation ex ${ex.number} (D02) item ${item.number}: bold cue "${item.stem}" must differ from the gap answer "${item.answer}" — use another form from the same family (e.g. stem EMBARRASSMENT → answer embarrassed, NOT stem EMBARRASSING → answer embarrassing)`);
        } else if (item.stem && item.answer && !wordsShareD02Family(item.stem, item.answer, vocab)) {
          issues.push(`Dictation ex ${ex.number} (D02) item ${item.number}: stem "${item.stem}" and answer "${item.answer}" should belong to the same unit word family`);
        }
      });
    }
    if (["D03", "D05", "D06", "D18", "D24"].includes(ex.typeId)) {
      ex.items?.forEach((item) => {
        if (!/\([^)]*\/[^)]*\)/.test(item.prompt || "")) {
          issues.push(`Dictation ex ${ex.number} (${ex.typeId}) item ${item.number}: needs bracketed choices (wrong / correct / wrong)`);
        }
      });
    }
    if (ex.typeId === "D04") {
      ex.items?.forEach((item) => {
        if (!/_+/.test(item.prompt || "")) {
          issues.push(`Dictation ex ${ex.number} (D04) item ${item.number}: phrase needs a ________ gap for the missing word`);
        }
      });
    }
    if (ex.typeId === "D11") {
      ex.items?.forEach((item) => {
        const words = parseCommaWordGroup(item.prompt);
        if (words.length < 4) {
          issues.push(`Dictation ex ${ex.number} (D11) item ${item.number}: odd-one-out needs 4 comma-separated words, not a sentence`);
        }
      });
    }
    if (ex.typeId === "D08") {
      ex.items?.forEach((item) => {
        const err = validateD08Item(item, data.lingoLauncher?.vocabulary || []);
        if (err) {
          issues.push(`Dictation ex ${ex.number} (D08) item ${item.number}: ${err}`);
        }
      });
    }
    if (ex.typeId === "D20") {
      ex.items?.forEach((item) => {
        if (!String(item.answer || "").trim()) {
          issues.push(`Dictation ex ${ex.number} (D20) item ${item.number}: missing corrected answer`);
        } else if (d08d20PromptMissingError(item)) {
          issues.push(`Dictation ex ${ex.number} (D20) item ${item.number}: sentence must contain a mistake — do not print a correct sentence with no error to fix`);
        }
      });
    }
    if (ex.typeId === "D15") {
      ex.items?.forEach((item) => {
        const ans = String(item.answer || "").trim().toUpperCase();
        if (!/^(T|F|TRUE|FALSE)$/.test(ans)) {
          issues.push(`Dictation ex ${ex.number} (D15) item ${item.number}: answer must be T or F`);
        }
      });
    }
    if (ex.typeId === "D13") {
      if (!ex.wordBank?.length || ex.wordBank.length < (ex.items?.length || 0)) {
        issues.push(`Dictation exercise ${ex.number} (D13): needs lettered definitions — students cannot match words without a definition list`);
      }
      if (ex.items?.some((i) => !/_+/.test(i.prompt || ""))) {
        issues.push(`Dictation exercise ${ex.number} (D13): each word needs a blank (__________) for the answer letter`);
      }
      if (ex.items?.some((i) => !isSingleLetter(i.answer))) {
        issues.push(`Dictation exercise ${ex.number} (D13): each answer must be a single letter (A, B, C…) matching the definition list`);
      }
      const bankDefs = (ex.wordBank || []).map(stripMatchLetter);
      if (bankDefs.some((d) => ex.items?.some((i) => {
        const word = String(i.prompt || "").replace(/\s*_+\s*$/, "").trim();
        return answerMatches(d, word);
      }))) {
        issues.push(`Dictation exercise ${ex.number} (D13): definition list must describe meanings — not repeat the vocabulary words`);
      }
    }
  });

  validateExtraTypes(data, issues);

  findCrossWorksheetDuplicatePrompts(data).forEach((dup) => {
    issues.push(`Duplicate sentence across worksheets: ${dup.message}`);
  });

  findLingoCollocationDuplicates(data).forEach((msg) => {
    issues.push(msg);
  });

  const dictCoverage = computeDictationCoverage(vocab, data.dictation || { exercises: [] });
  if (dictCoverage.missing.length) {
    const labels = dictCoverage.missing.map((m) => {
      if (m.kind === "headword") return m.label;
      return `${m.label} (${m.kind})`;
    });
    issues.push(`Dictation — not tested at least once: ${labels.join(", ")}`);
  }

  const lingoCoverage = computeLingoCoverage(vocab, data.lingoLauncher?.practice || []);
  const coverage = {
    dictation: dictCoverage,
    lingo: lingoCoverage,
    wordMap: dictCoverage.wordMap,
    missing: dictCoverage.missing.map((m) => m.label),
    missingDetails: dictCoverage.missing,
    ok: dictCoverage.ok,
  };

  return { issues, coverage, valid: issues.length === 0 };
}

function subtitleLine(meta) {
  const unit = meta.unit ? `: Unit ${meta.unit}` : "";
  const pages = String(meta.pageRange || "").trim();
  return `${meta.bookTitle || "Worksheet"}${unit}${pages ? ` (p. ${pages})` : ""}`;
}


function normalizeWordList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function parseDerivativePart(part) {
  if (!part) return null;
  if (typeof part === "object" && part.text) {
    return {
      text: String(part.text).trim(),
      type: String(part.type || "").trim(),
      greek: String(part.greek || "").trim(),
    };
  }
  const trimmed = String(part).trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*-\s*(.+)$/);
  if (m) {
    return { text: m[1].trim(), type: m[2].trim(), greek: m[3].trim() };
  }
  return { text: trimmed, type: "", greek: "" };
}

function normalizeDerivativesList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(parseDerivativePart).filter(Boolean);
  }
  return String(value).split(/[,;]/).map(parseDerivativePart).filter(Boolean);
}

function normalizeVocabEntry(v) {
  if (!v) return v;
  return {
    ...v,
    synonyms: normalizeWordList(v.synonyms),
    antonyms: normalizeAntonymList(v.antonyms),
    derivatives: normalizeDerivativesList(v.derivatives),
  };
}

function antonymEnglish(a) {
  if (!a) return "";
  if (typeof a === "string") {
    const m = a.match(/^(.+?)\s*-\s*(.+)$/);
    return (m ? m[1] : a).trim();
  }
  return (a.text || "").trim();
}

function antonymGreek(a) {
  if (!a) return "";
  if (typeof a === "string") {
    const m = a.match(/^(.+?)\s*-\s*(.+)$/);
    return m ? m[2].trim() : "";
  }
  return (a.greek || "").trim();
}

function normalizeAntonymList(value) {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return parts.map((part) => {
    const text = antonymEnglish(part);
    if (!text) return null;
    return { text, greek: antonymGreek(part) };
  }).filter(Boolean);
}

function antonymTexts(value) {
  return normalizeAntonymList(value).map((a) => a.text);
}

function formatAntonymLine(a) {
  const text = antonymEnglish(a);
  if (!text) return "";
  const greek = antonymGreek(a);
  return greek ? `${text} - ${greek}` : text;
}

function formatDerivativeLine(d) {
  const text = typeof d === "string" ? d : d?.text;
  if (!text) return "";
  const type = typeof d === "string" ? "" : (d.type || "").trim();
  const greek = typeof d === "string" ? "" : (d.greek || "").trim();
  let line = text;
  if (type) line += ` (${type})`;
  if (greek) line += ` - ${greek}`;
  return line;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Two-column Lingo Launcher layout: left 1…⌈n/2⌉, right ⌈n/2⌉+1…n */
function buildVocabTablePairs(vocabulary) {
  const sorted = [...(vocabulary || [])].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  const n = sorted.length;
  if (!n) return [];
  const leftCount = Math.ceil(n / 2);
  const pairs = [];
  for (let r = 0; r < leftCount; r++) {
    pairs.push({ left: sorted[r] || null, right: sorted[r + leftCount] || null });
  }
  return pairs;
}

function normalizeVocabulary(vocabulary) {
  const sorted = [...(vocabulary || [])].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  return sorted.map((v, i) => normalizeVocabEntry({ ...v, number: i + 1 }));
}





/* ── Pictures (emoji drawn in the chosen style) ─────────────────────────── */
// The renderer registers how to draw an emoji (see js/pictures.js). Without it — e.g. when
// Word files are built in Node — worksheets fall back to plain emoji text.
let pictureSource = null;
function configurePictures(source) {
  pictureSource = source || null;
}

const EMOJI_GRAPHEME = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** Split text into graphemes, flagging the emoji ones. */
function splitEmojiText(text) {
  const str = String(text ?? "");
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  const parts = seg ? [...seg.segment(str)].map((s) => s.segment) : Array.from(str);
  return parts.map((p) => ({ text: p, emoji: EMOJI_GRAPHEME.test(p) }));
}

/** Pack key for an emoji: lower-case code points joined by "-", without FE0F or skin tones. */
function pictureKey(emoji) {
  return Array.from(String(emoji || ""))
    .map((c) => c.codePointAt(0).toString(16))
    .filter((h) => h !== "fe0f" && !/^1f3f[b-f]$/.test(h))
    .join("-");
}

/** HTML for a run of text: emojis drawn in `style` (or kept / removed), everything else escaped. */
/** Same as textWithPictures, for HTML that is already escaped (emoji never occur inside tags). */
function picturesInHtml(html, style = "emoji") {
  if (style === "emoji" || !style) return html;
  return splitEmojiText(html).map((p) => (!p.emoji ? p.text : style === "none" ? "" : pictureSource?.svg(p.text, style) || "")).join("");
}

function textWithPictures(text, style = "emoji") {
  if (style === "emoji" || !style) return escapeHtml(text);
  return splitEmojiText(text).map((p) => {
    if (!p.emoji) return escapeHtml(p.text);
    if (style === "none") return "";
    return pictureSource?.svg(p.text, style) || "";
  }).join("").replace(/\s{2,}/g, " ");
}

/* ── Worksheet layout options (per sheet, all switchable) ─────────────── */
const WORKSHEET_LAYOUT_DEFAULTS = {
  // Lingo Launcher stays with the student as a study sheet.
  lingo: { studentHeader: true, scoreBoxes: false, footer: true, reuseNote: false },
  // Dictation sheets are printed once and reused by several classes.
  dictation: { studentHeader: false, scoreBoxes: false, footer: true, reuseNote: true },
  answer: { studentHeader: false, scoreBoxes: false, footer: true, reuseNote: false },
};

/** Effective layout for one sheet: defaults ← saved meta.layout ← explicit options. */
function resolveWorksheetLayout(sheet, meta = {}, options = {}) {
  const saved = meta.layout || {};
  const layout = { ...WORKSHEET_LAYOUT_DEFAULTS[sheet], ...(saved[sheet] || {}), ...(options.layout?.[sheet] || {}) };
  // Older saves and callers used a single student-header flag.
  if (typeof options.studentHeader === "boolean" && !options.layout) layout.studentHeader = options.studentHeader;
  layout.schoolName = String(options.layout?.schoolName ?? saved.schoolName ?? "").trim();
  layout.pictureStyle = options.layout?.pictureStyle ?? saved.pictureStyle ?? "emoji";
  return layout;
}

/** Official unit title (Big Question) for Cambridge Primary Path units, if known. */
function worksheetUnitTitle(meta = {}) {
  const id = resolveCoursebookId(meta.bookTitle || "");
  return (id && CPP_BOOKS[id]?.units?.[Number(meta.unit)]?.title) || "";
}

function worksheetMetaParts(meta = {}) {
  const pages = String(meta.pageRange || "").trim();
  return {
    book: meta.bookTitle || "",
    unitLine: [meta.unit ? `Unit ${meta.unit}` : "", worksheetUnitTitle(meta)].filter(Boolean).join(" · "),
    detail: [pages ? `pp. ${pages}` : "", meta.classLabel || ""].filter(Boolean).join(" · "),
  };
}

function worksheetHeaderHtml(meta, { title, kind, layout }) {
  const m = worksheetMetaParts(meta);
  return `<header class="ws-head">
    <div class="ws-band">
      <div class="ws-band-title">
        ${layout.schoolName ? `<div class="ws-school">${escapeHtml(layout.schoolName)}</div>` : ""}
        <h1 class="ws-title ws-heading">${escapeHtml(title)}</h1>
        <div class="ws-kind">${escapeHtml(kind)}</div>
      </div>
      <div class="ws-band-meta">
        ${m.book ? `<div class="ws-book">${escapeHtml(m.book)}</div>` : ""}
        ${m.unitLine ? `<div class="ws-unit">${escapeHtml(m.unitLine)}</div>` : ""}
        ${m.detail ? `<div class="ws-detail">${escapeHtml(m.detail)}</div>` : ""}
      </div>
    </div>
    ${layout.studentHeader ? `<div class="ws-student">
      <span class="ws-field grow"><b>Name</b><i></i></span>
      <span class="ws-field"><b>Class</b><i></i></span>
      <span class="ws-field"><b>Date</b><i></i></span>
      <span class="ws-field score"><b>Score</b><i></i><em>/</em><i></i></span>
    </div>` : ""}
    ${layout.reuseNote ? `<div class="ws-reuse">✎ This sheet is shared — please don’t write on it. Write your answers in your notebook.</div>` : ""}
  </header>`;
}

// Kept for older callers; the header now renders the student box itself.
function renderStudentHeaderHtml() {
  return "";
}

function worksheetSectionHtml(label) {
  return `<div class="ws-section"><span>${escapeHtml(label)}</span></div>`;
}

/** "Exercise N" in an outlined squircle, followed by the instruction as the heading. */
function exerciseHeadHtml(ex, layout) {
  const instr = getStudentExerciseInstruction(ex);
  const n = (ex.items || []).length;
  return `<div class="ex-head">
    <span class="ex-num">Exercise ${escapeHtml(ex.number)}</span>
    <div class="ex-title">
      ${instr ? `<h3 class="ex-heading ex-instruction ws-heading">${escapeHtml(instr)}</h3>` : ""}
    </div>
    ${layout.scoreBoxes && n ? `<span class="ex-score"><i></i>/ ${n}</span>` : ""}
  </div>`;
}

/* ── Target word inside its phrase (bolded on worksheets) ────────────────── */
const IRREGULAR_FORMS = {
  be: ["am", "is", "are", "was", "were", "been", "being"], have: ["has", "had", "having"], do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone"], get: ["got", "gotten"], give: ["gave", "given"], take: ["took", "taken"], make: ["made"],
  come: ["came"], see: ["saw", "seen"], eat: ["ate", "eaten"], run: ["ran"], swim: ["swam", "swum"], fly: ["flew", "flown", "flies"],
  write: ["wrote", "written"], ride: ["rode", "ridden"], drive: ["drove", "driven"], break: ["broke", "broken"], speak: ["spoke", "spoken"],
  choose: ["chose", "chosen"], wake: ["woke", "woken"], wear: ["wore", "worn"], tear: ["tore", "torn"], throw: ["threw", "thrown"],
  grow: ["grew", "grown"], know: ["knew", "known"], draw: ["drew", "drawn"], blow: ["blew", "blown"], fall: ["fell", "fallen"],
  forget: ["forgot", "forgotten"], hide: ["hid", "hidden"], bite: ["bit", "bitten"], begin: ["began", "begun"], sing: ["sang", "sung"],
  drink: ["drank", "drunk"], ring: ["rang", "rung"], sink: ["sank", "sunk"], buy: ["bought"], bring: ["brought"], think: ["thought"],
  catch: ["caught"], teach: ["taught"], fight: ["fought"], find: ["found"], feel: ["felt"], keep: ["kept"], sleep: ["slept"],
  leave: ["left"], meet: ["met"], sell: ["sold"], tell: ["told"], hold: ["held"], stand: ["stood"], understand: ["understood"],
  build: ["built"], send: ["sent"], spend: ["spent"], lose: ["lost"], win: ["won"], sit: ["sat"], hear: ["heard"], say: ["said"],
  pay: ["paid"], lay: ["laid"], lie: ["lay", "lain", "lying"], die: ["dying"], tie: ["tying"], light: ["lit"], shine: ["shone"],
  feed: ["fed"], lead: ["led"], dig: ["dug"], hang: ["hung"], stick: ["stuck"], strike: ["struck"], shake: ["shook", "shaken"],
  steal: ["stole", "stolen"], freeze: ["froze", "frozen"], mean: ["meant"], dream: ["dreamt"], learn: ["learnt"], burn: ["burnt"],
  good: ["better", "best"], bad: ["worse", "worst"], far: ["further", "farther", "furthest"], child: ["children"], person: ["people"],
  man: ["men"], woman: ["women"], mouse: ["mice"], foot: ["feet"], tooth: ["teeth"], goose: ["geese"], leaf: ["leaves"], knife: ["knives"],
  wolf: ["wolves"], life: ["lives"], shelf: ["shelves"], half: ["halves"],
};

/** Regex source matching one target word in any common form (helps, helped, happier, made, …). */
function wordFormPattern(word) {
  const w = word.toLowerCase();
  const forms = [escapeRegex(w), `${escapeRegex(w)}(?:s|es|ed|ing|er|est|ly|ness)`];
  if (w.length > 3 && /e$/.test(w)) forms.push(`${escapeRegex(w.slice(0, -1))}(?:ing|ed|er|est|ion|ation)`);
  if (w.length > 3 && /y$/.test(w)) forms.push(`${escapeRegex(w.slice(0, -1))}(?:ies|ied|ier|iest|ily|iness)`);
  if (/[aeiou][bcdfghjklmnpqrstvz]$/.test(w)) forms.push(`${escapeRegex(w + w.at(-1))}(?:ed|ing|er|est)`);
  (IRREGULAR_FORMS[w] || []).forEach((f) => forms.push(escapeRegex(f)));
  return `(?:${forms.join("|")})`;
}

/**
 * Split a phrase into [{ text, bold }] so the vocabulary word stands out:
 * "she competed in a race" for "compete" → "she ", **competed**, " in a race".
 * Multi-word targets match as a unit (other words may sit between, e.g. "gave it up"),
 * then word by word. No match → the phrase as one plain segment.
 */
function splitTargetInPhrase(phrase, english) {
  const text = String(phrase ?? "");
  const target = String(english ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\bsth\b|\bsb\b|\bsomething\b|\bsomebody\b|\bsomeone\b/g, " ");
  const words = target.split(/[^a-z']+/).filter(Boolean);
  if (!text.trim() || !words.length) return [{ text, bold: false }];
  const B = "(?<![A-Za-z])";
  const E = "(?![A-Za-z])";
  const ranges = [];
  // Whole target, allowing up to two words in between (phrasal verbs) and hyphens (ice-cream).
  if (words.length > 1) {
    const rx = new RegExp(words.map((w) => `${B}(${wordFormPattern(w)})${E}`).join(`(?:[\\s-]+(?:[A-Za-z']+[\\s-]+){0,2}?)`), "gi");
    for (const m of text.matchAll(rx)) {
      let from = m.index;
      for (let g = 1; g <= words.length; g++) {
        const at = text.toLowerCase().indexOf(m[g].toLowerCase(), from);
        ranges.push([at, at + m[g].length]);
        from = at + m[g].length;
      }
    }
  }
  // Single word, or the content words of a multi-word target.
  if (!ranges.length) {
    const parts = words.length > 1 ? words.filter((w) => w.length > 2 && !["the", "and", "for", "out", "off", "with"].includes(w)) : words;
    for (const w of parts) {
      for (const m of text.matchAll(new RegExp(`${B}${wordFormPattern(w)}${E}`, "gi"))) ranges.push([m.index, m.index + m[0].length]);
    }
  }
  if (!ranges.length) return [{ text, bold: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  // Join neighbours split only by a space or hyphen ("take care of" → one bold run).
  for (let i = ranges.length - 1; i > 0; i--) {
    if (/^[\s-]*$/.test(text.slice(ranges[i - 1][1], ranges[i][0])) && ranges[i][0] >= ranges[i - 1][1]) {
      ranges[i - 1][1] = ranges[i][1];
      ranges.splice(i, 1);
    }
  }
  const out = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    if (s > pos) out.push({ text: text.slice(pos, s), bold: false });
    out.push({ text: text.slice(s, e), bold: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), bold: false });
  return out;
}

function phraseWithTargetHtml(phrase, english) {
  return splitTargetInPhrase(phrase, english).map((p) => (p.bold ? `<b class="v-target">${escapeHtml(p.text)}</b>` : escapeHtml(p.text))).join("");
}

function formatVocabCell(v, pictureStyle = "emoji") {
  let html = `<div class="v-top"><span class="v-num">${escapeHtml(v.number)}</span><span class="v-word">${escapeHtml(v.english)}</span>`;
  if (v.type?.trim()) html += `<span class="v-pos">${escapeHtml(v.type.trim())}</span>`;
  // Greek sits on the same line: "be born phr. = γεννιέμαι" (saves a line per word).
  if (v.greek?.trim()) html += `<span class="v-tr"><span class="v-eq">=</span> <span class="v-greek">${escapeHtml(v.greek.trim())}</span></span>`;
  const pics = v.emojis ? textWithPictures(v.emojis, pictureStyle).trim() : "";
  if (pics) html += `<span class="v-emoji">${pics}</span>`;
  html += `</div>`;
  if (v.collocation) html += `<div class="vocab-coll v-coll">${phraseWithTargetHtml(v.collocation, v.english)}</div>`;
  normalizeDerivativesList(v.derivatives).forEach((d) => {
    const line = formatDerivativeLine(d);
    if (line) html += `<div class="vocab-deriv v-rel"><b>→</b>${escapeHtml(line)}</div>`;
  });
  const syn = normalizeWordList(v.synonyms);
  const ant = normalizeAntonymList(v.antonyms);
  // Synonyms and opposites share one row: "≈ clever   ≠ silly - ανόητος" (wraps only if too long).
  const rel = [];
  if (syn.length) rel.push(`<span class="vocab-related"><b>≈</b>${escapeHtml(syn.join(", "))}</span>`);
  if (ant.length) rel.push(`<span class="vocab-related"><b>≠</b>${escapeHtml(ant.map(formatAntonymLine).join(", "))}</span>`);
  if (rel.length) html += `<div class="v-rel">${rel.join("")}</div>`;
  return html;
}

function answerPill(item, showAnswers) {
  return showAnswers && item.answer
    ? ` <span class="teacher-ans-pill" title="Answer">✓ ${escapeHtml(item.answer)}</span>`
    : "";
}

function renderLingoLauncher(data, options = {}) {
  const meta = data.meta || {};
  const density = options.density || meta.density || "standard";
  const layout = resolveWorksheetLayout("lingo", meta, options);
  const vocab = normalizeVocabulary(data.lingoLauncher.vocabulary);
  const rows = buildVocabTablePairs(vocab).map(({ left, right }) =>
    `<tr><td class="${left ? "vocab-cell" : "vocab-empty"}" ${left ? `data-vocab-num="${left.number}"` : ""}>${left ? formatVocabCell(left, layout.pictureStyle) : ""}</td><td class="${right ? "vocab-cell" : "vocab-empty"}" ${right ? `data-vocab-num="${right.number}"` : ""}>${right ? formatVocabCell(right, layout.pictureStyle) : ""}</td></tr>`);

  let practiceHtml = "";
  data.lingoLauncher.practice.forEach((ex, exIndex) => {
    // The heading is part of the first exercise's block, so the two always sit on the same page.
    practiceHtml += `<section class="ex-block">${exIndex === 0 ? worksheetSectionHtml("Let’s practise") : ""}${exerciseHeadHtml(ex, layout)}`;
    if (ex.wordList?.length) {
      practiceHtml += `<div class="word-list">${ex.wordList.map((w) => `<span>${escapeHtml(w)}</span>`).join("")}</div>`;
    }
    ex.items.forEach((item) => {
      practiceHtml += `<p class="ex-item" data-answer="${escapeHtml(item.answer || "")}"><span class="item-num">${escapeHtml(item.number)}</span><span class="item-text">${textWithPictures(stripLeadingItemNumber(item.prompt), layout.pictureStyle)}${answerPill(item, options.showAnswers)}</span></p>`;
    });
    practiceHtml += `</section>`;
  });

  return `
    <div class="worksheet lingo-sheet density-${escapeHtml(density)}">
      ${worksheetHeaderHtml(meta, { title: "Lingo Launcher", kind: "Vocabulary study sheet", layout })}
      ${worksheetSectionHtml(`Words to learn · ${vocab.length}`)}
      <table class="vocab-table"><tbody>${rows.join("")}</tbody></table>
      ${practiceHtml}
    </div>`;
}

function renderWordBankTable(words) {
  return `<div class="word-bank">${(words || []).map((w) => `<span>${escapeHtml(w)}</span>`).join("")}</div>`;
}

function renderMatchDefinitionsList(entries) {
  if (!entries?.length) return "";
  return `<div class="match-defs">
    ${entries.map((entry) => {
      const m = String(entry).match(/^([A-Z])\.\s*(.*)$/i);
      return m
        ? `<p class="match-def-line"><b>${escapeHtml(m[1].toUpperCase())}</b><span>${escapeHtml(m[2])}</span></p>`
        : `<p class="match-def-line"><span>${escapeHtml(entry)}</span></p>`;
    }).join("")}
  </div>`;
}

function renderDictation(data, options = {}) {
  const meta = data.meta || {};
  const density = options.density || meta.density || "standard";
  const layout = resolveWorksheetLayout("dictation", meta, options);
  let body = "";
  data.dictation.exercises.forEach((ex) => {
    body += `<section class="ex-block">${exerciseHeadHtml(ex, layout)}`;
    if (ex.wordBank?.length) {
      body += ex.typeId === "D13" ? renderMatchDefinitionsList(ex.wordBank) : renderWordBankTable(ex.wordBank);
    }
    if (ex.stemHeader) body += `<p class="stem-header">${escapeHtml(ex.stemHeader)}</p>`;
    ex.items.forEach((item) => {
      body += `<p class="ex-item" data-answer="${escapeHtml(item.answer || "")}"><span class="item-num">${escapeHtml(item.number)}</span><span class="item-text">${picturesInHtml(formatDictationItemHtml(item, ex.typeId), layout.pictureStyle)}${answerPill(item, options.showAnswers)}</span></p>`;
    });
    body += `</section>`;
  });

  return `
    <div class="worksheet dictation-sheet density-${escapeHtml(density)}">
      ${worksheetHeaderHtml(meta, { title: "Dictation", kind: "Vocabulary test", layout })}
      ${body}
    </div>`;
}

function renderAnswerKey(data, options = {}) {
  const meta = data.meta || {};
  const density = options.density || meta.density || "standard";
  const layout = resolveWorksheetLayout("answer", meta, options);
  const exBlock = (ex, sheetLabel) => {
    const typeName = EXERCISE_LABELS[ex.typeId] || "";
    let h = `<section class="ex-block key-block"><div class="key-head"><h3 class="ex-heading ws-heading">${escapeHtml(sheetLabel)} · Exercise ${escapeHtml(ex.number)}</h3>${typeName ? `<span class="key-type">${escapeHtml(typeName)}</span>` : ""}</div>`;
    (ex.items || []).forEach((item) => {
      // Only show tested words when they add something beyond the answer itself.
      const words = (item.testsWords || []).filter((w) => String(w).trim().toLowerCase() !== String(item.answer || "").trim().toLowerCase()).join(", ");
      h += `<p class="ex-item"><span class="item-num">${escapeHtml(item.number)}</span><span class="item-text"><strong>${escapeHtml(item.answer || "—")}</strong>${words ? ` <span class="ans-tests-tag">${escapeHtml(words)}</span>` : ""}</span></p>`;
    });
    return h + `</section>`;
  };
  const keySection = (label, list, sheetLabel) => (list.length ? `<div class="key-section">${worksheetSectionHtml(label)}<div class="key-grid">${list.map((ex) => exBlock(ex, sheetLabel)).join("")}</div></div>` : "");
  const body = keySection("Lingo Launcher practice", data.lingoLauncher?.practice || [], "Lingo") + keySection("Dictation", data.dictation?.exercises || [], "Dictation");

  return `
    <div class="worksheet answer-key-sheet density-${escapeHtml(density)}">
      ${worksheetHeaderHtml(meta, { title: "Answer Key", kind: "Teacher’s copy", layout })}
      ${body}
    </div>`;
}

function renderCoverageHeatmap(coverage, vocabulary) {
  if (!vocabulary?.length) return "";
  const lingo = coverage.lingo?.wordMap || {};
  return vocabulary.map((v) => {
    const inDict = (coverage.dictation?.wordMap?.[v.english] || []).length > 0;
    const inLingo = (lingo[v.english] || []).length > 0;
    let cls = "cov-bad";
    if (inDict) cls = "cov-good";
    else if (inLingo) cls = "cov-warn";
    const tags = [inDict ? "dictation ✓" : null, inLingo ? "lingo ✓" : null].filter(Boolean).join(" · ");
    return `<span class="cov-chip ${cls}" title="${tags || "not covered"}">${escapeHtml(v.english)}</span>`;
  }).join(" ");
}

const DICTATION_EXERCISE_FORMAT_RULES = `
DICTATION FORMATS (never give away answers to students):
- D01 Definition + word bank ONLY: shuffled wordBank at top (may include all unit words); only ~itemsPerExercise gap/definition items in THIS exercise — other words tested in OTHER dictation exercises. NEVER put every vocabulary word as a gap item in one D01 exercise
- D02 Word formation (Cambridge style): NO "ROOT:" prefix. Each item = { "prompt": "sentence with ________________ gap", "stem": "WORD", "answer": "otherForm" }. "stem" = uppercase clue shown in bold at end — ANY other form from the same word family (headword, derivative, or root: JOURNAL, JOURNALIST, JOURNALISM, EMBARRASS, EMBARRASSMENT, EMBARRASSING…). VARY stems across items — do not use only bare roots. "answer" = the form that fits the gap — MUST differ from stem. FORBIDDEN: stem identical to answer. Use vocabulary derivatives when listed
- D03 Bracketed choice: NO wordBank; gap plus (wrong / correct) with slashes; correct answer must NOT always be first — vary order
- D04 Phrase completion: collocation with __________ gap ONLY — FORBIDDEN: "________ (regularly)" or any parenthesis hint; students recall the missing word from context
- D12 Mystery riddle: riddle body BEFORE brackets, max ~profile maxSentenceWords words in body only. Body = short context clues, NOT dictionary definitions. FORBIDDEN in body: answer word, obvious synonyms, giveaway phrases ("gold and jewels" for treasure, "hard hat" for helmet). Each item ends with shuffled (wrong / wrong / correct) bracket choices — 3 options only
- D13 Matching columns: REQUIRED wordBank = shuffled lettered definitions (e.g. "A. great honour and admiration", "B. strong enthusiasm for something") — one per item, same count as items. Items = vocabulary word/phrase + blank only: "passion __________". answer = single LETTER only (e.g. "C"). NEVER print words without the definition list — students cannot solve otherwise. Definitions must explain meaning, not repeat the vocabulary word
- D16 Category sort: REQUIRED shuffled wordBank with EVERY word students must place (all answers across categories combined); category lines use ________ gaps only — e.g. "Sports: ________, ________"; put words in testsWords per line OR comma-separated in answer; NEVER leave wordBank empty
- D05/D06/D18: NO wordBank; multiple choices inside parentheses separated by / only; shuffle option order so the answer is not always first
- D17 Collocation pair: one half of collocation given + ________ gap (e.g. "pour ________ into a glass"); answer is the missing chunk only — words like "a" in the prompt are NOT the answer
- D08 Sentence fixer (vocabulary): mark the ONE wrong word in [square brackets] in each sentence. "answer" = the single correct unit vocabulary word students write on their answer sheet. "testsWords" = [that same word]. Use a plausible mistake: wrong form (royalties→royalty), wrong similar word (cart→wagon), wrong collocation partner. NEVER print a perfect sentence with no [brackets]. NEVER use (slash / choices) — square brackets only. BAD: "The royalty attended the ceremony." GOOD: "The [royalties] attended the ceremony." answer "royalty". BAD: answer = full corrected sentence
- D15 True / false: each item starts with "( )" for students to write T or F; statement uses unit vocabulary in context; answer = "T" or "F" only
- D20 Error correction: like D08 — each sentence has a deliberate vocabulary mistake; answer = corrected sentence; prompt must NOT already be correct
- D11 Odd one out: each item = exactly 4 comma-separated words on one line (e.g. "run, jump, swim, apple") — NOT full sentences
- D25 Picture / emoji cue: each item is mainly emoji(s); add (short paraphrase) ONLY if the emoji is ambiguous — NEVER use the answer word or a close form (FORBIDDEN: "➡️ (arrow pointing farther)" for answer farther/further); paraphrase instead: "➡️ (more distance this way)"
- D26 Jumbled letters: prompt = "scrambledLetters (short clue)" e.g. "ckrat (a path for running races)"; the scramble MUST be the answer's letters in a different order (single word, lower case); the clue must NOT contain the answer or a close form; answer = the unit word
- D27 Missing letters: prompt = "t _ a _ k (short clue)" — the answer's letters with 2–3 letters replaced by "_" separated by spaces (never the first letter); clue must NOT contain the answer; answer = the full unit word (single word)
- D28 Spelling check: sentence with ONE misspelt unit word in [square brackets] (a realistic learner error, e.g. [competion]); answer = the correctly spelt word; the bracketed word must NOT be a real English word
- GLOBAL: Parentheses with a single vocabulary word matching the answer are FORBIDDEN on D01/D02/D04/D14/D17 — this includes trailing hints like "(blend)" after a gap`;

const LINGO_EXERCISE_FORMAT_RULES = `
LINGO PRACTICE FORMATS (follow exactly per typeId):
- L01 Gap fill: wordList = answer words SHUFFLED (~5 items). Each prompt = NEW sentence at class level with ________________ gap WHERE the answer word belongs (middle or end — never paste vocab collocation; never copy dictation sentences). Remove the answer word from the sentence — only the gap
- L02 Circle best word: wordList MUST be [] empty; each prompt = sentence with ( optionA / optionB ) choices IN the sentence; answer = correct option. Use sentences that do NOT appear anywhere in dictation
- L03 Synonym match: wordList MUST be [] empty — NO word bank row. ONLY create items for vocabulary words that HAVE synonyms listed in the table. Each prompt = "TARGET ( synonymFromTable / distractor / distractor )"; answer = one of that word's listed synonyms from the vocabulary table — do NOT invent synonyms for words without synonyms in the table
- L04 Opposite pairs: wordList MUST be [] empty. ONLY for words WITH antonyms in the table. Each prompt = "TARGET ( antonymFromTable / distractor / distractor )"; answer = listed antonym — do NOT invent antonyms
- L05 Collocation match: wordList = ONLY headwords in THIS exercise (shuffled, ~5). Each prompt = NEW phrase/sentence with gap where the headword goes — use collocation as a pattern only, NOT as the prompt text. GOOD: "She keeps her clothes in the ________________" answer drawer (not copying "open the drawer" from the table). Gap position must match natural word order
- L11 Yes / No questions: each prompt = a short question testing real understanding of a unit word in context (e.g. "Do athletes compete in a stadium?"); wordList MUST be []; answer = "Yes" or "No"; use a MIX of both (never all Yes); NEVER include the choices in the prompt
- L12 Spelling check: sentence with ONE misspelt unit word in [square brackets]; wordList MUST be []; answer = the correctly spelt word; the bracketed word must NOT be a real English word; NEW sentences, not copied from dictation
- L13 Which sentence is right?: wordList MUST be []; each prompt = "A. sentence  B. sentence" on one line — same unit word in both, exactly one uses it correctly (collocation, form or meaning); answer = "A" or "B"; MIX A and B answers; the mistake must be about the unit word, never random grammar
- L09 Odd one out: each item = exactly 4 comma-separated words. 3 share the SAME part of speech (check vocabulary type); 1 is a different part of speech. answer = the odd word only. NEVER put antonyms or related forms (careful/careless) together. NEVER use 4 nouns with no verb/adjective odd word. GOOD: "artifact, treasure, jewel, excavate" (3 nouns + 1 verb, answer excavate). BAD: "careful, careless, royalty, excavate" (2 adjectives + mixed). BAD: "wagon, tide, audience, mystery" (4 nouns — no clear odd word)`;

function buildSystemPrompt(profileId, plan) {
  const typeDesc = plan.dictationTypes.map((t) => `${t} (${EXERCISE_LABELS[t]})`).join(", ");
  const lingoDesc = plan.lingoTypes.map((t) => `${t} (${EXERCISE_LABELS[t]})`).join(", ");
  return `You are Vocab Master, an expert ESL materials writer for Greek learners in Greek language schools (φροντιστήριο).

Return ONLY valid json matching the schema below. No markdown fences.

${getProfilePromptBlock(profileId)}

LOCKED GENERATION PLAN (do NOT change types or counts):
- Dictation exercises: exactly ${plan.dictationExerciseCount} — types: ${typeDesc}
- Lingo practice: exactly ${plan.lingoPracticeCount} — types: ${lingoDesc}

RULES:
- Greek translation on EVERY Lingo Launcher vocab item; NEVER Greek in dictation prompts
- Collocation phrases, not dictionary sentences
- DICTATION: every headword AND every synonym, antonym, and derivative listed in the vocabulary table must be tested at least once TOTAL across all dictation exercises combined — NOT in every exercise, NOT all in one exercise. Each dictation exercise: ~${CLASS_PROFILES[profileId]?.itemsPerExercise || 5} items only
- LINGO PRACTICE: test a sensible subset of words — not every word must appear in practice. Each Lingo exercise: ~${CLASS_PROFILES[profileId]?.itemsPerExercise || 5} items maximum — NEVER one exercise with every vocabulary word
- NEVER reuse the same sentence in Lingo practice and Dictation — write different contexts for each worksheet
- Item "number" is a plain counter (1, 2, 3…) — NEVER type "(1)", "1)" or "1." at the start of any item "prompt"; the app prints the numbered circle itself
- Dictation titles: "Exercise N" only — no parenthetical subtitles
- Leave dictation "instruction" field empty — the app prints the student task line automatically
- No <u> HTML tags
- Lingo vocabulary table: two columns for any word count; left 1…⌈n/2⌉, right ⌈n/2⌉+1…n
- Emojis: prefer 1 per vocab item; use 2 only if one cannot convey meaning
- Derivatives show as > lines under the word with Greek: > form (type) - ελληνικά; every derivative MUST include greek
- Antonyms show as ≠ lines: english - ελληνικά; every antonym MUST include greek (array of { "text", "greek" })
- Associate synonyms, antonyms, and derivatives in exercises ONLY for words where those fields are filled in the vocabulary table — never invent them
${VOCAB_SENSE_DISAMBIGUATION_RULES}
- Teacher-provided type, greek, or collocation on a vocab row are LOCKED — copy exactly into the vocabulary table

JSON SCHEMA:
{
  "meta": { "bookTitle", "unit", "pageRange", "classProfile", "classLabel", "greekGrades", "cefr", "ageRange" },
  "generationPlan": { "dictationExerciseCount", "dictationTypes", "lingoTypes", "lingoPracticeCount", "signature" },
  "lingoLauncher": {
    "vocabulary": [{ "number", "english", "type", "greek", "emojis", "collocation", "derivatives": [{ "text", "type", "greek" }], "synonyms": [], "antonyms": [{ "text", "greek" }] }],
    "practice": [{ "number", "typeId", "instruction", "wordList": [], "items": [{ "number", "prompt", "answer" }] }]
  },
  "dictation": {
    "exercises": [{ "number", "typeId", "instruction": "", "wordBank": [], "items": [{ "number", "prompt", "answer", "stem", "testsWords": [] }] }]
  }
}

For D08 each item MUST use [wrongWord] in the prompt, answer = single correct vocabulary word, testsWords = [answer].
For D02: stem = bold clue (any form from word family except the answer); answer = different form in gap. Vary stem forms across items.
For D01 include wordBank row SHUFFLED (2–3 rows if many words) — never in answer order; only ~itemsPerExercise gap items in this exercise (not one gap per vocab word); NO bracket choices.
For D13 include wordBank as shuffled lettered definitions (A., B., C.…) — count MUST match items; items are words with __________ blank; answers are letters only.
For D16 include wordBank with ALL category words SHUFFLED — never in the same order as gaps left-to-right across categories.
For D03/D05/D06/D18 use bracket choices in each prompt only — wordBank must be empty [].
${DICTATION_EXERCISE_FORMAT_RULES}
${LINGO_EXERCISE_FORMAT_RULES}`;
}

function buildDictationRelatedExerciseBlock(form, plan) {
  let block = "";
  if (plan.dictationTypes?.includes("D08")) {
    block += `
D08 SENTENCE FIXER (vocabulary) — mandatory:
- Students see the wrong word in [square brackets] and write the correct unit word on their answer sheet
- Each item: "prompt" = sentence with exactly one [wrongWord] in brackets; "answer" = single correct vocabulary word; "testsWords" = [answer]
- Wrong word must be plausible: wrong plural/form, similar word, or wrong collocation — NOT random
- Cover different unit words across items (royalty, wagon, audience, etc.)
- BAD: "The royalty attended the ceremony." (no brackets — students cannot see what to fix)
- BAD: answer "The royalty attended the ceremony." (full sentence — answer must be one word only)
- GOOD: prompt "The children played with a red [cart].", answer "wagon", testsWords ["wagon"]
- GOOD: prompt "The [royalties] attended the ceremony.", answer "royalty", testsWords ["royalty"]`;
  }
  if (plan.dictationTypes?.includes("D02")) {
    const families = getD02WordFamiliesFromForm(form);
    block += `
D02 WORD FORMATION (Cambridge style) — mandatory:
- Each item: "prompt" = sentence with ________________ gap ONLY (no ROOT: prefix)
- "stem" = uppercase clue at end — a DIFFERENT form from the same word family as the answer (not the answer itself)
- VARY the stem form across items: mix headwords, derivatives, and roots — e.g. JOURNAL / JOURNALIST / JOURNALISM / EMBARRASS / EMBARRASSMENT / EMBARRASSING
- "answer" = the form that correctly fills the gap — must differ from stem
- Use word families from the unit (headword + derivatives). Prefer listed derivatives when they exist
- BAD: stem MATHEMATICS → answer mathematics (same word)
- BAD: every item uses only bare root MATHEM, JOURNAL, EMBARRASS (no variety)
- GOOD: stem JOURNALIST → answer journalism; stem EMBARRASSMENT → answer embarrassed; stem MATHEMATICS → answer mathematician
- GOOD: stem CONNECT → answer connection (classic root → derived)
- OK when forms coincide: stem ACCESS → answer access (same spelling, different sense)
Unit word families (use these forms for stems and answers):
${JSON.stringify(families, null, 2)}`;
  }
  if (plan.dictationTypes?.includes("D12")) {
    block += `
D12 MYSTERY RIDDLE — mandatory:
- Riddle body: short clues about use/context — max ~${CLASS_PROFILES[form.classProfile || plan.classProfile]?.maxSentenceWords || 11} words in body (not counting bracket choices)
- FORBIDDEN in riddle body: the answer word, synonyms, or defining phrases that name the answer
- End each item with shuffled (distractor / distractor / correct) — 3 bracketed options
- BAD: "I am a valuable thing like gold. Pirates look for me." for answer treasure
- GOOD: "People buried me long ago. You might dig to find me. What am I? (helmet / artifact / jewel)"`;
  }
  if (plan.dictationTypes?.includes("D03") || plan.dictationTypes?.includes("D05") || plan.dictationTypes?.includes("D06")) {
    block += `
BRACKET-CHOICE DICTATION (D03/D05/D06 etc.) — mandatory:
- ~${CLASS_PROFILES[form.classProfile]?.itemsPerExercise || 5} items per exercise — do NOT list every vocabulary word in one exercise
- Each sentence must be UNIQUE — never copy sentences from Lingo Launcher practice`;
  }
  if (plan.dictationTypes?.includes("D13")) {
    block += `
D13 MATCHING COLUMNS — mandatory:
- wordBank: shuffled lettered definitions ONLY (e.g. "A. to get power over something", "B. protection against attack") — exactly one definition per item
- items: vocabulary word or phrase from the unit, then blank: "passion __________" — NOT definitions in the item list
- answer: correct LETTER only (A, B, C…) pointing to the matching definition in wordBank
- NEVER leave wordBank empty or fill it with vocabulary words — students need definitions to solve the task`;
  }
  return block;
}

function buildLingoRelatedExerciseBlock(form, plan) {
  let block = "";
  if (plan.lingoTypes?.includes("L02")) {
    block += `
L02 CIRCLE BEST WORD — mandatory:
- wordList: [] (empty)
- Each item = one unique sentence with (optionA / optionB) in the sentence
- These sentences must NOT appear in dictation — write different contexts for Lingo practice`;
  }
  if (plan.lingoTypes?.includes("L03")) {
    const words = getSynonymWordsFromForm(form);
    block += `
L03 SYNONYM MATCH — mandatory:
- wordList: [] (empty — never show a word bank row)
- One item per word below ONLY (not every unit word)
- answer must be from that word's synonyms array in the vocabulary table
- Do NOT test or invent synonyms for words not listed below
Words with synonyms: ${JSON.stringify(words)}`;
  }
  if (plan.lingoTypes?.includes("L04")) {
    const words = getAntonymWordsFromForm(form);
    block += `
L04 OPPOSITE PAIRS — mandatory:
- wordList: [] (empty)
- One item per word below ONLY
- answer must be from that word's antonyms in the vocabulary table
Words with antonyms: ${JSON.stringify(words)}`;
  }
  if (plan.lingoTypes?.includes("L01")) {
    const perEx = CLASS_PROFILES[form.classProfile || plan.classProfile]?.itemsPerExercise || 5;
    block += `
L01 GAP FILL — mandatory:
- ~${perEx} items; wordList = only those answer words, shuffled
- Write NEW sentences at class level — NEVER copy vocabulary collocations or dictation sentences
- Put ________________ where the answer word belongs in the sentence (not always at the end)
- BAD: copying table collocation "open the drawer" → prompt "open the drawer ________________"
- GOOD: "She keeps her socks in the ________________" answer drawer
- GOOD: "The team felt very ________________ after the win" answer proud`;
  }
  if (plan.lingoTypes?.includes("L05")) {
    const perEx = CLASS_PROFILES[form.classProfile || plan.classProfile]?.itemsPerExercise || 5;
    block += `
L05 COLLOCATION MATCH — mandatory:
- ~${perEx} items ONLY; wordList = only headwords used as answers (shuffled) — NOT the whole unit
- Use collocation to know which word to test — but write a NEW phrase/sentence, do NOT paste the table collocation
- Gap goes where the headword belongs: "feel ________________ of yourself" NOT "feel proud of yourself ________________"
- GOOD: "She works as a ________________ for a newspaper" answer journalist (new context)
- BAD: copying "work as a journalist" from the table; BAD: 16 items; BAD: gap always at end when more words follow`;
  }
  if (plan.lingoTypes?.includes("L09")) {
    const types = getVocabWordsWithTypesFromForm(form);
    block += `
L09 ODD ONE OUT — mandatory:
- Each item = exactly 4 comma-separated words; answer = the single odd word
- Use the vocabulary table types: exactly 3 words with the SAME type + 1 word with a DIFFERENT type
- Prefer 3 unit nouns + 1 unit verb (or 3 nouns + 1 adjective). The odd word is usually the verb.
- FORBIDDEN: antonym pairs in one group; related forms (careful/careless, royalty/royal); 4 nouns with no clear odd word
- Before each item, verify types: 3+1 split — not 2+1+1 or 4+0
- GOOD: "artifact, treasure, jewel, excavate" → types noun,noun,noun,verb — answer excavate
- GOOD: "wagon, helmet, shipwreck, discover" → 3 nouns + 1 verb
- BAD: "careful, careless, royalty, excavate" — careful/careless are related; only 2 adjectives
- BAD: "wagon, tide, audience, mystery" — all nouns; no clear odd word
Unit vocabulary types (use these when building groups):
${JSON.stringify(types)}`;
  }
  return block;
}

/** Fields a teacher edits per word in Step 2. */
const TEACHER_VOCAB_FIELDS = ["type", "greek", "emojis", "collocation", "derivatives", "synonyms", "antonyms"];

/**
 * The vocabulary table on the worksheet IS the teacher's Step 2 table — the AI only writes exercises.
 * Whatever the AI put in the table is replaced with the teacher's values word by word: a field the
 * teacher emptied, deleted or switched off stays blank (never invented), a filled one is copied
 * exactly (Greek, emojis, phrase, family, synonyms, opposites). Freeform mode has no teacher rows
 * and is left alone. Returns the same data object.
 */
function enforceTeacherVocabulary(data, form) {
  const rows = form?.inputMode === "structured" ? form.vocabRows : null;
  if (!rows?.length || !data?.lingoLauncher) return data;
  const vocab = data.lingoLauncher.vocabulary || [];
  const used = new Set();
  const rowFor = (v, i) => {
    const key = normEnglish(v?.english);
    let j = rows.findIndex((r, idx) => !used.has(idx) && normEnglish(r.english) === key);
    if (j < 0 && rows[i] && !used.has(i) && !vocab.some((o) => normEnglish(o?.english) === normEnglish(rows[i].english))) j = i;
    if (j < 0) return null;
    used.add(j);
    return rows[j];
  };
  data.lingoLauncher.vocabulary = vocab.map((v, i) => {
    const row = rowFor(v, i);
    if (!row) return v;
    const on = (k) => row.fieldToggles?.[k] !== false;
    const text = (k) => (on(k) ? String(row[k] ?? "").trim() : "");
    return {
      ...v,
      english: row.english || v.english,
      type: text("type"),
      greek: text("greek"),
      emojis: text("emojis"),
      collocation: text("collocation"),
      derivatives: normalizeDerivativesList(text("derivatives")),
      synonyms: normalizeWordList(text("synonyms")),
      antonyms: normalizeAntonymList(text("antonyms")),
    };
  });
  data.meta = { ...(data.meta || {}), vocabFromTeacher: true };
  return data;
}

/** Core fields (not the optional family / synonyms / opposites) the teacher switched on but left empty. */
function findVocabGaps(form) {
  const gaps = {};
  if (form?.inputMode !== "structured") return gaps;
  for (const r of form.vocabRows || []) {
    for (const k of ["type", "greek", "emojis", "collocation"]) {
      if (r.fieldToggles?.[k] !== false && !String(r[k] ?? "").trim()) (gaps[k] ||= []).push(r.english);
    }
  }
  return gaps;
}

function buildUserPrompt(form, plan, teacherHints) {
  let vocabSection = "";
  if (form.inputMode === "structured" && form.vocabRows?.length) {
    const n = form.vocabRows.length;
    vocabSection = `STRUCTURED VOCABULARY (${n} words — vocabulary array MUST have exactly ${n} items, numbered 1–${n}):
THE TEACHER OWNS THE VOCABULARY TABLE: copy each row's type, greek, emojis, collocation, derivatives, synonyms and antonyms into the vocabulary array EXACTLY as written.
A field that is empty in the row, or whose fieldToggles entry is false, was deliberately left blank or deleted by the teacher: keep it EMPTY ("" or []) — never invent, fill in or "improve" it. Do not add synonyms, antonyms, derivatives, emojis or Greek the row does not contain, and do not use such invented material in the exercises.
Parse teacher derivative strings into derivatives: [{ "text", "type", "greek" }]. Format "word (type) - Greek" in teacher input → split into fields. Every derivative in the Lingo table MUST have greek.
Parse teacher antonym strings into antonyms: [{ "text", "greek" }]. Format "word - Greek" in teacher input → split into fields. Every antonym in the Lingo table MUST have greek. Put synonyms in string arrays.
${VOCAB_SENSE_DISAMBIGUATION_RULES}
If a row already has type and/or greek filled in, treat that as the locked word sense — exercises and all other fields must match (e.g. seal + v. / σφραγίζω = verb to close, NOT animal φώκια).\n` + JSON.stringify(form.vocabRows, null, 2);
  } else if (form.freeform) {
    vocabSection = "FREEFORM BRIEF:\n" + form.freeform;
  }
  const lingoRelated = buildLingoRelatedExerciseBlock(form, plan);
  const dictationRelated = buildDictationRelatedExerciseBlock(form, plan);
  const distributionBlock = buildDictationDistributionBlock(form, plan, form.vocabRows);
  const uniquenessBlock = buildWorksheetUniquenessBlock();
  return `Create worksheets for:
Book: ${form.bookTitle}
Unit: ${form.unit}
Pages: ${form.pageRange}
Class: ${form.classProfile}
Target vocabulary: use ALL ${form.vocabRows?.length || "unit"} words from the teacher input — do not drop or add words unless freeform mode.

${vocabSection}

Teacher hints (derivatives / synonyms / antonyms per word — use in table and exercises):
${JSON.stringify(teacherHints || [])}
${dictationRelated}
${lingoRelated}
${distributionBlock}
${uniquenessBlock}

Use generationPlan exactly:
${JSON.stringify(plan, null, 2)}`;
}

/* ── AI provider (DeepSeek or Google Gemini) ─────────────────────────────── */
const AI_PROVIDERS = {
  deepseek: { id: "deepseek", name: "DeepSeek" },
  gemini: { id: "gemini", name: "Google Gemini" },
};
let activeProvider = "deepseek";

/** Choose which AI service every generation call uses. */
function configureAi({ provider } = {}) {
  if (AI_PROVIDERS[provider]) activeProvider = provider;
}
function aiProviderName() {
  return AI_PROVIDERS[activeProvider].name;
}

// Used only if the live model list can't be read. Google renames models often.
const GEMINI_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
const geminiModelCache = new Map();

/**
 * Ask Google which models this key can use (listing is free and uses no quota), then order
 * them: newest Flash first, newest Flash-Lite next (larger free daily quota), then fallbacks.
 */
async function geminiModelsFor(apiKey) {
  if (geminiModelCache.has(apiKey)) return geminiModelCache.get(apiKey);
  let live = [];
  try {
    const res = await fetch("/gemini/v1beta/models", { headers: { "x-goog-api-key": apiKey } });
    if (res.ok) {
      const json = await res.json();
      live = (json.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => String(m.name || "").replace(/^models\//, ""))
        .filter((id) => /^gemini-[\d.]+-flash(-lite)?$/.test(id));
    }
  } catch { /* offline or blocked — use the fallbacks */ }
  const version = (id) => parseFloat(id.match(/gemini-([\d.]+)/)?.[1] || "0");
  const byNewest = (a, b) => version(b) - version(a);
  const flash = live.filter((id) => !id.endsWith("-lite")).sort(byNewest);
  const lite = live.filter((id) => id.endsWith("-lite")).sort(byNewest);
  const ordered = [...new Set([...flash.slice(0, 2), ...lite.slice(0, 1), ...GEMINI_FALLBACK_MODELS])];
  if (live.length) geminiModelCache.set(apiKey, ordered);
  return ordered;
}

async function callGemini(apiKey, systemPrompt, userPrompt, retryHint) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt + (retryHint ? "\n\nFIX:\n" + retryHint : "") }] }],
    // maxOutputTokens covers the model's thinking as well as the answer.
    generationConfig: { responseMimeType: "application/json", temperature: 0.35, maxOutputTokens: 32768 },
  });
  let lastErr;
  for (const model of await geminiModelsFor(apiKey)) {
    try {
      const res = await fetch(`/gemini/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
      });
      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(friendlyGeminiError(res.status, errText));
        // Unknown model → next one. Free quotas are per model, so on 429 try the next model too.
        // A bad key fails the same way on every model.
        if (res.status !== 404 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }
      const json = await res.json();
      const cand = json.candidates?.[0];
      const content = (cand?.content?.parts || []).map((p) => p.text || "").join("").trim();
      if (!content) {
        const why = cand?.finishReason || json.promptFeedback?.blockReason;
        throw new Error(`Gemini returned an empty response${why ? ` (${why})` : ""} — please try again.`);
      }
      try {
        return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        throw new Error(cand?.finishReason === "MAX_TOKENS"
          ? "Gemini's reply was too long and got cut off — try fewer words or exercises."
          : "Gemini's reply was not valid JSON — please try again.");
      }
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
    }
  }
  throw lastErr || new Error("Could not reach Google Gemini — check your internet connection.");
}

function friendlyGeminiError(status, bodyText) {
  let detail = "";
  try {
    detail = JSON.parse(bodyText)?.error?.message || "";
  } catch {
    detail = String(bodyText || "").slice(0, 160);
  }
  if (/API key not valid|API_KEY_INVALID/i.test(detail) || status === 401) return "Google rejected the Gemini API key. Check it in Settings.";
  if (status === 403) return `Google refused the request (403)${detail ? `: ${detail}` : ""}. Check the key's permissions in Google AI Studio.`;
  if (status === 429) return "The free Gemini quota is used up for now (429). Wait a minute and try again — daily limits reset overnight.";
  if (status === 502 && detail) return `Could not reach Google Gemini — ${detail}. Check your internet connection.`;
  if (status >= 500) return `Google Gemini is having trouble right now (${status}). Please try again shortly.`;
  return `Gemini error ${status}${detail ? `: ${detail}` : ""}`;
}

/** Every AI call goes through here; routes to the provider chosen in Settings. */
async function callDeepSeek(apiKey, systemPrompt, userPrompt, retryHint) {
  if (activeProvider === "gemini") return callGemini(apiKey, systemPrompt, userPrompt, retryHint);
  const url = "http://localhost:8787/chat/completions";
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt + (retryHint ? "\n\nFIX:\n" + retryHint : "") },
  ];
  const models = ["deepseek-chat", "deepseek-v4-flash"];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.35,
          max_tokens: 8192,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(friendlyApiError(res.status, errText));
        // A bad key / empty balance fails the same way on every model — stop here.
        if ([401, 402, 403].includes(res.status)) throw Object.assign(err, { fatal: true });
        throw err;
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned an empty response — please try again.");
      try {
        return JSON.parse(content);
      } catch {
        throw new Error("DeepSeek's reply was cut off or not valid JSON — please try again.");
      }
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
    }
  }
  throw lastErr || new Error("Could not reach DeepSeek — check your internet connection.");
}

function friendlyApiError(status, bodyText) {
  let detail = "";
  try {
    const body = JSON.parse(bodyText);
    detail = body?.error?.message || (typeof body?.error === "string" ? body.error : "");
  } catch {
    detail = String(bodyText || "").slice(0, 160);
  }
  if (status === 401) return "DeepSeek rejected the API key (401). Check it in Settings.";
  if (status === 402) return "Your DeepSeek balance is empty (402). Top up at platform.deepseek.com.";
  if (status === 429) return "DeepSeek is rate-limiting requests (429). Wait a moment and try again.";
  if (status === 502 && detail) return `Could not reach DeepSeek — ${detail}. Check your internet connection.`;
  if (status >= 500) return `DeepSeek is having trouble right now (${status}). Please try again shortly.`;
  return `DeepSeek error ${status}${detail ? `: ${detail}` : ""}`;
}

function buildValidationRetryHint(lastValidation) {
  if (!lastValidation?.issues?.length) return "";
  const missing = lastValidation.coverage?.dictation?.missing || [];
  const gapLabels = missing.map((m) => m.label || m).join(", ") || "none";
  let hint = `Validation failed — fix ALL issues below:\n${lastValidation.issues.join("\n")}\nDictation coverage gaps: ${gapLabels}`;
  const l09Issues = lastValidation.issues.filter((i) => i.includes("(L09)"));
  if (l09Issues.length) {
    hint += `\n\nL09 ODD ONE OUT — rebuild each failed item:
- Pick 3 unit words with the SAME part of speech (usually nouns) + 1 unit VERB as the odd word
- answer = the verb (or the one different-type word)
- Never mix careful/careless, antonyms, or 4 nouns
- Example: "artifact, treasure, jewel, excavate" with answer "excavate"`;
  }
  return hint;
}

/** Fill in any sections the AI left out so renderers never hit undefined arrays. */
function ensureWorksheetShape(data) {
  if (!data || typeof data !== "object") data = {};
  data.lingoLauncher = data.lingoLauncher || {};
  if (!Array.isArray(data.lingoLauncher.vocabulary)) data.lingoLauncher.vocabulary = [];
  if (!Array.isArray(data.lingoLauncher.practice)) data.lingoLauncher.practice = [];
  data.dictation = data.dictation || {};
  if (!Array.isArray(data.dictation.exercises)) data.dictation.exercises = [];
  [...data.lingoLauncher.practice, ...data.dictation.exercises].forEach((ex) => {
    if (!Array.isArray(ex.items)) ex.items = [];
  });
  return data;
}

async function callDeepSeekWithValidation({ apiKey, systemPrompt, userPrompt, prepareData, maxAttempts = 3 }) {
  let data;
  let lastValidation;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const hint = attempt > 0 ? buildValidationRetryHint(lastValidation) : "";
    data = ensureWorksheetShape(await callDeepSeek(apiKey, systemPrompt, userPrompt, hint));
    const earlyValidation = prepareData(data);
    ensureWorksheetShape(data);
    if (earlyValidation) {
      lastValidation = earlyValidation;
      continue;
    }
    normalizeWorksheetExercises(data);
    lastValidation = validateWorksheet(data);
    data.coverageReport = lastValidation.coverage;
    if (lastValidation.valid) break;
  }
  return { data, validation: lastValidation };
}

async function generateWorksheets(form, apiKey, options = {}) {
  const profileId = form.classProfile;
  const plan = options.plan || pickGenerationPlan(profileId, {
    ...options.planOptions,
    vocabFeatures: options.vocabFeatures || analyzeVocabFeatures(form),
  });
  const systemPrompt = buildSystemPrompt(profileId, plan);
  const userPrompt = buildUserPrompt(form, plan, form.teacherHints);

  const { data, validation: lastValidation } = await callDeepSeekWithValidation({
    apiKey,
    systemPrompt,
    userPrompt,
    prepareData: (data) => {
      data.generationPlan = plan;
      data.meta = buildWorksheetMeta(form, profileId, data.meta);
      if (data.lingoLauncher?.vocabulary) {
        data.lingoLauncher.vocabulary = normalizeVocabulary(data.lingoLauncher.vocabulary);
      }
      if (form.inputMode === "structured" && form.vocabRows?.length) {
        const expected = form.vocabRows.length;
        const actual = data.lingoLauncher?.vocabulary?.length || 0;
        if (actual !== expected) {
          return {
            valid: false,
            issues: [`Lingo vocabulary has ${actual} items; teacher provided ${expected}`],
            coverage: computeDictationCoverage(data.lingoLauncher?.vocabulary || [], data.dictation || { exercises: [] }),
          };
        }
      }
      enforceTeacherVocabulary(data, form);
      return null;
    },
  });
  return { data, validation: lastValidation, plan };
}

/** options.plan: a plan whose dictation types to use (e.g. the teacher's custom selection). */
async function regenerateDictationOnly(form, apiKey, existingData, options = {}) {
  const profileId = form.classProfile || existingData.meta?.classProfile;
  const vocab = existingData.lingoLauncher.vocabulary;
  const features = analyzeVocabFeaturesFromData(vocab);
  const picked = options.plan?.dictationTypes?.length
    ? options.plan
    : pickGenerationPlan(profileId, { forceRandom: true, vocabFeatures: features });
  // Lingo practice is kept as-is, so the plan must describe it (validation compares counts).
  const keptPractice = existingData.lingoLauncher?.practice || [];
  const lingoTypes = keptPractice.map((ex) => ex.typeId);
  const plan = {
    ...picked,
    dictationExerciseCount: picked.dictationTypes.length,
    lingoTypes,
    lingoPracticeCount: keptPractice.length,
    signature: buildSignature(picked.dictationTypes, lingoTypes),
  };
  const systemPrompt = buildSystemPrompt(profileId, plan);
  const userPrompt = buildUserPrompt(form, plan, form.teacherHints) +
    `\n\nUSE THIS EXACT VOCABULARY TABLE (do not change):\n${JSON.stringify(vocab, null, 2)}`;

  const { data, validation } = await callDeepSeekWithValidation({
    apiKey,
    systemPrompt,
    userPrompt,
    prepareData: (data) => {
      data.generationPlan = plan;
      data.lingoLauncher = { ...existingData.lingoLauncher, vocabulary: vocab };
      data.meta = buildWorksheetMeta(form, profileId, { ...existingData.meta, ...data.meta });
      enforceTeacherVocabulary(data, form);
      return null;
    },
  });
  return { data, validation, plan };
}

/** options.plan: a plan whose Lingo types to use (e.g. the teacher's custom selection). */
async function regenerateLingoPracticeOnly(form, apiKey, existingData, options = {}) {
  const profileId = form.classProfile || existingData.meta?.classProfile;
  const keptExercises = existingData.dictation?.exercises || [];
  const dictTypes = keptExercises.map((ex) => ex.typeId);
  const features = analyzeVocabFeaturesFromData(existingData.lingoLauncher.vocabulary);
  const lingoPlan = options.plan?.lingoTypes?.length
    ? options.plan
    : pickGenerationPlan(profileId, { forceRandom: true, vocabFeatures: features });
  const plan = {
    ...(existingData.generationPlan || {}),
    exerciseMode: lingoPlan.exerciseMode || "random",
    dictationTypes: dictTypes,
    dictationExerciseCount: keptExercises.length,
    lingoTypes: lingoPlan.lingoTypes,
    lingoPracticeCount: lingoPlan.lingoTypes.length,
    signature: buildSignature(dictTypes, lingoPlan.lingoTypes),
  };
  const systemPrompt = buildSystemPrompt(profileId, plan);
  const userPrompt = buildUserPrompt(form, plan, form.teacherHints) +
    `\n\nONLY regenerate lingoLauncher.practice. Keep dictation exercises identical to:\n${JSON.stringify(existingData.dictation, null, 2)}`;

  const { data, validation } = await callDeepSeekWithValidation({
    apiKey,
    systemPrompt,
    userPrompt,
    prepareData: (data) => {
      data.generationPlan = plan;
      data.lingoLauncher = {
        practice: data.lingoLauncher?.practice || [],
        vocabulary: existingData.lingoLauncher.vocabulary,
      };
      data.dictation = existingData.dictation;
      data.meta = buildWorksheetMeta(form, profileId, { ...existingData.meta, ...data.meta });
      enforceTeacherVocabulary(data, form);
      return null;
    },
  });
  return { data, validation, plan };
}

function cloneWorksheetData(data) {
  return JSON.parse(JSON.stringify(data));
}

function getWorksheetExercise(data, sheet, exerciseNum) {
  if (sheet === "lingo") {
    return data.lingoLauncher?.practice?.find((ex) => ex.number === exerciseNum);
  }
  return data.dictation?.exercises?.find((ex) => ex.number === exerciseNum);
}

function getWorksheetItem(data, sheet, exerciseNum, itemNum) {
  return getWorksheetExercise(data, sheet, exerciseNum)?.items?.find((i) => i.number === itemNum) || null;
}

/** Parse item-level validation issues that can be fixed without regenerating the whole worksheet. */
function parseValidationFixTargets(issues, data) {
  const targets = [];
  const seen = new Set();
  for (const issue of issues || []) {
    let m = issue.match(/^(Lingo|Dictation) ex (\d+) \(([^)]+)\) item (\d+): (.+)$/i);
    if (m) {
      const sheet = m[1].toLowerCase() === "lingo" ? "lingo" : "dictation";
      const key = `${sheet}:${m[2]}:${m[4]}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({
          sheet,
          exercise: parseInt(m[2], 10),
          typeId: m[3],
          item: parseInt(m[4], 10),
          reason: m[5],
        });
      }
      continue;
    }
    m = issue.match(/^(Lingo|Dictation) ex (\d+) item (\d+): (.+)$/i);
    if (m) {
      const sheet = m[1].toLowerCase() === "lingo" ? "lingo" : "dictation";
      const exercise = parseInt(m[2], 10);
      const item = parseInt(m[3], 10);
      const key = `${sheet}:${exercise}:${item}`;
      if (!seen.has(key)) {
        seen.add(key);
        const ex = data ? getWorksheetExercise(data, sheet, exercise) : null;
        targets.push({
          sheet,
          exercise,
          typeId: ex?.typeId,
          item,
          reason: m[4],
        });
      }
    }
  }
  return targets;
}

function countFixableValidationIssues(issues, data) {
  return parseValidationFixTargets(issues, data).length;
}

function isQuickFixIssue(issue) {
  return /word (bank|list) is in (answer|category\/gap) order/i.test(issue)
    || /bracket choices always put the correct answer first/i.test(issue)
    || /remove word bank — bracket choices/i.test(issue)
    || /remove wordList/i.test(issue)
    || /word list is in answer order/i.test(issue);
}

function isCoverageIssue(issue) {
  return /^Dictation — not tested at least once:/i.test(issue);
}

function humanizeValidationIssue(issue) {
  if (/^Dictation — not tested at least once:/i.test(issue)) {
    const words = issue.replace(/^Dictation — not tested at least once:\s*/i, "");
    return `Still need to test in dictation: ${words}`;
  }
  if (/word bank is in answer order/i.test(issue)) {
    const m = issue.match(/exercise (\d+)/i);
    return `Dictation exercise ${m?.[1] || "?"} — word bank order is too predictable (we can shuffle it).`;
  }
  if (/word bank is in category\/gap order/i.test(issue)) {
    const m = issue.match(/exercise (\d+)/i);
    return `Dictation exercise ${m?.[1] || "?"} — category sort words match the gap order (we can shuffle the bank).`;
  }
  if (/bracket choices always put the correct answer first/i.test(issue)) {
    const m = issue.match(/exercise (\d+)/i);
    return `Exercise ${m?.[1] || "?"} — multiple-choice options always show the answer first (we can shuffle them).`;
  }
  if (/word list is in answer order/i.test(issue)) {
    const m = issue.match(/exercise (\d+)/i);
    return `Lingo exercise ${m?.[1] || "?"} — word list order matches the answers (we can shuffle it).`;
  }
  if (/remove word bank/i.test(issue)) return "A word bank isn't needed when each line already has bracket choices — we can remove it.";
  if (/remove wordList/i.test(issue)) return "This exercise type shouldn't show a separate word list — we can hide it.";
  if (/ambiguous group/i.test(issue) || /do not pair related forms/i.test(issue)) {
    const m = issue.match(/item (\d+)/i);
    return `Odd one out (line ${m?.[1] || "?"}): the four words don't have one clear odd word out.`;
  }
  const itemM = issue.match(/^(?:Lingo|Dictation) ex \d+(?: \([^)]+\))? item (\d+):\s*(.+)$/i);
  if (itemM) {
    const detail = itemM[2].charAt(0).toUpperCase() + itemM[2].slice(1);
    return `Line ${itemM[1]}: ${detail}`;
  }
  const exM = issue.match(/^(?:Lingo|Dictation) exercise (\d+)(?: \([^)]+\))?:\s*(.+)$/i);
  if (exM) return `Exercise ${exM[1]}: ${exM[2].charAt(0).toUpperCase() + exM[2].slice(1)}`;
  return issue;
}

function categorizeValidationIssues(issues, data) {
  const quick = [];
  const items = [];
  const coverage = [];
  const manual = [];
  const itemKeys = new Set();

  for (const issue of issues || []) {
    const friendly = humanizeValidationIssue(issue);
    if (isCoverageIssue(issue)) {
      coverage.push({ raw: issue, friendly });
      continue;
    }
    if (isQuickFixIssue(issue)) {
      quick.push({ raw: issue, friendly });
      continue;
    }
    const targets = parseValidationFixTargets([issue], data);
    if (targets.length) {
      const t = targets[0];
      const key = `${t.sheet}:${t.exercise}:${t.item}`;
      if (!itemKeys.has(key)) {
        itemKeys.add(key);
        items.push({ raw: issue, friendly, target: t });
      }
      continue;
    }
    manual.push({ raw: issue, friendly });
  }

  return { quick, items, coverage, manual };
}

function buildValidationReport(validation, data) {
  if (validation?.valid) {
    return { valid: true, intro: "Everything looks good — ready to print or export." };
  }
  const categories = categorizeValidationIssues(validation?.issues || [], data);
  const missing = validation?.coverage?.dictation?.missing || [];
  return {
    valid: false,
    intro: "A few small tweaks will make this worksheet-ready. You can fix most of these below without starting over.",
    categories,
    quickCount: categories.quick.length,
    itemCount: categories.items.length,
    coverageWords: missing.map((m) => (m.kind === "headword" ? m.label : `${m.label} (${m.kind})`)),
    coverageCount: missing.length,
    manualCount: categories.manual.length,
  };
}

function forceShuffleBracketChoices(data) {
  const reshuffle = (ex) => {
    ex.items?.forEach((item) => {
      if (item.prompt && /\([^)]*\/[^)]*\)/.test(item.prompt)) {
        item.prompt = shuffleBracketChoicesInPrompt(item.prompt, item.answer);
      }
    });
  };
  data.dictation?.exercises?.forEach(reshuffle);
  data.lingoLauncher?.practice?.forEach(reshuffle);
}

/** Instant layout fixes — shuffles, word-bank order, bracket order (no API). */
function applyQuickWorksheetFixes(data) {
  const fixed = cloneWorksheetData(data);
  normalizeWorksheetExercises(fixed);
  forceShuffleBracketChoices(fixed);
  fixed.dictation?.exercises?.forEach((ex) => {
    if (ex.wordBank?.length >= 2 && (ex.typeId === "D01" || ex.typeId === "D16")) {
      const orderItems = ex.typeId === "D16" ? itemsForAnswerOrderCheck(ex) : ex.items;
      ex.wordBank = shuffleListAwayFromAnswers(ex.wordBank, orderItems);
    }
  });
  fixed.lingoLauncher?.practice?.forEach((ex) => {
    if (LINGO_WORDLIST_TYPES.has(ex.typeId) && ex.wordList?.length >= 2) {
      ex.wordList = shuffleListAwayFromAnswers(ex.wordList, ex.items);
    }
  });
  return fixed;
}

function countQuickFixIssues(issues) {
  return (issues || []).filter(isQuickFixIssue).length;
}

function targetKeysFromFixTargets(targets) {
  return new Set(targets.map((t) => `${t.sheet}:${t.exercise}:${t.item}`));
}

function issuesStillForTargets(issues, targetKeys, data) {
  return parseValidationFixTargets(issues, data).filter((p) =>
    targetKeys.has(`${p.sheet}:${p.exercise}:${p.item}`)
  );
}

function buildFixItemsSystemPrompt(profileId, targets) {
  let extra = "";
  if (targets.some((t) => t.sheet === "lingo" && ["L01", "L05"].includes(t.typeId))) {
    extra += `
L01/L05 — gap where the answer word belongs (not always at end); NEW sentences — never copy vocab collocation or dictation lines`;
  }
  if (targets.some((t) => t.typeId === "L09")) {
    extra += `
L09 ODD ONE OUT — mandatory for each L09 fix:
- prompt = exactly 4 comma-separated words; answer = the single odd word
- 3 words share the SAME part of speech (use vocabulary table types — usually 3 nouns)
- 1 word is DIFFERENT (usually a verb from the unit) — that word is the answer
- FORBIDDEN: careful/careless pairs, antonyms together, 4 nouns with no verb odd word
- GOOD: "artifact, treasure, jewel, excavate" → answer "excavate"`;
  }
  if (targets.some((t) => t.typeId === "D08")) {
    extra += `
D08 SENTENCE FIXER — mandatory for each D08 fix:
- prompt = sentence with exactly one [wrongWord] in square brackets
- answer = single correct vocabulary word; testsWords = [answer]`;
  }
  if (targets.some((t) => t.typeId === "D02")) {
    extra += `
D02 — stem = uppercase clue (any form from same word family as answer: headword, derivative, or root — vary across items); answer = different form in gap`;
  }
  return `You are an ESL worksheet editor for Greek learners (${CLASS_PROFILES[profileId]?.label || profileId}).
Return ONLY valid JSON — no markdown.

Schema: { "fixes": [ { "sheet": "lingo"|"dictation", "exercise": number, "item": number, "prompt": string, "answer": string, optional "stem", "testsWords" } ] }

Rules:
- Fix ONLY the items listed in the user message — same exercise and item numbers
- Do not change vocabulary, other exercises, or other items
- Return one fix object per listed item
${extra}`;
}

function buildFixItemsUserPrompt(data, targets, vocab) {
  const payload = targets.map((t) => {
    const current = getWorksheetItem(data, t.sheet, t.exercise, t.item);
    return {
      sheet: t.sheet,
      exercise: t.exercise,
      typeId: t.typeId || current?.typeId,
      item: t.item,
      problem: t.reason,
      current: {
        prompt: current?.prompt ?? "",
        answer: current?.answer ?? "",
        stem: current?.stem,
        testsWords: current?.testsWords,
      },
    };
  });
  return `Fix exactly these ${payload.length} item(s). Replace only prompt/answer (and stem or testsWords if needed for the exercise type).

Unit vocabulary with part-of-speech types:
${JSON.stringify(getVocabWordsWithTypesFromVocabulary(vocab), null, 2)}

Full vocabulary table (do not edit):
${JSON.stringify(vocab, null, 2)}

Items to fix:
${JSON.stringify(payload, null, 2)}`;
}

function mergeItemFixes(data, aiResult, targets) {
  const merged = cloneWorksheetData(data);
  const fixes = aiResult?.fixes || [];
  const byKey = new Map();
  fixes.forEach((fix) => {
    if (fix?.sheet && fix.exercise != null && fix.item != null) {
      byKey.set(`${fix.sheet}:${fix.exercise}:${fix.item}`, fix);
    }
  });
  for (const t of targets) {
    const fix = byKey.get(`${t.sheet}:${t.exercise}:${t.item}`);
    if (!fix) continue;
    const item = getWorksheetItem(merged, t.sheet, t.exercise, t.item);
    if (!item) continue;
    if (fix.prompt !== undefined) item.prompt = fix.prompt;
    if (fix.answer !== undefined) item.answer = fix.answer;
    if (fix.stem !== undefined) item.stem = fix.stem;
    if (fix.testsWords !== undefined) item.testsWords = fix.testsWords;
  }
  return merged;
}

/**
 * Re-generate only validation-failed exercise items (not the whole worksheet).
 */
async function fixWorksheetValidationIssues(form, apiKey, existingData, validation, options = {}) {
  const issues = validation?.issues || validateWorksheet(existingData).issues;
  const targets = parseValidationFixTargets(issues, existingData);
  if (!targets.length) {
    return {
      data: existingData,
      validation: validation || validateWorksheet(existingData),
      targetsAttempted: 0,
      fixedCount: 0,
      message: "No individual items to fix automatically — try full regenerate or edit manually.",
    };
  }

  const profileId = form.classProfile || existingData.meta?.classProfile;
  const vocab = existingData.lingoLauncher?.vocabulary || [];
  const targetKeys = targetKeysFromFixTargets(targets);
  const systemPrompt = buildFixItemsSystemPrompt(profileId, targets);
  const userPrompt = buildFixItemsUserPrompt(existingData, targets, vocab);
  const maxAttempts = options.maxAttempts ?? 3;

  let data = cloneWorksheetData(existingData);
  let lastValidation = validation || validateWorksheet(data);
  let remaining = issuesStillForTargets(lastValidation.issues, targetKeys, data);

  for (let attempt = 0; attempt < maxAttempts && remaining.length > 0; attempt++) {
    const hint = attempt > 0
      ? `These items still fail validation:\n${remaining.map((r) => `${r.sheet} ex ${r.exercise} item ${r.item} (${r.typeId}): ${r.reason}`).join("\n")}`
      : "";
    const aiResult = await callDeepSeek(apiKey, systemPrompt, userPrompt, hint);
    data = mergeItemFixes(existingData, aiResult, targets);
    normalizeWorksheetExercises(data);
    lastValidation = validateWorksheet(data);
    data.coverageReport = lastValidation.coverage;
    remaining = issuesStillForTargets(lastValidation.issues, targetKeys, data);
  }

  const fixedCount = targets.length - remaining.length;
  let message;
  if (remaining.length === 0) {
    message = `Fixed all ${targets.length} problem item${targets.length === 1 ? "" : "s"}.`;
  } else if (fixedCount > 0) {
    message = `Fixed ${fixedCount} of ${targets.length} item(s). ${remaining.length} still need review.`;
  } else {
    message = `Could not auto-fix the ${targets.length} item(s) — try Regenerate Lingo practice or generate again.`;
  }

  return {
    data,
    validation: lastValidation,
    targetsAttempted: targets.length,
    fixedCount,
    remainingTargets: remaining,
    message,
  };
}

function mergeDictationItemUpdates(data, updates) {
  const merged = cloneWorksheetData(data);
  for (const u of updates || []) {
    const ex = getWorksheetExercise(merged, "dictation", u.exercise);
    if (!ex) continue;
    if (u.replaceExercise) {
      Object.assign(ex, u.replaceExercise);
      continue;
    }
    let item = ex.items?.find((i) => i.number === u.item);
    if (!item && u.item != null) {
      item = { number: u.item, prompt: "", answer: "" };
      ex.items = ex.items || [];
      ex.items.push(item);
      ex.items.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    }
    if (!item) continue;
    if (u.prompt !== undefined) item.prompt = u.prompt;
    if (u.answer !== undefined) item.answer = u.answer;
    if (u.stem !== undefined) item.stem = u.stem;
    if (u.testsWords !== undefined) item.testsWords = u.testsWords;
    if (u.wordBank !== undefined) ex.wordBank = u.wordBank;
  }
  return merged;
}

/**
 * Adjust dictation only so every vocabulary target is tested at least once.
 */
async function fixDictationCoverageGaps(form, apiKey, existingData, validation, options = {}) {
  const missing = validation?.coverage?.dictation?.missing
    || computeDictationCoverage(existingData.lingoLauncher?.vocabulary || [], existingData.dictation).missing;
  if (!missing.length) {
    return {
      data: existingData,
      validation: validation || validateWorksheet(existingData),
      message: "Dictation coverage is already complete.",
      fixedCount: 0,
    };
  }

  const profileId = form.classProfile || existingData.meta?.classProfile;
  const profile = CLASS_PROFILES[profileId];
  const labels = missing.map((m) => (m.kind === "headword" ? m.label : `${m.label} (${m.kind})`));
  const vocab = existingData.lingoLauncher?.vocabulary || [];
  const maxAttempts = options.maxAttempts ?? 3;

  const systemPrompt = `You are an ESL dictation worksheet editor for Greek learners (${profile?.label || profileId}).
Return ONLY valid JSON — no markdown.

Schema: {
  "itemUpdates": [
    { "exercise": number, "item": number, "prompt": string, "answer": string, optional "stem", "testsWords": [] }
  ],
  optional "exerciseUpdates": [
    { "exercise": number, optional "wordBank": [], optional "items": [ full items array if replacing one exercise only ] }
  ]
}

Rules:
- Edit dictation ONLY — keep the same number of exercises and the same typeId per exercise
- Every missing target below must be tested at least once (use testsWords and/or answer)
- Prefer editing existing items over adding new ones; ~${profile?.itemsPerExercise || 5} items per exercise max
- Do not change lingoLauncher vocabulary or practice
- Do not reuse sentences from lingoLauncher practice`;

  const userPrompt = `Missing dictation coverage — each word MUST be tested at least once:
${labels.join(", ")}

Current dictation (keep structure; update content only as needed):
${JSON.stringify(existingData.dictation, null, 2)}

Vocabulary table:
${JSON.stringify(vocab, null, 2)}`;

  let data = cloneWorksheetData(existingData);
  let lastValidation = validation || validateWorksheet(data);
  let stillMissing = lastValidation.coverage?.dictation?.missing?.length ?? missing.length;

  for (let attempt = 0; attempt < maxAttempts && stillMissing > 0; attempt++) {
    const hint = attempt > 0
      ? `Still not covered: ${(lastValidation.coverage?.dictation?.missing || []).map((m) => m.label).join(", ")}`
      : "";
    const aiResult = await callDeepSeek(apiKey, systemPrompt, userPrompt, hint);
    data = mergeDictationItemUpdates(data, aiResult.itemUpdates);
    if (aiResult.exerciseUpdates?.length) {
      aiResult.exerciseUpdates.forEach((eu) => {
        const ex = getWorksheetExercise(data, "dictation", eu.exercise);
        if (!ex) return;
        if (eu.wordBank) ex.wordBank = eu.wordBank;
        if (eu.items) ex.items = eu.items;
      });
    }
    normalizeWorksheetExercises(data);
    lastValidation = validateWorksheet(data);
    data.coverageReport = lastValidation.coverage;
    stillMissing = lastValidation.coverage?.dictation?.missing?.length || 0;
  }

  const fixed = stillMissing === 0;
  return {
    data,
    validation: lastValidation,
    fixedCount: fixed ? missing.length : Math.max(0, missing.length - stillMissing),
    message: fixed
      ? `Dictation now covers all ${missing.length} missing word${missing.length === 1 ? "" : "s"}.`
      : stillMissing < missing.length
        ? `Improved coverage — ${stillMissing} word${stillMissing === 1 ? "" : "s"} still missing. Try again or regenerate dictation.`
        : `Could not fill dictation gaps automatically — try Regenerate Dictation.`,
  };
}

/**
 * Run quick fixes, then item AI fixes, then coverage AI fixes (in order).
 */
async function fixAllWorksheetIssues(form, apiKey, existingData, validation) {
  let data = cloneWorksheetData(existingData);
  let val = validation || validateWorksheet(data);
  const parts = [];

  if (countQuickFixIssues(val.issues) > 0) {
    data = applyQuickWorksheetFixes(data);
    val = validateWorksheet(data);
    parts.push("layout");
  }

  const itemTargets = countFixableValidationIssues(val.issues, data);
  if (itemTargets > 0) {
    const itemResult = await fixWorksheetValidationIssues(form, apiKey, data, val);
    data = itemResult.data;
    val = itemResult.validation;
    parts.push("items");
  }

  const missing = val.coverage?.dictation?.missing?.length || 0;
  if (missing > 0) {
    const covResult = await fixDictationCoverageGaps(form, apiKey, data, val);
    data = covResult.data;
    val = covResult.validation;
    parts.push("coverage");
  }

  const message = val.valid
    ? "All issues addressed — worksheet is ready."
    : parts.length
      ? `Applied ${parts.join(" → ")} fixes. Some notes may remain — see below.`
      : "Nothing could be auto-fixed — try regenerate.";

  return { data, validation: val, steps: parts, message };
}

/* ─── Print export ─── */
const WORKSHEET_PRINT_CSS = `
@page { size: A4; margin: 13mm 14mm 15mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; }
.worksheet {
  --ink: #111;
  --ink-2: #444;
  --ink-3: #777;
  --rule: #c9c9c9;
  --tint: #f1f1f1;
  --tint-2: #e6e6e6;
  background: #fff;
  max-width: 210mm;
  margin: 0 auto;
  font-family: ${WORKSHEET_FONTS.css};
  font-size: 11pt;
  line-height: 1.45;
  color: var(--ink);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.worksheet * { box-sizing: border-box; }
.ws-heading { font-family: ${WORKSHEET_FONTS.display}; }

/* Title band */
.ws-head { margin: 0 0 5mm; }
.ws-band {
  display: flex; align-items: stretch; justify-content: space-between; gap: 0;
  border: 1pt solid var(--ink); border-radius: 3mm; overflow: hidden;
}
.ws-band-title { padding: 3mm 5mm 3.2mm 5.4mm; display: flex; flex-direction: column; justify-content: center; min-width: 56%; border-left: 2.2mm solid var(--ink); }
.ws-school { font: 700 7.4pt/1.2 ${WORKSHEET_FONTS.display}; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-2); margin-bottom: 1mm; }
.ws-title { font-size: 22pt; font-weight: 800; letter-spacing: -0.015em; line-height: 1.05; margin: 0; color: var(--ink); }
.ws-kind { font: 700 8.4pt/1.3 ${WORKSHEET_FONTS.display}; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); margin-top: 1.2mm; }
.ws-band-meta { padding: 2.6mm 5mm 2.6mm 6mm; border-left: 0.6pt solid var(--rule); display: flex; flex-direction: column; justify-content: center; align-items: flex-end; text-align: right; position: relative; z-index: 1; }
.ws-book { font: 700 9.6pt/1.25 ${WORKSHEET_FONTS.display}; }
.ws-unit { font-size: 9pt; line-height: 1.3; color: var(--ink-2); margin-top: 0.6mm; }
.ws-detail { font-size: 8pt; color: var(--ink-3); margin-top: 0.6mm; letter-spacing: 0.02em; }

/* Student box */
.ws-student { display: flex; gap: 5mm; align-items: flex-end; margin-top: 3mm; padding: 2.6mm 4mm 2.4mm; border: 0.8pt solid var(--ink); border-radius: 2.4mm; }
.ws-field { display: flex; align-items: flex-end; gap: 2mm; font-size: 8.4pt; flex: 0 0 auto; }
.ws-field.grow { flex: 1; }
.ws-field b { font: 700 7.6pt ${WORKSHEET_FONTS.display}; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-2); }
.ws-field i { display: inline-block; height: 4.6mm; border-bottom: 0.8pt solid var(--ink-3); width: 20mm; }
.ws-field.grow i { flex: 1; width: auto; }
.ws-field.score i { width: 8mm; }
.ws-field em { font-style: normal; color: var(--ink-3); }
.ws-reuse { margin-top: 2.6mm; padding: 1.8mm 3.4mm; border: 0.8pt dashed var(--ink-3); border-radius: 2mm; font-size: 8.6pt; color: var(--ink-2); text-align: center; }

/* Section labels */
.ws-section { break-after: avoid; page-break-after: avoid; display: flex; align-items: center; gap: 3mm; margin: 5mm 0 2.6mm; font: 800 8.4pt/1 ${WORKSHEET_FONTS.display}; letter-spacing: 0.16em; text-transform: uppercase; }
.ws-section::after { content: ""; flex: 1; border-top: 0.8pt solid var(--ink); }
.ws-head + .ws-section { margin-top: 0; }
.ex-block > .ws-section { margin-top: 0; }
.ws-head + .key-section > .ws-section { margin-top: 0; }

/* Vocabulary table */
.vocab-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0 0 2mm; border: 1pt solid var(--ink); border-radius: 2.6mm; overflow: hidden; table-layout: fixed; }
.vocab-table td { vertical-align: top; width: 50%; padding: 2.2mm 3.2mm 2.4mm; border-bottom: 0.6pt solid var(--rule); }
.vocab-table td + td { border-left: 0.6pt solid var(--rule); }
.vocab-table tr:last-child td { border-bottom: 0; }
.vocab-table tr { break-inside: avoid; page-break-inside: avoid; }
.v-top { display: flex; align-items: baseline; gap: 1.6mm; flex-wrap: wrap; }
.v-num { flex: none; align-self: center; display: inline-flex; align-items: center; justify-content: center; min-width: 4.6mm; height: 4.6mm; padding: 0 1mm; border-radius: 2.3mm; border: 0.8pt solid var(--ink); color: var(--ink); font: 800 7.4pt/1 ${WORKSHEET_FONTS.display}; }
.v-word { font: 800 11.6pt/1.2 ${WORKSHEET_FONTS.display}; letter-spacing: -0.005em; }
.v-pos { font-size: 8.6pt; font-style: italic; color: var(--ink-3); }
.v-emoji { font-size: 10pt; margin-left: auto; display: inline-flex; gap: 1mm; align-items: center; }
.pic { display: inline-block; width: 1.25em; height: 1.25em; vertical-align: -0.28em; color: var(--ink); }
.v-emoji .pic { width: 7.5mm; height: 7.5mm; }
.item-text .pic { width: 1.6em; height: 1.6em; vertical-align: -0.45em; margin: 0 0.1em; }
.v-tr { display: inline-flex; gap: 1.2mm; align-items: baseline; min-width: 0; }
.v-eq { flex: none; font-size: 10pt; font-weight: 700; color: var(--ink-3); }
.v-greek { font-size: 10.4pt; font-weight: 600; }
.v-coll { font-size: 9.4pt; font-style: italic; color: var(--ink-2); margin: 0.6mm 0 0 6.2mm; }
.v-coll::before { content: "“"; }
.v-coll::after { content: "”"; }
.v-coll .v-target { font-weight: 800; color: var(--ink); }
.v-rel { font-size: 9pt; color: var(--ink-2); margin: 0.4mm 0 0 6.2mm; }
.v-rel .vocab-related { display: inline-block; margin-right: 5mm; }
.v-rel .vocab-related:last-child { margin-right: 0; }
.v-rel b { display: inline-block; width: 4mm; font-weight: 800; color: var(--ink); }
.vocab-empty { background: transparent !important; }

/* Exercises */
.ex-block { margin: 0 0 4.6mm; break-inside: avoid-page; }
.ex-block:last-child { margin-bottom: 0; }
.ex-head { display: flex; align-items: center; gap: 3.2mm; margin-bottom: 2mm; break-after: avoid; page-break-after: avoid; }
.ex-num { flex: none; display: inline-flex; align-items: center; justify-content: center; height: 7mm; min-width: 25mm; padding: 0 2.8mm; border-radius: 2.6mm; border: 1.2pt solid var(--ink); color: var(--ink); font: 800 9.6pt/1 ${WORKSHEET_FONTS.display}; letter-spacing: 0.01em; white-space: nowrap; }
.ex-title { flex: 1; min-width: 0; }
.ex-instruction { font: 700 11pt/1.35 ${WORKSHEET_FONTS.display}; margin: 0; color: var(--ink); }
.key-head .ex-heading { font-size: 8pt; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; margin: 0; line-height: 1.2; }
.ex-score { flex: none; display: inline-flex; align-items: flex-end; gap: 1.2mm; margin-top: 0.8mm; padding: 1.2mm 2.4mm; border: 0.8pt solid var(--ink); border-radius: 2mm; font: 700 9pt/1 ${WORKSHEET_FONTS.display}; }
.ex-score i { display: inline-block; width: 6mm; border-bottom: 0.8pt solid var(--ink-3); height: 3.6mm; }
.ex-item { display: flex; gap: 2.6mm; margin: 0 0 1.5mm; padding-left: 0.6mm; font-size: 11pt; line-height: 1.7; break-inside: avoid; page-break-inside: avoid; }
.item-num { flex: none; width: 5.4mm; height: 5.4mm; margin-top: 0.7mm; display: inline-flex; align-items: center; justify-content: center; border: 0.8pt solid var(--ink); border-radius: 50%; font: 700 8pt/1 ${WORKSHEET_FONTS.display}; }
.item-text { flex: 1; min-width: 0; }
.stem-word { font-weight: 800; letter-spacing: 0.04em; }
.d08-wrong { font-weight: 800; }
.stem-header { font-size: 9.4pt; color: var(--ink-2); margin: 0 0 2mm 9.8mm; }

/* Word bank / word list */
.word-bank, .word-list { display: flex; flex-wrap: wrap; gap: 1.6mm 2mm; margin: 0 0 2.6mm 9.8mm; padding: 2mm 2.6mm; border: 0.8pt solid var(--ink); border-radius: 2.4mm; }
.word-bank span, .word-list span { display: inline-block; padding: 0.5mm 2.4mm; border-radius: 1.6mm; border: 0.6pt solid var(--rule); font: 700 9.6pt/1.3 ${WORKSHEET_FONTS.display}; }
.match-defs { margin: 0 0 2.6mm 9.8mm; padding: 2mm 3mm; border: 0.8pt solid var(--ink); border-radius: 2.4mm; }
.match-def-line { display: flex; gap: 2.4mm; margin: 0.8mm 0; font-size: 10pt; line-height: 1.4; }
.match-def-line b { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 5mm; height: 5mm; border-radius: 1.4mm; border: 0.8pt solid var(--ink); color: var(--ink); font: 800 8pt/1 ${WORKSHEET_FONTS.display}; margin-top: 0.2mm; }

/* Answer key */
.key-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 7mm; align-items: start; }
.key-block { break-inside: avoid; margin-bottom: 4mm; padding: 2.6mm 3.2mm; border: 0.8pt solid var(--rule); border-radius: 2.4mm; }
.key-head { display: flex; align-items: center; gap: 2.2mm; margin-bottom: 1.6mm; flex-wrap: wrap; }
.key-head .ex-num { width: 5.6mm; height: 5.6mm; font-size: 8pt; }
.key-head .ex-heading { color: var(--ink); }
.key-type { font-size: 8pt; color: var(--ink-3); width: 100%; margin-top: -1mm; }
.key-block .ex-item { font-size: 10pt; line-height: 1.45; margin-bottom: 0.8mm; }
.key-block .item-num { width: 4.6mm; height: 4.6mm; margin-top: 0.4mm; font-size: 7pt; }
.ans-tests-tag { color: var(--ink-3); font-size: 8.4pt; margin-left: 1.6mm; }

/* Density */
.worksheet.density-compact { font-size: 10pt; }
.worksheet.density-compact .ex-item { font-size: 10pt; line-height: 1.45; margin-bottom: 0.6mm; }
.worksheet.density-compact .ex-block { margin-bottom: 3.4mm; }
.worksheet.density-compact .vocab-table td { padding: 1.4mm 2.6mm 1.6mm; }
.worksheet.density-comfortable .ex-item { font-size: 12pt; line-height: 2; margin-bottom: 2.4mm; }
.worksheet.density-comfortable .ex-block { margin-bottom: 6mm; }
.worksheet.density-comfortable .vocab-table td { padding: 3mm 3.6mm; }

.teacher-ans-pill { display: none; }
`;

/** Standalone print/PDF document. `fontCss` inlines the worksheet fonts (see js/fonts.js). */
function buildWorksheetPrintDocument(html, title, fontCss = "") {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${fontCss}
${WORKSHEET_PRINT_CSS}</style>
</head><body>${html}</body></html>`;
}

function openWorksheetPrint(data, sheet, options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const title = sheet === "lingo" ? "Lingo Launcher" : sheet === "answer" ? "Answer Key" : "Dictation";
  const renderOpts = { ...options, showAnswers: false };
  const html = sheet === "lingo"
    ? renderLingoLauncher(data, renderOpts)
    : sheet === "answer"
      ? renderAnswerKey(data, renderOpts)
      : renderDictation(data, renderOpts);
  const printDoc = buildWorksheetPrintDocument(html, title, options.fontCss || "");

  let iframe = document.getElementById("worksheet-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "worksheet-print-frame";
    iframe.setAttribute("title", "Worksheet print");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:0";
    document.body.appendChild(iframe);
  }

  const win = iframe.contentWindow;
  if (!win) throw new Error("Could not open print view — try refreshing the page.");

  const doc = win.document;
  doc.open();
  doc.write(printDoc);
  doc.close();

  const runPrint = () => {
    // Wait for the embedded fonts so the first print never falls back to system fonts.
    Promise.resolve(doc.fonts?.ready).catch(() => {}).then(() => {
      win.focus();
      win.print();
    });
  };
  if (doc.readyState === "complete") {
    setTimeout(runPrint, 150);
  } else {
    win.addEventListener("load", () => setTimeout(runPrint, 150), { once: true });
  }
}

/* ─── DOCX export ─── */
async function loadDocxLibs() {
  if (typeof process !== "undefined" && process.versions?.node) {
    return import("docx");
  }
  return import("https://esm.sh/docx@8.5.0?bundle");
}





/* ── Word (.docx) worksheets — same design as the PDF, built from Word-native parts ── */
const MM = 56.7; // twips per millimetre

async function docxKit(meta, sheet) {
  const d = await loadDocxLibs();
  const F = WORKSHEET_FONTS;
  const layout = resolveWorksheetLayout(sheet, meta);
  const INK = "111111";
  const GREY = "6F6F6F";
  const RULE = "C9C9C9";
  const TINT = "F1F1F1";
  const none = { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const line = (size, color = INK, style = d.BorderStyle.SINGLE) => ({ style, size, color });

  const run = (text, o = {}) => new d.TextRun({
    text: String(text ?? ""),
    font: o.display ? F.docxDisplay : F.docx,
    size: o.size || 22,
    bold: o.bold,
    italics: o.italics,
    color: o.color,
    allCaps: o.caps,
    characterSpacing: o.spacing,
    border: o.boxed ? { style: d.BorderStyle.SINGLE, size: 6, color: INK, space: 1 } : undefined,
  });
  // A number in an outlined box — no filled areas anywhere, to save toner.
  const badge = (n, size = 18) => run(` ${n} `, { display: true, bold: true, size, color: INK, boxed: true });
  const para = (children, o = {}) => new d.Paragraph({ children, ...o });

  // Text with its emojis drawn in the chosen picture style (PNG copies prepared by the app in meta.pictures).
  const pics = meta.pictures || {};
  const toBytes = (b64) => (typeof Buffer !== "undefined" ? Buffer.from(b64, "base64") : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const textRuns = (text, o = {}) => {
    const style = layout.pictureStyle || "emoji";
    if (style === "emoji") return [run(text, o)];
    const out = [];
    let buf = "";
    for (const p of splitEmojiText(text)) {
      if (!p.emoji) { buf += p.text; continue; }
      if (buf) { out.push(run(buf, o)); buf = ""; }
      if (style === "none") continue;
      const key = pictureKey(p.text);
      const b64 = pics[key] || pics[key.split("-")[0]];
      if (b64) out.push(new d.ImageRun({ data: toBytes(b64), transformation: { width: o.pic || 18, height: o.pic || 18 } }));
    }
    if (buf.trim()) out.push(run(buf, o));
    return out;
  };

  function header(title, kind) {
    const m = worksheetMetaParts(meta);
    const band = new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      borders: { top: line(8), bottom: line(8), left: line(8), right: line(8), insideHorizontal: none, insideVertical: line(4, RULE) },
      rows: [new d.TableRow({
        children: [
          new d.TableCell({
            width: { size: 60, type: d.WidthType.PERCENTAGE },
            borders: { left: line(48) },
            margins: { top: 3 * MM, bottom: 3 * MM, left: 5 * MM, right: 4 * MM },
            verticalAlign: d.VerticalAlign.CENTER,
            children: [
              ...(layout.schoolName ? [para([run(layout.schoolName, { display: true, bold: true, size: 15, color: "444444", caps: true, spacing: 20 })])] : []),
              para([run(title, { display: true, bold: true, size: 44, color: INK })]),
              para([run(kind, { display: true, bold: true, size: 16, color: GREY, caps: true, spacing: 24 })]),
            ],
          }),
          new d.TableCell({
            width: { size: 40, type: d.WidthType.PERCENTAGE },
            margins: { top: 2.4 * MM, bottom: 2.4 * MM, left: 4 * MM, right: 5 * MM },
            verticalAlign: d.VerticalAlign.CENTER,
            children: [
              para([run(m.book, { display: true, bold: true, size: 19 })], { alignment: d.AlignmentType.RIGHT }),
              ...(m.unitLine ? [para([run(m.unitLine, { size: 18, color: "444444" })], { alignment: d.AlignmentType.RIGHT })] : []),
              ...(m.detail ? [para([run(m.detail, { size: 16, color: GREY })], { alignment: d.AlignmentType.RIGHT })] : []),
            ],
          }),
        ],
      })],
    });
    const out = [band];
    if (layout.studentHeader) {
      const field = (label, blank) => [run(`${label} `, { display: true, bold: true, size: 15, color: "444444", caps: true, spacing: 16 }), run(blank, { size: 18, color: "8A8A8A" })];
      out.push(para([
        ...field("Name", "_______________________________"), run("    "),
        ...field("Class", "__________"), run("    "),
        ...field("Date", "__________"), run("    "),
        ...field("Score", "____ / ____"),
      ], {
        spacing: { before: 3 * MM },
        border: { top: line(6), bottom: line(6), left: line(6), right: line(6) },
        indent: { left: 2 * MM, right: 2 * MM },
      }));
    }
    if (layout.reuseNote) {
      out.push(para([run("✎ This sheet is shared — please don’t write on it. Write your answers in your notebook.", { size: 17, color: "444444" })], {
        alignment: d.AlignmentType.CENTER,
        spacing: { before: 2.4 * MM },
        border: { top: line(4, "8A8A8A", d.BorderStyle.DASHED), bottom: line(4, "8A8A8A", d.BorderStyle.DASHED), left: line(4, "8A8A8A", d.BorderStyle.DASHED), right: line(4, "8A8A8A", d.BorderStyle.DASHED) },
      }));
    }
    return out;
  }

  const section = (label) => para([run(label, { display: true, bold: true, size: 17, caps: true, spacing: 30 })], {
    spacing: { before: 5 * MM, after: 2.4 * MM },
    border: { bottom: line(10) },
    keepNext: true,
  });

  function exerciseHead(ex, label = "Exercise") {
    const n = (ex.items || []).length;
    const instr = getStudentExerciseInstruction(ex);
    // "Exercise N" in an outlined box, then its instruction as the heading.
    const head = [badge(`${label} ${ex.number}`, 19), ...(instr ? [new d.TextRun({ text: "\t" }), run(instr, { display: true, bold: true, size: 22 })] : [])];
    if (layout.scoreBoxes && n) head.push(new d.TextRun({ text: "\t" }), run(`____ / ${n}`, { display: true, bold: true, size: 18 }));
    return [para(head, {
      keepNext: true,
      spacing: { before: 3 * MM, after: 1.6 * MM },
      indent: { left: 27 * MM, hanging: 27 * MM },
      tabStops: [{ type: d.TabStopType.LEFT, position: 27 * MM }, { type: d.TabStopType.RIGHT, position: 180 * MM }],
    })];
  }

  const chipsBox = (words) => new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: { top: line(6), bottom: line(6), left: line(6), right: line(6), insideHorizontal: none, insideVertical: none },
    rows: [new d.TableRow({
      children: [new d.TableCell({
        margins: { top: 1.6 * MM, bottom: 1.6 * MM, left: 3 * MM, right: 3 * MM },
        children: [para(words.flatMap((w, i) => [...(i ? [run("   •   ", { size: 18, color: GREY })] : []), run(w, { display: true, bold: true, size: 20 })]), { keepNext: true })],
      })],
    })],
  });

  const item = (n, runs) => para([run(`${n}.`, { display: true, bold: true, size: 19 }), new d.TextRun({ text: "\t" }), ...runs], {
    tabStops: [{ type: d.TabStopType.LEFT, position: 8 * MM }],
    indent: { left: 8 * MM, hanging: 8 * MM },
    spacing: { after: 1.4 * MM, line: meta.density === "compact" ? 276 : meta.density === "comfortable" ? 420 : 360 },
    keepLines: true,
  });

  function footer() {
    if (!layout.footer) return undefined;
    const m = worksheetMetaParts(meta);
    const left = [m.book, m.unitLine].filter(Boolean).join(" · ");
    return new d.Footer({
      children: [para([
        run(left, { size: 15, color: GREY }),
        new d.TextRun({ text: "\t" }),
        new d.TextRun({ children: ["Page ", d.PageNumber.CURRENT, " of ", d.PageNumber.TOTAL_PAGES], font: F.docx, size: 15, color: GREY }),
      ], { tabStops: [{ type: d.TabStopType.RIGHT, position: 182 * MM }], border: { top: line(4, RULE) } })],
    });
  }

  function document(children) {
    const ft = footer();
    return new d.Document({
      styles: worksheetDocxStyles(),
      sections: [{
        properties: { page: { margin: { top: 13 * MM, bottom: 15 * MM, left: 14 * MM, right: 14 * MM } } },
        ...(ft ? { footers: { default: ft } } : {}),
        children,
      }],
    });
  }

  return { d, run, textRuns, badge, para, header, section, exerciseHead, chipsBox, item, document, line, none, INK, GREY, RULE, TINT, layout };
}

async function buildLingoDocx(data) {
  const meta = data.meta || {};
  const k = await docxKit(meta, "lingo");
  const { d, run, textRuns, badge, para } = k;
  const vocab = normalizeVocabulary(data.lingoLauncher.vocabulary);
  const children = [...k.header("Lingo Launcher", "Vocabulary study sheet"), k.section(`Words to learn · ${vocab.length}`)];

  const cell = (v, shaded) => {
    const lines = [];
    if (v) {
      const top = [badge(v.number, 16), run(`  ${v.english}`, { display: true, bold: true, size: 23 })];
      if (v.type?.trim()) top.push(run(`  ${v.type.trim()}`, { italics: true, size: 17, color: k.GREY }));
      if (v.greek?.trim()) top.push(run("  =  ", { bold: true, size: 19, color: k.GREY }), run(v.greek.trim(), { bold: true, size: 20 }));
      if (v.emojis) top.push(run("  "), ...textRuns(v.emojis, { size: 19, pic: 22 }));
      lines.push(para(top));
      const sub = (runs) => para(runs, { indent: { left: 6 * MM } });
      if (v.collocation) {
        const phrase = splitTargetInPhrase(v.collocation, v.english).map((p) => run(p.text, p.bold ? { italics: true, bold: true, size: 19, color: k.INK } : { italics: true, size: 19, color: "444444" }));
        lines.push(sub([run("“", { italics: true, size: 19, color: "444444" }), ...phrase, run("”", { italics: true, size: 19, color: "444444" })]));
      }
      normalizeDerivativesList(v.derivatives).forEach((dv) => {
        const t = formatDerivativeLine(dv);
        if (t) lines.push(sub([run("→  ", { bold: true, size: 18 }), run(t, { size: 18, color: "444444" })]));
      });
      const syn = normalizeWordList(v.synonyms);
      const ant = normalizeAntonymList(v.antonyms);
      // Synonyms and opposites share one line: "≈ clever     ≠ silly - ανόητος".
      const relRuns = [];
      if (syn.length) relRuns.push(run("≈  ", { bold: true, size: 18 }), run(syn.join(", "), { size: 18, color: "444444" }));
      if (syn.length && ant.length) relRuns.push(run("       ", { size: 18 }));
      if (ant.length) relRuns.push(run("≠  ", { bold: true, size: 18 }), run(ant.map(formatAntonymLine).join(", "), { size: 18, color: "444444" }));
      if (relRuns.length) lines.push(sub(relRuns));
    }
    return new d.TableCell({
      width: { size: 50, type: d.WidthType.PERCENTAGE },
      margins: { top: 2 * MM, bottom: 2 * MM, left: 3 * MM, right: 3 * MM },
      children: lines.length ? lines : [para([])],
    });
  };
  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: { top: k.line(8), bottom: k.line(8), left: k.line(8), right: k.line(8), insideHorizontal: k.line(4, k.RULE), insideVertical: k.line(4, k.RULE) },
    rows: buildVocabTablePairs(vocab).map(({ left, right }, i) => new d.TableRow({ cantSplit: true, children: [cell(left, i % 2 === 1), cell(right, i % 2 === 1)] })),
  }));

  if (data.lingoLauncher.practice.length) children.push(k.section("Let’s practise"));
  data.lingoLauncher.practice.forEach((ex) => {
    children.push(...k.exerciseHead(ex));
    if (ex.wordList?.length) children.push(k.chipsBox(ex.wordList), para([], { spacing: { after: 1 * MM }, keepNext: true }));
    ex.items.forEach((it) => children.push(k.item(it.number, textRuns(stripLeadingItemNumber(it.prompt), { pic: 20 }))));
  });
  return d.Packer.toBlob(k.document(children));
}

async function buildDictationDocx(data) {
  const meta = data.meta || {};
  const k = await docxKit(meta, "dictation");
  const { d, run, para } = k;
  const children = [...k.header("Dictation", "Vocabulary test")];
  data.dictation.exercises.forEach((ex) => {
    children.push(...k.exerciseHead(ex));
    if (ex.wordBank?.length) {
      if (ex.typeId === "D13") {
        ex.wordBank.forEach((entry) => {
          const m = String(entry).match(/^([A-Z])\.\s*(.*)$/i);
          children.push(para(m ? [k.badge(m[1].toUpperCase(), 16), run(`  ${m[2]}`, { size: 20 })] : [run(entry, { size: 20 })], { indent: { left: 8 * MM }, spacing: { after: 0.8 * MM }, keepNext: true }));
        });
        children.push(para([], { spacing: { after: 1 * MM }, keepNext: true }));
      } else {
        children.push(k.chipsBox(ex.wordBank), para([], { spacing: { after: 1 * MM }, keepNext: true }));
      }
    }
    if (ex.stemHeader) children.push(para([run(ex.stemHeader, { size: 19, color: "444444" })], { indent: { left: 8 * MM } }));
    ex.items.forEach((it) => {
      let runs;
      if (ex.typeId === "D02" && it.stem) {
        runs = [run(`${stripLeadingItemNumber(it.prompt)}  `), run(String(it.stem).toUpperCase(), { display: true, bold: true })];
      } else if ((ex.typeId === "D08" || ex.typeId === "D28") && /\[[^\]]+\]/.test(it.prompt || "")) {
        runs = stripLeadingItemNumber(it.prompt).split(/(\[[^\]]+\])/).filter(Boolean).map((part) => run(part, { bold: /^\[[^\]]+\]$/.test(part) }));
      } else {
        runs = k.textRuns(formatDictationItemPlain(it, ex.typeId), { pic: 26 });
      }
      children.push(k.item(it.number, runs));
    });
  });
  return d.Packer.toBlob(k.document(children));
}

async function buildAnswerKeyDocx(data) {
  const meta = data.meta || {};
  const k = await docxKit(meta, "answer");
  const { d, run, badge, para } = k;
  const children = [...k.header("Answer Key", "Teacher’s copy")];
  const block = (ex, label) => {
    children.push(para([run(`${label} · Exercise ${ex.number}`, { display: true, bold: true, size: 18, caps: true, spacing: 16 }), ...(EXERCISE_LABELS[ex.typeId] ? [run(`   ${EXERCISE_LABELS[ex.typeId]}`, { size: 16, color: k.GREY })] : [])], { keepNext: true, spacing: { before: 2.6 * MM, after: 1 * MM } }));
    (ex.items || []).forEach((it) => {
      const words = (it.testsWords || []).filter((w) => String(w).trim().toLowerCase() !== String(it.answer || "").trim().toLowerCase()).join(", ");
      children.push(k.item(it.number, [run(it.answer || "—", { bold: true, size: 20 }), ...(words ? [run(`   ${words}`, { size: 16, color: k.GREY })] : [])]));
    });
  };
  if ((data.lingoLauncher?.practice || []).length) children.push(k.section("Lingo Launcher practice"));
  (data.lingoLauncher?.practice || []).forEach((ex) => block(ex, "Lingo"));
  if ((data.dictation?.exercises || []).length) children.push(k.section("Dictation"));
  (data.dictation?.exercises || []).forEach((ex) => block(ex, "Dictation"));
  return d.Packer.toBlob(k.document(children));
}

function downloadBlob(blob, filename) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return blob;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}

async function exportDocx(type, data, filename) {
  if (typeof fetch !== "undefined") {
    try {
      const res = await fetch("/export/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data }),
      });
      if (res.ok) {
        downloadBlob(await res.blob(), filename);
        return;
      }
      const errText = await res.text();
      throw new Error(errText || `Export failed (${res.status})`);
    } catch (err) {
      if (err.message?.includes("Pop-up")) throw err;
      console.warn("Server DOCX export failed, trying browser fallback:", err);
    }
  }
  let blob;
  if (type === "lingo") blob = await buildLingoDocx(data);
  else if (type === "dictation") blob = await buildDictationDocx(data);
  else if (type === "answer") blob = await buildAnswerKeyDocx(data);
  else throw new Error("Unknown export type");
  downloadBlob(blob, filename);
}

function fileBaseName(meta) {
  const pages = String(meta?.pageRange || "").trim();
  return [meta?.unit ? `Unit ${meta.unit}` : "Worksheet", pages ? `p.${pages}` : ""].filter(Boolean).join(", ");
}

/**
 * AI-fill vocabulary metadata for structured input rows.
 * @param {string} apiKey
 * @param {string} profileId
 * @param {{ english: string, fields: Record<string,boolean> }[]} wordRequests
 */
const VOCAB_AUTOFILL_FIELDS = ["type", "greek", "emojis", "collocation", "derivatives", "synonyms", "antonyms"];

const VOCAB_SENSE_DISAMBIGUATION_RULES = `
WORD SENSE & TEACHER HINTS (critical for polysemous English words):
- Many English words have several meanings (e.g. seal = animal φώκια OR verb σφραγίζω; wave = κύμα OR χαιρετώ; match = σπίρτρο OR ταιριάζω).
- When the teacher provided "type" (n., v., adj., phr. v., etc.), use THAT part of speech and the matching Greek sense — never the most common dictionary sense if it conflicts.
- When the teacher provided "greek", that translation LOCKS the intended meaning — all other fields (type, collocation, emojis, derivatives) must fit that Greek sense.
- When both type and greek are provided, copy both exactly; fill only the remaining requested fields to match.
- When only type is provided (e.g. "v."), infer the verb sense and Greek (seal + v. → σφραγίζω, NOT φώκια).
- When only greek is provided, infer type and collocation from that Greek meaning.
- Collocation and emojis must match the locked sense (verb seal → "seal the envelope", not sea animal emojis).
- NEVER replace or "correct" teacher-provided type or greek to a different sense.`;

function buildAutofillRequests(wordRequests) {
  return (wordRequests || [])
    .map((w) => {
      const english = w.english?.trim();
      if (!english) return null;
      const fields = w.fields || {};
      const provided = {};
      for (const key of VOCAB_AUTOFILL_FIELDS) {
        const v = String(w.provided?.[key] ?? w[key] ?? "").trim();
        if (v) provided[key] = v;
      }
      const fill = Object.entries(fields)
        .filter(([k, on]) => on && VOCAB_AUTOFILL_FIELDS.includes(k) && !provided[k])
        .map(([k]) => k);
      return { english, fill, provided };
    })
    .filter(Boolean);
}

/** AI answers can be strings, lists, or {text, type, greek} objects — always store plain text. */
function autofillValueText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(autofillValueText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const text = String(value.text || value.english || value.word || "").trim();
    if (!text) return "";
    const type = value.type ? ` (${String(value.type).trim()})` : "";
    const greek = value.greek ? ` - ${String(value.greek).trim()}` : "";
    return `${text}${type}${greek}`;
  }
  return String(value).trim();
}

const normEnglish = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[-‐–]/g, " ").replace(/\s+/g, " ").trim();

/** The fields whose AI answers get rule-checked and reviewed (the others are free text). */
const VOCAB_CHECKED_FIELDS = ["emojis", "derivatives", "synonyms", "antonyms"];

const AUTOFILL_EMOJI_GUIDE = `PICKING THE EMOJI (the picture a student sees next to the word — it must make them think of THIS word):
- Every word in a unit gets a DIFFERENT emoji — two words must never share one, even related ones (run and jog must not both be 🏃: pick another image for the second).
- First decide the sense (use provided greek / type / collocation), then in "picture" describe in a few words the single clearest thing to draw, THEN choose the emoji for that picture.
- Concrete nouns → the thing itself (apple 🍎, helmet ⛑️, lighthouse 🗼 not 🏠). Animals/plants/foods → that exact animal/plant/food.
- Verbs → the action or its tell-tale object (climb 🧗, cut ✂️, swim 🏊, hide 🙈, whisper 🤫, rescue 🛟, explore 🧭, invent 💡).
- Adjectives → a clear prototype of the quality (hot 🔥, cold 🥶, huge 🐘, tiny 🐜, fast 🐆, exhausted 😩, brave 🦁, noisy 📢). Feelings → the matching face.
- Abstract words → a concrete symbol or tiny scene people instantly link to it (success 🏆, danger ⚠️, secret 🤐, idea 💡, journey 🧳, time ⏰, money 💰).
- Prepositions / adverbs / function words → a spatial or symbolic emoji (up ⬆️, under ⬇️, together 🤝, always 🔁).
- Match the sense: bat (animal) 🦇 vs bat (cricket) 🏏; seal (verb) ✉️ vs seal (animal) 🦭; match (game) ⚽ vs match (fire) 🔥.
- 1 emoji is best. Use 2 only when a single one cannot show the meaning (e.g. object + action: ✂️💇). Never 3+, never the same emoji twice.
- NEVER use: placeholders (❓❗🔤🔠ℹ️🆗✅❌), flags or national symbols, letters/numbers/keycaps, plain coloured shapes, or a face for a word that is not an emotion.
- Use well-established emojis (Unicode 13 or older) so every device and every picture style can draw them; avoid brand-new emojis.`;

const AUTOFILL_FAMILY_GUIDE = `WORD FAMILY ("derivatives") — the rules that matter most:
- A word family = DIFFERENT words built from the same root by adding or changing a prefix/suffix, often changing the part of speech: compete → competition (n.), competitor (n.), competitive (adj.), competitively (adv.); teach → teacher (n.); happy → happiness (n.), unhappy (adj.), happily (adv.); excite → excitement (n.), excited (adj.), exciting (adj.).
- NEVER list the headword itself, and NEVER list a mere inflection of it: not "compete" for compete, not competes/competed/competing, not plural of a noun, not happier/happiest for happy, not running/ran for run, not the same spelling with another part of speech (water (v.) for water (n.)).
- Participle adjectives (excited, boring) and -ing nouns (building from build) are fine ONLY when they are a different part of speech from the headword.
- Every entry must be a real, common English word that genuinely shares the root and meaning — no made-up forms, no look-alikes with a different root (cat ≠ catalogue, bear ≠ beard), no synonyms/opposites that merely relate in meaning.
- Phrasal verbs and fixed phrases: use the family of the key word (give up → none usually; take care of → careful (adj.), carefully (adv.), careless (adj.)).
- Format: "word (type) - Greek" with the Greek for THAT word; prefer the most useful and level-appropriate forms first.
- If the word has no real derivatives (pencil, table, yesterday), return "" and add "derivatives" to "none" — do NOT pad the list with the headword or forms of it.`;

const AUTOFILL_RELATION_GUIDE = `SYNONYMS & OPPOSITES:
- synonyms: words with (nearly) the SAME meaning in THIS sense and the SAME part of speech, interchangeable in the collocation (big ↔ large, begin ↔ start, tired ↔ exhausted). Prefer simple, common words that the class level can understand; a single word is better than a phrase. Never the headword, an inflection of it, a definition, an opposite, or a merely related word (dog ≠ puppy ≠ animal).
- antonyms: the natural OPPOSITE in THIS sense and the same part of speech, as "word - Greek" (e.g. cold - κρύος). Adjectives: hot/cold, brave/afraid; verbs: open/close, win/lose; nouns: the opposite concept (winner/loser, success/failure). A negated form of the same word (unhappy for happy) is allowed only if no better opposite exists; never "not + word". Never reuse a synonym as an antonym.
- If a pair is not genuinely possible (an opposite of pencil, a synonym of Monday), return "" and list the field in "none".`;

function vocabFieldLimits(profile) {
  const max = profile.maxDerivatives >= 99 ? 5 : Math.max(1, profile.maxDerivatives);
  return { derivatives: max, synonyms: max <= 1 ? 1 : max <= 2 ? 2 : 3, antonyms: max <= 1 ? 1 : 2 };
}

async function autofillBatch(apiKey, profileId, requests, { strict = false, taken = [] } = {}) {
  const profile = CLASS_PROFILES[profileId];
  const limits = vocabFieldLimits(profile);
  const allFields = VOCAB_AUTOFILL_FIELDS;
  const schemaFields = allFields.map((k) => `"${k}": string`).join(", ");

  const systemPrompt = `You enrich English vocabulary rows for Greek ESL teachers. Return valid json only.

${getProfilePromptBlock(profileId)}
${VOCAB_SENSE_DISAMBIGUATION_RULES}

Schema: { "items": [ { "english": string, "sense": string, "picture": string, ${schemaFields}, "none": string[] } ] }

Rules:
- One item per input word, in the SAME ORDER as the input; "english" must be copied exactly from the input
- Each word has "fill" (fields to generate) and optional "provided" (teacher hints — LOCKED, copy exactly) and optional "avoid" (answers already rejected — never give those again)
- Return EVERY key listed in "fill" with real content, PLUS echo every key in "provided" unchanged
- "sense": FIRST decide the exact meaning of this word (a 3–8 word English gloss, e.g. "to close an envelope"). Everything else must fit it. "picture": 2–6 words naming what the emoji will show. Both are scratch notes for accuracy — always return them
- type: standard abbreviation n., v., adj., adv., phr. v., prep., conj., pron., det., interj. Must match the locked sense from provided type/greek
- greek: natural Greek for students at ${profile.label} level — must match provided greek if given, or match provided type
- emojis: 1 emoji (2 only if one cannot show the meaning); never 3+; never leave empty
- collocation: short natural phrase (3–7 words) using the word in the locked sense — not a dictionary definition; never leave empty
- derivatives: comma-separated "word (type) - Greek"; up to ${limits.derivatives}, suitable for ${profile.cefr}
- synonyms: comma-separated, up to ${limits.synonyms}
- antonyms: comma-separated "word - Greek", up to ${limits.antonyms}
- Only if a requested field truly has NO correct answer in English (e.g. an opposite of "pencil"), return "" for it AND list the field name in "none". Never invent wrong or unnatural words just to fill a field${strict ? `
- SECOND PASS: these fields came back empty or were rejected last time (see "avoid"). Think again carefully — most words DO have a word family, a synonym and an opposite. Use "none" only when an answer is genuinely impossible` : ""}

${AUTOFILL_EMOJI_GUIDE}

${AUTOFILL_FAMILY_GUIDE}

${AUTOFILL_RELATION_GUIDE}

Examples:
- { "english": "seal", "provided": { "type": "v." }, "fill": ["greek","emojis","collocation"] } → sense "to close something tightly", type "v.", greek "σφραγίζω", picture "sealed envelope", emojis "✉️", collocation "seal an envelope"
- { "english": "seal", "provided": { "greek": "φώκια" }, "fill": ["type","emojis","collocation"] } → sense "sea animal with flippers", type "n.", emojis "🦭", collocation "a seal on the rocks"
- { "english": "brave", "fill": ["emojis","derivatives","synonyms","antonyms"] } → emojis "🦁", derivatives "bravery (n.) - θάρρος, bravely (adv.) - γενναία", synonyms "courageous", antonyms "afraid - φοβισμένος"
- { "english": "compete", "provided": {"type":"v."}, "fill": ["derivatives"] } → derivatives "competition (n.) - διαγωνισμός, competitor (n.) - αντίπαλος, competitive (adj.) - ανταγωνιστικός" (NOT "compete", "competing" or "competes")
- { "english": "pencil", "fill": ["derivatives","antonyms"] } → derivatives "", antonyms "", none ["derivatives","antonyms"]`;

  const takenNote = taken.length ? `\nEmojis ALREADY USED by other words in this unit — every word needs its OWN emoji, never reuse these: ${taken.join(" ")}\n` : "";
  const userPrompt = `Return json items for these words. Respect "fill", "provided" and "avoid" on each:${takenNote}\n${JSON.stringify(requests, null, 2)}`;
  const result = await callDeepSeek(apiKey, systemPrompt, userPrompt);
  const items = Array.isArray(result.items) ? result.items : [];
  const byEnglish = new Map(items.filter((it) => it?.english).map((it) => [normEnglish(it.english), it]));
  // Match by headword, falling back to position (the AI sometimes re-spells a word).
  return requests.map((r, i) => byEnglish.get(normEnglish(r.english)) || items[i] || {});
}

/**
 * Second opinion on what the first pass wrote. A separate call acts as a strict teacher: it checks
 * each emoji, word family, synonym and opposite against the word's sense, and returns corrected
 * values ONLY for the fields it found faulty.
 * @param rows [{ english, sense, type, greek, collocation, emojis?, derivatives?, synonyms?, antonyms?, issues? }]
 * @returns one object per row with the corrected fields (empty object = approved).
 */
async function reviewBatch(apiKey, profileId, rows) {
  const profile = CLASS_PROFILES[profileId];
  const limits = vocabFieldLimits(profile);
  const systemPrompt = `You are a strict English teacher for Greek ${profile.label} students (${profile.cefr}) checking AI-written vocabulary cards. Return valid json only.

Schema: { "items": [ { "english": string, "shows"?: string, "emojis"?: string, "derivatives"?: string, "synonyms"?: string, "antonyms"?: string } ] }

For each row, audit ONLY the fields present in "check". Return the row with a key ONLY for a field that is wrong and needs replacing, containing the corrected value. Return just { "english": ... } when everything is correct. Never touch fields outside "check". The sense is fixed by "sense", "type", "greek" and "collocation".

How to audit:
- shows: for every row that has "emojis" in "check", first write in "shows" what the emoji literally depicts, in plain words (for example a lion's face). Judge from that, not from what you hoped it would be.
- emojis: Imagine a student who sees ONLY the emoji (no text). Would they think of THIS word in THIS sense? Replace it if it shows a different meaning or a homograph, is too vague, is a placeholder, or is a poor stand-in when a clearer emoji exists. Keep a good one. Never return an empty emoji.
- derivatives: every entry must be a different, real word from the same root (different spelling from the headword and not merely an inflection of it). Remove the headword, plurals/-s/-ed/-ing/-er/-est forms of it, invented words, look-alikes with a different root, and entries without the right Greek. Add the most useful genuine derivatives if the list is thin (up to ${limits.derivatives}). Return "" if none truly exist.
- synonyms: same meaning in THIS sense and same part of speech, simple and level-appropriate, up to ${limits.synonyms}. Remove the headword, inflections, definitions, opposites and loosely related words.
- antonyms: "word - Greek", the natural opposite in THIS sense and the same part of speech, up to ${limits.antonyms}. Remove the headword, "not + word" and synonyms. Return "" if there is no genuine opposite.
- "issues" lists problems already detected automatically (e.g. words that were thrown out); fix those fields.

${AUTOFILL_EMOJI_GUIDE}

${AUTOFILL_FAMILY_GUIDE}`;
  const userPrompt = `Audit these rows and return json items in the SAME ORDER:\n${JSON.stringify(rows, null, 2)}`;
  const result = await callDeepSeek(apiKey, systemPrompt, userPrompt);
  const items = Array.isArray(result.items) ? result.items : [];
  const byEnglish = new Map(items.filter((it) => it?.english).map((it) => [normEnglish(it.english), it]));
  return rows.map((r, i) => byEnglish.get(normEnglish(r.english)) || (items.length === rows.length ? items[i] : null) || {});
}

/** First emoji of a field (without variation selectors / skin tones): the picture a word is known by. */
function emojiHead(text) {
  const first = splitEmojiText(text).find((p) => p.emoji);
  return first ? first.text.replace(/\uFE0F/g, "").replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "") : "";
}

/** Words that were given the same picture as another word get a new, distinct one. */
async function distinctEmojiBatch(apiKey, profileId, rows, taken) {
  const profile = CLASS_PROFILES[profileId];
  const systemPrompt = `You pick emojis for vocabulary cards for Greek ${profile.label} students (${profile.cefr}). Return valid json only.

Schema: { "items": [ { "english": string, "picture": string, "emojis": string } ] }

Each row below was given an emoji that ANOTHER word in the unit already uses (see "sameEmojiAs"). Give each row a DIFFERENT emoji that clearly shows ITS OWN meaning ("sense", "type", "greek", "collocation") and is not in the "taken" list. Return one item per row, in the same order. "picture": 2–6 words naming what the new emoji shows.

${AUTOFILL_EMOJI_GUIDE}`;
  const userPrompt = `taken emojis (never use): ${taken.join(" ")}\n${JSON.stringify(rows, null, 2)}`;
  const result = await callDeepSeek(apiKey, systemPrompt, userPrompt);
  const items = Array.isArray(result.items) ? result.items : [];
  const byEnglish = new Map(items.filter((it) => it?.english).map((it) => [normEnglish(it.english), it]));
  return rows.map((r, i) => byEnglish.get(normEnglish(r.english)) || (items.length === rows.length ? items[i] : null) || {});
}

/* ── Coursebook word-bank emojis: only a few hundred are specific, the rest are generic fillers ── */
let bankEmojiUsage = null;
function bankUsage() {
  if (bankEmojiUsage) return bankEmojiUsage;
  bankEmojiUsage = new Map();
  for (const e of CPP_WORDBANK) {
    if (!e.emojis) continue;
    if (!bankEmojiUsage.has(e.emojis)) bankEmojiUsage.set(e.emojis, new Set());
    bankEmojiUsage.get(e.emojis).add(String(e.english).toLowerCase());
  }
  return bankEmojiUsage;
}
/** The word bank reuses one emoji for dozens of unrelated words (✨ predict, live, respect…). Keep it only when 2 words or fewer share it. */
function trustedBankEmoji(entry) {
  const em = entry?.emojis || "";
  return em && (bankUsage().get(em)?.size || 0) <= 2 ? em : "";
}
/** True when `emojis` is the word bank's own generic filler for this word. */
function isJunkBankEmoji(english, emojis) {
  const key = String(english || "").trim().toLowerCase();
  if (!key || !emojis) return false;
  const usage = bankUsage().get(emojis);
  return !!usage && usage.size > 2 && usage.has(key);
}

/**
 * AI-fill vocabulary rows. Every requested field is filled unless the AI says it has no genuine
 * answer (then it is listed in the result's `unavailable` map: english → [fields]).
 * Works in small batches so long word lists are never cut short, and retries empty fields once.
 * Each answer is rule-checked (a word family never repeats the headword, an opposite is never a
 * synonym, an emoji must be a real picture) and, for emojis / families / synonyms / opposites,
 * reviewed by a second AI call before it reaches the teacher.
 * @param {object} [options]
 * @param {(emoji: string) => boolean} [options.emojiDrawable] true when every picture style can draw this emoji
 * @param {(message: string) => void} [options.onStage] progress text for the UI
 * @param {{english: string, emojis: string}[]} [options.siblingEmojis] pictures other words in the unit already use (never reused)
 */
async function autofillVocabulary(apiKey, profileId, wordRequests, options = {}) {
  const profile = CLASS_PROFILES[profileId];
  if (!profile) throw new Error("Invalid class profile");
  const requests = buildAutofillRequests(wordRequests);
  if (!requests.length) return [];
  if (!requests.every((r) => r.fill.length || Object.keys(r.provided).length)) {
    throw new Error("Each word needs at least one field enabled, or type/Greek hint already filled.");
  }
  if (!requests.every((r) => r.fill.length)) {
    throw new Error("Each word needs at least one empty field to fill — all enabled fields are already filled.");
  }

  const BATCH = 8;
  const limits = vocabFieldLimits(profile);
  const merged = requests.map((r) => ({ english: r.english, ...Object.fromEntries(Object.entries(r.provided)) }));
  const none = requests.map(() => new Set());
  const aiMade = requests.map(() => new Set()); // checked fields the AI (not the teacher) wrote
  const rejected = requests.map(() => ({})); // field → answers thrown out, so a retry never repeats them
  const notes = requests.map(() => ({ sense: "", picture: "" }));
  const stage = (msg) => { try { options.onStage?.(msg); } catch { /* UI only */ } };

  const ctxFor = (i, key) => ({
    english: requests[i].english,
    type: merged[i].type || "",
    synonyms: merged[i].synonyms || "",
    max: limits[key],
    isDrawable: options.emojiDrawable,
  });
  // Rule-check one AI answer and keep it in `merged`. Returns true when something usable was kept.
  const accept = (i, key, raw) => {
    const text = autofillValueText(raw);
    if (!text) return false;
    if (!VOCAB_CHECKED_FIELDS.includes(key)) { merged[i][key] = text; return true; }
    const { value, rejected: bad } = sanitizeVocabField(key, text, ctxFor(i, key));
    if (bad.length) rejected[i][key] = [...new Set([...(rejected[i][key] || []), ...bad])];
    if (!value) return false;
    merged[i][key] = value;
    aiMade[i].add(key);
    return true;
  };

  // Emojis the rest of the unit already uses (other rows not being filled + words answered so far).
  const siblingEmojis = (options.siblingEmojis || []).filter((e) => e?.emojis);
  const firstEmoji = (text) => emojiHead(text);
  const takenFor = (slice) => {
    const mine = new Set(slice);
    const all = [...siblingEmojis.map((e) => e.emojis), ...requests.map((_, i) => (mine.has(i) ? "" : merged[i].emojis || ""))];
    return [...new Set(all.map(firstEmoji).filter(Boolean))];
  };

  const runPass = async (indexes, strict) => {
    for (let b = 0; b < indexes.length; b += BATCH) {
      const slice = indexes.slice(b, b + BATCH);
      const batch = slice.map((i) => {
        const fill = requests[i].fill.filter((k) => !merged[i][k] && !none[i].has(k));
        const avoid = Object.fromEntries(fill.filter((k) => rejected[i][k]?.length).map((k) => [k, rejected[i][k]]));
        return {
          english: requests[i].english,
          fill,
          provided: { ...requests[i].provided, ...Object.fromEntries(requests[i].fill.filter((k) => merged[i][k]).map((k) => [k, merged[i][k]])) },
          ...(Object.keys(avoid).length ? { avoid } : {}),
        };
      });
      const answers = await autofillBatch(apiKey, profileId, batch, { strict, taken: takenFor(slice) });
      answers.forEach((item, j) => {
        const i = slice[j];
        if (item.sense) notes[i].sense = String(item.sense).trim();
        if (item.picture) notes[i].picture = String(item.picture).trim();
        const fields = [...batch[j].fill].sort((a, c) => VOCAB_AUTOFILL_FIELDS.indexOf(a) - VOCAB_AUTOFILL_FIELDS.indexOf(c));
        const said = Array.isArray(item.none) ? item.none : [];
        for (const key of fields) {
          // synonyms come before antonyms, so an opposite can be checked against them
          if (!accept(i, key, item[key]) && said.includes(key) && !rejected[i][key]?.length) none[i].add(key);
        }
      });
    }
  };

  // The second AI opinion on emojis, word families, synonyms and opposites.
  const reviewPass = async () => {
    const indexes = requests.map((_, i) => i).filter((i) => aiMade[i].size);
    for (let b = 0; b < indexes.length; b += BATCH) {
      const slice = indexes.slice(b, b + BATCH);
      const rows = slice.map((i) => {
        const check = VOCAB_CHECKED_FIELDS.filter((k) => aiMade[i].has(k));
        const issues = check.filter((k) => rejected[i][k]?.length).map((k) => `${k}: ${rejectionNote(k, rejected[i][k])}`);
        return {
          english: requests[i].english,
          sense: notes[i].sense || undefined,
          type: merged[i].type || undefined,
          greek: merged[i].greek || undefined,
          collocation: merged[i].collocation || undefined,
          check,
          ...Object.fromEntries(check.map((k) => [k, merged[i][k]])),
          ...(issues.length ? { issues } : {}),
        };
      });
      let fixes;
      try {
        fixes = await reviewBatch(apiKey, profileId, rows);
      } catch (err) {
        if (err?.fatal) throw err;
        continue; // the review is a bonus — never lose the first answers because of it
      }
      fixes.forEach((fix, j) => {
        const i = slice[j];
        for (const key of [...rows[j].check].sort((a, c) => VOCAB_AUTOFILL_FIELDS.indexOf(a) - VOCAB_AUTOFILL_FIELDS.indexOf(c))) {
          if (!(key in (fix || {}))) continue;
          const text = autofillValueText(fix[key]);
          const before = merged[i][key];
          if (!text) {
            // The reviewer found nothing valid. Emojis must stay; other fields may legitimately end up empty.
            if (key === "emojis") continue;
            merged[i][key] = "";
            none[i].add(key);
            continue;
          }
          const { value, rejected: bad } = sanitizeVocabField(key, text, ctxFor(i, key));
          if (bad.length) rejected[i][key] = [...new Set([...(rejected[i][key] || []), ...bad])];
          merged[i][key] = value || before;
        }
        // The cleaned synonyms may have changed: re-check the opposites against them.
        if (aiMade[i].has("antonyms") && merged[i].antonyms) {
          merged[i].antonyms = sanitizeVocabField("antonyms", merged[i].antonyms, ctxFor(i, "antonyms")).value || merged[i].antonyms;
        }
      });
    }
  };

  // Two words must never share a picture. Keep the first owner, ask again for the others.
  const distinctPass = async () => {
    for (let round = 0; round < 2; round++) {
      const owner = new Map(); // emoji → who owns it
      siblingEmojis.forEach((e) => { const k = firstEmoji(e.emojis); if (k && !owner.has(k)) owner.set(k, e.english); });
      const clashing = [];
      requests.forEach((r, i) => {
        const k = firstEmoji(merged[i].emojis);
        if (!k) return;
        if (!owner.has(k)) { owner.set(k, r.english); return; }
        if (aiMade[i].has("emojis")) clashing.push({ i, with: owner.get(k) });
      });
      if (!clashing.length) return;
      stage("Giving every word its own picture…");
      for (let b = 0; b < clashing.length; b += BATCH) {
        const slice = clashing.slice(b, b + BATCH);
        const taken = [...new Set([...owner.keys()])];
        const rows = slice.map(({ i, with: other }) => ({
          english: requests[i].english, sense: notes[i].sense || undefined, type: merged[i].type || undefined, greek: merged[i].greek || undefined,
          collocation: merged[i].collocation || undefined, currentEmoji: merged[i].emojis, sameEmojiAs: other,
        }));
        let fixes;
        try { fixes = await distinctEmojiBatch(apiKey, profileId, rows, taken); } catch (err) { if (err?.fatal) throw err; return; }
        fixes.forEach((fix, j) => {
          const i = slice[j].i;
          const { value } = sanitizeVocabField("emojis", autofillValueText(fix?.emojis), ctxFor(i, "emojis"));
          const k = firstEmoji(value);
          if (value && k && !taken.includes(k)) { rejected[i].emojis = [...new Set([...(rejected[i].emojis || []), merged[i].emojis])]; merged[i].emojis = value; taken.push(k); owner.set(k, requests[i].english); }
        });
      }
    }
  };

  const allIdx = requests.map((_, i) => i);
  const missingIdx = () => allIdx.filter((i) => requests[i].fill.some((k) => !merged[i][k] && !none[i].has(k)));

  stage("Writing phrases, pictures and word families…");
  await runPass(allIdx, false);
  const missing = missingIdx();
  if (missing.length) {
    stage("Taking a second look at fields that came back empty…");
    await runPass(missing, true);
  }
  if (allIdx.some((i) => aiMade[i].size)) {
    stage("Checking pictures, word families, synonyms and opposites…");
    await reviewPass();
  }
  if (allIdx.some((i) => aiMade[i].has("emojis"))) await distinctPass();
  // The reviewer may have emptied a field; ask once more for anything still missing without a "none".
  const stillMissing = missingIdx();
  if (stillMissing.length) {
    stage("Filling the last gaps…");
    await runPass(stillMissing, true);
  }

  const unavailable = {};
  requests.forEach((r, i) => {
    const empty = r.fill.filter((k) => !merged[i][k]);
    if (empty.length) unavailable[r.english] = empty;
  });
  const out = merged;
  out.unavailable = unavailable;
  return out;
}

/**
 * Smart parser for bulk-pasting vocabulary lists from Word, PDFs, Quizlet, or teacher notes.
 * Supports:
 * - "1. stay in shape (phr. v.) - γυμνάζομαι 🏃💪 | exercise to stay in shape"
 * - Sub-lines starting with `>` (derivatives), `≈` (synonyms), `≠` (antonyms)
 * - Tab / dash / colon separated "english - greek"
 * - Comma-separated single line "compete, track, sequence, limb, introduce"
 */
function parseBulkVocabularyText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Single line comma-separated list of English words
  if (rawLines.length === 1 && rawLines[0].includes(",") && !/[-–—:=\t]/.test(rawLines[0])) {
    return rawLines[0]
      .split(",")
      .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .map((english) => ({
        english,
        type: "",
        greek: "",
        emojis: "",
        collocation: "",
        derivatives: "",
        synonyms: "",
        antonyms: "",
        fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
      }));
  }

  const rows = [];
  const emojiRegex = /[\p{Extended_Pictographic}\u2600-\u27BF]+(?:\u200d[\p{Extended_Pictographic}\u2600-\u27BF]+|\ufe0f)*/gu;

  for (const line of rawLines) {
    const last = rows[rows.length - 1];
    // Derivative line: > competition (n.) - διαγωνισμός
    if (/^>\s*/.test(line) && last) {
      const d = line.replace(/^>\s*/, "").trim();
      last.derivatives = last.derivatives ? `${last.derivatives}, ${d}` : d;
      last.fieldToggles.derivatives = true;
      continue;
    }
    // Synonym line: ≈ contest, race
    if (/^[≈~]\s*/.test(line) && last) {
      const s = line.replace(/^[≈~]\s*/, "").trim();
      last.synonyms = last.synonyms ? `${last.synonyms}, ${s}` : s;
      last.fieldToggles.synonyms = true;
      continue;
    }
    // Antonym line: ≠ quit - τα παρατάω
    if (/^[≠!]\s*/.test(line) && last) {
      const a = line.replace(/^[≠!]\s*/, "").trim();
      last.antonyms = last.antonyms ? `${last.antonyms}, ${a}` : a;
      last.fieldToggles.antonyms = true;
      continue;
    }

    // A plain comma list inside a longer paste: "rescue, brave, cliff"
    if (line.includes(",") && !/[-–—:=\t|()>≈≠]/.test(line) && !hasGreek(line)) {
      line.split(",").map((s) => s.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim()).filter(Boolean).forEach((english) => {
        rows.push({
          english, type: "", greek: "", emojis: "", collocation: "", derivatives: "", synonyms: "", antonyms: "",
          fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
        });
      });
      continue;
    }

    // Inline word-family markers on the same line: "… > competition (n.) ≈ contest ≠ give up"
    const inline = { derivatives: [], synonyms: [], antonyms: [] };
    const body = line.replace(/\s+([>≈≠])\s*([^>≈≠]*?)(?=\s+[>≈≠]|$)/g, (_m, mark, val) => {
      const v = val.trim();
      if (v) inline[mark === ">" ? "derivatives" : mark === "≈" ? "synonyms" : "antonyms"].push(v);
      return "";
    });

    // Extract emojis if any
    const foundEmojis = body.match(emojiRegex) || [];
    const emojis = foundEmojis.join("");
    let cleaned = body.replace(emojiRegex, "").replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim();
    if (!cleaned) continue;

    // Optional pipe for collocation: "word (v.) - greek | collocation phrase"
    let collocation = "";
    if (cleaned.includes("|")) {
      const pipeParts = cleaned.split("|").map((s) => s.trim());
      cleaned = pipeParts[0];
      collocation = pipeParts[1] || "";
    }

    // Extract part of speech in parentheses e.g. (n.), (v.), (adj.), (phr. v.)
    let type = "";
    cleaned = cleaned.replace(/\((n\.?|v\.?|adj\.?|adv\.?|phr\.?\s*v\.?|prep\.?|conj\.?|pron\.?|noun|verb|adjective|adverb|phrasal verb)\)/i, (_m, pos) => {
      const p = pos.toLowerCase().trim();
      if (p === "noun") type = "n.";
      else if (p === "verb") type = "v.";
      else if (p === "adjective") type = "adj.";
      else if (p === "adverb") type = "adv.";
      else if (p === "phrasal verb") type = "phr. v.";
      else type = pos.endsWith(".") ? pos : `${pos}.`;
      return "";
    }).replace(/\s{2,}/g, " ").trim();

    // Split English and Greek by tab, colon, or dash
    let english = cleaned;
    let greek = "";
    const sepMatch = cleaned.match(/^(.+?)\s*(?:\t|\s+[-–—:]\s+)\s*(.+)$/);
    if (sepMatch) {
      english = sepMatch[1].trim();
      greek = sepMatch[2].trim();
    } else if (hasGreek(cleaned)) {
      // e.g. "compete συναγωνίζομαι"
      const greekStart = cleaned.search(/[\u0370-\u03FF\u1F00-\u1FFF]/);
      if (greekStart > 1) {
        english = cleaned.slice(0, greekStart).replace(/[-–—:]+\s*$/, "").trim();
        greek = cleaned.slice(greekStart).trim();
      }
    }

    if (!english) continue;
    rows.push({
      english,
      type,
      greek,
      emojis,
      collocation,
      derivatives: "",
      synonyms: "",
      antonyms: "",
      fieldToggles: {
        type: true,
        greek: true,
        emojis: true,
        collocation: true,
        derivatives: false,
        synonyms: false,
        antonyms: false,
      },
    });
    const added = rows[rows.length - 1];
    for (const key of ["derivatives", "synonyms", "antonyms"]) {
      if (inline[key].length) {
        added[key] = inline[key].join(", ");
        added.fieldToggles[key] = true;
      }
    }
  }
  return rows;
}

export {
  trustedBankEmoji,
  isJunkBankEmoji,
  emojiHead,
  enforceTeacherVocabulary,
  findVocabGaps,
  sanitizeVocabField,
  splitTargetInPhrase,
  CLASS_PROFILES,
  configurePictures,
  pictureKey,
  splitEmojiText,
  WORKSHEET_LAYOUT_DEFAULTS,
  resolveWorksheetLayout,
  AI_PROVIDERS,
  configureAi,
  aiProviderName,
  EXERCISE_FAMILIES,
  EXERCISE_LABELS,
  EXERCISE_DESCRIPTIONS,
  EXERCISE_EXAMPLES,
  BOOK_PRESETS,
  STORAGE_KEY,
  pickGenerationPlan,
  analyzeVocabFeatures,
  analyzeVocabFeaturesFromData,
  buildPlanFromCustom,
  validateWorksheet,
  computeCoverage,
  computeDictationCoverage,
  computeLingoCoverage,
  renderLingoLauncher,
  renderDictation,
  renderAnswerKey,
  renderCoverageHeatmap,
  openWorksheetPrint,
  generateWorksheets,
  regenerateDictationOnly,
  regenerateLingoPracticeOnly,
  fixWorksheetValidationIssues,
  countFixableValidationIssues,
  buildValidationReport,
  applyQuickWorksheetFixes,
  fixDictationCoverageGaps,
  fixAllWorksheetIssues,
  countQuickFixIssues,
  buildWorksheetPrintDocument,
  buildLingoDocx,
  buildDictationDocx,
  buildAnswerKeyDocx,
  downloadBlob,
  exportDocx,
  fileBaseName,
  saveSignature,
  getSignatureHistory,
  saveWorksheetSession,
  isLocalStorageWritable,
  getAllSavedSessions,
  getSavedSession,
  deleteSavedSession,
  normalizeWorksheetExercises,
  autofillVocabulary,
  parseBulkVocabularyText,
  WORKSHEET_PRINT_CSS,
  CPP_BOOKS,
  CPP_WORDBANK,
  resolveCoursebookId,
  getCppUnitStructure,
  parsePageRangeSpec,
  inferUnitFromPages,
  queryCoursebookWords,
  selectSmartCoursebookWords,
  lookupCoursebookWord,
  buildArcadeDeck,
  buildDetectiveQuestions,
  buildTabooCard,
  maskWordInText,
};

