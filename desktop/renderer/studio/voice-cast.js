/* Vocab Master — who speaks a listening script, and with which voice (pure).
 * Three engines read listening scripts and read-aloud dictations:
 *   natural  — Kokoro, an open voice model that runs on the computer (free, offline after one download)
 *   studio   — Gemini voices with the teacher's own Gemini key (about 2 cents per test listening)
 *   computer — the system's speechSynthesis voices (always there, robotic)
 * Speakers are cast by role (girl, boy, woman, man) from their names, so Mia and Tom never share a voice. */

export const ENGINES = {
  natural: { label: "Natural voices", note: "Free · made on this computer · about 90 MB, downloaded once" },
  studio: { label: "Studio voices (Gemini)", note: "The most lifelike · uses your Gemini key · about 2 cents per test listening" },
  computer: { label: "Computer voices", note: "Always available · sounds robotic" },
};
export const DEFAULT_ENGINE = "natural";
export const engineOf = (id) => (ENGINES[id] ? id : DEFAULT_ENGINE);

const GIRLS = /^(mia|anna|eleni|maria|sophie|sofia|emma|lily|lucy|kate|katie|amy|lena|zoe|olivia|ella|chloe|sara|sarah|helen|nina|daisy|enitan|grace|ruby|alice|jenny|jane|mary|rosie|holly|eva|ava|isla|poppy|freya|layla|amira|fatima|yasmin|katerina|georgia|christina|ioanna|despina|elena)\b/i;
const BOYS = /^(tom|leo|nick|ben|sam|jack|max|alex|dimitris|george|nikos|peter|paul|tim|timmy|bob|harry|leon|kostas|james|oliver|charlie|oscar|noah|lucas|adam|daniel|david|jake|joe|josh|luke|ryan|kevin|omar|ali|yannis|giorgos|andreas|petros|stefanos|chris|mike|matt)\b/i;
const WOMEN = /^(mum|mom|mother|grandma|granny|gran|mrs|miss|ms|aunt|auntie|lady|woman|teacher|madam|doctor|dr|nurse|waitress|shop ?assistant|guide|librarian|announcer|presenter)\b/i;
const MEN = /^(dad|daddy|father|grandpa|granddad|grandad|mr|sir|uncle|man|waiter|farmer|policeman|captain|coach|chef|pilot|driver)\b/i;
// A teacher, doctor, guide… is cast as a woman unless the name says otherwise; the second adult in a dialogue is a man.

/** "girl" | "boy" | "woman" | "man" from a speaker name ("Mia", "Mrs Brown", "Dad", "Teacher"). */
export function speakerRole(name = "") {
  const n = String(name).trim().replace(/[.:]/g, "");
  if (MEN.test(n)) return "man";
  if (/^(mrs|miss|ms|madam)\b/i.test(n)) return "woman";
  if (WOMEN.test(n)) return "woman";
  if (GIRLS.test(n)) return "girl";
  if (BOYS.test(n)) return "boy";
  return "";
}

/* Voices per role, best first. Kokoro grades (A best): af_heart A, af_bella A-, bf_emma B-, the rest C/C+.
 * British voices where Kokoro has a good one (Cambridge English), American where the British ones are weak. */
export const KOKORO_VOICES = {
  girl: ["af_heart", "af_bella", "af_sarah"],
  boy: ["am_puck", "am_fenrir", "am_michael"],
  woman: ["bf_emma", "bf_isabella", "af_kore"],
  man: ["bm_george", "am_michael", "bm_fable"],
  reader: "bf_emma",
};
/* Gemini prebuilt voices: Leda, Laomedeia, Puck and Fenrir sound youthful (used for the lesson children). */
export const GEMINI_VOICES = {
  girl: ["Leda", "Laomedeia", "Autonoe"],
  boy: ["Puck", "Fenrir", "Achird"],
  woman: ["Kore", "Aoede", "Callirrhoe"],
  man: ["Charon", "Orus", "Iapetus"],
  reader: "Kore",
};
const TABLES = { natural: KOKORO_VOICES, studio: GEMINI_VOICES };

/**
 * speaker → { voice, role } for one script, every speaker a different voice.
 * Unknown names alternate girl / boy (the scripts are mostly children talking), then woman / man.
 */
export function castVoices(speakers, engine = "natural") {
  const table = TABLES[engine] || KOKORO_VOICES;
  const list = [...new Set((speakers || []).map((s) => String(s || "Narrator").trim() || "Narrator"))];
  const roles = list.map(speakerRole);
  let unknown = 0;
  const used = new Set();
  const cast = {};
  list.forEach((sp, i) => {
    let role = roles[i];
    if (!role) {
      if (/^(narrator|speaker)\b/i.test(sp) && list.length === 1) role = "reader";
      else role = ["girl", "boy", "woman", "man"][unknown++ % 4];
    }
    const pool = role === "reader" ? [table.reader, ...table.woman] : table[role];
    const others = Object.values(table).flat().filter((v) => typeof v === "string");
    const voice = pool.find((v) => !used.has(v)) || others.find((v) => !used.has(v)) || pool[0];
    used.add(voice);
    cast[sp] = { voice, role };
  });
  return cast;
}

/** Kokoro speaking speed by class (younger = slower). Kokoro sounds odd below ~0.8. */
export const NATURAL_SPEED = { A_SENIOR: 0.84, B_SENIOR: 0.88, C_SENIOR: 0.93, D_SENIOR: 0.97, E_SENIOR: 1 };
export const naturalSpeed = (levelId, slow = false) => Math.max(0.78, (NATURAL_SPEED[levelId] || 0.92) - (slow ? 0.08 : 0));

/** Delivery note for Gemini, per class (Gemini reads the style; it is never spoken). */
export function studioStyle(levelId, role = "") {
  const pace = { A_SENIOR: "slowly and very clearly", B_SENIOR: "slowly and clearly", C_SENIOR: "clearly, a little slower than normal", D_SENIOR: "clearly, at a natural pace", E_SENIOR: "naturally" }[levelId] || "clearly";
  const who = { girl: "a friendly child", boy: "a friendly child", woman: "a warm adult", man: "a warm adult", reader: "a kind English teacher" }[role] || "a friendly speaker";
  return `British English, ${who}, speaking ${pace} for young learners of English. Natural and lively, never theatrical.`;
}

/** Text as it should be spoken: gaps read as "blank", stage directions and emoji dropped. */
export function spokenText(text = "") {
  return String(text)
    .replace(/_{2,}/g, " blank ")
    .replace(/\[[^\]]*\]|\([^)]*(laugh|sigh|pause|music|sound)[^)]*\)/gi, " ")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

/** Dictation sentence with the punctuation said aloud ("…, comma, …, full stop."). */
export function withPunctuation(s) {
  return String(s).replace(/,/g, ", comma,").replace(/\?\s*$/, ", question mark.").replace(/\.\s*$/, ", full stop.").replace(/!\s*$/, ", exclamation mark.");
}

/** Stable cache key for one spoken clip. */
export function clipKey(engine, voice, speed, text) {
  const s = `${engine}|${voice}|${Number(speed || 1).toFixed(2)}|${text}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return `${engine}-${voice}-${h1.toString(36)}${h2.toString(36)}-${s.length}`;
}
