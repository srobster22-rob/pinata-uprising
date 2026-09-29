import test from "node:test";
import assert from "node:assert/strict";
import * as sim from "../src/sim.js";
import { sfx as realSfx } from "../src/audio.js";
import { handleEvents, HANDLED, MASK_COLOR } from "../src/feedback.js";
import { ENEMIES, DMG, TOWER_ORDER, WAVES } from "../src/data.js";

// Stubs that record calls instead of drawing or making noise. The point of
// this suite is that the handler runs at all — the one crash the pure-sim
// tests could not see was a stale `MAP` reference in the leak branch.
function rig() {
  const calls = [];
  const spy =
    (name) =>
    (...args) => {
      calls.push({ name, args });
    };
  return {
    calls,
    ctx: {
      state: sim.createGame(1),
      fx: { burst: spy("burst"), ring: spy("ring"), floatText: spy("floatText"), shake: spy("shake") },
      // Stubbed from the REAL table's keys, not a hand-written list. The list
      // version went stale the moment a sound was added: `handleEvents` called
      // `sfx.execute()`, the stub did not have one, and the failure looked like
      // a bug in the feedback layer rather than in the fixture.
      sfx: Object.fromEntries(Object.keys(realSfx).map((k) => [k, spy(`sfx.${k}`)])),
      banner: spy("banner"),
      modal: spy("modal"),
      recordBest: spy("recordBest"),
      recordMasks: spy("recordMasks"),
      difficultyName: "Plaza",
      budget: { sound: 99, resist: 99 },
    },
  };
}

// One representative payload per event kind, matching what sim.js emits.
const SAMPLES = {
  hit: { t: "hit", x: 100, y: 100, dmgType: DMG.SHARP, resisted: false, amount: 9 },
  shrug: { t: "shrug", x: 100, y: 100, type: "toro" },
  slowed: { t: "slowed", x: 100, y: 100 },
  stunned: { t: "stunned", x: 100, y: 100, secs: 0.5 },
  deflect: { t: "deflect", x: 100, y: 100, how: "cape" },
  burst: { t: "burst", x: 100, y: 100, r: 54 },
  chain: { t: "chain", x: 100, y: 100, tx: 160, ty: 120 },
  cut: { t: "cut", x: 100, y: 100, r: 88 },
  phase: { t: "phase", x: 100, y: 100, name: "The mask comes off", boss: "El Coloso" },
  execute: { t: "execute", x: 100, y: 100 },
  quake: { t: "quake", x: 100, y: 100 },
  payday: { t: "payday", x: 100, y: 100, amount: 12 },
  mask: { t: "mask", x: 100, y: 100, type: "rudo" },
  defeat: { t: "defeat", x: 100, y: 100, type: "nino", boss: false },
  tag: { t: "tag", x: 100, y: 100 },
  collect: { t: "collect", x: 100, y: 100, value: 4 },
  leak: { t: "leak", x: 100, y: 100, amount: 4 },
  waveEnd: { t: "waveEnd", wave: 3, bonus: 210, income: 130, interest: 12 },
  boss: { t: "boss", name: "El Campeón" },
  over: { t: "over" },
  won: { t: "won" },
};

test("every event kind the sim emits has a sample here", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...HANDLED].sort());
});

test("no event kind throws, and every one produces feedback", () => {
  for (const kind of HANDLED) {
    const { calls, ctx } = rig();
    assert.doesNotThrow(() => handleEvents([SAMPLES[kind]], ctx), `${kind} threw`);
    assert.ok(calls.length > 0, `${kind} produced no feedback at all`);
  }
});

test("a leak reads the base off the live map, not a module global", () => {
  // This is the exact shape of the R10 crash: main.js kept a stale `MAP`
  // import after maps became per-game. Run it on a non-default board.
  for (const mapId of ["plaza", "mercado", "cementerio"]) {
    const { calls, ctx } = rig();
    ctx.state = sim.createGame(1, "plaza", mapId);
    assert.doesNotThrow(() => handleEvents([SAMPLES.leak], ctx), `leak threw on ${mapId}`);
    const text = calls.find((c) => c.name === "floatText");
    assert.equal(text.args[0], ctx.state.map.base[0], `leak drew at the wrong x on ${mapId}`);
  }
});

test("a boss defeat shakes harder and takes over the banner", () => {
  const plain = rig();
  handleEvents([{ ...SAMPLES.defeat, boss: false }], plain.ctx);
  const boss = rig();
  handleEvents([{ ...SAMPLES.defeat, boss: true, type: "campeon" }], boss.ctx);
  const shake = (r) => r.calls.find((c) => c.name === "shake").args[0];
  assert.ok(shake(boss) > shake(plain) * 3, "a boss going down should be felt");
  assert.ok(!plain.calls.some((c) => c.name === "banner"), "an ordinary defeat is quiet");
  assert.ok(boss.calls.some((c) => c.name === "banner"), "a boss defeat is not");
});

test("towers near a defeat get the credit", () => {
  const { ctx } = rig();
  ctx.state.money = 9000;
  const near = sim.placeTower(ctx.state, "candy", 200, 560);
  handleEvents([{ ...SAMPLES.defeat, x: near.x + 10, y: near.y + 10 }], ctx);
  assert.equal(near.defeats, 1);
  handleEvents([{ ...SAMPLES.defeat, x: near.x + 600, y: near.y }], ctx);
  assert.equal(near.defeats, 1, "a defeat out of range is not this tower's");
});

