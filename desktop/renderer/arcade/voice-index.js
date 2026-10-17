/* Voice manifest lookup — pure, DOM-free (tested in Node).
   manifest = { v, entries: { key: { f, d, pack? } }, text: { normText: key } } */
import { normText } from "../lesson/schema.js";

export function createVoiceIndex(manifest) {
  const entries = manifest?.entries || {};
  const text = manifest?.text || {};
  return {
    size: Object.keys(entries).length,
    has: (key) => !!(key && entries[key]),
    get: (key) => entries[key] || null,
    /** Key of a recorded clip for this exact text (case/punctuation-insensitive), or null. */
    keyForText: (t) => text[normText(t)] || null,
  };
}
