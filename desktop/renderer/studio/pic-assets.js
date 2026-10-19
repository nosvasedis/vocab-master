/* Vocab Master — word-bank pictures for exports (browser only).
 * Worksheets show the WebP illustrations from assets/pics. Word can't hold WebP, and the PDF window
 * can't load app files, so exports get PNG copies (Word) or data: URLs (PDF) made here. */
import { picUrl } from "../js/pics.js";

const TOKEN = /@?((?:w|c|ui)-[a-z0-9][a-z0-9-]*)/;
const pngCache = new Map();
const dataCache = new Map();

async function loadImage(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

/** PNG (base64, no prefix) of one picture, drawn into a px × px square on white. */
export async function picPng(id, px = 256) {
  const key = `${id}@${px}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const job = (async () => {
    try {
      const img = await loadImage(picUrl(id));
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      const g = canvas.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, px, px);
      const s = Math.min(px / img.naturalWidth, px / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      g.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    } catch { return ""; }
  })();
  pngCache.set(key, job);
  return job;
}

/** Every picture token used anywhere in a worksheet-like object (vocab, items, sections). */
export function picTokensIn(value) {
  const out = new Set();
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") { const m = v.match(/^@((?:w|c|ui)-[a-z0-9][a-z0-9-]*)$/); if (m) out.add(m[1]); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (k !== "picPng") walk(x); });
  };
  walk(value);
  return [...out];
}

/** { id → base64 PNG } for every picture a worksheet uses, for the Word builders (meta.picPng). */
export async function picPngMap(data, px = 256) {
  const out = {};
  for (const id of picTokensIn(data)) {
    const b64 = await picPng(id, px);
    if (b64) out[id] = b64;
  }
  return out;
}

async function dataUrl(src) {
  if (dataCache.has(src)) return dataCache.get(src);
  const job = fetch(src).then((r) => (r.ok ? r.blob() : null)).then((blob) => (blob ? new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => res("");
    fr.readAsDataURL(blob);
  }) : "")).catch(() => "");
  dataCache.set(src, job);
  return job;
}

/** The same HTML with every app picture (<img src="./assets/pics/…">) embedded, for the PDF window. */
export async function inlinePictures(html) {
  const srcs = [...new Set([...String(html).matchAll(/src="(\.\/assets\/pics\/[^"]+)"/g)].map((m) => m[1]))];
  let out = String(html);
  for (const src of srcs) {
    const url = await dataUrl(src);
    if (url) out = out.split(`src="${src}"`).join(`src="${url}"`);
  }
  return out;
}

export const isPicToken = (s) => TOKEN.test(String(s || ""));
