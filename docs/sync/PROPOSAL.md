# Accounts & sync: proposal (approved 2026-10-19, with Google sign-in; built, see README.md)

Goal: sign in on any laptop (web on :8787 or the desktop app) and find your classes, worksheets, preferences and, if you opt in, your AI keys. It must still work fully offline, and it must stay out of the files the other sessions are editing.

## 1. What the app saves today

Everything goes through `localStorage`. On desktop, `js/bridge.js` patches `Storage.prototype` so every write is also kept in `userData/store.json`, and API keys go to `keychain*.bin` (Electron safeStorage) instead. So there is one place to hook, and no IndexedDB data needs syncing.

| key | what | sync? | merge kind |
|---|---|---|---|
| `lingo_maker_saves` | worksheet library (≤100 sessions, each `{id, savedAt, form, data, plan…}`) | yes | list by `id` |
| `lingo_maker_signatures` | per class-level "already used" history (avoids repeats) | yes | object, per field |
| `vm_classes` | arcade classes: first names, teams | yes | list by `id` |
| `vm_prefs_v2` | theme, sounds, school name, picture style… | yes | object, per field |
| `vm_ai_provider` | DeepSeek / Gemini / ChatGPT | yes | value |
| `vm_arcade_mode`, `vm_arcade_class`, `vm_arcade_greek`, `vm_live_prefs`, `vm_board_timer`, `vm_quiz_timer`, `vm_fc_front`, `vm_mem_mode`, `vm_mem_pairs`, `vm_taboo_secs` | game settings | yes | value |
| `lingo_maker_api_key`, `vm_gemini_api_key` | AI keys (keychain on desktop) | **opt-in, end-to-end encrypted** | value |
| `vm_draft_v2` | the unsaved worksheet being built | no (changes every keystroke; saved worksheets do sync) | — |
| `vm_fc_retry`, `vm_arcade_teams` | one-off flashcard retry list, pre-modes legacy | no | — |
| ChatGPT sign-in (`chatgpt-*.bin`) | OAuth tokens tied to this device | never | — |
| Voice cache (Cache Storage), exported PDFs/DOCX | re-downloadable / your own files | no | — |

A test classifies every `vm_*` / `lingo_*` key found in the renderer as synced or local-only. A new key added by another branch makes it fail until someone decides which it is.

## 2. Backend: Firebase Realtime Database + Firebase Auth (recommended)

- **Realtime Database (chosen).** The SDK is already vendored, the CSP already allows it, and the project `vocab-master-live` (free Spark plan) already hosts Lingo Live. Live listeners mean a second open laptop updates within seconds. Free limits (1 GB stored, 10 GB/month download) are far above one teacher's data (100 worksheets ≈ 2–8 MB).
- **Firestore (not chosen).** Better queries and offline persistence, but it would mean vendoring about 400 KB more SDK, a new CSP host, and 1 MiB document limits that a big worksheet could approach. Its offline cache would also duplicate the localStorage that is already the source of truth here.
- **Other options (Supabase, own server).** A new vendor, new keys, nothing reused.

## 3. Sign-in

- **Email + password**, with "Forgot password" (a Firebase reset email). It is plain HTTPS to `identitytoolkit.googleapis.com` (already in the CSP), so it works the same on the web and inside Electron's `app://` page. Nothing Electron-specific is needed.
- **Google sign-in: phase 2 (optional).** It works on the web (localhost is an authorised domain). Electron can't use the popup from `app://`. It would need a small loopback flow: open the system browser at `vocab-master-live.web.app/desktop-signin`, then pass the Google ID token back to `127.0.0.1` and call `signInWithCredential`. I'd build it only if you want it.
- **Email link: not recommended.** The link opens a browser, not the desktop app.

Lingo Live keeps its anonymous sign-in. The rules forbid anonymous users from the `users/` tree.

## 4. Data model (RTDB)

```
users/{uid}/
  meta     { schema: 1, createdAt, email }
  index/{coll}/{itemId} = updatedAt   // tiny: lets a laptop fetch only what changed
  items/{coll}/{itemId} { v: "<JSON string>", t: updatedAt, by: deviceId, del?: true }
  vault    { v: 1, kdf: "PBKDF2-SHA256", iter: 600000, salt, iv, ct }   // only if keys are synced
```

- `coll` is the localStorage key. For "value" keys there is a single item `_`. For "object" keys there is one item per field. For "list" keys there is one item per list entry (by `id`).
- Values are stored as JSON strings, so RTDB never mangles arrays, empty lists or `null`s. Keys are encoded so RTDB-unsafe characters (`. # $ [ ] /`) are escaped.

## 5. Offline-first sync and conflicts

- **localStorage stays the source of truth.** The app keeps reading and writing it exactly as now.
- **Change capture.** A new module `js/sync/` wraps `Storage.prototype.setItem/removeItem`, on top of bridge.js's desktop patch. When a synced key is written, it diffs the old and new value to find which list entries or fields changed. It stamps those with a timestamp (server-time corrected via `.info/serverTimeOffset`) in a sidecar `vm_sync_meta`, and marks them dirty in an outbox. Deleted entries become tombstones (`del: true`), removed after 90 days.
- **Push.** Dirty items are uploaded (debounced about 2 s, plus on "Sync now" and on reconnect). The outbox survives restarts, so offline edits upload later.
- **Pull.** At startup (awaited for at most about 2.5 s, so offline start is never slow), the app reads `index/`, fetches only the items newer than the local copy, and merges them. While open, live listeners apply other laptops' changes.
- **Conflicts: last write wins per item, not per key.** Two laptops adding different worksheets or classes both keep theirs. Editing the same class on both keeps the later edit. A deletion beats an older edit, and an edit made after the deletion brings the item back. Lists are rebuilt in their natural order (worksheets newest first, capped at 100 as today).
- **In-memory state.** Settings (`prefs`) is read once at startup. When a pull changes it, a small hook refreshes the in-memory object, so a stale copy can't overwrite the newer one. A toast says what arrived.

