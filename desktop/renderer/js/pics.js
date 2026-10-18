/* Illustrated pictures (the picture set, art-brief/pictures → assets/pics) that replace emoji.
 * A picture travels through the app's existing emoji fields as a token "@<id>" (e.g. "@w-house"), so lessons,
 * games and pops need no new plumbing: the shared picture() renderer turns tokens into <img>.
 * Phases 0–3 are bundled (assets/pics/<id>.webp); the rest of the word bank (manifest.remote) streams from R2
 * (remote.json → picsBase) and the browser cache keeps what has been seen. Missing pictures simply hide. */
import { stem } from "../lesson/schema.js";

let M = { words: {}, nouns: {}, characters: {}, ui: {} };
let byEnglish = new Map();
let remote = new Set();
let remoteBase = "";

export const PIC_TOKEN = /@((?:w|c|ui)-[a-z0-9][a-z0-9-]*)/g;
const isToken = (s) => /^@(?:w|c|ui)-[a-z0-9][a-z0-9-]*$/.test(String(s || "").trim());
const tok = (file) => (file ? `@${String(file).replace(/\.webp$/, "")}` : "");

// Lingo Live: phone avatars and team mascots are emoji on the wire; the projector draws their pictures.
const UI_BY_EMOJI = {
  "🦊": "ui-avatar-fox", "🐼": "ui-avatar-panda", "🐯": "ui-avatar-tiger", "🦁": "ui-avatar-lion", "🐸": "ui-avatar-frog",
  "🐵": "ui-avatar-monkey", "🐨": "ui-avatar-koala", "🐰": "ui-avatar-rabbit", "🐻": "ui-avatar-bear", "🐧": "ui-avatar-penguin",
  "🦄": "ui-avatar-unicorn", "🐙": "ui-avatar-octopus", "🐢": "ui-avatar-turtle", "🦉": "ui-avatar-owl", "🐝": "ui-avatar-bee",
  "🐬": "ui-avatar-dolphin",
};
const TEAM_BY_EMOJI = { "🚀": "ui-team-rockets", "🐯": "ui-team-tigers", "🐬": "ui-team-dolphins", "🐉": "ui-team-dragons" };

/** Load the manifest (bundled) and the R2 base. Safe to call when no pictures exist. */
export async function initPics() {
  try {
    const res = await fetch("./assets/pics/manifest.json", { cache: "no-cache" });
    if (res.ok) M = { words: {}, nouns: {}, characters: {}, ui: {}, ...(await res.json()) };
  } catch { /* no pictures: emoji everywhere */ }
  remote = new Set(M.remote || []);
  byEnglish = new Map();
  for (const [k, f] of Object.entries(M.words)) { const e = k.split("|")[0]; if (!byEnglish.has(e)) byEnglish.set(e, f); }
  try {
    const r = await fetch("./assets/remote.json", { cache: "no-cache" }).then((x) => (x.ok ? x.json() : {}));
    remoteBase = r.picsBase || "";
  } catch { /* offline: bundled pictures still show */ }
  // A picture that can't load (offline, not uploaded yet) disappears instead of showing a broken image.
  if (!initPics.wired && typeof document !== "undefined") {
    initPics.wired = true;
    document.addEventListener("error", (e) => { if (e.target?.classList?.contains("vpic")) e.target.classList.add("vpic-off"); }, true);
  }
  return Object.keys(M.words).length;
}

// Word-bank abbreviations → the part-of-speech names the picture set uses (scripts/art/picture-jobs.mjs).
const TYPE = { "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb", "phr.": "phrase", "phr. v.": "phrasal verb", "prep.": "preposition", "pron.": "pronoun" };
export const picType = (t) => TYPE[String(t || "").trim()] || String(t || "").trim();

/** Token for a word ("house", "n."), or "" when it has no picture. Falls back to any part of speech. */
export function picForWord(english, type) {
  const e = String(english || "").trim().toLowerCase();
  if (!e) return "";
  return tok(M.words[`${e}|${picType(type)}`] || byEnglish.get(e));
}
/** Token for a thing a line mentions (a story prop label: "apples", "Grandma's hat"). */
export function picForNoun(label) {
  const l = String(label || "").trim().toLowerCase();
  if (!l) return "";
  return tok(M.nouns[stem(l)] || M.words[`${l}|noun`]);
}
export const picForCharacter = (lessonId, castKey) => tok(M.characters[`${lessonId}|${castKey}`]);
export const picForAvatar = (emoji) => (UI_BY_EMOJI[String(emoji || "").trim()] && M.ui[UI_BY_EMOJI[String(emoji).trim()]] ? `@${UI_BY_EMOJI[String(emoji).trim()]}` : "");
export const picForTeam = (emoji) => (TEAM_BY_EMOJI[String(emoji || "").trim()] && M.ui[TEAM_BY_EMOJI[String(emoji).trim()]] ? `@${TEAM_BY_EMOJI[String(emoji).trim()]}` : "");

export function picUrl(id) {
  const f = `${id}.webp`;
  if (!remote.has(f)) return `./assets/pics/${f}`;
  return remoteBase ? `${remoteBase}${f}` : "";
}

/** <img> for a token id; sized like text (1.15em) so it drops in wherever an emoji was. */
export function picImg(id) {
  const src = picUrl(id);
  return src ? `<img class="vpic" src="${src}" alt="" draggable="false" decoding="async">` : "";
}

/** Replace every "@id" token in already-safe text/HTML with its picture. */
export const withPics = (html) => String(html ?? "").replace(PIC_TOKEN, (_, id) => picImg(id));
export { isToken as isPicToken };

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** A team's mascot picture (Rockets, Tigers, Dolphins, Dragons), else its emoji. */
export const teamPic = (emoji) => { const p = picForTeam(emoji); return (p && picImg(p.slice(1))) || escHtml(emoji); };
/** A phone player's animal avatar as a picture, else the emoji they picked. */
export const avatarPic = (emoji) => { const p = picForAvatar(emoji); return (p && picImg(p.slice(1))) || escHtml(emoji); };
