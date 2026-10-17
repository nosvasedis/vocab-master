/* The drafting prompt for one curated lesson. Kept separate so it can be tuned without touching the runner. */
import { BACKDROPS, CHECK_KINDS, PRACTICE_GAMES, FOCUS_RANGE, MAX_SENTENCE_WORDS } from "../../../desktop/renderer/lesson/schema.js";

const SECTION_ROLE = {
  BQ: "the Big Question opener: spark curiosity about the unit's question, meet the cast, and teach the Big Question words. Short and energetic (10–15 minutes).",
  A: "Part A: the first main vocabulary lesson of the unit, built around a short illustrated story or real-world situation (20–25 minutes).",
  B: "Part B: the second main vocabulary lesson, building on Part A with a new story or situation and recycling a few Part A ideas (20–25 minutes).",
};

export function buildSystemPrompt() {
  return `You are an award-winning ESL curriculum designer and children's author. You write curated, joyful vocabulary lessons for Greek-speaking children (ages 9–14) using Cambridge Primary Path. The lessons are taught on a classroom projector by a teacher, with a friendly owl mascot called "Lingo" narrating.

Principles:
- Comprehensible input first: short, natural sentences; the target word in a vivid, memorable context; repetition across scenes.
- Use British English spelling. Warm, inclusive, positive. No brands, no violence, no stereotypes.
- Never put Greek in English prompts or answers; Greek appears only in "greekHint" (a short Greek memory tip, optional).
- Every focus word must appear in the story or its examples AND be tested by at least one check item.
- Distractors are plausible words of the SAME part of speech, never the answer, never synonyms that would also be correct.
- Lines are spoken aloud by a voice actor: write them to sound natural when read aloud (no emojis, no symbols, no stage directions inside "text").
- Output ONLY one JSON object exactly matching the requested schema.`;
}

/**
 * @param {{ book: object, unit: number, unitInfo: object, section: string, profile: object, words: object[], prevTitles?: string[] }} o
 */
