#!/usr/bin/env node
/* The smoke test: `npm run smoke` builds the development shell and runs it with --smoke (pages read from
 * desktop/renderer); `npm run smoke -- <exe>` runs a built exe instead (the release script uses the portable one).
 * Extra arguments (e.g. --voices) are passed on. Exit code: the app's (0 = all checks passed). */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const exeArg = args.find((a) => a.toLowerCase().endsWith(".exe"));
const pass = args.filter((a) => a !== exeArg);
const env = { ...process.env, PATH: `${path.join(os.homedir(), ".cargo", "bin")}${path.delimiter}${process.env.PATH}` };
let exe = exeArg && path.resolve(exeArg);
if (!exe) {
  const b = spawnSync("cargo", ["build", "--manifest-path", path.join(DESKTOP, "src-tauri", "Cargo.toml")], { stdio: "inherit", env });
  if (b.status !== 0) process.exit(b.status || 1);
  exe = path.join(DESKTOP, "src-tauri", "target", "debug", "vocab-master.exe");
}
const r = spawnSync(exe, ["--smoke", ...pass], { stdio: "inherit", env, timeout: 6 * 60 * 1000 });
process.exit(r.status ?? 1);
