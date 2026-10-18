import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SOUNDS, kit, hz, N } from "../desktop/renderer/arcade/sounds.js";
import { play, sfx, configureAudio, audioSettings, audioQuality, claimed } from "../desktop/renderer/arcade/audio.js";

/* A minimal Web Audio stand-in that records every scheduled node and the latest stop time. */
function mockContext(sampleRate = 44100) {
  const stats = { nodes: 0, sources: 0, end: 0, badValues: [] };
  const param = (v = 0) => {
    const p = { value: v };
    const check = (x, t) => { if (!Number.isFinite(x) || !Number.isFinite(t) || t < 0) stats.badValues.push([x, t]); };
    p.setValueAtTime = (x, t) => { check(x, t); };
    p.exponentialRampToValueAtTime = (x, t) => { check(x, t); if (x <= 0) stats.badValues.push(["exp<=0", x]); stats.end = Math.max(stats.end, t); };
    p.linearRampToValueAtTime = (x, t) => { check(x, t); };
    p.setTargetAtTime = () => {};
    p.cancelScheduledValues = () => {};
    return p;
  };
  const node = (extra = {}) => { stats.nodes++; return { connect: () => {}, disconnect: () => {}, ...extra }; };
  const source = (extra) => node({
    start() { stats.sources++; },
    stop(t) { stats.end = Math.max(stats.end, t); },
    ...extra,
  });
  const c = {
    sampleRate,
    currentTime: 0,
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createOscillator: () => source({ type: "sine", frequency: param(440), detune: param(0) }),
    createBiquadFilter: () => node({ type: "lowpass", frequency: param(350), Q: param(1) }),
    createBufferSource: () => source({ buffer: null, playbackRate: param(1) }),
    createBuffer: (ch, len, sr) => ({ duration: len / sr, getChannelData: () => new Float32Array(len) }),
  };
  return { c, stats };
}

test("every sound renders on a mock context, inside its declared length", () => {
  for (const [name, def] of Object.entries(SOUNDS)) {
    const { c, stats } = mockContext();
    def.play(kit(c, c.createGain(), 0));
    assert.ok(stats.sources > 0, `${name} makes no sound`);
    assert.deepEqual(stats.badValues, [], `${name} schedules invalid automation`);
    assert.ok(stats.end <= def.dur + 0.06, `${name} runs ${stats.end.toFixed(3)}s but declares ${def.dur}s`);
    // Cheap enough to play live on a weak PC before its buffer is rendered.
    assert.ok(stats.nodes < 90, `${name} uses ${stats.nodes} nodes`);
  }
});

test("sound definitions are complete", () => {
  for (const [name, def] of Object.entries(SOUNDS)) {
    assert.ok(["ui", "sfx"].includes(def.bus), `${name} bus`);
    assert.ok(def.dur > 0 && def.dur <= 2, `${name} dur`);
    assert.ok((def.wet ?? 0) >= 0 && (def.wet ?? 0) <= 0.5, `${name} wet`);
    assert.equal(typeof def.play, "function");
  }
  // Interface sounds are short and quiet so they never get in the way.
  for (const [name, def] of Object.entries(SOUNDS).filter(([, d]) => d.bus === "ui")) {
    if (["tapUi", "press", "select", "toggleOn", "toggleOff", "pickup", "drop"].includes(name)) assert.ok(def.dur <= 0.2, `${name} too long`);
  }
  assert.equal(Math.round(hz(N.A4)), 440);
  assert.equal(Math.round(hz(N.C5)), 523);
});

test("every sfx method and every play() name in the renderer exists in the palette", () => {
  for (const k of Object.keys(sfx)) assert.ok(SOUNDS[k], `sfx.${k} has no sound`);
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = `${d}/${e.name}`;
    if (e.isDirectory() && e.name !== "vendor") walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  });
  walk("desktop/renderer");
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bplay\("([A-Za-z]+)"/g)) assert.ok(SOUNDS[m[1]], `${f}: play("${m[1]}") is not in the palette`);
    for (const m of src.matchAll(/\bsfx\.([A-Za-z]+)\(/g)) assert.ok(sfx[m[1]], `${f}: sfx.${m[1]}() does not exist`);
    for (const m of src.matchAll(/data-sound="([A-Za-z]+)"/g)) assert.ok(m[1] === "none" || SOUNDS[m[1]], `${f}: data-sound="${m[1]}"`);
    for (const m of src.matchAll(/\breturn "([A-Za-z]+)";/g)) if (f.endsWith("sound-ui.js")) assert.ok(SOUNDS[m[1]], `${f}: "${m[1]}"`);
  }
  for (const name of ["success", "error", "warn", "notify", "open", "close", "nav", "navBack", "aiStart", "aiDone"]) assert.ok(SOUNDS[name], name);
});

test("the engine is silent and safe without Web Audio, and respects settings", () => {
  assert.equal(play("correct"), false);
  assert.equal(play("no-such-sound"), false);
  assert.equal(sfx.win(), false);
  assert.equal(claimed(), false);
  configureAudio({ volume: 2, ui: false, quality: "light" });
  assert.equal(audioSettings.volume, 1);
  assert.equal(audioSettings.ui, false);
  assert.equal(audioQuality(), "light");
  configureAudio({ volume: -1, quality: "nonsense" });
  assert.equal(audioSettings.volume, 0);
  assert.equal(audioSettings.quality, "light");
  configureAudio({ volume: 0.8, ui: true, quality: "auto" });
  assert.equal(audioQuality(), "high");
});
