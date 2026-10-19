/* electron-builder settings = package.json "build", plus two size savings computed at build time:
   - Chromium's UI languages: only English and Greek (the others are ~10 MB of the installer);
   - voice clips the manifest no longer points to (superseded takes, kept on disk for the audio job's state). */
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");

const AUDIO = path.join(__dirname, "renderer", "assets", "audio");
function supersededClips() {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(AUDIO, "manifest.json"), "utf8")); } catch { return []; }
  const used = new Set(Object.values(manifest.entries || {}).map((e) => String(e.f).replace(/\\/g, "/")));
  const out = [];
  for (const dir of fs.readdirSync(AUDIO, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(AUDIO, dir.name))) {
      const rel = `${dir.name}/${f}`;
      if (f.endsWith(".ogg") && !used.has(rel)) out.push(`!renderer/assets/audio/${rel}`);
    }
  }
  return out;
}

const skip = supersededClips();
console.log(`electron-builder.config: leaving out ${skip.length} superseded voice clips`);
module.exports = {
  ...pkg.build,
  electronLanguages: ["en-US", "en-GB", "el"],
  files: [...pkg.build.files, ...skip],
};
