import test from "node:test";
import assert from "node:assert/strict";
import * as sim from "../src/sim.js";
import { MAP, TOWERS, ENEMIES, WAVES, DMG, DIFFICULTIES, BLINDFOLD, BOUNTY_MUL } from "../src/data.js";

const run = (g, secs, dt = 0.016) => {
  const out = [];
  for (let i = 0; i < Math.ceil(secs / dt); i++) out.push(...sim.update(g, dt));
  return out;
};
const types = (ev, t) => ev.filter((e) => e.t === t);

// Legal ground on Plaza del Sol: the strip below the bottom leg of the lane,
// and one pocket on the right. Kept here so a map redraw breaks one constant.
const SPOT = [200, 560];
const ROW = (i) => [200 + i * 52, 560];
const POCKET = [680, 300];

// ------------------------------------------------------------------- path

test("path length is the sum of its segments", () => {
  const p = sim.buildPath([
    [0, 0],
    [30, 40],
    [30, 140],
  ]);
  assert.equal(p.total, 150);
});

test("pointAt walks the lane and clamps at both ends", () => {
  const p = sim.buildPath([
    [0, 0],
    [100, 0],
  ]);
  assert.equal(sim.pointAt(p, 50).x, 50);
  assert.equal(sim.pointAt(p, -20).x, 0);
  assert.equal(sim.pointAt(p, 999).x, 100);
});

test("distToPath measures perpendicular distance", () => {
  const p = sim.buildPath([
    [0, 0],
    [100, 0],
  ]);
  assert.equal(sim.distToPath(p, 50, 30), 30);
  assert.equal(sim.distToPath(p, 50, -12), 12);
});

// -------------------------------------------------------------- placement

test("towers cannot be placed on the lane", () => {
  const g = sim.createGame(1);
  const [x, y] = MAP.path[1];
  assert.equal(sim.canPlace(g, x, y), false);
  assert.equal(sim.placeTower(g, "candy", x, y), null);
  assert.equal(g.money, DIFFICULTIES.plaza.money, "a rejected placement must not charge");
});

test("towers cannot overlap each other", () => {
  const g = sim.createGame(1);
  assert.ok(sim.placeTower(g, "candy", ...SPOT));
  assert.equal(sim.canPlace(g, SPOT[0] + 12, SPOT[1]), false);
  assert.ok(sim.canPlace(g, SPOT[0] + 56, SPOT[1]));
});

test("placement is refused when short of candy", () => {
  const g = sim.createGame(1);
  g.money = 10;
  assert.equal(sim.placeTower(g, "candy", ...SPOT), null);
  assert.equal(g.towers.length, 0);
});

test("selling refunds 70 percent and removes the tower", () => {
  const g = sim.createGame(1);
  const t = sim.placeTower(g, "candy", ...SPOT);
  const before = g.money;
  const refund = sim.sellTower(g, t);
  assert.equal(refund, Math.floor(TOWERS.candy.cost * 0.7));
  assert.equal(g.money, before + refund);
  assert.equal(g.towers.length, 0);
});

// ------------------------------------------------------------------ waves

test("starting a wave queues every enemy in its groups", () => {
  const g = sim.createGame(1);
  sim.startWave(g);
  const expected = WAVES[0].reduce((n, grp) => n + grp.n, 0);
  assert.equal(g.queue.length, expected);
  assert.equal(g.phase, "wave");
});

test("a round can be sent on top of one already running", () => {
  const g = sim.createGame(1);
  assert.equal(sim.startWave(g), true);
  assert.equal(g.wave, 1);
  // The old rule was "one at a time" and it is now deliberately false: most of
  // a round is spent watching enemies walk, and sending early is what turns
  // that wait into a decision.
  assert.equal(sim.startWave(g), true);
  assert.equal(g.wave, 2);
  assert.deepEqual(sim.liveWaves(g), [1, 2], "both rounds are on the road");
  // Both rounds' spawns share one queue, and each entry knows which round it is.
  assert.ok(g.queue.some((q) => q.wave === 1));
  assert.ok(g.queue.some((q) => q.wave === 2));
});