## 6. Several teachers on one computer

Settings → **Account** lists the profiles that have signed in on this computer, plus "This computer (not signed in)".

Switching works like this:
1. The current data is pushed.
2. The synced keys are tucked into a per-profile local stash.
3. The other profile's stash is restored.
4. The app reloads.

Switching works offline, and one teacher never sees another's classes. API keys belong to the profile too.

## 7. First sign-in when this computer already has data

- **Cloud empty:** upload everything (no question).
- **Both have data:** a dialog with these choices:
  - **Merge (recommended)**: per-item rules as above. Nothing is lost.
  - **Use only the account's data on this computer**: a backup file of the local data is saved first.
  - **Cancel.**

## 8. AI keys: opt-in, end-to-end encrypted

- **Off by default.** You turn on "Sync my AI keys" and choose a sync passphrase (not your password; at least 10 characters, with a strength hint).
- **Encryption.** WebCrypto PBKDF2-SHA256, 600,000 iterations, 16-byte random salt, gives an AES-GCM-256 key. A 12-byte random IV is used on every save. Only `{salt, iv, ct}` leaves the computer, so Firebase and anyone with database access see ciphertext only.
- **On another laptop.** Enter the passphrase once. The keys go into that laptop's keychain (desktop) or localStorage (web), and the derived key is kept in memory only (non-extractable) to re-encrypt when a key changes.
- **Forgotten passphrase.** It can't be recovered. You turn key sync off and on again with a new one, and the old vault is replaced.
- **Never logged.** Keys never appear in logs, the backup file (unless encrypted the same way), or the repo.

## 9. Settings → Account panel

- Signed out: sign in or create an account (email + password), "Forgot password", and a short "what syncs" list.
- Signed in:
  - email, status (Synced ✓ · Syncing… · Offline, changes will upload · Error), last sync time, **Sync now**;
  - the AI-key sync toggle and passphrase;
  - switch profile, **Sign out** (optionally removing this profile's data from this computer).
- Always:
  - **Export backup** writes a `.vmbackup.json` of all synced keys (keys only if you add a passphrase).
  - **Import backup** merges a file with the same per-item rules.

## 10. Security rules (committed in `firebase/database.rules.json`)

```
"users": { "$uid": {
  ".read":  "auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider !== 'anonymous'",
  ".write": same,
  "items": { "$coll": { "$id": { ".validate": "newData.hasChildren(['t']) && newData.child('t').isNumber() && (!newData.child('v').exists() || (newData.child('v').isString() && newData.child('v').val().length < 2000000))" } } },
  "vault": { ".validate": "newData.hasChildren(['salt','iv','ct'])" }
} }
```

Only you can read or write your own tree, and nobody can list other users. Size limits stop runaway writes. Rules get tests on the Firebase emulator.

## 11. Where the code goes (small, additive hooks only)

- New:
  - `js/sync/`: `registry.js` (key → kind), `merge.js` (pure, tested), `crypto.js` (vault), `engine.js` (capture, outbox, push/pull), `backend-firebase.js`, `profiles.js`, `account-ui.js`.
  - `tests/sync*.test.mjs`.
  - `docs/sync/`.
- Hooks:
  - `js/main.js`: `await initSync()` after `hydrateStorage()`, plus a listener that refreshes `prefs`.
  - `js/dialogs.js`: an "Account & sync" section that mounts `account-ui.js`.
  - `index.html`: a CSP `frame-src` only if Google sign-in is added later.
  - `firebase/`: rules and `auth.providers.emailPassword`.
- None of the files the worksheets or arcade sessions are editing.

## 12. Testing

- **Unit tests.** Merge rules (concurrent adds, edit vs delete, tombstone expiry, list order and cap, object fields), diff capture, key encoding, and the vault round trip plus a wrong-passphrase failure (Node has WebCrypto).
- **Rules and live check.** These run on the **Firebase Auth + Database emulators** on localhost (`npx firebase-tools emulators:start`, Java is installed). I'd test with throwaway emulator accounts, never by creating a real account on your production project. The emulator also runs the security rules.
- **App check.** The app at :8787 is pointed at the emulators for the check (dev-only switch `?syncEmulator=1`, ignored in packaged builds). Then `npm run smoke` on desktop.

## 13. What you need to do (about 5 minutes)

1. **Firebase console → vocab-master-live → Authentication → Sign-in method → enable "Email/Password".** Alternatively: `npx firebase-tools login`, then `npx firebase-tools deploy --only auth,database` from `firebase/` (after I add `emailPassword: true` to `firebase.json`).
2. **Deploy the new database rules:** `npx firebase-tools deploy --only database`, from `firebase/`. They keep the Lingo Live rules exactly as they are.
3. Optional: Authentication → Templates, to set the sender name of the password-reset email.
4. Optional, later: tell me if you want Google sign-in (phase 2).

Then create your account in the app (Settings → Account). I won't create real accounts for you.
