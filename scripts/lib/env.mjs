/* Loads KEY=VALUE pairs from .env.local (gitignored) into process.env. Never commit keys. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let loaded = false;
export function loadEnv() {
  if (loaded) return process.env;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  }
  return process.env;
}

/** The value of a required variable, or a clear error naming the variable (never its value). */
export function requireEnv(name) {
  loadEnv();
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Add it to .env.local (see docs/roadmap/RESUME.md).`);
  return v;
}
