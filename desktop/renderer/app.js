/* Vocab Master — core worksheet engine */

const STORAGE_KEY = "lingo_maker_api_key";
const HISTORY_KEY = "lingo_maker_signatures";
const SAVES_KEY = "lingo_maker_saves";
const MAX_SAVES = 30;

/** Worksheet typography — preview, print, and .docx (Segoe UI covers Latin + Greek on Windows) */
const WORKSHEET_FONTS = {
  family: "Segoe UI",
  css: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  docx: "Segoe UI",
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
  D25: "recognition",
  L01: "productive", L02: "recognition", L03: "recognition", L04: "recognition",
  L05: "productive", L06: "analysis", L07: "productive", L08: "productive",
  L09: "analysis", L10: "productive",
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
  L01: "Gap fill with list", L02: "Circle best word", L03: "Synonym match",
  L04: "Opposite pairs", L05: "Collocation match", L06: "Grammar labels",
  L07: "Derivative build", L08: "Sentence order", L09: "Odd one out (light)",
  L10: "Personalize prompt",
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
    allowDictation: ["D01", "D03", "D04", "D06", "D13", "D15", "D17", "D25"],
    allowLingo: ["L01", "L02", "L04", "L05", "L09"],
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
    allowDictation: ["D01", "D02", "D03", "D04", "D05", "D06", "D13", "D15", "D16", "D17", "D25"],
    allowLingo: ["L01", "L02", "L03", "L04", "L05", "L09"],
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
    allowDictation: ["D01", "D02", "D03", "D04", "D05", "D06", "D08", "D11", "D12", "D13", "D16", "D17", "D25"],
    allowLingo: ["L01", "L02", "L03", "L04", "L05", "L09"],
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
    allowDictation: ["D01","D02","D03","D04","D05","D06","D07","D08","D09","D10","D11","D12","D13","D15","D16","D17","D20","D21","D23","D25"],
    allowLingo: ["L01","L02","L03","L04","L05","L06","L07","L08","L09"],
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
    allowDictation: Array.from({ length: 25 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`),
    allowLingo: ["L01","L02","L03","L04","L05","L06","L07","L08","L09","L10"],
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
    label: `Unit ${form.unit} · ${form.bookTitle}`,
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

function renderWordBankTable(words) {
  const rows = chunkWordBank(words);
  return `<table class="word-bank">${rows.map((row) =>
    `<tr>${row.map((w) => `<td>${escapeHtml(w)}</td>`).join("")}</tr>`
  ).join("")}</table>`;
}

function renderMatchDefinitionsList(entries) {
  if (!entries?.length) return "";
  return `<div class="match-defs">
    <p class="match-defs-heading">Definitions:</p>
    ${entries.map((entry) => `<p class="match-def-line">${escapeHtml(entry)}</p>`).join("")}
  </div>`;
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

function normalizeWorksheetPrompts(data) {
  if (!data) return data;
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
    const prompt = escapeHtml(item.prompt || "");
    const stem = escapeHtml(String(item.stem).toUpperCase());
    return `${prompt}  <strong class="stem-word">${stem}</strong>`;
  }
  if (typeId === "D08") {
    return renderD08PromptHtml(item.prompt);
  }
  if (typeId === "D11") {
    const words = parseCommaWordGroup(item.prompt);
    if (words.length >= 3) {
      return escapeHtml(words.join(" · "));
    }
  }
  return escapeHtml(item.prompt || "");
}

function formatDictationItemPlain(item, typeId) {
  if (typeId === "D02" && item.stem) {
    return `${item.prompt || ""}  ${String(item.stem).toUpperCase()}`;
  }
  if (typeId === "D11") {
    const words = parseCommaWordGroup(item.prompt);
    if (words.length >= 3) return words.join(" · ");
  }
  return item.prompt || "";
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

  vocab.forEach((v, i) => {
    if (!v.greek?.trim()) issues.push(`Vocab #${i + 1}: missing Greek translation`);
    if (profile?.minEmojis > 0 && !(v.emojis || "").trim()) {
      issues.push(`Vocab "${v.english}": needs at least one emoji for ${profile.label}`);
    }
    normalizeDerivativesList(v.derivatives).forEach((d) => {
      const text = typeof d === "string" ? d : d?.text;
      const greek = typeof d === "object" ? d?.greek : "";
      if (text?.trim() && !greek?.trim()) {
        issues.push(`Vocab "${v.english}" derivative "${text}": missing Greek translation`);
      }
    });
    normalizeAntonymList(v.antonyms).forEach((a) => {
      if (a.text && !a.greek?.trim()) {
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
  return `${meta.bookTitle}: Unit ${meta.unit} (p. ${meta.pageRange})`;
}

function formatVocabCell(v) {
  let line1 = `${v.number}. ${v.english}`;
  if (v.type?.trim()) line1 += ` (${v.type.trim()})`;
  if (v.greek) line1 += ` - ${v.greek}`;
  if (v.emojis) line1 += ` ${v.emojis}`;
  let html = `<div class="vocab-head">${escapeHtml(line1)}</div>`;
  if (v.collocation) html += `<div class="vocab-coll">${escapeHtml(v.collocation)}</div>`;
  const derivs = normalizeDerivativesList(v.derivatives);
  if (derivs.length) {
    derivs.forEach((d) => {
      const line = formatDerivativeLine(d);
      if (line) html += `<div class="vocab-deriv">&gt; ${escapeHtml(line)}</div>`;
    });
  }
  const syn = normalizeWordList(v.synonyms);
  if (syn.length) html += `<div class="vocab-related">≈ ${escapeHtml(syn.join(", "))}</div>`;
  const ant = normalizeAntonymList(v.antonyms);
  if (ant.length) html += `<div class="vocab-related">≠ ${escapeHtml(ant.map(formatAntonymLine).join(", "))}</div>`;
  return html;
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

function renderStudentHeaderHtml(meta, options = {}) {
  const show = options.studentHeader ?? meta?.includeStudentHeader ?? false;
  if (!show) return "";
  return `<div class="ws-student-header">
    <span><strong>Name:</strong> ___________________________</span>
    <span><strong>Date:</strong> _______________</span>
    <span><strong>Class:</strong> ${escapeHtml(meta?.classLabel || "__________")}</span>
    <span><strong>Score:</strong> _____ / _____</span>
  </div>`;
}

function renderLingoLauncher(data, options = {}) {
  const meta = data.meta || {};
  const density = options.density || meta.density || "standard";
  const showAnswers = !!options.showAnswers;
  const vocab = normalizeVocabulary(data.lingoLauncher.vocabulary);
  const rows = buildVocabTablePairs(vocab).map(
    ({ left, right }) =>
      `<tr><td class="${left ? "vocab-cell" : ""}" ${left ? `data-vocab-num="${left.number}"` : ""}>${left ? formatVocabCell(left) : ""}</td><td class="${right ? "vocab-cell" : ""}" ${right ? `data-vocab-num="${right.number}"` : ""}>${right ? formatVocabCell(right) : ""}</td></tr>`
  );

  let practiceHtml = "";
  data.lingoLauncher.practice.forEach((ex) => {
    practiceHtml += `<div class="ex-block">`;
    practiceHtml += `<h3 class="ex-heading ws-heading">Exercise ${ex.number}</h3>`;
    const instr = getStudentExerciseInstruction(ex);
    if (instr) practiceHtml += `<p class="ex-instruction">${escapeHtml(instr)}</p>`;
    if (ex.wordList?.length) {
      practiceHtml += `<p class="word-list">${ex.wordList.map(escapeHtml).join(" · ")}</p>`;
    }
    ex.items.forEach((item) => {
      const ansPill = showAnswers && item.answer
        ? ` <span class="teacher-ans-pill" title="Answer">✓ ${escapeHtml(item.answer)}</span>`
        : "";
      practiceHtml += `<p class="ex-item" data-answer="${escapeHtml(item.answer || "")}"><span class="item-num">(${item.number})</span> ${escapeHtml(item.prompt)}${ansPill}</p>`;
    });
    practiceHtml += `</div>`;
  });

  return `
    <div class="worksheet lingo-sheet density-${escapeHtml(density)}">
      <h1 class="ws-title ws-heading">🚀 Lingo Launcher</h1>
      <p class="ws-subtitle">${escapeHtml(subtitleLine(meta))}</p>
      ${renderStudentHeaderHtml(meta, options)}
      <table class="vocab-table"><tbody>${rows.join("")}</tbody></table>
      <h2 class="practice-heading ws-heading">Let's Practice! ✍️</h2>
      ${practiceHtml}
    </div>`;
}

function renderDictation(data, options = {}) {
  const meta = data.meta || {};
  const density = options.density || meta.density || "standard";
  const showAnswers = !!options.showAnswers;
  let body = "";
  data.dictation.exercises.forEach((ex) => {
    body += `<div class="ex-block">`;
    body += `<h3 class="ex-heading ws-heading">Exercise ${ex.number}</h3>`;
    const instr = getStudentExerciseInstruction(ex);
    if (instr) body += `<p class="ex-instruction">${escapeHtml(instr)}</p>`;
    if (ex.wordBank?.length) {
      if (ex.typeId === "D13") body += renderMatchDefinitionsList(ex.wordBank);
      else body += renderWordBankTable(ex.wordBank);
    }
    if (ex.stemHeader) body += `<p class="stem-header">${escapeHtml(ex.stemHeader)}</p>`;
    ex.items.forEach((item) => {
      const ansPill = showAnswers && item.answer
        ? ` <span class="teacher-ans-pill" title="Answer">✓ ${escapeHtml(item.answer)}</span>`
        : "";
      body += `<p class="ex-item" data-answer="${escapeHtml(item.answer || "")}"><span class="item-num">(${item.number})</span> ${formatDictationItemHtml(item, ex.typeId)}${ansPill}</p>`;
    });
    body += `</div>`;
  });

  return `
    <div class="worksheet dictation-sheet density-${escapeHtml(density)}">
      <h1 class="ws-title ws-heading">📝 Dictation</h1>
      <p class="ws-subtitle">${escapeHtml(subtitleLine(meta))}</p>
      ${renderStudentHeaderHtml(meta, options)}
      ${body}
    </div>`;
}

function renderAnswerKey(data, options = {}) {
  const meta = data.meta || {};
  const density = options.density || meta.density || "standard";
  let body = "";
  const exBlock = (ex, sheetLabel) => {
    const typeName = EXERCISE_LABELS[ex.typeId] ? ` · ${EXERCISE_LABELS[ex.typeId]} (${ex.typeId})` : "";
    let h = `<div class="ex-block"><h3 class="ex-heading ws-heading">${escapeHtml(sheetLabel)} — Exercise ${ex.number}${escapeHtml(typeName)}</h3>`;
    (ex.items || []).forEach((item) => {
      const words = (item.testsWords || []).join(", ");
      h += `<p class="ex-item"><span class="item-num">(${item.number})</span> <strong>${escapeHtml(item.answer || "—")}</strong>${words ? ` <span class="ans-tests-tag">[tests: ${escapeHtml(words)}]</span>` : ""}</p>`;
    });
    return h + `</div>`;
  };
  body += `<h2 class="practice-heading ws-heading">🚀 Lingo Launcher Practice</h2>`;
  (data.lingoLauncher?.practice || []).forEach((ex) => { body += exBlock(ex, "Lingo"); });
  body += `<h2 class="practice-heading ws-heading">📝 Dictation Exercises</h2>`;
  (data.dictation?.exercises || []).forEach((ex) => { body += exBlock(ex, "Dictation"); });

  return `
    <div class="worksheet answer-key-sheet density-${escapeHtml(density)}">
      <h1 class="ws-title ws-heading">📋 Teacher Answer Key</h1>
      <p class="ws-subtitle">${escapeHtml(subtitleLine(meta))}</p>
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
- GLOBAL: Parentheses with a single vocabulary word matching the answer are FORBIDDEN on D01/D02/D04/D14/D17 — this includes trailing hints like "(blend)" after a gap`;

const LINGO_EXERCISE_FORMAT_RULES = `
LINGO PRACTICE FORMATS (follow exactly per typeId):
- L01 Gap fill: wordList = answer words SHUFFLED (~5 items). Each prompt = NEW sentence at class level with ________________ gap WHERE the answer word belongs (middle or end — never paste vocab collocation; never copy dictation sentences). Remove the answer word from the sentence — only the gap
- L02 Circle best word: wordList MUST be [] empty; each prompt = sentence with ( optionA / optionB ) choices IN the sentence; answer = correct option. Use sentences that do NOT appear anywhere in dictation
- L03 Synonym match: wordList MUST be [] empty — NO word bank row. ONLY create items for vocabulary words that HAVE synonyms listed in the table. Each prompt = "TARGET ( synonymFromTable / distractor / distractor )"; answer = one of that word's listed synonyms from the vocabulary table — do NOT invent synonyms for words without synonyms in the table
- L04 Opposite pairs: wordList MUST be [] empty. ONLY for words WITH antonyms in the table. Each prompt = "TARGET ( antonymFromTable / distractor / distractor )"; answer = listed antonym — do NOT invent antonyms
- L05 Collocation match: wordList = ONLY headwords in THIS exercise (shuffled, ~5). Each prompt = NEW phrase/sentence with gap where the headword goes — use collocation as a pattern only, NOT as the prompt text. GOOD: "She keeps her clothes in the ________________" answer drawer (not copying "open the drawer" from the table). Gap position must match natural word order
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
- Number items (1), (2)... in each exercise
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

function buildUserPrompt(form, plan, teacherHints) {
  let vocabSection = "";
  if (form.inputMode === "structured" && form.vocabRows?.length) {
    const n = form.vocabRows.length;
    vocabSection = `STRUCTURED VOCABULARY (${n} words — vocabulary array MUST have exactly ${n} items, numbered 1–${n}):
Each row includes fieldToggles — only populate fields the teacher enabled. Respect teacher values for derivatives, synonyms, antonyms.
If synonyms/antonyms toggles are OFF for a word, leave synonyms/antonyms arrays EMPTY — do not fill them.
For enabled optional fields (derivatives/synonyms/antonyms), add content only when natural for the level; leave empty arrays when none fit.
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

async function callDeepSeek(apiKey, systemPrompt, userPrompt, retryHint) {
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
@page { size: A4; margin: 15mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
.worksheet {
  background: #fff;
  max-width: 210mm;
  margin: 0 auto;
  padding: 0;
  font-family: ${WORKSHEET_FONTS.css};
  font-size: 11pt;
  color: #000;
}
.worksheet.density-compact { font-size: 9.8pt; }
.worksheet.density-compact .ws-title { font-size: 17pt; }
.worksheet.density-compact .ex-heading { font-size: 11pt; }
.worksheet.density-compact .ex-item { margin: 0.18rem 0; font-size: 9.8pt; line-height: 1.32; }
.worksheet.density-compact .vocab-table td { padding: 0.25rem 0.45rem; }
.worksheet.density-compact .vocab-coll, .worksheet.density-compact .vocab-deriv, .worksheet.density-compact .vocab-related { font-size: 9.3pt; }
.worksheet.density-comfortable { font-size: 12pt; }
.worksheet.density-comfortable .ex-item { margin: 0.42rem 0; font-size: 12pt; line-height: 1.55; }
.ws-title { font-size: 20pt; font-weight: 700; margin: 0 0 0.25rem; line-height: 1.2; }
.ws-heading {
  font-family: ${WORKSHEET_FONTS.css};
  color: #1a6b5c;
  font-weight: 700;
}
.ws-subtitle { margin: 0 0 0.85rem; font-size: 11pt; color: #444; }
.ws-student-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.4rem 0.6rem;
  margin: 0 0 0.9rem;
  border: 1px solid #888;
  border-radius: 4px;
  font-size: 9.8pt;
  color: #222;
}
.vocab-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; border: 1px solid #000; }
.vocab-table td {
  vertical-align: top;
  width: 50%;
  padding: 0.4rem 0.6rem;
  border: 1px solid #000;
}
.vocab-head { font-weight: normal; margin-bottom: 0.15rem; }
.vocab-coll, .vocab-deriv, .vocab-related { font-size: 10.5pt; }
.practice-heading { font-size: 14pt; margin: 1rem 0 0.5rem; }
.ex-block { margin-bottom: 1.15rem; }
.ex-block:last-child { margin-bottom: 0; }
.ex-heading { font-size: 12.5pt; font-weight: 700; margin: 0 0 0.2rem; color: #1a6b5c; }
.ex-instruction {
  margin: 0 0 0.4rem;
  font-size: 8.5pt;
  font-weight: 400;
  color: #777;
  line-height: 1.35;
}
.ex-item { margin: 0.3rem 0; font-size: 11pt; color: #000; line-height: 1.45; page-break-inside: avoid; }
.item-num { font-weight: bold; margin-right: 0.25rem; }
.stem-word { font-weight: 700; }
.d08-wrong { font-weight: 700; }
.word-list { margin: 0.35rem 0 0.5rem; font-weight: bold; }
.match-defs { margin: 0.35rem 0 0.75rem; }
.match-defs-heading { font-weight: 600; font-size: 10pt; margin: 0 0 0.25rem; }
.match-def-line { margin: 0.15rem 0; font-size: 10.5pt; line-height: 1.35; }
.word-bank { width: 100%; border-collapse: collapse; margin: 0.35rem 0 0.5rem; table-layout: fixed; }
.word-bank td {
  border: 1px solid #999;
  padding: 0.2rem 0.35rem;
  text-align: center;
  font-weight: bold;
  font-size: 9pt;
  word-break: break-word;
}
.ans-tests-tag { color: #666; font-size: 9pt; margin-left: 0.35rem; }
.teacher-ans-pill { display: none; }
`;

function buildWorksheetPrintDocument(html, title) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${WORKSHEET_PRINT_CSS}</style>
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
  const printDoc = buildWorksheetPrintDocument(html, title);

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
    win.focus();
    win.print();
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


async function buildLingoDocx(data) {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, BorderStyle } = await loadDocxLibs();
  const W = (text, opts = {}) => wTextRun(TextRun, text, opts);
  const meta = data.meta || {};
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
  };
  const children = [
    new Paragraph({ children: [W("🚀 Lingo Launcher", { bold: true, size: 40, color: "1A6B5C" })] }),
    new Paragraph({ children: [W(subtitleLine(meta), { size: 24 })] }),
  ];
  if (meta.includeStudentHeader) {
    children.push(new Paragraph({
      children: [W(`Name: ___________________________    Date: _______________    Class: ${meta.classLabel || "_______"}    Score: ____ / ____`, { size: 20, color: "333333" })],
    }));
  }
  children.push(new Paragraph({ text: "" }));

  const vocab = normalizeVocabulary(data.lingoLauncher.vocabulary);
  const vocabToCell = (v) => {
    if (!v) return new TableCell({ borders: cellBorders, children: [new Paragraph("")] });
    const lines = [
      `${v.number}. ${v.english}${v.type?.trim() ? ` (${v.type.trim()})` : ""}${v.greek ? " - " + v.greek : ""} ${v.emojis || ""}`.trim(),
      v.collocation || "",
    ];
    normalizeDerivativesList(v.derivatives).forEach((d) => {
      const line = formatDerivativeLine(d);
      if (line) lines.push(`> ${line}`);
    });
    const syn = normalizeWordList(v.synonyms);
    if (syn.length) lines.push(`≈ ${syn.join(", ")}`);
    const ant = normalizeAntonymList(v.antonyms);
    if (ant.length) lines.push(`≠ ${ant.map(formatAntonymLine).join(", ")}`);
    return new TableCell({
      borders: cellBorders,
      children: lines.filter(Boolean).map((l) => new Paragraph({ children: [W(l, { size: 22 })] })),
    });
  };
  const tableRows = buildVocabTablePairs(vocab).map(
    ({ left, right }) => new TableRow({ children: [vocabToCell(left), vocabToCell(right)] })
  );
  children.push(new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: cellBorders,
  }));
  children.push(new Paragraph({ children: [W("Let's Practice! ✍️", { bold: true, size: 28, color: "1A6B5C" })] }));

  data.lingoLauncher.practice.forEach((ex) => {
    children.push(new Paragraph({ children: [W(`Exercise ${ex.number}`, { bold: true, size: 26, color: "1A6B5C" })] }));
    const instr = getStudentExerciseInstruction(ex);
    if (instr) {
      children.push(new Paragraph({ children: [W(instr, { size: 17, color: "777777" })] }));
    }
    if (ex.wordList?.length) {
      children.push(new Paragraph({ children: [W(ex.wordList.join("  ·  "), { bold: true, size: 22 })] }));
    }
    ex.items.forEach((item) => {
      children.push(new Paragraph({ children: [W(`(${item.number}) ${item.prompt}`, { size: 22 })] }));
    });
    children.push(new Paragraph({ text: "" }));
  });

  const doc = new Document({ styles: worksheetDocxStyles(), sections: [{ children }] });
  return Packer.toBlob(doc);
}

async function buildDictationDocx(data) {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } = await loadDocxLibs();
  const W = (text, opts = {}) => wTextRun(TextRun, text, opts);
  const meta = data.meta || {};
  const children = [
    new Paragraph({ children: [W("📝 Dictation", { bold: true, size: 40, color: "1A6B5C" })] }),
    new Paragraph({ children: [W(subtitleLine(meta), { size: 24 })] }),
  ];
  if (meta.includeStudentHeader) {
    children.push(new Paragraph({
      children: [W(`Name: ___________________________    Date: _______________    Class: ${meta.classLabel || "_______"}    Score: ____ / ____`, { size: 20, color: "333333" })],
    }));
  }
  children.push(new Paragraph({ text: "" }));

  data.dictation.exercises.forEach((ex) => {
    children.push(new Paragraph({ children: [W(`Exercise ${ex.number}`, { bold: true, size: 26, color: "1A6B5C" })] }));
    const instr = getStudentExerciseInstruction(ex);
    if (instr) {
      children.push(new Paragraph({ children: [W(instr, { size: 17, color: "777777" })] }));
    }
    if (ex.wordBank?.length) {
      if (ex.typeId === "D13") {
        children.push(new Paragraph({ children: [W("Definitions:", { bold: true, size: 22 })] }));
        ex.wordBank.forEach((entry) => {
          children.push(new Paragraph({ children: [W(entry, { size: 22 })] }));
        });
      } else {
        const rows = chunkWordBank(ex.wordBank);
        children.push(new Table({
          rows: rows.map((row) => new TableRow({
            children: row.map((w) => new TableCell({ children: [new Paragraph({ children: [W(w)] })] })),
          })),
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
      }
    }
    ex.items.forEach((item) => {
      const line = formatDictationItemPlain(item, ex.typeId);
      if (ex.typeId === "D02" && item.stem) {
        children.push(new Paragraph({
          children: [
            W(`(${item.number}) ${item.prompt}  `, { size: 22 }),
            W(String(item.stem).toUpperCase(), { bold: true, size: 22 }),
          ],
        }));
      } else if (ex.typeId === "D08" && /\[[^\]]+\]/.test(item.prompt || "")) {
        // Bold the [wrong word], matching the on-screen / PDF worksheet.
        const runs = [W(`(${item.number}) `, { size: 22 })];
        String(item.prompt).split(/(\[[^\]]+\])/).filter(Boolean).forEach((part) => {
          runs.push(W(part, { size: 22, bold: /^\[[^\]]+\]$/.test(part) }));
        });
        children.push(new Paragraph({ children: runs }));
      } else {
        children.push(new Paragraph({ children: [W(`(${item.number}) ${line}`, { size: 22 })] }));
      }
    });
    children.push(new Paragraph({ text: "" }));
  });

  const doc = new Document({ styles: worksheetDocxStyles(), sections: [{ children }] });
  return Packer.toBlob(doc);
}

async function buildAnswerKeyDocx(data) {
  const { Document, Packer, Paragraph, TextRun } = await loadDocxLibs();
  const W = (text, opts = {}) => wTextRun(TextRun, text, opts);
  const meta = data.meta;
  const children = [
    new Paragraph({ children: [W("📋 Answer Key", { bold: true, size: 32 })] }),
    new Paragraph({ children: [W(subtitleLine(meta), { size: 24 })] }),
    new Paragraph({ text: "" }),
  ];

  children.push(new Paragraph({ children: [W("— Lingo Launcher —", { bold: true })] }));
  data.lingoLauncher.practice.forEach((ex) => {
    children.push(new Paragraph({ children: [W(`Exercise ${ex.number}`, { bold: true })] }));
    ex.items.forEach((item) => {
      children.push(new Paragraph({
        children: [W(`(${item.number}) ${item.answer}`)],
      }));
    });
  });

  children.push(new Paragraph({ children: [W("— Dictation —", { bold: true })] }));
  data.dictation.exercises.forEach((ex) => {
    children.push(new Paragraph({ children: [W(`Exercise ${ex.number}`, { bold: true })] }));
    ex.items.forEach((item) => {
      const words = (item.testsWords || []).join(", ");
      children.push(new Paragraph({
        children: [W(`(${item.number}) ${item.answer}${words ? "  [tests: " + words + "]" : ""}`)],
      }));
    });
  });

  const doc = new Document({ styles: worksheetDocxStyles(), sections: [{ children }] });
  return Packer.toBlob(doc);
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
  return `Unit ${meta.unit}, p.${meta.pageRange}`;
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

async function autofillVocabulary(apiKey, profileId, wordRequests) {
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

  const allFields = VOCAB_AUTOFILL_FIELDS;
  const schemaFields = allFields.map((k) => `"${k}": string`).join(", ");

  const systemPrompt = `You enrich English vocabulary rows for Greek ESL teachers. Return valid json only.

${getProfilePromptBlock(profileId)}
${VOCAB_SENSE_DISAMBIGUATION_RULES}

Schema: { "items": [ { "english": string, ${schemaFields} } ] }

Rules:
- One item per input word; "english" must match the input exactly
- Each word has "fill" (fields to generate) and optional "provided" (teacher hints — LOCKED, copy exactly)
- Return ONLY keys listed in "fill" for that word, PLUS echo every key in "provided" unchanged
- type: standard abbreviation n., v., adj., adv., phr. v., prep., conj., pron., det., interj. Must match the locked sense from provided type/greek
- greek: natural Greek for students at ${profile.label} level — must match provided greek if given, or match provided type
- emojis: prefer exactly 1 relevant emoji for THIS sense; use 2 only if needed; never 3+
- collocation: short natural phrase (3–7 words) using the word in the locked sense — not a dictionary definition
- derivatives: comma-separated "word (type) - Greek". Leave "" if none suit ${profile.cefr} — do not force. Max ${profile.maxDerivatives}.
- synonyms / antonyms: comma-separated; antonyms as "word - Greek". Leave "" if none fit.

Examples:
- { "english": "seal", "provided": { "type": "v." }, "fill": ["greek","emojis","collocation"] } → type "v.", greek "σφραγίζω", emojis about closing/sealing, collocation "seal an envelope"
- { "english": "seal", "provided": { "greek": "φώκια" }, "fill": ["type","emojis","collocation"] } → type "n.", emojis 🦭, collocation about the animal
- { "english": "seal", "provided": { "type": "v.", "greek": "σφραγίζω" }, "fill": ["emojis","collocation"] } → echo type and greek exactly; fill emojis/collocation for the verb sense only`;

  const userPrompt = `Return json items for these words. Respect "fill" and "provided" on each:\n${JSON.stringify(requests, null, 2)}`;

  const result = await callDeepSeek(apiKey, systemPrompt, userPrompt);
  const items = result.items || [];
  const byEnglish = {};
  items.forEach((it) => {
    if (it.english) byEnglish[it.english.toLowerCase()] = it;
  });
  return requests.map((r) => {
    const item = byEnglish[r.english.toLowerCase()] || { english: r.english };
    const merged = { english: r.english };
    for (const key of VOCAB_AUTOFILL_FIELDS) {
      if (r.provided[key]) merged[key] = r.provided[key];
      else if (r.fill.includes(key) && item[key] != null) merged[key] = item[key];
    }
    return merged;
  });
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

    // Extract emojis if any
    const foundEmojis = line.match(emojiRegex) || [];
    const emojis = foundEmojis.join("");
    let cleaned = line.replace(emojiRegex, "").replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim();
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
  }
  return rows;
}

/**
 * Ready-to-use Sample Unit (Cambridge Primary Paths 3 · Unit 6, p. 118–120 · C Senior)
 * so teachers can explore the entire app, live editing, classroom mode, and exports immediately.
 */
function getSampleUnitData() {
  const vocabRows = [
    {
      english: "stay in shape", type: "phr. v.", greek: "διατηρούμαι σε φόρμα", emojis: "🏃💪",
      collocation: "exercise to stay in shape", derivatives: "", synonyms: "keep fit", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: true, antonyms: false },
    },
    {
      english: "compete", type: "v.", greek: "συναγωνίζομαι / αγωνίζομαι", emojis: "🏁🏆",
      collocation: "compete for a gold medal", derivatives: "competition (n.) - αγώνας / διαγωνισμός", synonyms: "", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: true, synonyms: false, antonyms: false },
    },
    {
      english: "sequence", type: "n.", greek: "σειρά / αλληλουχία", emojis: "🔢",
      collocation: "follow a logical sequence", derivatives: "", synonyms: "order", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: true, antonyms: false },
    },
    {
      english: "inspiration", type: "n.", greek: "έμπνευση", emojis: "✨💡",
      collocation: "be a great inspiration", derivatives: "inspiring (adj.) - εμπνευστικός, inspired (adj.) - εμπνευσμένος", synonyms: "", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: true, synonyms: false, antonyms: false },
    },
    {
      english: "introduce", type: "v.", greek: "συστήνω / παρουσιάζω", emojis: "👋🤝",
      collocation: "introduce my new coach", derivatives: "", synonyms: "", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
    },
    {
      english: "disability", type: "n.", greek: "αναπηρία", emojis: "♿",
      collocation: "overcome a physical disability", derivatives: "disabled (adj.) - ανάπηρος / με αναπηρία", synonyms: "", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: true, synonyms: false, antonyms: false },
    },
    {
      english: "limb", type: "n.", greek: "άκρο σώματος (χέρι / πόδι)", emojis: "🦾",
      collocation: "an artificial limb", derivatives: "", synonyms: "", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
    },
    {
      english: "track", type: "n.", greek: "στίβος / πίστα αγώνων", emojis: "🏟️",
      collocation: "run around the track", derivatives: "", synonyms: "", antonyms: "",
      fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
    },
  ];

  const form = {
    bookTitle: "Cambridge Primary Paths 3",
    unit: "6",
    pageRange: "118–120",
    classProfile: "C_SENIOR",
    inputMode: "structured",
    vocabRows,
    freeform: "",
  };

  const plan = {
    dictationExerciseCount: 4,
    dictationTypes: ["D01", "D02", "D03", "D06"],
    lingoTypes: ["L01", "L02"],
    lingoPracticeCount: 2,
    signature: "D01+D02+D03+D06|L01+L02",
    exerciseMode: "custom",
  };

  const rawData = {
    meta: buildWorksheetMeta(form, "C_SENIOR"),
    generationPlan: plan,
    lingoLauncher: {
      vocabulary: vocabRows.map((r, i) => ({
        number: i + 1,
        english: r.english,
        type: r.type,
        greek: r.greek,
        emojis: r.emojis,
        collocation: r.collocation,
        derivatives: normalizeDerivativesList(r.derivatives),
        synonyms: normalizeWordList(r.synonyms),
        antonyms: normalizeAntonymList(r.antonyms),
      })),
      practice: [
        {
          number: 1,
          typeId: "L01",
          instruction: "",
          wordList: ["sequence", "track", "stay in shape", "compete"],
          items: [
            { number: 1, prompt: "You need to run four times around the ________________ to finish the mile.", answer: "track" },
            { number: 2, prompt: "I try to eat healthy food and go swimming to ________________.", answer: "stay in shape" },
            { number: 3, prompt: "Every summer, young swimmers ________________ in the national finals.", answer: "compete" },
            { number: 4, prompt: "The lights on the board flashed in a special ________________.", answer: "sequence" },
          ],
        },
        {
          number: 2,
          typeId: "L02",
          instruction: "",
          wordList: [],
          items: [
            { number: 1, prompt: "My coach is a great (track / inspiration) to everyone on our team.", answer: "inspiration" },
            { number: 2, prompt: "Let me (compete / introduce) you to our new classmate from Athens.", answer: "introduce" },
            { number: 3, prompt: "An arm or a leg is called a (sequence / limb) of the body.", answer: "limb" },
            { number: 4, prompt: "The Paralympic Games celebrate athletes with a physical (shape / disability).", answer: "disability" },
          ],
        },
      ],
    },
    dictation: {
      exercises: [
        {
          number: 1,
          typeId: "D01",
          instruction: "",
          wordBank: ["track", "introduce", "limb", "sequence", "compete"],
          items: [
            { number: 1, prompt: "To tell someone another person's name when they meet: ________", answer: "introduce", testsWords: ["introduce"] },
            { number: 2, prompt: "A path or stadium ring used for running races: ________", answer: "track", testsWords: ["track"] },
            { number: 3, prompt: "To take part in a race or sports contest: ________", answer: "compete", testsWords: ["compete"] },
            { number: 4, prompt: "A particular order in which events or numbers follow each other: ________", answer: "sequence", testsWords: ["sequence"] },
            { number: 5, prompt: "An arm or a leg of a person: ________", answer: "limb", testsWords: ["limb"] },
          ],
        },
        {
          number: 2,
          typeId: "D02",
          instruction: "",
          wordBank: [],
          items: [
            { number: 1, prompt: "Did your school win the basketball ________________?", stem: "COMPETE", answer: "competition", testsWords: ["compete", "competition"] },
            { number: 2, prompt: "The stadium has special ramps for ________________ visitors.", stem: "DISABILITY", answer: "disabled", testsWords: ["disability", "disabled"] },
            { number: 3, prompt: "Her story was very ________________ for the young players.", stem: "INSPIRATION", answer: "inspiring", testsWords: ["inspiration", "inspiring"] },
            { number: 4, prompt: "We all felt ________________ after watching the champion speak.", stem: "INSPIRATION", answer: "inspired", testsWords: ["inspiration", "inspired"] },
          ],
        },
        {
          number: 3,
          typeId: "D03",
          instruction: "",
          wordBank: [],
          items: [
            { number: 1, prompt: "Athletes train every afternoon to ________. (introduce / stay in shape / limb)", answer: "stay in shape", testsWords: ["stay in shape"] },
            { number: 2, prompt: "He uses a modern artificial ________ to help him run fast. (sequence / limb / track)", answer: "limb", testsWords: ["limb"] },
            { number: 3, prompt: "A physical ________ did not stop her from winning gold. (track / disability / sequence)", answer: "disability", testsWords: ["disability"] },
            { number: 4, prompt: "The runner gave us great ________ before the match. (limb / inspiration / track)", answer: "inspiration", testsWords: ["inspiration"] },
          ],
        },
        {
          number: 4,
          typeId: "D06",
          instruction: "",
          wordBank: [],
          items: [
            { number: 1, prompt: "stay in shape: (introduce / keep fit / compete)", answer: "keep fit", testsWords: ["stay in shape", "keep fit"] },
            { number: 2, prompt: "sequence: (limb / order / track)", answer: "order", testsWords: ["sequence", "order"] },
          ],
        },
      ],
    },
  };

  const data = normalizeWorksheetExercises(rawData);
  return { form, plan, data };
}

export {
  CLASS_PROFILES,
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
  getSampleUnitData,
  WORKSHEET_PRINT_CSS,
};

