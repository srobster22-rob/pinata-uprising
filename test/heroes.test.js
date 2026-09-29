/**
 * Heroes are the one thing in the game you place once and then watch improve,
 * so the tests are about the SHAPE of that growth, not about damage numbers:
 * one per run, the level curve reaching where the design says, and the three of
 * them pulling in three different directions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as sim from "../src/sim.js";
import {
  HEROES, HERO_ORDER, MAX_LEVEL, LEVEL_XP, heroStats, levelFor, levelProgress, xpForWave, milestones,
} from "../src/heroes.js";

const rich = (id) => {
  const g = sim.createGame(1, "plaza", "plaza");
  g.money = 500000;
  g.heroId = id;
  return g;
};
const spot = (g, i = 0) => sim.bestSpots(g, 6)[i];

test("three heroes, and each pulls the build somewhere different", () => {
  assert.equal(HERO_ORDER.length, 3);
  // The point of a roster is that the members are not interchangeable. An aura
  // hero, a carry and an economy: check that by what they DO at max level.
  const max = HERO_ORDER.map((id) => heroStats(id, MAX_LEVEL));
  assert.ok(max.some((h) => h.auraRate > 0), "nobody buffs");
  assert.ok(max.some((h) => h.damage > 50), "nobody carries");
  assert.ok(max.some((h) => h.income > 0), "nobody earns");
  assert.equal(new Set(HERO_ORDER.map((id) => HEROES[id].pull)).size, 3);
});

test("one hero per run, ever", () => {
  const g = rich("chamaco");
  assert.ok(sim.placeHero(g, ...spot(g, 0)));
  assert.equal(sim.placeHero(g, ...spot(g, 1)), null, "a second hero was allowed");
  assert.equal(g.towers.filter((t) => t.hero).length, 1);
});

test("a hero cannot be placed without choosing one", () => {
  const g = sim.createGame(1);
  g.money = 500000;
  assert.equal(sim.placeHero(g, ...spot(g, 0)), null);
});

test("levels are earned, and they change the piñata", () => {
  const g = rich("chamaco");
  const h = sim.placeHero(g, ...spot(g, 0));
  const at1 = h.def.damage;
  sim.addHeroXp(g, LEVEL_XP[MAX_LEVEL]);
  assert.equal(sim.heroTower(g).level, MAX_LEVEL);
  assert.ok(sim.heroTower(g).def.damage > at1 * 10, "the curve is not a curve");
});

test("experience only accrues once the hero is on the board", () => {
  // The bug this catches, and it was real: XP accrued from the moment the hero
  // was CHOSEN, so placing on round one and on round nine landed at the same
  // level and the placement decision was worth nothing.
  const g = rich("reina");
  assert.equal(sim.addHeroXp(g, 500), null);
  assert.equal(g.heroXp, 0);
  sim.placeHero(g, ...spot(g, 0));
  sim.addHeroXp(g, 500);
  assert.ok(g.heroXp > 0);
});

test("the level curve reaches where the design says it does", () => {
  // heroes.js claims a hero placed on round one lands around 8 at the boss and
  // that only freeplay sees 10. Sixteen rounds of `xpForWave` is the check.
  let xp = 0;
  for (let w = 1; w <= 16; w++) xp += xpForWave(w);
  const lv = levelFor(xp);
  assert.ok(lv >= 7 && lv <= 8, `a full campaign lands at level ${lv}, not 7-8`);
  assert.ok(xp < LEVEL_XP[MAX_LEVEL], "the campaign alone should not max a hero");
});

test("progress through a level is reportable, and null at the top", () => {
  assert.equal(levelProgress(LEVEL_XP[3]), 0);
  assert.ok(levelProgress(LEVEL_XP[3] + 1) > 0);
  assert.equal(levelProgress(LEVEL_XP[MAX_LEVEL]), null);
});

test("sparse level tables inherit rather than reset", () => {
  // Level 7 does not restate the rate it inherited from 6. If `heroStats` reset
  // instead of layering, a hero would get WORSE on some level-ups.
  for (const id of HERO_ORDER) {
    let prev = heroStats(id, 1);
    for (let lv = 2; lv <= MAX_LEVEL; lv++) {
      const now = heroStats(id, lv);
      for (const key of ["damage", "range", "pierce", "income", "auraRate", "auraDamage", "auraRange"]) {
        const a = prev[key] ?? 0, b = now[key] ?? 0;
        assert.ok(b >= a, `${id} lost ${key} going to level ${lv}: ${a} -> ${b}`);
      }
      // Rate is a cooldown, so lower is better and it must never rise.
      assert.ok((now.rate ?? 0) <= (prev.rate ?? 0), `${id} got slower at level ${lv}`);
      prev = now;
    }
  }
});

test("every hero announces itself at least twice on the way up", () => {
  for (const id of HERO_ORDER)
    assert.ok(milestones(id).length >= 3, `${HEROES[id].name} levels silently`);
});

test("finishing a round levels the hero and says so", () => {
  const g = rich("suerte");
  sim.placeHero(g, ...spot(g, 0));
  sim.startWave(g);
  g.queue = [];
  g.enemies = [];
  const ev = [];
  for (let i = 0; i < 4; i++) ev.push(...sim.update(g, 0.016));
  assert.ok(ev.some((e) => e.t === "waveEnd"));
  assert.ok(g.heroXp > 0, "a finished round paid no experience");
});