test("each round pays its own bonus, at its own rate", () => {
  const g = sim.createGame(1);
  g.money = 0;
  sim.startWave(g);
  sim.startWave(g);
  const ends = [];
  for (let t = 0; t < 400 && g.phase === "wave"; t += 1 / 60)
    for (const e of sim.update(g, 1 / 60)) if (e.t === "waveEnd") ends.push(e);
  assert.deepEqual(ends.map((e) => e.wave), [1, 2], "one payout per round, oldest first");
  // Priced off the round that ended, not off the newest one — otherwise
  // pressing send early is free money.
  assert.ok(ends[1].bonus > ends[0].bonus, "the later round pays more");
});

test("you cannot send past the last authored round outside freeplay", () => {
  const g = sim.createGame(1);
  g.wave = WAVES.length;
  assert.equal(sim.startWave(g), false);
  g.freeplay = true;
  assert.equal(sim.startWave(g), true);
});

test("an undefended wave leaks and drains the great piñata", () => {
  const g = sim.createGame(1);
  sim.startWave(g);
  const ev = run(g, 40);
  assert.ok(types(ev, "leak").length > 0);
  assert.ok(g.lives < DIFFICULTIES.plaza.lives);
});

test("clearing a wave returns to build phase and pays a bonus", () => {
  const g = sim.createGame(1);
  g.money = 5000;
  for (let i = 0; i < 6; i++) sim.placeTower(g, "candy", ...ROW(i));
  sim.startWave(g);
  const ev = run(g, 45);
  const end = types(ev, "waveEnd");
  assert.equal(end.length, 1, "wave should end exactly once");
  assert.equal(g.phase, "build");
  assert.ok(end[0].bonus > 0);
});

// ----------------------------------------------------------------- combat

test("towers only fire at enemies inside their range", () => {
  const g = sim.createGame(1);
  const t = sim.placeTower(g, "candy", ...SPOT);
  sim.startWave(g);
  run(g, 0.5);
  const far = g.enemies[0];
  assert.ok(far, "an enemy should have spawned");
  assert.ok(
    Math.hypot(far.x - t.x, far.y - t.y) > t.def.range,
    "first spawn starts outside range",
  );
  assert.equal(g.shots.length, 0);
});

test("a defeated enemy spills candy that is collected into the bank", () => {
  const g = sim.createGame(1);
  sim.startWave(g);
  run(g, 1);
  const target = g.enemies[0];
  const before = g.money;
  const ev = [...sim.damage(g, target, target.hp, DMG.SHARP), ...run(g, 2.5)];
  assert.equal(types(ev, "defeat").length, 1);
  assert.equal(types(ev, "mask").length, 1, "the mask comes off");
  assert.ok(types(ev, "collect").length >= 1, "candy is collected");
  // Asserted against the formula, not a literal, so rebalancing the bounty
  // share does not need this number hand-edited.
  const expected = ENEMIES.nino.bounty * BOUNTY_MUL * g.payout;
  assert.ok(
    Math.abs(g.money - before - expected) < 0.01,
    `the bounty reaches the bank in full: got ${(g.money - before).toFixed(2)}, want ${expected.toFixed(2)}`,
  );
});

test("the rudo resists sharp candy but takes a firecracker in full", () => {
  const hit = (dmgType) => {
    const g = sim.createGame(1);
    g.phase = "wave";
    g.queue = [{ id: "rudo", at: 0, scale: 1 }];
    run(g, 0.05);
    const e = g.enemies[0];
    const before = e.hp;
    sim.damage(g, e, 100, dmgType);
    return before - e.hp;
  };
  const sharp = hit(DMG.SHARP);
  const splash = hit(DMG.SPLASH);
  assert.equal(splash, 100, "splash lands in full");
  assert.equal(sharp, 100 * (1 - ENEMIES.rudo.resist[DMG.SHARP]));
  assert.ok(sharp < splash, "sharp is the wrong tool for a rudo");
});

test("the toro accelerates down the lane", () => {
  const a = sim.createGame(1);
  const b = sim.createGame(1);
  a.phase = "wave";
  b.phase = "wave";
  a.queue = [{ id: "toro", at: 0, scale: 1 }];
  b.queue = [{ id: "tecnico", at: 0, scale: 1 }];
  run(a, 0.05);
  run(b, 0.05);
  const toro = a.enemies[0];
  toro.dist = a.path.total * 0.7;
  const before = toro.dist;
  run(a, 1);
  const moved = toro.dist - before;
  assert.ok(
    moved > ENEMIES.toro.speed * 1.5,
    `charging toro should exceed base speed, moved ${moved.toFixed(1)}`,
  );
});

