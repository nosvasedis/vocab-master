#!/usr/bin/env node
/* Publish voice clips + manifest to Cloudflare R2 (bucket vocab-master-media, public r2.dev URL).
   The app streams clips from there (and caches them for offline use), so installers stay small and
   new narration reaches installed apps without a rebuild: the app also reads the remote manifest.
   Usage: node scripts/packs/publish.mjs [--dry-run]     Resumable: work/state/publish.json */
import fs from "node:fs";
import path from "node:path";
import { ROOT, requireEnv } from "../lib/env.mjs";

const DELIVERY = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "delivery.json"), "utf8"));
const AUDIO_DIR = path.join(ROOT, "desktop", "renderer", "assets", "audio");
const STATE_FILE = path.join(ROOT, "work", "state", "publish.json");
const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { uploaded: {} }; } })();
const save = () => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state)); };

async function put(key, body, type, cache) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${requireEnv("CF_ACCOUNT_ID")}/r2/buckets/${DELIVERY.bucket}/objects/${key}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: "PUT", headers: { Authorization: `Bearer ${requireEnv("CF_API_TOKEN")}`, "Content-Type": type, "Cache-Control": cache }, body });
    if (res.ok) return;
    if (res.status < 500 && res.status !== 429) throw new Error(`R2 PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`R2 PUT ${key} failed after retries`);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, "manifest.json"), "utf8"));
  const files = [...new Set(Object.values(manifest.entries).map((e) => e.f))].filter((f) => !state.uploaded[f] && fs.existsSync(path.join(AUDIO_DIR, f)));
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(AUDIO_DIR, f)).size, 0);
  console.log(`${files.length} new clip(s) to upload (${(bytes / 1e6).toFixed(1)} MB) → ${DELIVERY.publicBase}`);
  if (process.argv.includes("--dry-run")) return;
  let i = 0;
  let done = 0;
  const failed = [];
  const worker = async () => {
    while (i < files.length) {
      const f = files[i++];
      try {
        await put(`audio/${f}`, fs.readFileSync(path.join(AUDIO_DIR, f)), "audio/ogg", "public, max-age=31536000, immutable");
        state.uploaded[f] = 1;
      } catch (e) { failed.push(f); continue; }
      if (++done % 100 === 0) { save(); process.stdout.write(`${done} `); }
    }
  };
  try { await Promise.all(Array.from({ length: 6 }, worker)); } finally { save(); }
  if (failed.length) console.log(`
${failed.length} upload(s) failed — run again to retry them.`);
  // The manifest last, so it never points at clips that aren't uploaded yet.
  const published = { ...manifest, entries: Object.fromEntries(Object.entries(manifest.entries).filter(([, e]) => state.uploaded[e.f])), publishedAt: new Date().toISOString() };
  await put("audio/manifest.json", JSON.stringify(published), "application/json", "no-cache");
  console.log(`\nUploaded ${done}. Remote manifest: ${Object.keys(published.entries).length} entries.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
