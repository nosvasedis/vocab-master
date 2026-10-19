/* Lingo Arcade — avatars for children and crests for teams (pure data and helpers; tested in Node).
   An avatar travels as its emoji (the same field Lingo Live phones and saved classes already use); the projector draws
   its illustrated picture. A child's choice is saved with the class (`players[i].avatar`, `players[i].color`), a team's
   crest with the class too (`teamCrests[i] = { emoji, color, shape }`). Both are optional: old classes keep the
   animal and colour of their place in the list. */
import { picImg } from "../js/pics.js";

/** Every avatar: emoji (the key), the picture that draws it, a name and the shelf it sits on in the picker. */
export const AVATARS = [
  // The Lingo Live animals (the phones offer these sixteen too).
  ...[
    ["🦊", "Fox"], ["🐼", "Panda"], ["🐯", "Tiger"], ["🦁", "Lion"], ["🐸", "Frog"], ["🐵", "Monkey"], ["🐨", "Koala"], ["🐰", "Rabbit"],
    ["🐻", "Bear"], ["🐧", "Penguin"], ["🦄", "Unicorn"], ["🐙", "Octopus"], ["🐢", "Turtle"], ["🦉", "Owl"], ["🐝", "Bee"], ["🐬", "Dolphin"],
  ].map(([emoji, name]) => ({ emoji, name, pic: `ui-avatar-${name.toLowerCase()}`, shelf: "friends" })),
  // More from the picture set.
  ...[
    ["🐶", "Puppy", "dog", "friends"], ["🐷", "Pig", "pig", "friends"], ["🐴", "Horse", "horse", "friends"], ["🐑", "Sheep", "sheep", "friends"],
    ["🐘", "Elephant", "elephant", "wild"], ["🦒", "Giraffe", "giraffe", "wild"], ["🦘", "Kangaroo", "kangaroo", "wild"], ["🦛", "Hippo", "hippo", "wild"],
    ["🐊", "Crocodile", "crocodile", "wild"], ["🦌", "Deer", "deer", "wild"], ["🐿️", "Squirrel", "squirrel", "wild"], ["🐫", "Camel", "camel", "wild"],
    ["🦜", "Parrot", "parrot", "wild"], ["🦋", "Butterfly", "butterfly", "wild"], ["🐌", "Snail", "snail", "wild"],
    ["🦈", "Shark", "shark", "sea"], ["🐳", "Whale", "whale", "sea"], ["🦀", "Crab", "crab", "sea"],
    ["🦕", "Dinosaur", "dinosaur", "magic"], ["🤖", "Robot", "robot", "magic"], ["👾", "Monster", "monster", "magic"], ["👻", "Ghost", "ghost", "magic"],
    ["🦸", "Superhero", "superhero", "magic"], ["🧑‍🚀", "Astronaut", "astronaut", "magic"], ["🏴‍☠️", "Pirate", "pirate", "magic"], ["🧚", "Fairy", "fairy", "magic"],
    ["👸", "Princess", "princess", "magic"], ["🤴", "King", "king", "magic"],
  ].map(([emoji, name, word, shelf]) => ({ emoji, name, pic: `w-${word}`, shelf })),
];
export const SHELVES = [
  { id: "friends", label: "Friends" },
  { id: "wild", label: "Wild" },
  { id: "sea", label: "Sea" },
  { id: "magic", label: "Magic & heroes" },
];
// The sea animals of the first sixteen also sit on the Sea shelf in the picker.
const SEA_TOO = new Set(["🐧", "🐙", "🐢", "🐬"]);
export const onShelf = (a, shelf) => a.shelf === shelf || (shelf === "sea" && SEA_TOO.has(a.emoji));

/** The first sixteen, in order: a child without a saved choice gets the one at their place in the class list. */
export const DEFAULT_AVATARS = AVATARS.slice(0, 16).map((a) => a.emoji);
/** Bright colours that read well on a projector (ring, banner and podium colour). */
export const COLORS = ["#ff8a4c", "#7b6bff", "#22c3ee", "#34d399", "#f2a900", "#ff5e7a", "#a855f7", "#14b8a6", "#ef4444", "#3b82f6", "#84cc16", "#ec4899"];

/** Team crests: the four team mascots first, then any avatar. Shapes for the badge behind the mascot. */
export const TEAM_MASCOTS = [
  { emoji: "🚀", name: "Rockets", pic: "ui-team-rockets" },
  { emoji: "🐯", name: "Tigers", pic: "ui-team-tigers" },
  { emoji: "🐬", name: "Dolphins", pic: "ui-team-dolphins" },
  { emoji: "🐉", name: "Dragons", pic: "ui-team-dragons" },
];
export const CREST_SHAPES = ["shield", "circle", "star", "hex"];
export const DEFAULT_CRESTS = [
  { emoji: "🚀", color: "#7b6bff", shape: "shield" },
  { emoji: "🐯", color: "#ff8a4c", shape: "shield" },
  { emoji: "🐬", color: "#22c3ee", shape: "shield" },
  { emoji: "🐉", color: "#34d399", shape: "shield" },
];