test("El Campeón tags in a partner squad instead of simply dying", () => {
  const g = sim.createGame(1);
  g.phase = "wave";
  g.queue = [{ id: "campeon", at: 0, scale: 1 }];
  run(g, 0.05);
  assert.equal(g.enemies.length, 1);
  const ev = sim.damage(g, g.enemies[0], ENEMIES.campeon.hp, DMG.SPLASH);
  assert.equal(types(ev, "tag").length, 1);
  assert.equal(g.enemies.length, ENEMIES.campeon.tag.length);
  assert.ok(
    g.enemies.every((e) => ENEMIES.campeon.tag.includes(e.type)),
    "the partners are the declared tag squad",
  );
});

test("burn keeps ticking after the shot that applied it", () => {
  const g = sim.createGame(1);
  g.phase = "wave";
  g.queue = [{ id: "rudo", at: 0, scale: 1 }];
  run(g, 0.05);
  const e = g.enemies[0];
  e.burn = TOWERS.chili.burn.dps;
  e.burnT = TOWERS.chili.burn.secs;
  const before = e.hp;
  run(g, 1);
  assert.ok(e.hp < before, "burn damages over time");
  const mid = e.hp;
  run(g, 4);
  const after = e.hp;
  run(g, 1);
  assert.equal(e.hp, after, "burn stops when its timer runs out");
  assert.ok(mid > after);
});

test("game ends when the great piñata is broken", () => {
  const g = sim.createGame(1);
  g.lives = 1;
  sim.startWave(g);
  const ev = run(g, 40);
  assert.equal(types(ev, "over").length, 1);
  assert.equal(g.phase, "over");
  assert.equal(g.lives, 0);
  assert.equal(sim.update(g, 0.016).length, 0, "a finished game stops simulating");
});

test("coin piñatas pay out at the end of each wave", () => {
  const bare = sim.createGame(1);
  const rich = sim.createGame(1);
  for (const g of [bare, rich]) {
    g.money = 5000;
    for (let i = 0; i < 6; i++) sim.placeTower(g, "candy", ...ROW(i));
  }
  assert.ok(sim.placeTower(rich, "coin", ...POCKET), "coin piñata should fit off-lane");
  sim.startWave(bare);
  sim.startWave(rich);
  const a = types(run(bare, 45), "waveEnd")[0];
  const b = types(run(rich, 45), "waveEnd")[0];
  assert.equal(a.income, 0);
  assert.equal(b.income, TOWERS.coin.income);
  assert.equal(b.bonus - a.bonus, TOWERS.coin.income);
});

test("the sim is deterministic for a given seed", () => {
  const play = () => {
    const g = sim.createGame(42);
    g.money = 5000;
    for (let i = 0; i < 5; i++) sim.placeTower(g, "candy", ...ROW(i));
    sim.startWave(g);
    run(g, 40);
    return [g.money.toFixed(4), g.lives, g.stats.defeated];
  };
  assert.deepEqual(play(), play());
});

// -------------------------------------------------------------- freeplay

test("the campaign ends at the last authored wave", () => {
  const g = sim.createGame(1);
  g.wave = WAVES.length - 1;
  g.money = 200000;
  // The last wave is El Coloso, and he is meant to be a filter: six fresh candy
  // piñatas cannot kill him, and neither can eight upgraded ones stood in a line
  // along one leg — measured, he walked through that and took the plaza with 100
  // leak damage. This needs what a finished campaign actually looks like: towers
  // on the best positions, upgraded, and long enough for the fight.
  sim.bestSpots(g, 8).forEach(([x, y], i) => {
    const t = sim.placeTower(g, i % 3 === 0 ? "sparkler" : "candy", x, y);
    if (!t) return;
    for (let k = 0; k < 4; k++) sim.upgradeTower(g, t, 0);
    for (let k = 0; k < 2; k++) sim.upgradeTower(g, t, 1);
  });
  sim.startWave(g);
  const ev = run(g, 240);
  assert.equal(g.wave, WAVES.length);
  assert.equal(types(ev, "won").length, 1);
  assert.equal(g.phase, "won");
  assert.equal(sim.update(g, 0.016).length, 0, "a won game stops simulating");
});

