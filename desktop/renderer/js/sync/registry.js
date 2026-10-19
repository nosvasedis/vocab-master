/* Sync — which localStorage keys travel with an account, and how each one merges.
   kind "list":   an array of records with an id; each record syncs on its own (last write wins per record).
   kind "object": a plain object; each field syncs on its own.
   kind "value":  the whole stored string syncs as one item.
   tests/sync.test.mjs fails when the renderer uses a vm_* / lingo_* key that is in neither SYNCED nor LOCAL_ONLY. */

export const SYNCED = {
  lingo_maker_saves: { kind: "list", id: "id", label: "Saved worksheets", newestFirst: "savedAt" },
  vm_classes: { kind: "list", id: "id", label: "Classes" },
  vm_studio_docs_v1: { kind: "list", id: "id", label: "Tests and dictations", newestFirst: "savedAt" },
  vm_arcade_decks: { kind: "list", id: "id", label: "Saved word decks", newestFirst: "at" },
  vm_arcade_played: { kind: "object", label: "Words played recently" },
  lingo_maker_signatures: { kind: "object", label: "Worksheet history" },
  vm_prefs_v2: { kind: "object", label: "Settings" },
  vm_ai_provider: { kind: "value", label: "AI service" },
  vm_dictation_prefs_v1: { kind: "value", label: "Dictation settings" },
  vm_tests_prefs_v1: { kind: "value", label: "Test settings" },
  vm_dp_filters: { kind: "value", label: "Game settings" },
  vm_arcade_mode: { kind: "value", label: "Game settings" },
  vm_arcade_class: { kind: "value", label: "Game settings" },
  vm_arcade_greek: { kind: "value", label: "Game settings" },
  vm_arcade_pick: { kind: "value", label: "Game settings" },
  vm_live_prefs: { kind: "value", label: "Game settings" },
  vm_board_timer: { kind: "value", label: "Game settings" },
  vm_quiz_timer: { kind: "value", label: "Game settings" },
  vm_fc_front: { kind: "value", label: "Game settings" },
  vm_mem_mode: { kind: "value", label: "Game settings" },
  vm_mem_pairs: { kind: "value", label: "Game settings" },
  vm_taboo_secs: { kind: "value", label: "Game settings" },
};

/** AI keys: synced only inside the end-to-end encrypted vault (crypto.js), never as plain items. */
export const SECRET = { lingo_maker_api_key: "deepseek", vm_gemini_api_key: "gemini" };

/** Keys that stay on this computer, and why. */
export const LOCAL_ONLY = {
  vm_draft_v2: "the unsaved worksheet being built; saved worksheets sync",
  vm_fc_retry: "a one-off flashcard retry list",
  vm_arcade_teams: "legacy, read once to pick a game mode",
  vm_sync_state: "sync bookkeeping for the active profile",
  vm_sync_profiles: "the profiles that use this computer",
  vm_sync_emulator: "developer switch: use the Firebase emulators",
};

export const isSynced = (key) => Object.prototype.hasOwnProperty.call(SYNCED, key);
export const isSecret = (key) => Object.prototype.hasOwnProperty.call(SECRET, key);
/** Every key a profile owns on this computer (moved aside when another teacher switches in). */
export const PROFILE_KEYS = [...Object.keys(SYNCED), ...Object.keys(SECRET), "vm_draft_v2", "vm_fc_retry", "vm_sync_state"];