const byEmoji = new Map(AVATARS.map((a) => [a.emoji, a]));
const mascotByEmoji = new Map(TEAM_MASCOTS.map((m) => [m.emoji, m]));
export const avatarInfo = (emoji) => byEmoji.get(String(emoji || "").trim()) || null;
export const isAvatar = (emoji) => byEmoji.has(String(emoji || "").trim());
const isColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ""));

/** A child's avatar and colour: their saved choice, else the one at their place in the class list. */
export function playerLook(cls, p) {
  const i = Math.max(0, cls?.players?.indexOf(p) ?? 0);
  return {
    emoji: isAvatar(p?.avatar) ? p.avatar : DEFAULT_AVATARS[i % DEFAULT_AVATARS.length],
    color: isColor(p?.color) ? p.color : COLORS[i % COLORS.length],
  };
}

/** A team's crest: the saved one (any field may be missing), else the default for its place. */
export function teamCrest(cls, i) {
  const d = DEFAULT_CRESTS[i % DEFAULT_CRESTS.length];
  const s = cls?.teamCrests?.[i] || {};
  return {
    emoji: mascotByEmoji.has(s.emoji) || isAvatar(s.emoji) ? s.emoji : d.emoji,
    color: isColor(s.color) ? s.color : d.color,
    shape: CREST_SHAPES.includes(s.shape) ? s.shape : d.shape,
  };
}

/** Save a team's crest (only the fields given change). */
export function setTeamCrest(cls, i, patch) {
  cls.teamCrests = Array.isArray(cls.teamCrests) ? cls.teamCrests : [];
  while (cls.teamCrests.length <= i) cls.teamCrests.push(null);
  cls.teamCrests[i] = { ...teamCrest(cls, i), ...patch };
  return cls.teamCrests[i];
}

/** Give every child (or only those in `ids`) a different random avatar and colour where the class allows. */
export function shuffleAvatars(cls, { ids = null, rnd = Math.random } = {}) {
  const who = cls.players.filter((p) => !ids || ids.includes(p.id));
  const keep = cls.players.filter((p) => !who.includes(p) && isAvatar(p.avatar)).map((p) => p.avatar);
  const deck = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let free = deck(AVATARS.map((a) => a.emoji).filter((e) => !keep.includes(e)));
  const colors = deck(COLORS);
  who.forEach((p, k) => {
    if (!free.length) free = deck(AVATARS.map((a) => a.emoji));
    p.avatar = free.pop();
    p.color = colors[k % colors.length];
  });
  return who.length;
}

/** Avatars nobody else in the class has chosen (for the picker's "taken" marks). */
export function takenAvatars(cls, exceptId = null) {
  return new Set(cls.players.filter((p) => p.id !== exceptId).map((p) => playerLook(cls, p).emoji));
}

/* ── Drawing ─────────────────────────────────────────────────────── */
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The picture for any avatar, team mascot or emoji (the emoji itself when there is no picture). 🐯 and 🐬 are both a
 *  child's avatar and a team mascot: { team: true } picks the team's drawing. */
export function facePic(emoji, { team = false } = {}) {
  const e = String(emoji || "").trim();
  const mascot = mascotByEmoji.get(e);
  const a = byEmoji.get(e);
  return (team && mascot ? picImg(mascot.pic) : a ? picImg(a.pic) : mascot ? picImg(mascot.pic) : "") || escHtml(e);
}

/** A round avatar disc in the child's colour: <span class="av"> (size via the --av-size CSS variable). */
export function avatarDisc(emoji, color = "#7b6bff", { cls = "", title = "" } = {}) {
  return `<span class="av ${cls}" style="--av:${color}" data-emoji="${escHtml(emoji)}"${title ? ` title="${escHtml(title)}"` : ""}>${facePic(emoji)}</span>`;
}

/** A team crest: the mascot on a coloured badge (shield, circle, star or hexagon). */
export function crestBadge(team, { cls = "" } = {}) {
  const shape = CREST_SHAPES.includes(team?.shape) ? team.shape : "shield";
  return `<span class="crest sh-${shape} ${cls}" style="--team:${team?.color || "#7b6bff"}" data-emoji="${escHtml(team?.emoji)}"><i class="crest-bg"></i>${facePic(team?.emoji, { team: true })}</span>`;
}