test("freeplay carries the run past the campaign", () => {
  const g = sim.createGame(1);
  g.phase = "won";
  g.wave = WAVES.length;
  assert.equal(sim.continueFreeplay(g), true);
  assert.equal(g.phase, "build");
  assert.equal(g.freeplay, true);
  assert.equal(sim.startWave(g), true);
  assert.equal(g.wave, WAVES.length + 1);
  assert.ok(g.queue.length > 0, "a freeplay wave still queues enemies");
});

test("freeplay can only start from a won game", () => {
  const g = sim.createGame(1);
  assert.equal(sim.continueFreeplay(g), false, "not from build phase");
  g.phase = "over";
  assert.equal(sim.continueFreeplay(g), false, "and not from a loss");
  assert.equal(g.freeplay, false);
});

test("freeplay cycles the late campaign rather than repeating the last wave", () => {
  const seen = new Set();
  for (let w = WAVES.length; w < WAVES.length + 8; w++)
    seen.add(JSON.stringify(sim.waveGroups(w)));
  assert.ok(seen.size > 1, "freeplay must not be wave 15 on a loop");
  const tail = Math.max(1, Math.floor(WAVES.length / 3));
  assert.equal(seen.size, Math.min(8, tail));
});

test("freeplay waves keep scaling up", () => {
  const hpAt = (wave) => {
    const g = sim.createGame(1);
    g.wave = wave;
    g.freeplay = true;
    g.phase = "build";
    sim.startWave(g);
    run(g, 0.05);
    return g.enemies[0]?.maxHp ?? 0;
  };
  const a = hpAt(WAVES.length);
  const b = hpAt(WAVES.length + 5);
  assert.ok(a > 0 && b > a * 1.5, `wave ${WAVES.length + 5} hp ${b} should dwarf ${a}`);
});

// ------------------------------------------------------- the mask tally

test("every defeat is tallied by enemy type", () => {
  const g = sim.createGame(1);
  g.phase = "wave";
  g.queue = [
    { id: "nino", at: 0, scale: 1 },
    { id: "nino", at: 0, scale: 1 },
    { id: "rudo", at: 0, scale: 1 },
  ];
  sim.update(g, 0.016);
  assert.deepEqual(g.stats.masks, {}, "nothing taken yet");
  for (const e of [...g.enemies]) sim.damage(g, e, e.hp, DMG.SPLASH);
  assert.deepEqual(g.stats.masks, { nino: 2, rudo: 1 });
  assert.equal(
    Object.values(g.stats.masks).reduce((a, b) => a + b, 0),
    g.stats.defeated,
    "the tally must agree with the defeat count",
  );
});

test("a leak is not a mask", () => {
  const g = sim.createGame(1);
  sim.startWave(g);
  run(g, 40);
  assert.ok(g.stats.leaked > 0, "an undefended wave leaks");
  assert.deepEqual(g.stats.masks, {}, "leaked enemies keep their masks");
});

