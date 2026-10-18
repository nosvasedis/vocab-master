/* Word pops — pure matching of prop pictures to the words of a line (DOM-free; tested in Node). */
import { stem } from "./schema.js";

const graphemes = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
const TEXT_STYLE = /^\p{Extended_Pictographic}$/u;
const COLOUR_STYLE = /\p{Emoji_Presentation}/u;

/**
 * Exactly one picture: the first emoji of `e`, drawn in colour. Rebus runs ("🧑🧑🏘") overflow the inline
 * word pops, the zoom and the unit cards, so lessons only ever show one. Emoji that default to the black text
 * style (🏘 🏙 ☀ ✏) get U+FE0F, otherwise Windows draws them as a monochrome glyph.
 */
export function onePicture(e) {
  const s = String(e || "").trim();
  if (!s) return "";
  if (s.startsWith("@")) return s.split(/\s+/)[0]; // a picture-set token ("@w-house") is one picture
  const first = graphemes ? [...graphemes.segment(s)][0].segment : Array.from(s)[0];
  return TEXT_STYLE.test(first) && !COLOUR_STYLE.test(first) ? `${first}️` : first;
}

/** Word core of a token: "“Hat," → { lead: "“", core: "Hat", trail: "," }. */
export function splitToken(token) {
  const m = String(token).match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/s);
  return m ? { lead: m[1], core: m[2], trail: m[3] } : { lead: "", core: token, trail: "" };
}

/**
 * Which tokens get which prop. Each prop is used once (its first occurrence). A multi-word label
 * ("teddy bear", "fire station") matches as a phrase and the picture goes after its last word; otherwise
 * the label's last word, then any of its words, may match ("sweet, sticky food" → "food").
 * @param {string[]} tokens  whitespace-split words of the line (punctuation allowed)
 * @param {{emoji:string,label:string}[]} props
 * @returns {Map<number, {emoji:string,label:string}>} token index → prop
 */
export function matchProps(tokens, props) {
  const stems = tokens.map((t) => stem(splitToken(t).core));
  const out = new Map();
  const taken = new Set();
  for (const p of props || []) {
    const parts = String(p.label).toLowerCase().split(/[\s,/]+/).filter(Boolean).map(stem);
    if (!parts.length) continue;
    let at = -1;
    // 1. whole phrase
    for (let i = 0; at < 0 && i + parts.length <= stems.length; i++) {
      if (parts.every((w, k) => stems[i + k] === w)) at = i + parts.length - 1;
    }
    // 2. head word (last), 3. any word
    const tryWord = (w) => { for (let i = 0; i < stems.length; i++) if (stems[i] === w && !taken.has(i)) return i; return -1; };
    if (at < 0) at = tryWord(parts[parts.length - 1]);
    for (let k = 0; at < 0 && k < parts.length; k++) at = tryWord(parts[k]);
    if (at < 0 || taken.has(at)) continue;
    taken.add(at);
    out.set(at, p);
  }
  return out;
}

/**
 * Where a popped picture should float (stage px, 1920×1080): next to the word at (cx, cy), choosing among
 * above / below / left / right the spot that covers the least of `avoid` (quiz answers, faces, Lingo).
 * Words high on the stage try below first; words lower down try above first.
 * @param {{ cx:number, cy:number, avoid?: {x:number,y:number,w:number,h:number}[], W?:number, H?:number }} o
 */
export function pickSpot({ cx, cy, avoid = [], W = 1920, H = 1080 }) {
  const clampX = (x) => Math.min(W - 170, Math.max(170, x));
  const clampY = (y) => Math.min(H - 190, Math.max(165, y));
  const order = cy > 420 ? [[cx, cy - 230], [cx, cy + 230]] : [[cx, cy + 230], [cx, cy - 230]];
  order.push([cx - 340, cy], [cx + 340, cy]);
  const overlap = (x, y) => avoid.reduce((sum, a) => {
    const w = Math.max(0, Math.min(x + 140, a.x + a.w) - Math.max(x - 140, a.x));
    const h = Math.max(0, Math.min(y + 140, a.y + a.h) - Math.max(y - 140, a.y));
    return sum + w * h;
  }, 0);
  let best = null;
  for (const [x0, y0] of order) {
    const x = clampX(x0);
    const y = clampY(y0);
    const o = overlap(x, y);
    if (!best || o < best.o - 1) best = { x, y, o };
  }
  return { x: best.x, y: best.y };
}
