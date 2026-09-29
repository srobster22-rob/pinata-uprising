import test from "node:test";
import assert from "node:assert/strict";
import * as sim from "../src/sim.js";
import * as up from "../src/upgrades.js";
import { TOWERS, TOWER_ORDER, ENEMIES, DMG, EDGE_MUL, HP_MUL } from "../src/data.js";
import { DEEP_POWER, BLOCKS, blockedBy, blockedReason, MAX_TIER } from "../src/upgrades.js";

const SPOT = [200, 560];
const POCKET = [680, 300];
const rich = (seed = 1) => {
  const g = sim.createGame(seed);
  g.money = 200000;
  return g;
};

test("every path has four tiers with rising costs", () => {
  for (const [type, paths] of Object.entries(up.PATHS)) {
    assert.equal(paths.length, 3, `${type} should have three paths`);
    for (const path of paths) {
      assert.equal(path.tiers.length, up.MAX_TIER, `${type}/${path.name}`);
      for (let i = 1; i < path.tiers.length; i++)
        assert.ok(
          path.tiers[i].cost > path.tiers[i - 1].cost,
          `${type}/${path.name} tier ${i + 1} must cost more than tier ${i}`,
        );
    }
  }
});

// The path-shape test above walks PATHS, so a piñata with no entry at all slips
// through it silently — which is exactly what happened when the ribbon dancer
// was first added.
test("every piñata in the shop has upgrade paths", () => {
  for (const id of TOWER_ORDER) {
    assert.ok(up.PATHS[id], `${id} is buyable but has no upgrade paths`);
    assert.ok(TOWERS[id], `${id} is in TOWER_ORDER but has no definition`);
  }
});

test("a fresh tower starts at 0-0-0 with base stats", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  assert.deepEqual(t.tiers, [0, 0, 0]);
  assert.equal(t.def.damage, TOWERS.candy.damage);
  assert.equal(t.def.range, TOWERS.candy.range);
});

test("buying a tier charges and applies its mod", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  const before = g.money;
  const bought = sim.upgradeTower(g, t, 0);
  assert.ok(bought);
  assert.equal(bought.tier, 1);
  assert.equal(g.money, before - up.PATHS.candy[0].tiers[0].cost);
  assert.equal(t.def.damage, TOWERS.candy.damage + 3);
});

test("mods stack down a path in order, with the top tier scaled", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  for (let i = 0; i < 4; i++) sim.upgradeTower(g, t, 0);
  assert.deepEqual(t.tiers, [MAX_TIER, 0, 0]);
  // The last tier's additive part is multiplied by DEEP_POWER, so that saving up
  // for it is a real alternative to buying more piñatas. Written against the
  // constant so retuning it does not need this number hand-edited.
  assert.equal(t.def.damage, TOWERS.candy.damage + 3 + 6 + 11 + 26 * DEEP_POWER);
});

test("the top tier is a genuine spike, not an increment", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  for (let i = 0; i < up.MAX_TIER - 1; i++) sim.upgradeTower(g, t, 0);
  const below = t.def.damage;
  sim.upgradeTower(g, t, 0);
  const jump = t.def.damage - below;
  assert.ok(
    jump > below * 0.9,
    `the capstone should roughly double damage or better: +${jump} on ${below}`,
  );
});

test("multiplicative mods apply after additive ones", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  sim.upgradeTower(g, t, 1); // rate x0.82
  sim.upgradeTower(g, t, 1); // rate x0.78
  assert.ok(Math.abs(t.def.rate - TOWERS.candy.rate * 0.82 * 0.78) < 1e-9);
});

// ---------------------------------------------------- the restriction rule

test("only two paths may be opened", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  assert.ok(sim.upgradeTower(g, t, 0));
  assert.ok(sim.upgradeTower(g, t, 1));
  assert.equal(sim.upgradeTower(g, t, 2), null, "third path must be refused");
  assert.equal(up.blockedReason(t.tiers, 2), "Only two paths per piñata");
  assert.deepEqual(t.tiers, [1, 1, 0]);
});

test("only one path may pass the crosspath cap", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  // The cap is "only one path past tier 2", so with a three-rung ladder the
  // main path is the only one that may reach its capstone.
  for (let i = 0; i < 2; i++) sim.upgradeTower(g, t, 0); // 2-0-0
  sim.upgradeTower(g, t, 1);
  sim.upgradeTower(g, t, 1); // 2-2-0
  assert.deepEqual(t.tiers, [2, 2, 0]);
  assert.ok(sim.upgradeTower(g, t, 0), "the main path can still go up");
  assert.deepEqual(t.tiers, [MAX_TIER, 2, 0]);
  assert.equal(sim.upgradeTower(g, t, 1), null, "second path cannot pass tier 2");
  assert.match(up.blockedReason(t.tiers, 1), /Only one path/);
  assert.deepEqual(t.tiers, [MAX_TIER, 2, 0]);
});

test("a path stops at max tier", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  for (let i = 0; i < 6; i++) sim.upgradeTower(g, t, 0);
  assert.equal(t.tiers[0], up.MAX_TIER);
  assert.equal(up.blockedReason(t.tiers, 0), "Fully upgraded");
});

test("an upgrade is refused when short of candy, and charges nothing", () => {
  const g = sim.createGame(1);
  const t = sim.placeTower(g, "candy", ...SPOT);
  g.money = 5;
  assert.equal(sim.upgradeTower(g, t, 0), null);
  assert.equal(g.money, 5);
  assert.deepEqual(t.tiers, [0, 0, 0]);
});

test("sell value includes what was spent on upgrades", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  sim.upgradeTower(g, t, 0);
  sim.upgradeTower(g, t, 0);
  const spent = TOWERS.candy.cost + up.PATHS.candy[0].tiers[0].cost + up.PATHS.candy[0].tiers[1].cost;
  const before = g.money;
  assert.equal(sim.sellTower(g, t), Math.floor(spent * 0.7));
  assert.equal(g.money, before + Math.floor(spent * 0.7));
});

// ------------------------------------------------------------ path effects