test("the campeón's tagged-in partners are tallied separately", () => {
  const g = sim.createGame(1);
  g.phase = "wave";
  g.queue = [{ id: "campeon", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  sim.damage(g, g.enemies[0], ENEMIES.campeon.hp, DMG.SPLASH);
  assert.equal(g.stats.masks.campeon, 1);
  for (const e of [...g.enemies]) sim.damage(g, e, e.hp, DMG.SPLASH);
  assert.equal(g.stats.masks.rudo, 2, "the tag partners count too");
  assert.equal(g.stats.masks.tecnico, 2);
});

// ------------------------------------------------------------ the blindfold

// The blindfold pays nothing on purpose — see the note in data.js. This test
// exists to stop a premium being reintroduced casually: the economy is leveraged
// enough that even 10% turns a losing run into a comfortable one.
test("the blindfold pays no economic premium", () => {
  const bounty = (blind) => {
    const g = sim.createGame(1, "plaza", "plaza", blind);
    g.phase = "wave";
    g.queue = [{ id: "nino", at: 0, scale: 1 }];
    sim.update(g, 0.016);
    const before = g.money;
    sim.damage(g, g.enemies[0], 99, DMG.SPLASH);
    run(g, 2.5);
    return g.money - before;
  };
  assert.equal(BLINDFOLD.premium, 1, "a premium here needs the whole grid re-measured");
  assert.ok(Math.abs(bounty(true) - bounty(false)) < 0.01, "blindfolded pays the same");
});

test("the blindfold changes nothing about the fight itself", () => {
  // Same seed, same build, same waves: only the payout may differ. If the
  // handicap touched the sim, the whole balance grid would need re-measuring.
  const play = (blind) => {
    const g = sim.createGame(99, "plaza", "plaza", blind);
    g.money = 50000;
    for (const s of sim.bestSpots(g, 6)) sim.placeTower(g, "candy", ...s);
    for (let w = 0; w < 4; w++) {
      sim.startWave(g);
      let guard = 0;
      while (g.phase === "wave" && guard++ < 60 / 0.016) sim.update(g, 0.016);
    }
    return { lives: g.lives, defeated: g.stats.defeated, leaked: g.stats.leaked };
  };
  assert.deepEqual(play(true), play(false));
});

test("blindfolded, only ground within reach of a piñata is legible", () => {
  const g = sim.createGame(1, "plaza", "plaza", true);
  g.money = 9000;
  const t = sim.placeTower(g, "candy", ...SPOT);
  assert.equal(sim.canSee(g, t.x, t.y), true, "a piñata sees itself");
  assert.equal(sim.canSee(g, t.x + t.def.range * 0.5, t.y), true, "and nearby ground");
  assert.equal(sim.canSee(g, t.x + 600, t.y), false, "but not across the plaza");
});

test("a longer-ranged piñata sees further, and selling blinds you again", () => {
  const g = sim.createGame(1, "plaza", "plaza", true);
  g.money = 9000;
  const far = [SPOT[0] + 160, SPOT[1]];
  const sniper = sim.placeTower(g, "sparkler", ...SPOT);
  assert.equal(sim.canSee(g, ...far), true, "a sparkler's reach covers it");
  sim.sellTower(g, sniper);
  assert.equal(sim.canSee(g, ...far), false, "selling it puts the lights out");
  const shortRange = sim.placeTower(g, "coin", ...SPOT);
  assert.ok(shortRange);
  assert.equal(sim.canSee(g, ...far), false, "a coin piñata cannot see that far");
});

test("without the blindfold everything is visible, even with no piñatas", () => {
  const g = sim.createGame(1, "plaza", "plaza", false);
  assert.equal(g.towers.length, 0);
  assert.equal(sim.canSee(g, 10, 10), true);
  assert.equal(sim.canSee(g, 900, 590), true);
});

test("blindfolded, your own great piñata is always lit", () => {
  const g = sim.createGame(1, "plaza", "plaza", true);
  assert.equal(g.towers.length, 0, "with nothing built at all");
  const [bx, by] = g.map.base;
  assert.equal(sim.canSee(g, bx, by - 30), true, "the base itself");
  assert.equal(sim.canSee(g, bx - 60, by - 30), true, "and the ground around it");
  assert.equal(
    sim.canSee(g, bx - BLINDFOLD.baseSight - 60, by - 30),
    false,
    "but not indefinitely far from it",
  );
});

test("a leak arrives somewhere the blindfolded player can see it", () => {
  const g = sim.createGame(1, "plaza", "plaza", true);
  sim.startWave(g);
  let sawArrival = false;
  for (let i = 0; i < 60 / 0.016; i++) {
    const ev = sim.update(g, 0.016);
    for (const e of ev)
      if (e.t === "leak") sawArrival = sawArrival || sim.canSee(g, e.x, e.y);
    if (sawArrival) break;
  }
  assert.equal(sawArrival, true, "the moment that costs you lives must be visible");
});

test("a piñata lights the ground it works over, including an aura's", () => {
  const g = sim.createGame(1, "plaza", "plaza", true);
  const trio = sim.placeTower(g, "mariachi", ...SPOT);
  assert.equal(trio.def.range, 0, "the trio has no firing range at all");
  assert.ok(sim.canSee(g, trio.x + 60, trio.y), "ground inside its aura should be lit");
  assert.ok(!sim.canSee(g, trio.x + 400, trio.y), "ground far outside it should not be");
});

// The veil used to carry its own copy of this expression, and the two drifted the
// moment one was fixed.
test("the veil and canSee agree about how far a piñata lights", () => {
  const g = sim.createGame(1, "plaza", "plaza", true);
  for (const type of ["candy", "mariachi", "papel", "coin"]) {
    const t = sim.placeTower(g, type, ...ROW(["candy", "mariachi", "papel", "coin"].indexOf(type)));
    if (!t) continue;
    const r = sim.sightRadius(t.def);
    assert.ok(r > 0, `${type} lights nothing at all`);
    assert.ok(sim.canSee(g, t.x + r - 2, t.y), `${type}: inside its own radius should be lit`);
  }
});

test("freeplay is a slope, not a wall", () => {
  const g = sim.createGame(1);
  const scaleAt = (wave) => {
    g.wave = wave;
    g.phase = "build";
    g.freeplay = wave >= WAVES.length;
    // Not `queue[0]`: the queue ACCUMULATES now, so index 0 is whatever the
    // previous call left behind. Read the entry for the round just sent.
    g.queue = [];
    sim.startWave(g);
    return g.queue.find((q) => q.wave === g.wave).scale;
  };
  const last = scaleAt(WAVES.length - 1);
  const five = scaleAt(WAVES.length + 4);
  const fifteen = scaleAt(WAVES.length + 14);
  assert.ok(five > last, "freeplay must get harder");
  assert.ok(fifteen > five, "and keep getting harder");
  // The old 0.35 term killed every profile on every board between waves 16 and 19
  // regardless of how well it had played. Five waves past the campaign now
  // multiplies health by 2.36x against the 3.4x it used to — a slope a good build
  // climbs rather than a wall it hits.
  assert.ok(five / last < 2.5, `five waves of freeplay multiplied health by ${(five / last).toFixed(2)}x`);
});

// ---------------------------------------------------------------- El Coloso

// The boss the campaign exists for. His phases fire on HEALTH, so the fight can
// be read and planned for rather than memorised as a timer.
const bossFight = (hits = 40) => {
  const g = sim.createGame(1);
  g.phase = "wave";
  g.queue = [{ id: "coloso", at: 0, scale: 1 }];
  sim.update(g, 0.016);
  const boss = g.enemies[0];
  return { g, boss };
};

test("El Coloso changes what he is on the way down, once per phase", () => {
  const { g, boss } = bossFight();
  assert.equal(boss.phaseIx, 0, "starts unphased");
  const seen = [];
  const bite = (frac) => {
    const target = boss.maxHp * frac;
    for (const ev of sim.damage(g, boss, boss.hp - target, DMG.BLUNT))
      if (ev.t === "phase") seen.push(ev.name);
  };
  bite(0.8);
  assert.equal(seen.length, 0, "no phase before the first threshold");
  bite(0.5);
  assert.equal(seen.length, 1, "the mask should come off at 66%");
  assert.equal(boss.phaseIx, 1);
  const spriteAfterOne = boss.sprite;
  assert.ok(spriteAfterOne, "the phase should change what he looks like");
  bite(0.45);
  assert.equal(seen.length, 1, "a phase fires once, not every hit");
  bite(0.2);
  assert.equal(seen.length, 2, "and he rages at 30%");
  assert.equal(boss.phaseIx, 2);
  assert.notEqual(boss.sprite, spriteAfterOne);
});

test("each phase brings friends in behind him, not on top of him", () => {
  const { g, boss } = bossFight();
  const before = g.enemies.length;
  sim.damage(g, boss, boss.hp - boss.maxHp * 0.5, DMG.BLUNT);
  const adds = g.enemies.filter((e) => e !== boss);
  assert.ok(g.enemies.length > before, "the phase brought nobody");
  for (const a of adds) assert.ok(a.dist < boss.dist, `${a.type} spawned ahead of the boss`);
});

test("phase changes are written on the enemy, never on the shared definition", () => {
  const first = bossFight();
  sim.damage(first.g, first.boss, first.boss.hp * 0.9, DMG.BLUNT);
  assert.ok(first.boss.phaseIx >= 1);
  const second = bossFight();
  assert.equal(second.boss.phaseIx, 0, "a later Coloso started where the last one finished");
  assert.equal(second.boss.sprite, null);
  assert.equal(ENEMIES.coloso.speed, 22, "the definition itself was mutated");
});

test("he does not walk past: reaching the plaza ends it", () => {
  assert.ok(ENEMIES.coloso.leak >= 100, "the boss should not be survivable as a leak");
});

// ------------------------------------------------------------- run persistence
//
// A campaign is fifteen minutes long and lives in a browser tab. These cover the
// two things that make a save safe: it only happens where a clean picture exists,
// and it refuses anything it cannot faithfully rebuild.

test("a run is only saved between rounds", () => {
  const g = sim.createGame(3, "fiesta", "plaza");
  assert.ok(sim.snapshot(g), "the build phase should snapshot");
  sim.startWave(g);
  assert.equal(sim.snapshot(g), null, "a wave in flight must not snapshot");
  g.phase = "build";
  g.over = true;
  assert.equal(sim.snapshot(g), null, "a finished run must not snapshot");
});

test("a saved run comes back with the same board and piñatas", () => {
  const g = sim.createGame(3, "mascara", "cementerio");
  g.money = 9000;
  const made = [];
  for (let x = 100; x < 880 && made.length < 4; x += 30)
    for (let y = 100; y < 540 && made.length < 4; y += 30)
      if (sim.canPlace(g, x, y)) {
        const t = sim.placeTower(g, made.length % 2 ? "chili" : "candy", x, y);
        if (t) { t.tiers = [2, 1, 0]; t.targeting = 2; made.push(t); }
      }
  g.wave = 9;
  g.lives = 44;
  const back = sim.restore(JSON.parse(JSON.stringify(sim.snapshot(g))));
  assert.equal(back.map.id, "cementerio");
  assert.equal(back.diff.id, "mascara");
  assert.equal(back.wave, 9);
  assert.equal(back.lives, 44);
  assert.equal(back.towers.length, made.length, "a piñata was lost or duplicated");
  assert.deepEqual(back.towers.map((t) => [t.type, t.x, t.y, t.tiers.join(""), t.targeting]),
                   made.map((t) => [t.type, t.x, t.y, t.tiers.join(""), t.targeting]));
  // Stats have to be rebuilt from the tiers, not trusted from the file.
  assert.ok(back.towers[0].def.damage > back.towers[0].base.damage, "upgrades were not reapplied");
});

test("a save it cannot rebuild is refused, not half-loaded", () => {
  assert.equal(sim.restore(null), null);
  assert.equal(sim.restore({ v: 99 }), null, "a future version must not be guessed at");
  assert.equal(sim.restore({ v: 1, diff: "gone", map: "plaza", towers: [] }), null);
  assert.equal(sim.restore({ v: 1, diff: "fiesta", map: "atlantis", towers: [] }), null);
  assert.equal(sim.restore({ v: 1, diff: "fiesta", map: "plaza", towers: [{ type: "banana", x: 1, y: 1, tiers: [0,0,0] }] }), null);
  // Tiers out of range are clamped rather than trusted — the file is user-editable.
  const g = sim.restore({ v: 1, diff: "fiesta", map: "plaza", wave: 2, money: 100, lives: 50,
    towers: [{ type: "candy", x: 200, y: 500, tiers: [99, -3, 1], targeting: 0 }] });
  assert.ok(g, "a legal save with silly tiers should still load");
  if (g.towers.length) assert.deepEqual(g.towers[0].tiers, [up.MAX_TIER, 0, 1]);
});

test("a restored run keeps playing", () => {
  const g = sim.createGame(5, "fiesta", "plaza");
  g.money = 4000;
  for (let x = 120; x < 860; x += 40)
    for (let y = 120; y < 520; y += 40)
      if (g.towers.length < 5 && sim.canPlace(g, x, y)) sim.placeTower(g, "candy", x, y);
  g.wave = 3;
  const back = sim.restore(JSON.parse(JSON.stringify(sim.snapshot(g))));
  assert.ok(sim.startWave(back), "a restored run cannot start its next wave");
  let guard = 0;
  while (back.phase !== "build" && !back.over && guard++ < 6000) sim.update(back, 0.016);
  assert.ok(guard < 6000, "the restored wave never finished");
  assert.equal(back.wave, 4);
});
