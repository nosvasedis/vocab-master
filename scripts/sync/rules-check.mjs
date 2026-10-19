#!/usr/bin/env node
/* Checks firebase/database.rules.json against the Realtime Database emulator (no real project touched).
   Start the emulators first:  cd firebase && npx -y firebase-tools@latest emulators:start --only auth,database,hosting
   Then:                        node scripts/sync/rules-check.mjs
   Uses unsigned emulator tokens for made-up users (alice, bob, an anonymous phone). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB = process.env.DB_EMULATOR || "http://127.0.0.1:9000";
const NS = "vocab-master-live-default-rtdb";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (uid, provider = "password") => {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: uid, user_id: uid, aud: "vocab-master-live", iss: "https://securetoken.google.com/vocab-master-live", iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: provider } })}.`;
};
const call = async (method, p, who, body) => {
  const headers = { "Content-Type": "application/json" };
  if (who === "owner") headers.Authorization = "Bearer owner";
  const auth = who && who !== "owner" ? `&auth=${token(...who)}` : "";
  const res = await fetch(`${DB}/${p}.json?ns=${NS}${auth}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.status;
};

// Load the committed rules into the emulator.
const rules = fs.readFileSync(path.join(ROOT, "firebase", "database.rules.json"), "utf8");
const put = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: rules });
if (!put.ok) { console.error("Couldn't load rules into the emulator:", put.status, await put.text()); process.exit(1); }

const alice = ["alice"];
const bob = ["bob"];
const anon = ["phone1", "anonymous"];
const item = { t: Date.now(), by: "d1", v: "on" };
const vault = { v: 1, kdf: "PBKDF2-SHA256", iter: 600000, salt: "c2FsdA==", iv: "aXY=", ct: "Y3Q=", t: Date.now(), by: "d1" };

const checks = [
  ["owner writes an item", "PATCH", "users/alice", alice, { "items/vm_quiz_timer/_": item, "index/vm_quiz_timer/_": item.t, meta: { schema: 1, updatedAt: 1 } }, 200],
  ["owner reads own data", "GET", "users/alice", alice, undefined, 200],
  ["another user can't read it", "GET", "users/alice", bob, undefined, 401],
  ["another user can't write it", "PUT", "users/alice/items/vm_quiz_timer/_", bob, item, 401],
  ["signed-out can't read it", "GET", "users/alice", null, undefined, 401],
  ["nobody can list all users", "GET", "users", alice, undefined, 401],
  ["anonymous (Lingo Live phone) can't use users/", "PUT", "users/phone1/items/vm_quiz_timer/_", anon, item, 401],
  ["item needs t and by", "PUT", "users/alice/items/vm_quiz_timer/_", alice, { v: "on" }, 401],
  ["item can't carry extra fields", "PUT", "users/alice/items/vm_quiz_timer/_", alice, { ...item, x: 1 }, 401],
  ["a tombstone is fine", "PUT", "users/alice/items/vm_classes/c1", alice, { t: 5, by: "d1", del: true }, 200],
  ["unknown top-level node is refused", "PUT", "users/alice/junk", alice, { a: 1 }, 401],
  ["index values must be numbers", "PUT", "users/alice/index/vm_classes/c1", alice, "x", 401],
  ["vault accepted", "PUT", "users/alice/vault", alice, vault, 200],
  ["vault with plaintext field refused", "PUT", "users/alice/vault", alice, { ...vault, deepseek: "sk-x" }, 401],
  ["vault removable", "DELETE", "users/alice/vault", alice, undefined, 200],
  ["Lingo Live host can still open a room", "PUT", "rooms/123456", anon, { meta: { host: "phone1", createdAt: 1, title: "t", teams: [] }, state: { phase: "lobby" } }, 200],
];

let failed = 0;
for (const [name, method, p, who, body, want] of checks) {
  const got = await call(method, p, who, body);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (got ${got}, want ${want})`}`);
}
await call("DELETE", "users/alice", "owner");
await call("DELETE", "rooms/123456", "owner");
console.log(failed ? `\n${failed} rule check(s) failed.` : `\nAll ${checks.length} rule checks passed.`);
process.exit(failed ? 1 : 0);
