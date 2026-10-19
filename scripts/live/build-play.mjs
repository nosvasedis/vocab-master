#!/usr/bin/env node
/* Copies the shared pieces the phone page needs into firebase/public/vendor (Firebase SDK + net-config),
   so the phone page and the projector app always use the same config. Run before `firebase deploy`.
   Usage: node scripts/live/build-play.mjs [--deploy] */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "../lib/env.mjs";

const out = path.join(ROOT, "firebase", "public", "vendor");
fs.mkdirSync(out, { recursive: true });
const copy = (from, name = path.basename(from)) => fs.copyFileSync(path.join(ROOT, from), path.join(out, name));
for (const m of ["app", "auth", "database"]) copy(`desktop/renderer/vendor/firebase/firebase-${m}.js`);
copy("desktop/renderer/arcade/live/net-config.js");
console.log(`✓ phone page vendor files → ${path.relative(ROOT, out)}`);
if (process.argv.includes("--deploy")) {
  execSync("npx -y firebase-tools@latest deploy --only hosting,database,auth --project vocab-master-live --non-interactive", { cwd: path.join(ROOT, "firebase"), stdio: "inherit" });
}
