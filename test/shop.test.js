/**
 * The shop list is not a list of towers.
 *
 * It also holds the hero's card, and the hero is not in `TOWERS`. The first
 * version of `syncCards` assumed otherwise and did `state.money < def.cost` on
 * every child — which threw a TypeError on the FIRST one, so:
 *
 *   - no card ever got the `armed` class, so clicking a piñata did nothing and
 *     nothing could be placed;
 *   - the exception escaped both the click handler and the per-frame sync, so
 *     the frame loop stopped and the page stopped responding entirely.
 *
 * Reported as three separate things — "I can't place towers", "the towers are
 * invisible", and a tab that would not screenshot — and it was one line.
 *
 * `syncCards` needs a DOM, so rather than stand up a fake one this test checks
 * the invariant the fix relies on: anything the shop can show must have a price
 * that can be looked up without assuming it is a tower.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOWERS, TOWER_ORDER } from "../src/data.js";
import { HEROES, HERO_ORDER } from "../src/heroes.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/main.js"), "utf8");

test("every card the shop can build has a price the shop can find", () => {
  // The two kinds of card that reach `#tower-list`.
  for (const id of TOWER_ORDER) assert.equal(typeof TOWERS[id].cost, "number", `${id} has no cost`);
  for (const id of HERO_ORDER) assert.equal(typeof HEROES[id].cost, "number", `${id} has no cost`);
});

test("syncCards never reads a cost off an unchecked lookup", () => {
  // The exact shape of the crash: `TOWERS[...]` dereferenced without a guard.
  const body = SRC.slice(SRC.indexOf("function syncCards()"));
  const fn = body.slice(0, body.indexOf("\n}\n") + 3);
  assert.ok(
    !/TOWERS\[[^\]]+\]\.cost/.test(fn),
    "syncCards dereferences TOWERS[...].cost without a guard — the hero card is not a tower",
  );
  assert.ok(
    fn.includes("HERO_ARM") || fn.includes("?."),
    "syncCards has no guard for a card that is not a piñata",
  );
});

test("the hero's card id can never collide with a real piñata", () => {
  const sentinel = SRC.match(/const HERO_ARM = "([^"]+)"/)?.[1];
  assert.ok(sentinel, "HERO_ARM sentinel not found");
  assert.ok(!TOWER_ORDER.includes(sentinel), `${sentinel} collides with a real piñata id`);
  assert.ok(!TOWERS[sentinel], `${sentinel} resolves to a tower`);
});