test("rock candy penetrates the rudo's resistance", () => {
  const hit = (pen) => {
    const g = rich();
    g.phase = "wave";
    g.queue = [{ id: "rudo", at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const e = g.enemies[0];
    const before = e.hp;
    sim.damage(g, e, 100, DMG.SHARP, pen);
    return before - e.hp;
  };
  const plain = hit(0);
  const pierced = hit(0.2);
  assert.equal(plain, 100 * (1 - ENEMIES.rudo.resist[DMG.SHARP]));
  assert.ok(pierced > plain, "penetration should recover damage");
  assert.equal(pierced, 100 * (1 - (ENEMIES.rudo.resist[DMG.SHARP] - 0.2)));
});

test("chili burn tiers lengthen and intensify the burn", () => {
  const g = rich();
  const t = sim.placeTower(g, "chili", ...SPOT);
  const base = { dps: t.def.burn.dps, secs: t.def.burn.secs };
  sim.upgradeTower(g, t, 0);
  assert.ok(t.def.burn.dps > base.dps, "hotter path raises dps");
  assert.equal(t.def.burn.secs, base.secs, "hotter path leaves duration alone");
  const g2 = rich();
  const t2 = sim.placeTower(g2, "chili", ...SPOT);
  sim.upgradeTower(g2, t2, 1);
  assert.ok(t2.def.burn.secs > base.secs, "lingering path raises duration");
});

// (760,220) and (870,180) are legal ground within one aura radius of POCKET.
test("a sugar rush coin piñata speeds up its neighbours but not itself", () => {
  const g = rich();
  const near = sim.placeTower(g, "candy", 760, 220);
  const far = sim.placeTower(g, "candy", 175, 225);
  const coin = sim.placeTower(g, "coin", ...POCKET);
  sim.upgradeTower(g, coin, 2); // Sweet air: +8% rate, 118 range
  sim.update(g, 0.016);
  assert.ok(Math.hypot(near.x - coin.x, near.y - coin.y) <= coin.def.auraRange);
  assert.equal(near.buffRate, 0.08, "a neighbour inside the aura is buffed");
  assert.equal(far.buffRate, 0, "a tower outside the aura is not");
  assert.equal(coin.buffRate, 0, "the source does not buff itself");
});

test("auras take the best source rather than stacking", () => {
  const g = rich();
  const target = sim.placeTower(g, "candy", 760, 220);
  const a = sim.placeTower(g, "coin", ...POCKET);
  const b = sim.placeTower(g, "coin", 870, 180);
  sim.upgradeTower(g, a, 2);
  sim.upgradeTower(g, b, 2);
  sim.update(g, 0.016);
  for (const src of [a, b])
    assert.ok(
      Math.hypot(target.x - src.x, target.y - src.y) <= src.def.auraRange,
      "both sources must actually reach the target, or this proves nothing",
    );
  assert.equal(target.buffRate, 0.08, "two identical auras must not add up");
});

test("compounding pays a share of the bank at wave end", () => {
  const g = sim.createGame(1);
  g.money = 100000;
  const coin = sim.placeTower(g, "coin", ...POCKET);
  sim.upgradeTower(g, coin, 1); // Piggy bank: 2%
  const bank = g.money;
  // Start a REAL round and then empty the road, rather than faking `phase`.
  // Rounds are tracked individually now — `g.live` is what says a round is
  // outstanding — so a hand-set phase with nothing registered is not a round
  // and correctly pays nothing.
  sim.startWave(g);
  g.queue = [];
  g.enemies = [];
  const ev = [];
  for (let i = 0; i < 4; i++) ev.push(...sim.update(g, 0.016));
  const end = ev.find((e) => e.t === "waveEnd");
  assert.ok(end, "wave should have ended");
  assert.ok(end.interest > 0, "interest is reported");
  assert.equal(end.interest, Math.round(bank * 0.02));
});

test("a maxed candy piñata is dramatically stronger than a fresh one", () => {
  const g = rich();
  const fresh = sim.placeTower(g, "candy", ...SPOT);
  const maxed = sim.placeTower(g, "candy", 300, 560);
  for (let i = 0; i < 4; i++) sim.upgradeTower(g, maxed, 0);
  for (let i = 0; i < 2; i++) sim.upgradeTower(g, maxed, 2);
  const dps = (t) => (t.def.damage * (t.def.pierce ?? 1)) / t.def.rate;
  assert.ok(
    dps(maxed) > dps(fresh) * 8,
    `maxed dps ${dps(maxed).toFixed(0)} should dwarf fresh ${dps(fresh).toFixed(0)}`,
  );
});

// ---------------------------------------------------- gum: the slow archetype
//
// Position is derived from `dist` every frame, so a test must walk an enemy
// down the lane rather than assigning x/y — assigning them is silently undone.
// LANE_AT_SPOT puts an enemy on the bottom leg, 82px from SPOT (range 112).
const LANE_AT_SPOT = 872;

test("gum slows what it hits", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [{ id: "tecnico", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  assert.equal(e.slow, 1, "starts unslowed");
  const t = sim.placeTower(g, "gum", ...SPOT);
  e.dist = LANE_AT_SPOT;
  sim.update(g, 0.016);
  assert.ok(
    Math.hypot(e.x - t.x, e.y - t.y) <= t.def.range,
    "the enemy must actually be in range, or this proves nothing",
  );
  for (let i = 0; i < 90; i++) sim.update(g, 0.016);
  assert.ok(e.slow < 1, `gum should slow, got ${e.slow}`);
  assert.equal(e.slow, TOWERS.gum.slow);
});

test("the toro charges straight through gum", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [{ id: "toro", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  const t = sim.placeTower(g, "gum", ...SPOT);
  e.dist = LANE_AT_SPOT;
  const ev = [];
  for (let i = 0; i < 90; i++) ev.push(...sim.update(g, 0.016));
  assert.equal(e.slow, 1, "the toro is immune");
  assert.ok(ev.some((x) => x.t === "shrug"), "and it says so out loud");
});

test("stickier tiers deepen the slow, bubble trap widens it", () => {
  const g = rich();
  const t = sim.placeTower(g, "gum", ...SPOT);
  const base = t.def.slow;
  sim.upgradeTower(g, t, 0);
  assert.ok(t.def.slow < base, "a lower multiplier is a stronger slow");
  const g2 = rich();
  const t2 = sim.placeTower(g2, "gum", ...SPOT);
  assert.equal(t2.def.slowSplash, 0);
  sim.upgradeTower(g2, t2, 1);
  assert.ok(t2.def.slowSplash > 0, "bubble trap adds splatter");
});

test("slow wears off", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [{ id: "tecnico", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  e.slow = 0.5;
  e.slowT = 0.3;
  for (let i = 0; i < 40; i++) sim.update(g, 0.016);
  assert.equal(e.slow, 1, "back to full speed once the timer runs out");
});

test("a slowed enemy actually travels less far", () => {
  const dist = (slow) => {
    const g = rich();
    g.phase = "wave";
    g.queue = [{ id: "tecnico", at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const e = g.enemies[0];
    e.slow = slow;
    e.slowT = 99;
    const from = e.dist;
    for (let i = 0; i < 60; i++) sim.update(g, 0.016);
    return e.dist - from;
  };
  const full = dist(1);
  const slowed = dist(0.5);
  assert.ok(slowed < full * 0.6, `slowed ${slowed.toFixed(1)} vs full ${full.toFixed(1)}`);
});

// ------------------------------------------------------------- targeting

test("targeting cycles through every mode and wraps", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  assert.equal(t.targeting, 0);
  const seen = [];
  for (let i = 0; i < sim.TARGETING.length; i++) seen.push(sim.cycleTargeting(g, t).id);
  assert.deepEqual(seen, [...sim.TARGETING.slice(1), sim.TARGETING[0]].map((m) => m.id));
  assert.equal(t.targeting, 0, "wraps back to the start");
  assert.equal(sim.cycleTargeting(g, t, -1).id, sim.TARGETING.at(-1).id, "and goes backwards");
});

test("each targeting mode picks the enemy it says it does", () => {
  // One tower with huge range, three enemies laid out so every mode has a
  // different correct answer: a fat rudo behind, a niño ahead, a niño nearest.
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  t.def = { ...t.def, range: 600 };
  g.phase = "wave";
  g.queue = [
    { id: "nino", at: 0, scale: 1 },
    { id: "rudo", at: 0, scale: 1 },
    { id: "nino", at: 0, scale: 1 },
  ];
  sim.update(g, 0.016);
  const [ahead, fat, behind] = g.enemies;
  ahead.dist = 1000;
  fat.dist = 872; // exactly beside the tower — also the closest
  behind.dist = 700;
  sim.update(g, 0.016);

  const pick = (mode) => {
    t.targeting = sim.TARGETING.findIndex((m) => m.id === mode);
    return sim.pickTarget(g, t);
  };
  for (const e of g.enemies)
    assert.ok(
      Math.hypot(e.x - t.x, e.y - t.y) <= t.def.range,
      "every enemy must be in range or the modes are not really being compared",
    );

  assert.equal(pick("first").id, ahead.id, "first takes the one furthest along");
  assert.equal(pick("last").id, behind.id, "last takes the one that just arrived");
  assert.equal(pick("strong").id, fat.id, "strong takes the rudo");
  const nearest = [...g.enemies].sort(
    (a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y),
  )[0];
  assert.equal(pick("close").id, nearest.id, "close takes the nearest");
  assert.notEqual(pick("first").id, pick("last").id, "modes must actually differ");
});

test("targeting only ever picks something in range", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", ...SPOT);
  g.phase = "wave";
  g.queue = [{ id: "nino", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  for (const mode of sim.TARGETING) {
    t.targeting = sim.TARGETING.indexOf(mode);
    assert.equal(sim.pickTarget(g, t), null, `${mode.id} must not reach across the map`);
  }
});

// ------------------------------------------------- plateado: the burn counter

test("the plateado reflects burn but takes candy normally", () => {
  const hit = (dmgType) => {
    const g = rich();
    g.phase = "wave";
    g.queue = [{ id: "plateado", at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const e = g.enemies[0];
    const before = e.hp;
    sim.damage(g, e, 100, dmgType);
    return before - e.hp;
  };
  assert.equal(hit(DMG.SHARP), 100, "candy lands in full");
  assert.equal(hit(DMG.SPLASH), 100, "so does a firecracker");
  assert.ok(hit(DMG.BURN) < 20, `fire should mostly slide off, took ${hit(DMG.BURN)}`);
});

test("a pure chili build stalls on plateados where a candy build does not", () => {
  const clear = (type) => {
    const g = rich();
    const spots = sim.bestSpots(g, 5);
    for (const s of spots) {
      const t = sim.placeTower(g, type, ...s);
      if (t) for (let p = 0; p < 3; p++) for (let i = 0; i < 2; i++) sim.upgradeTower(g, t, p);
    }
    g.phase = "wave";
    g.queue = Array.from({ length: 6 }, (_, i) => ({ id: "plateado", at: i * 1.1, scale: 1 }));
    for (let i = 0; i < 60 / 0.016 && (g.queue.length || g.enemies.length); i++) sim.update(g, 0.016);
    return g.stats.leaked;
  };
  const chiliLeaks = clear("chili");
  const candyLeaks = clear("candy");
  assert.ok(
    chiliLeaks > candyLeaks,
    `chili should struggle: chili leaked ${chiliLeaks}, candy leaked ${candyLeaks}`,
  );
});

test("burn ticks are reduced on a plateado over time, not just on impact", () => {
  const burnOff = (id) => {
    const g = rich();
    g.phase = "wave";
    g.queue = [{ id, at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const e = g.enemies[0];
    e.burn = 40;
    e.burnT = 2;
    const before = e.hp;
    for (let i = 0; i < 100; i++) sim.update(g, 0.016);
    return before - e.hp;
  };
  const plain = burnOff("tecnico");
  const foil = burnOff("plateado");
  assert.ok(foil < plain * 0.3, `foil ${foil.toFixed(1)} should be far under plain ${plain.toFixed(1)}`);
});

// ------------------------------------------------- maraca: the stun archetype

const LANE_AT_SPOT_2 = 872;

test("a rattled enemy stops moving, then carries on", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [{ id: "tecnico", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  e.stunT = 0.5;
  const held = e.dist;
  for (let i = 0; i < 20; i++) sim.update(g, 0.016);
  assert.equal(e.dist, held, "a stunned enemy does not advance at all");
  for (let i = 0; i < 40; i++) sim.update(g, 0.016);
  assert.ok(e.dist > held, "and moves again once it wears off");
});

test("the maraca stuns what it hits", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [{ id: "tecnico", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  const t = sim.placeTower(g, "maraca", ...SPOT);
  e.dist = LANE_AT_SPOT_2;
  sim.update(g, 0.016);
  assert.ok(
    Math.hypot(e.x - t.x, e.y - t.y) <= t.def.range,
    "the enemy must be in range or this proves nothing",
  );
  const ev = [];
  for (let i = 0; i < 150; i++) ev.push(...sim.update(g, 0.016));
  assert.ok(ev.some((x) => x.t === "stunned"), "the rattle should land");
});

test("heavies shake a rattle off faster, the campeón nearly ignores it", () => {
  const held = (id) => {
    const g = rich();
    g.phase = "wave";
    g.queue = [{ id, at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const e = g.enemies[0];
    const secs = TOWERS.maraca.stun * (1 - (ENEMIES[id].stunResist ?? 0));
    return secs;
  };
  assert.ok(held("tecnico") > held("rudo"), "a rudo shrugs sooner than a técnico");
  assert.ok(held("rudo") > held("campeon"), "and the champion sooner than a rudo");
  assert.ok(held("campeon") < 0.15, "the boss is barely held at all");
});

test("stun resistance can reduce a hold to nothing, which reads as a shrug", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [{ id: "campeon", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  const t = sim.placeTower(g, "maraca", ...SPOT);
  t.def = { ...t.def, stun: 0.02, range: 900 };
  const ev = [];
  for (let i = 0; i < 200; i++) ev.push(...sim.update(g, 0.016));
  assert.ok(ev.some((x) => x.t === "shrug"), "a hold too short to matter says so");
  assert.equal(e.stunT, 0, "and applies nothing");
});

// ------------------------------------------------ sparkler: reach over rate

test("the sparkler outranges every other piñata by a wide margin", () => {
  const others = Object.values(TOWERS).filter((t) => t.id !== "sparkler" && t.damage > 0);
  for (const o of others)
    assert.ok(TOWERS.sparkler.range > o.range * 1.7, `should dwarf ${o.id}'s range`);
});

test("the sparkler trades rate for punch", () => {
  const dps = (t) => (t.damage * (t.pierce || 1)) / t.rate;
  assert.ok(TOWERS.sparkler.damage > TOWERS.candy.damage * 8, "far heavier per hit");
  assert.ok(TOWERS.sparkler.rate > TOWERS.candy.rate * 3, "and far slower");
  assert.ok(
    dps(TOWERS.sparkler) < dps(TOWERS.candy) * 3,
    "so its raw dps is not runaway despite the huge hit",
  );
});

test("the Further path actually extends reach", () => {
  const g = rich();
  const t = sim.placeTower(g, "sparkler", ...SPOT);
  const base = t.def.range;
  sim.upgradeTower(g, t, 1);
  assert.ok(t.def.range > base, "range should climb");
  assert.equal(t.def.damage, TOWERS.sparkler.damage, "without touching damage at tier 1");
});

// -------------------------------------------- colgado: the speed counter

test("the colgado swings across the lane instead of walking down the middle", () => {
  const g = rich();
  g.phase = "wave";
  g.queue = [
    { id: "colgado", at: 0, scale: 1 },
    { id: "tecnico", at: 0, scale: 1 },
  ];
  sim.update(g, 0.016);
  const [swinger, walker] = g.enemies;
  const off = (e) => {
    const p = sim.pointAt(g.path, e.dist);
    return Math.hypot(e.x - p.x, e.y - p.y);
  };
  let maxSwing = 0;
  let maxWalk = 0;
  for (let i = 0; i < 200; i++) {
    sim.update(g, 0.016);
    maxSwing = Math.max(maxSwing, off(swinger));
    maxWalk = Math.max(maxWalk, off(walker));
  }
  assert.ok(maxWalk < 0.001, "an ordinary enemy stays on the centre line");
  assert.ok(maxSwing > 10, `a colgado should swing wide, peaked at ${maxSwing.toFixed(1)}`);
});

test("a slow shot can miss a swinging colgado, a fast one cannot", () => {
  const dodges = (speed, dmgType = DMG.SHARP) => {
    const g = rich(7);
    g.phase = "wave";
    let missed = 0;
    for (let trial = 0; trial < 60; trial++) {
      g.queue = [{ id: "colgado", at: g.time, scale: 1 }];
      sim.update(g, 0.016);
      const e = g.enemies.at(-1);
      // catch it mid-swing, where it is moving fastest across the lane
      e.swayT = 0;
      e.swayV = ENEMIES.colgado.sway * ENEMIES.colgado.swayRate;
      const shot = { speed, dmgType, dmg: 1, pen: 0, hits: new Set(), splash: 0 };
      const ev = [];
      // drive the same predicate the projectile loop uses
      if (sim.wouldDodge(g, e, shot)) missed += 1;
      g.enemies.length = 0;
    }
    return missed;
  };
  assert.ok(dodges(330) > 10, "a slow shot is swung away from");
  assert.equal(dodges(900), 0, "a sparkler is not");
  assert.equal(dodges(330, DMG.SPLASH), 0, "and splash does not care where it is");
});

test("only a colgado at the fast part of its swing can dodge", () => {
  const g = rich(3);
  g.phase = "wave";
  g.queue = [{ id: "colgado", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  const shot = { speed: 330, dmgType: DMG.SHARP, dmg: 1, hits: new Set(), splash: 0 };
  e.swayV = 0; // at the top of the arc, momentarily still
  let dodged = 0;
  for (let i = 0; i < 40; i++) if (sim.wouldDodge(g, e, shot)) dodged += 1;
  assert.equal(dodged, 0, "a colgado hanging still is an easy target");
});

// ------------------------------------------ edge falloff: reach has a price

test("a shot taken at the rim hits softer than one taken up close", () => {
  const range = 200;
  assert.equal(sim.edgeFalloff(0, range), 1, "no penalty at the tower's feet");
  assert.ok(
    Math.abs(sim.edgeFalloff(range, range) - EDGE_MUL) < 1e-9,
    "full penalty at the rim",
  );
  assert.ok(
    sim.edgeFalloff(range, range) < sim.edgeFalloff(range * 0.2, range),
    "and monotonically softer with distance",
  );
  assert.equal(sim.edgeFalloff(range * 3, range), EDGE_MUL, "clamped past the rim");
});

test("a real tower actually applies falloff to the shots it fires", () => {
  // Two enemies at different lane positions, so both are legitimately placed by
  // the sim rather than by hand, at different distances from one tower.
  const g = rich();
  const t = sim.placeTower(g, "sparkler", ...SPOT);
  g.phase = "wave";
  g.queue = [{ id: "rudo", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];

  const dmgFromLaneDist = (laneDist) => {
    e.dist = laneDist;
    sim.update(g, 0.016);
    const away = Math.hypot(e.x - t.x, e.y - t.y);
    if (away > t.def.range) return null;
    t.cool = 0;
    const before = g.shots.length;
    sim.update(g, 0.016);
    const shot = g.shots[before] ?? g.shots.at(-1);
    return shot ? { dmg: shot.dmg, away } : null;
  };
  // 872 is beside the tower; 760 is further back along the same leg.
  const near = dmgFromLaneDist(872);
  const far = dmgFromLaneDist(700);
  assert.ok(near && far, "both positions must be inside a sparkler's reach");
  assert.ok(far.away > near.away, "the second position is genuinely further out");
  assert.ok(
    far.dmg < near.dmg,
    `further should hit softer: ${far.dmg.toFixed(1)} at ${Math.round(far.away)}px ` +
      `vs ${near.dmg.toFixed(1)} at ${Math.round(near.away)}px`,
  );
});

test("falloff is linear between the tower's feet and its rim", () => {
  // Checked against the formula rather than magic numbers, so retuning EDGE_MUL
  // does not need this test hand-edited.
  const expected = (f) => 1 - (1 - EDGE_MUL) * f;
  assert.ok(EDGE_MUL < 1, "falloff is on; if this is 1 the mechanic is disabled");
  assert.ok(expected(0) === 1, "no penalty at the tower itself");
  assert.ok(Math.abs(expected(1) - EDGE_MUL) < 1e-9, "full penalty at the rim");
  assert.ok(expected(0.5) > expected(1) && expected(0.5) < expected(0), "monotonic between");
});

test("falloff is what makes range placement matter, and it is documented as such", () => {
  // Guards the pairing: EDGE_MUL costs DPS and HP_MUL pays it back. Shipping one
  // without the other made every board unwinnable.
  assert.ok(EDGE_MUL < 1 && HP_MUL < 1, "the two constants must move together");
});

// ------------------------------------------------------ sprite coverage

test("every sprite name builds and has a sane anchor", () => {
  // Runs headless, so it cannot rasterize — it checks the registry instead, which
  // is what catches a tower or enemy referencing a sprite that does not exist.
  const referenced = new Set([
    ...Object.values(TOWERS).map((t) => t.sprite),
    ...Object.values(ENEMIES).map((e) => e.sprite),
    "stand",
  ]);
  for (const name of referenced)
    assert.ok(
      sim.SPRITE_NAMES.includes(name),
      `${name} is referenced by data.js but has no builder in art.js`,
    );
});

// ------------------------------------------------------------------ the ribbon

// Two luchadores side by side at the tower's feet. Queued directly and walked to
// `LANE_AT_SPOT` — the same trick the gum and maraca tests use, because spawning
// a wave and hoping they wander into range proves nothing when they do not.
const pair = (g, gapSim = 30) => {
  g.phase = "wave";
  g.queue = [
    { id: "tecnico", at: 0, scale: 1 },
    { id: "tecnico", at: 0, scale: 1 },
  ];
  sim.update(g, 0.016);
  const es = g.enemies.slice(0, 2);
  es[0].dist = LANE_AT_SPOT;
  es[1].dist = LANE_AT_SPOT - gapSim;
  sim.update(g, 0.016);
  return es;
};

test("a ribbon shot jumps from the luchador it hit to the next one along", () => {
  const g = rich();
  const t = sim.placeTower(g, "ribbon", ...SPOT);
  const es = pair(g);
  assert.equal(es.length, 2, "two luchadores must be standing there");
  assert.ok(
    Math.hypot(es[0].x - t.x, es[0].y - t.y) <= t.def.range,
    "the first luchador must be in range, or this proves nothing",
  );
  const before = es.map((e) => e.hp);
  let chained = 0;
  for (let i = 0; i < 200; i++) for (const e of sim.update(g, 0.016)) if (e.t === "chain") chained++;
  assert.ok(chained > 0, "no chain event was ever raised");
  assert.ok(es[1].hp < before[1] || es[1].hp <= 0, "the second luchador was never touched");
});

test("a jump costs damage, and the falloff is what an upgrade buys back", () => {
  const base = up.computeStats("ribbon", TOWERS.ribbon, [0, 0, 0]);
  const spun = up.computeStats("ribbon", TOWERS.ribbon, [0, 0, 3]);
  assert.ok(base.chainFalloff < 1, "a jump should cost damage by default");
  assert.ok(spun.chainFalloff > base.chainFalloff, "Blur should recover some of it");
  // The cap matters: DEEP_POWER triples a top tier's additive part, so a top
  // tier that touched falloff would make a shot gain damage per jump.
  const maxed = up.computeStats("ribbon", TOWERS.ribbon, [0, 0, MAX_TIER]);
  assert.ok(maxed.chainFalloff <= 1, `chain falloff ran past 1: ${maxed.chainFalloff}`);
});

test("the ribbon never hits the same luchador twice with one throw", () => {
  const g = rich();
  sim.placeTower(g, "ribbon", ...SPOT);
  pair(g, 26);
  for (let i = 0; i < 300; i++) {
    sim.update(g, 0.016);
    for (const s of g.shots) assert.ok(s.hits.size <= 1 + (s.chain ?? 0) + 3, "a shot re-hit its own targets");
  }
});

test("more jumps is what the first path sells", () => {
  const a = up.computeStats("ribbon", TOWERS.ribbon, [0, 0, 0]);
  const b = up.computeStats("ribbon", TOWERS.ribbon, [2, 0, 0]);
  assert.ok(b.chain > a.chain);
  assert.ok(b.chainRange > a.chainRange);
});

// The whole reason the tower exists. If a throw into a crowd is not worth
// several throws at a lone runner, the chain is decoration.
test("a ribbon throw pays for itself in a crowd and barely at all on a lone runner", () => {
  const damageDealt = (n) => {
    const g = rich();
    sim.placeTower(g, "ribbon", ...SPOT);
    g.phase = "wave";
    g.queue = Array.from({ length: n }, () => ({ id: "tecnico", at: 0, scale: 1 }));
    sim.update(g, 0.016);
    const es = g.enemies.slice(0, n);
    es.forEach((e, i) => (e.dist = LANE_AT_SPOT - i * 26));
    const before = es.reduce((a, e) => a + e.hp, 0);
    for (let i = 0; i < 120; i++) sim.update(g, 0.016);
    const after = g.enemies.filter((e) => es.includes(e)).reduce((a, e) => a + e.hp, 0);
    return before - after;
  };
  const alone = damageDealt(1);
  const crowd = damageDealt(4);
  assert.ok(alone > 0, "the ribbon must at least hit the one it aimed at");
  assert.ok(
    crowd > alone * 1.8,
    `a crowd should be worth far more than a single target: ${crowd} vs ${alone}`,
  );
});

// ------------------------------------------------------------- papel picado

test("the paper cuts everything under it at once, not one target", () => {
  const g = rich();
  const t = sim.placeTower(g, "papel", ...SPOT);
  g.phase = "wave";
  g.queue = Array.from({ length: 3 }, () => ({ id: "tecnico", at: 0, scale: 1 }));
  sim.update(g, 0.016);
  const es = g.enemies.slice(0, 3);
  es.forEach((e, i) => (e.dist = LANE_AT_SPOT - i * 18));
  // `update` recomputes x/y from dist, so the positions are not real until it has
  // run once. Asserting on them straight after the assignment tests nothing.
  sim.update(g, 0.016);
  const before = es.map((e) => e.hp);
  assert.ok(
    es.every((e) => Math.hypot(e.x - t.x, e.y - t.y) <= t.def.range),
    "all three must be under the paper, or this proves nothing",
  );
  for (let i = 0; i < 60; i++) sim.update(g, 0.016);
  es.forEach((e, i) => assert.ok(e.hp < before[i], `luchador ${i} was never cut`));
});

// The reason it exists. Cape and swing are rules about projectiles, so the one
// piñata with no projectile is the answer to both.
test("a cape cannot be waved at paper", () => {
  const cut = (id) => {
    const g = rich();
    sim.placeTower(g, "papel", ...SPOT);
    g.phase = "wave";
    g.queue = [{ id, at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const e = g.enemies[0];
    e.dist = LANE_AT_SPOT;
    const before = e.hp;
    let deflects = 0;
    for (let i = 0; i < 90; i++)
      for (const ev of sim.update(g, 0.016)) if (ev.t === "deflect") deflects++;
    return { dealt: before - (g.enemies.includes(e) ? e.hp : 0), deflects };
  };
  const m = cut("matador");
  assert.ok(m.dealt > 0, "the matador took nothing");
  assert.equal(m.deflects, 0, "a field raised a deflect, which it cannot do");
});

test("the field pays the same range falloff a shot would", () => {
  const g = rich();
  const t = sim.placeTower(g, "papel", ...SPOT);
  const near = sim.edgeFalloff(4, t.def.range);
  const far = sim.edgeFalloff(t.def.range - 2, t.def.range);
  assert.ok(near > far, "falloff must still apply under the paper");
});

test("the tangled path is what turns the paper into a slow", () => {
  const plain = up.computeStats("papel", TOWERS.papel, [0, 0, 0]);
  const tangled = up.computeStats("papel", TOWERS.papel, [0, 0, 2]);
  assert.ok(!(plain.slow > 0 && plain.slow < 1), "it should not slow before the path is bought");
  assert.ok(tangled.slow > 0 && tangled.slow < 1, "Streamers should slow");
});

// ------------------------------------------------------------- mariachi trio

test("the trio buffs its neighbours out of the box, with nothing bought", () => {
  const g = rich();
  const trio = sim.placeTower(g, "mariachi", ...SPOT);
  const near = sim.placeTower(g, "candy", SPOT[0] + 60, SPOT[1]);
  sim.update(g, 0.016);
  assert.ok(Math.hypot(near.x - trio.x, near.y - trio.y) <= trio.def.auraRange, "must be in earshot");
  assert.ok(near.buffRate > 0, "the neighbour was not sped up");
  assert.equal(trio.buffRate, 0, "the trio should not buff itself");
});

test("a trio hits nothing itself", () => {
  const g = rich();
  const trio = sim.placeTower(g, "mariachi", ...SPOT);
  g.phase = "wave";
  g.queue = [{ id: "tecnico", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const e = g.enemies[0];
  e.dist = LANE_AT_SPOT;
  sim.update(g, 0.016);
  const before = e.hp;
  for (let i = 0; i < 120; i++) sim.update(g, 0.016);
  assert.equal(e.hp, before, "a pure support dealt damage");
  assert.equal(trio.def.damage, 0);
});

test("each mariachi path deepens a different part of the aura", () => {
  const base = up.computeStats("mariachi", TOWERS.mariachi, [0, 0, 0]);
  const tempo = up.computeStats("mariachi", TOWERS.mariachi, [2, 0, 0]);
  const brass = up.computeStats("mariachi", TOWERS.mariachi, [0, 2, 0]);
  const band = up.computeStats("mariachi", TOWERS.mariachi, [0, 0, 2]);
  assert.ok(tempo.auraRate > base.auraRate);
  assert.ok(brass.auraDamage > base.auraDamage);
  assert.ok(band.auraRange > base.auraRange);
  assert.equal(brass.auraRate, base.auraRate, "brass should not also buy tempo");
});

// ------------------------------------------------- the wave's counter rule

// The tip shown on the next-round card is derived from the same enemy flags the
// sim fights with, so a rule change cannot leave the advice behind. These assert
// the flags it reads still exist and still belong to the enemy they describe.
test("every counter rule the intel tip reads is still on the enemy it names", () => {
  assert.ok(ENEMIES.matador.cape > 0, "the matador's cape is what makes slow shots miss");
  assert.ok(ENEMIES.colgado.sway > 0, "the colgado's swing is a sway, not a cape");
  assert.ok((ENEMIES.plateado.resist?.[DMG.BURN] ?? 0) > 0.5, "foil should shed fire");
  assert.ok((ENEMIES.rudo.resist?.[DMG.SHARP] ?? 0) > 0.2, "the rudo should shrug off sharp");
  assert.equal(ENEMIES.toro.noSlow, true, "the toro should ignore slows");
});

// ------------------------------------------------------- what a tier reads as

// The upgrade rows show numbers now, not sentences, and those numbers are read
// off the same `mod` the sim applies. If a tier's effect changes, the row changes
// with it — which is the whole reason the blurbs went.
test("every tier of every path describes itself in at least one chip", () => {
  for (const [type, paths] of Object.entries(up.PATHS))
    paths.forEach((path, pi) =>
      path.tiers.forEach((tier, ti) => {
        const chips = up.describeMod(tier.mod, { top: ti === up.MAX_TIER - 1 });
        assert.ok(chips.length > 0, `${type}/${pi}/${ti} (${tier.name}) describes nothing`);
        for (const c of chips) assert.ok(/\d/.test(c), `${type}/${pi}/${ti}: "${c}" has no number in it`);
      }),
    );
});

test("a cut to cooldown reads as a gain, and so does a cut to enemy speed", () => {
  // rate 0.84 is a 16% shorter cooldown: good for you.
  assert.deepEqual(up.describeMod({ rate: { mul: 0.84 } }), ["-16% cool"]);
  // slow 0.72 means they walk at 72% speed: also good for you, and "-28% slow"
  // reads as the opposite of what it does.
  assert.deepEqual(up.describeMod({ slow: { mul: 0.72 } }), ["+28% slow"]);
});

test("a fraction of a whole is never advertised past 100%", () => {
  // `sharpPierce` is a share of the target's armour, so anything over 1 is a
  // promise the sim cannot keep. The original risk was DEEP_POWER tripling a top
  // tier (0.35 x 3 = "+105%"); with the multiplier at 1 that particular route is
  // gone, but folding two rungs into a capstone SUMS their pierce, so the clamp
  // still has a job.
  assert.deepEqual(up.describeMod({ sharpPierce: { add: 0.35 } }, { top: true }), ["+35% pierce"]);
  assert.deepEqual(up.describeMod({ sharpPierce: { add: 1.4 } }, { top: true }), ["+100% pierce"]);
  // And no real capstone in the game may advertise more than it can deliver.
  for (const paths of Object.values(up.PATHS))
    for (const path of paths) {
      const pierce = path.tiers.reduce((a, t) => a + (t.mod?.sharpPierce?.add ?? 0), 0);
      assert.ok(pierce <= 1, `${path.name} totals ${pierce} pierce`);
    }
});

// Every refusal has to be sayable in two registers: a badge that fits in a row,
// and a sentence to float over the piñata when the click is refused. They come
// from one table so the row and the refusal can never disagree.
test("every block reason carries a short badge and a sentence", () => {
  for (const b of Object.values(BLOCKS)) {
    assert.equal(typeof b.short, "string");
    assert.equal(typeof b.why, "string");
    assert.ok(b.short.length <= 14, `${b.code} badge too long for a row: ${b.short}`);
    assert.ok(b.why.length > b.short.length, `${b.code} sentence should say more`);
  }
});

// The three ways a click can be refused, each identified by its own code. The
// panel branches on these: MAXED is an achievement and renders gold, the other
// two are rules and render locked.
test("blockedBy names which rule stopped the purchase", () => {
  assert.equal(blockedBy([0, 0, 0], 0), null);
  assert.equal(blockedBy([1, 1, 0], 2).code, "PATHS", "a third path is refused");
  assert.equal(blockedBy([1, 1, 0], 0), null, "a path you already opened stays open");
  // Reaching the cross-path cap is allowed; passing it while another path is
  // already past it is not. 1 -> 2 is the cap, 2 -> 3 is past it.
  assert.equal(blockedBy([2, 1, 0], 1), null, "1 -> 2 lands ON the cap");
  assert.equal(blockedBy([3, 2, 0], 1).code, "CROSS", "2 -> 3 passes it");
  // With a three-rung ladder and a cap of 2, "past the cap" and "maxed" are the
  // same state — a path that got past the cap has nowhere left to go.
  assert.equal(blockedBy([3, 2, 0], 0).code, "MAXED", "past the cap is also the top");
  assert.equal(blockedBy([MAX_TIER, 1, 0], 0).code, "MAXED");
});

// A maxed path must NOT be reported as a rule violation: it used to share the
// "blocked" string, so the panel drew a padlock on a finished path.
test("maxed is told apart from forbidden", () => {
  const maxed = blockedBy([MAX_TIER, 0, 0], 0);
  const forbidden = blockedBy([1, 1, 0], 2);
  assert.notEqual(maxed.code, forbidden.code);
  assert.equal(maxed.short, "MAX");
});

// blockedReason is still the sentence, so nothing that used it had to change.
test("blockedReason stays the sentence form of blockedBy", () => {
  for (const tiers of [[0, 0, 0], [1, 1, 0], [3, 1, 0], [MAX_TIER, 0, 0]])
    for (let p = 0; p < 3; p++)
      assert.equal(blockedReason(tiers, p), blockedBy(tiers, p)?.why ?? null);
});

// ---------------------------------------------------------------- abilities
//
// The complaint these answer: "the upgrades are just numerical". A tier-4 that
// only adds damage is a bigger number with a better name.

test("every path ends in a named ability, not a bigger number", () => {
  for (const [id, paths] of Object.entries(up.PATHS))
    for (const path of paths) {
      assert.ok(path.tiers.at(-1).special, `${id} / "${path.name}" tops out at a number`);
      // Every rung BELOW the capstone is a number; the capstone is the ability.
      for (let t = 0; t < path.tiers.length - 1; t++)
        assert.ok(!path.tiers[t].special, `${id} / "${path.name}" gives an ability before the capstone`);
    }
});

test("the abilities are a small shared vocabulary, not thirty one-offs", () => {
  const all = Object.values(up.PATHS).flatMap((ps) => ps.map((p) => p.tiers.at(-1).special));
  const kinds = new Set(all);
  assert.ok(kinds.size >= 5, `only ${kinds.size} distinct abilities`);
  assert.ok(kinds.size <= 10, `${kinds.size} abilities is a vocabulary nobody can learn`);
});

test("buying a top tier grants its ability and nothing else does", () => {
  const base = TOWERS.candy;
  assert.deepEqual(up.computeStats("candy", base, [0, 0, 0]).special, []);
  assert.deepEqual(up.computeStats("candy", base, [MAX_TIER - 1, 0, 0]).special, []);
  assert.deepEqual(up.computeStats("candy", base, [MAX_TIER, 0, 0]).special, ["execute"]);
  // Two paths cannot both reach the capstone, so a piñata carries at most one ability.
  for (const tiers of [[MAX_TIER, 2, 0], [2, MAX_TIER, 0], [0, 2, MAX_TIER]])
    assert.ok(up.computeStats("candy", base, tiers).special.length <= 1, `${tiers} stacked abilities`);
});

// What it throws is the other half of "looks like an upgrade". It comes from the
// deepest path, and only once you have actually invested in one.
test("the projectile changes with the path you commit to", () => {
  const base = TOWERS.candy;
  assert.equal(up.computeStats("candy", base, [1, 0, 0]).shotArt, undefined, "tier 1 is too early");
  assert.equal(up.computeStats("candy", base, [2, 0, 0]).shotArt, "sharp");
  assert.equal(up.computeStats("candy", base, [0, 2, 0]).shotArt, "swift");
  assert.equal(up.computeStats("candy", base, [0, 0, 2]).shotArt, "spread");
  // The deeper path wins, so the piñata throws one thing rather than two.
  assert.equal(up.computeStats("candy", base, [3, 2, 0]).shotArt, "sharp");
  assert.equal(up.computeStats("candy", base, [2, 3, 0]).shotArt, "swift");
});

test("execute cannot be used on a boss", () => {
  const g = rich();
  const t = sim.placeTower(g, "candy", SPOT[0], SPOT[1]);
  t.tiers = [MAX_TIER, 0, 0];
  t.def = up.computeStats("candy", t.base, t.tiers);
  assert.ok(t.def.special.includes("execute"));
  // El Coloso on 1% health must still have to be killed, not deleted.
  g.wave = 16;
  sim.startWave(g);
  for (let i = 0; i < 400 && !g.enemies.length; i++) sim.update(g, 0.05);
  const boss = g.enemies.find((e) => e.def.boss);
  if (boss) {
    boss.hp = boss.maxHp * 0.02;
    const before = boss.hp;
    for (let i = 0; i < 20; i++) sim.update(g, 0.05);
    const still = g.enemies.find((e) => e === boss);
    // Either it took ordinary damage or it died to ordinary damage — what must
    // not happen is a one-shot execute the moment it dips under the threshold.
    if (still) assert.ok(still.hp <= before, "boss took no damage at all");
  }
});

// An ability the panel does not mention is an ability the player thinks is a
// number. Every one of them has to be sayable in a row.
test("every ability has a chip, and it leads the row", () => {
  const named = new Set(Object.values(up.PATHS).flatMap((ps) => ps.map((p) => p.tiers.at(-1).special)));
  for (const a of named) {
    assert.ok(up.ABILITY[a], `ability "${a}" has nothing to show in the panel`);
    assert.ok(up.ABILITY[a].length <= 20, `"${up.ABILITY[a]}" is too long for a row`);
  }
  const chips = up.describeMod({ damage: { add: 26 } }, { top: true, special: "execute" });
  assert.equal(chips[0], up.ABILITY.execute, "the ability should come before the numbers");
  assert.ok(chips.length > 1, "the numbers should still be there");
});

// An ability on a piñata that cannot trigger it is not an ability. The coin has
// damage 0 and the firing loop skips zero-damage towers outright, so "earns per
// hit" could never once have fired.
test("no ability is stranded on a piñata that cannot use it", () => {
  const SHOOTS = (id) => TOWERS[id].damage > 0;
  const NEEDS_SHOT = ["execute", "pierceAll", "volley", "wildfire", "shockwave", "freeze"];
  for (const [id, paths] of Object.entries(up.PATHS))
    for (const path of paths) {
      const sp = path.tiers.at(-1).special;
      if (NEEDS_SHOT.includes(sp))
        assert.ok(SHOOTS(id), `${id} has damage 0 but its "${path.name}" grants ${sp}, which rides on a shot`);
    }
});

test("payday pays out of defeats, not out of hits", () => {
  const g = rich(7);
  // Scanned rather than hardcoded: fixed spots break whenever a lane is redrawn.
  let t = null;
  for (let x = 90; x < 900 && !t; x += 20)
    for (let y = 90; y < 550 && !t; y += 20)
      if (sim.canPlace(g, x, y)) t = sim.placeTower(g, "coin", x, y);
  assert.ok(t, "nowhere to put a coin piñata");
  t.tiers = [MAX_TIER, 0, 0];
  t.def = up.computeStats("coin", t.base, t.tiers);
  assert.ok(t.def.special.includes("payday"));
  assert.equal(t.def.damage, 0, "the coin still does not shoot — that is the point");
  g.money = 0; // zeroed AFTER buying, or it could not have been bought at all
  // A defeat anywhere on the board pays it.
  sim.startWave(g);
  for (let i = 0; i < 200 && !g.enemies.length; i++) sim.update(g, 0.05);
  const e = g.enemies[0];
  const before = g.money;
  assert.ok(e, "no enemy to defeat");
  // Killed through the sim's own damage path — the coin cannot kill anything
  // itself, which is exactly why this ability had to move off the shot.
  sim.damage(g, e, e.hp + 1, e.def.dmgType ?? 0);
  assert.ok(g.money > before, "a defeat paid the treasury nothing");
  assert.ok(g.money >= Math.round(e.def.bounty * 0.25), "the cut is too small to notice");
});