export function buildUserPrompt({ book, unit, unitInfo, section, profile, words, prevTitles = [] }) {
  const [minF, maxF] = FOCUS_RANGE[section];
  const maxWords = MAX_SENTENCE_WORDS[profile.id] || 14;
  const rows = words.map((w) => `${w.id} | ${w.english} | ${w.type || ""} | ${w.greek || ""} | ${w.example || ""}`).join("\n");
  return `Write lesson ${book.id}-U${unit}-${section} for "${book.title}" (${book.cefr}).

UNIT ${unit}: "${unitInfo.title}"  (Big Question)
Non-fiction reading: "${unitInfo.nonfiction || "-"}" · Fiction reading: "${unitInfo.fiction || "-"}"
CLASS: ${profile.label}, CEFR ${profile.cefr}, age ${profile.ageRange}. Max ${maxWords} words per sentence.
THIS LESSON IS ${SECTION_ROLE[section]}
${prevTitles.length ? `Other lessons in this unit are titled: ${prevTitles.join("; ")} — don't repeat their story.` : ""}

CANDIDATE WORDS (id | english | type | greek | coursebook example):
${rows}

Choose ${minF}–${maxF} FOCUS words from the candidates (by id) — the most useful, picturable and story-friendly ones${section === "BQ" ? " (include the Big Question words that children need to talk about the question)" : ""}. Prefer single words/phrases a child can picture; skip classroom meta-words (e.g. "oracy", "presentation") unless the section is tiny.

SCENE RECIPE (in this order):
1. "hook": 3–5 narration lines by lingo that pull children into the topic + one "question" to the class (open, personal, easy).
2. "reveal": all focus word ids in teaching order; greek "after".
3. ${section === "BQ" ? '"story" (optional, 2–3 panels) OR skip' : '"story": 4–6 comic panels. Each panel has a backdrop, 1–3 characters, an optional caption (narrator) and 1–3 speech lines. Use focus words naturally and list them in "highlight".'}
4. "check": ${Math.max(5, minF)}–10 items covering EVERY focus word; mix kinds: ${CHECK_KINDS.join(", ")}.
   - pickPicture/listen: prompt says or asks for the word; options are 3–4 focus WORD IDS; answer = index of the right id.
   - gap: prompt is a sentence with "____" where the word goes; options are 3–4 English words (answer + distractors).
   - trueFalse: prompt is a statement about the story or a word meaning; options ["True","False"].
   - oddOneOut: options are 4 English words; explain why.
   Every item has "wordId" (the focus word it tests) and an "explain" line (one friendly sentence).
5. "practice": one game id from ${Object.keys(PRACTICE_GAMES).join(", ")} that suits the words (memory for picturable nouns, spelling for short words, quiz for mixed, taboo for older classes). Add one intro line.
6. "speak": a pair-work speaking task using the words, with 2–3 sentence "frames" containing "___", "partner": true, "timerSec" 45–90, and a "model" answer.
7. "recap": 2–3 celebratory lines, a "badge" {emoji, name}, and 2 "exitTicket" questions.

CAST: always "lingo" (narrator owl). Add 1–2 child or adult characters fitting the unit (e.g. from the fiction reading "${unitInfo.fiction || ""}"), each { "name", "emoji", "persona" } where persona is a short voice direction (e.g. "cheerful 9-year-old boy, curious").

BACKDROPS (use only these keys): ${BACKDROPS.join(", ")}.

IDS: scene ids are short words ("hook","reveal","story","check","practice","speak","recap"). Line ids are unique inside their scene ("l1","l2"..., panels "p1"..., speech "p1a","p1b", items "c1"..., prompts "c1q", explains "c1e").

Return JSON:
{
  "title": "short catchy lesson title",
  "setting": "<backdrop key>",
  "durationMin": ${section === "BQ" ? 12 : 22},
  "cast": { "lingo": { "name": "Lingo", "emoji": "🦉", "persona": "warm, playful owl teacher" }, "<id>": { "name": "...", "emoji": "...", "persona": "..." } },
  "focusWords": [ { "wordId": "<id>", "emoji": "<one emoji that best pictures it>", "kidDefinition": "simple English definition, max 10 words", "examples": ["1–2 new sentences using the word"], "distractors": ["3 same-type words"], "greekHint": "optional short Greek tip" } ],
  "scenes": [
    { "id": "hook", "type": "hook", "backdrop": "<key>", "lines": [ { "id": "l1", "text": "..." } ], "question": { "id": "q", "text": "..." } },
    { "id": "reveal", "type": "reveal", "words": ["<id>", "..."], "greek": "after" },
    { "id": "story", "type": "story", "title": "...", "panels": [ { "id": "p1", "backdrop": "<key>", "characters": [ { "who": "<cast id>" } ], "caption": { "id": "p1c", "text": "..." }, "speech": [ { "id": "p1a", "who": "<cast id>", "text": "..." } ], "highlight": ["<id>"] } ] },
    { "id": "check", "type": "check", "items": [ { "id": "c1", "kind": "gap", "wordId": "<id>", "prompt": { "id": "c1q", "text": "..." }, "options": ["..."], "answer": 0, "explain": { "id": "c1e", "text": "..." } } ] },
    { "id": "practice", "type": "practice", "game": "memory", "lines": [ { "id": "l1", "text": "..." } ] },
    { "id": "speak", "type": "speak", "prompt": { "id": "q", "text": "..." }, "frames": ["I have a ___."], "partner": true, "timerSec": 60, "model": { "id": "m", "text": "..." } },
    { "id": "recap", "type": "recap", "lines": [ { "id": "l1", "text": "..." } ], "badge": { "emoji": "🏅", "name": "..." }, "exitTicket": [ { "id": "e1", "text": "..." } ] }
  ]
}`;
}

/** A follow-up prompt asking the model to fix validation errors in its previous JSON. */
export function buildFixPrompt(previousJson, errors) {
  return `Your lesson JSON has these problems:\n- ${errors.join("\n- ")}\n\nReturn the COMPLETE corrected JSON object (same schema), fixing every problem. Previous JSON:\n${JSON.stringify(previousJson)}`;
}