test("the sound budget caps how much noise one frame can make", () => {
  const { calls, ctx } = rig();
  ctx.budget = { sound: 2, resist: 0 };
  handleEvents(Array.from({ length: 20 }, () => SAMPLES.hit), ctx);
  assert.equal(calls.filter((c) => c.name === "sfx.hit").length, 2);
  assert.equal(calls.filter((c) => c.name === "burst").length, 20, "visuals are not capped");
});

test("a resisted hit says so, but only once per frame", () => {
  const { calls, ctx } = rig();
  ctx.budget = { sound: 99, resist: 1 };
  handleEvents(
    Array.from({ length: 5 }, () => ({ ...SAMPLES.hit, resisted: true })),
    ctx,
  );
  const tells = calls.filter((c) => c.name === "floatText" && c.args[2] === "shrugged off");
  assert.equal(tells.length, 1);
});

test("winning offers freeplay, losing does not", () => {
  const win = rig();
  handleEvents([SAMPLES.won], win.ctx);
  const lose = rig();
  handleEvents([SAMPLES.over], lose.ctx);
  assert.equal(win.calls.find((c) => c.name === "modal").args[2], true);
  assert.notEqual(lose.calls.find((c) => c.name === "modal").args[2], true);
  for (const r of [win, lose]) {
    assert.ok(r.calls.some((c) => c.name === "recordBest"), "both bank the best run");
    assert.ok(r.calls.some((c) => c.name === "recordMasks"), "and both bank masks");
  }
});

test("every enemy has a mask colour", () => {
  for (const id of Object.keys(ENEMIES))
    assert.ok(MASK_COLOR[id], `${id} has no mask colour, its defeat burst would be generic`);
});

test("a real run's events all pass through the handler", () => {
  const { ctx } = rig();
  const g = ctx.state;
  g.money = 40000;
  // One of each piñata: building only candies left whole event kinds — the
  // maraca's `stunned` in particular — never exercised by this test.
  // Taken from TOWER_ORDER, not written out: a hand-listed roster is how a new
  // piñata ships with its event kind unhandled, which this project has done
  // twice. Adding a tower now automatically extends this test.
  const roster = TOWER_ORDER;
  sim.bestSpots(g, roster.length).forEach((s, i) => sim.placeTower(g, roster[i], ...s));
  const kinds = new Set();
  for (let w = 0; w < WAVES.length && g.phase !== "over"; w++) {
    sim.startWave(g);
    for (let i = 0; i < 90 / 0.016 && g.phase === "wave"; i++) {
      const ev = sim.update(g, 0.016);
      for (const e of ev) kinds.add(e.t);
      ctx.budget = { sound: 4, resist: 1 };
      assert.doesNotThrow(() => handleEvents(ev, ctx), `threw on wave ${w + 1}`);
    }
  }
  assert.ok(kinds.size >= 6, `a full run should raise several event kinds, saw ${[...kinds]}`);
  for (const k of kinds) assert.ok(HANDLED.includes(k), `sim emits "${k}" but nothing handles it`);
});

test("a cape and a swing read differently, so the player learns which rule fired", () => {
  const cape = rig();
  handleEvents([{ t: "deflect", x: 50, y: 50, how: "cape" }], cape.ctx);
  const sway = rig();
  handleEvents([{ t: "deflect", x: 50, y: 50, how: "sway" }], sway.ctx);
  const label = (r) => r.calls.find((c) => c.name === "floatText").args[2];
  assert.equal(label(cape), "olé!");
  assert.equal(label(sway), "swung clear!");
  assert.notEqual(label(cape), label(sway));
});

test("a freeplay defeat is reported in freeplay's terms, not the campaign's", () => {
  const plain = rig();
  plain.ctx.state.wave = 9;
  handleEvents([{ t: "over" }], plain.ctx);
  const campaign = plain.calls.find((c) => c.name === "modal").args[1];
  assert.match(campaign, new RegExp(`wave 9 of ${WAVES.length}`));

  const free = rig();
  free.ctx.state.wave = WAVES.length + 7;
  free.ctx.state.freeplay = true;
  handleEvents([{ t: "over" }], free.ctx);
  const past = free.calls.find((c) => c.name === "modal").args[1];
  assert.match(past, new RegExp(`wave ${WAVES.length + 7}`));
  assert.ok(!past.includes(`of ${WAVES.length}`), `still counting against the campaign: ${past}`);
  assert.match(past, /7 past the campaign/);
});

// Every sound the table defines should be reachable from some event, or it is
// dead code that looks like a feature. (place/upgrade are fired by main.js on
// click rather than by an event, so they are exempt.)
test("no sound is defined and never played", () => {
  // Played by main.js on a click or a phase change rather than by a sim event.
  const UI_ONLY = new Set(["place", "upgrade", "deflect", "waveStart"]);
  const src = handleEvents.toString();
  for (const name of Object.keys(realSfx)) {
    if (UI_ONLY.has(name)) continue;
    assert.ok(src.includes(`sfx.${name}(`), `sfx.${name} is never played by any event`);
  }
});
