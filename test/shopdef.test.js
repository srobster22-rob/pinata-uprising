/**
 * The shop list is not a list of towers.
 *
 * It also holds the run's hero, and the hero is not in `TOWERS`. Four separate
 * places dereferenced `TOWERS[id].something` anyway — the card sync, the detail
 * panel, the refusal message, and the placement ghost. Two of those run inside
 * the frame loop, so the failure was never "one card misbehaves": the exception
 * escaped the frame, the loop stopped, and the page went unresponsive.
 *
 * Reported as three different things — "I can't place towers", "the towers are
 * invisible", and a tab that would not screenshot.
 *
 * They all go through `shopDef()` now. This scans the whole file rather than one
 * function, because the defining feature of this bug was that it kept
 * reappearing somewhere new.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/main.js"), "utf8");

/**
 * Comments stripped.
 *
 * The first version of this test scanned the raw file and failed on the
 * COMMENTS that explain the bug — which is a nicely circular way to be wrong:
 * writing down what not to do tripped the check for doing it.
 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("nothing dereferences a shop id as a tower without a guard", () => {
  const risky = [...SRC.matchAll(/TOWERS\[([A-Za-z_$][\w.$]*)\]\.(\w+)/g)];
  const offenders = risky.filter((m) => {
    // A `for (const id of TOWER_ORDER)` loop is safe: the id there is always a
    // real piñata, never the hero's sentinel.
    const around = SRC.slice(Math.max(0, m.index - 260), m.index);
    return !/for \(const \w+ of TOWER_ORDER\)/.test(around);
  });
  assert.deepEqual(
    offenders.map((m) => m[0]),
    [],
    "unguarded TOWERS[...] dereference — the hero's card id is not a tower",
  );
});

test("one shared resolver handles both kinds of card", () => {
  assert.ok(SRC.includes("function shopDef("), "the shared resolver is gone");
  const from = SRC.indexOf("function shopDef(");
  const body = SRC.slice(from, SRC.indexOf("\n}", from));
  assert.ok(body.includes("HERO_ARM"), "shopDef does not handle the hero");
  assert.ok(body.includes("TOWERS[id]"), "shopDef does not resolve a piñata");
  assert.ok(/\?\?\s*null/.test(body), "shopDef does not fall back safely");
});

test("the frame-loop callers go through the resolver", () => {
  // `currentGhost` is the one that actually killed the game, because it runs
  // every frame while something is armed.
  const from = SRC.indexOf("function currentGhost(");
  assert.ok(from > 0, "currentGhost is gone");
  const body = SRC.slice(from, SRC.indexOf("\n}", from));
  assert.ok(body.includes("shopDef("), "currentGhost bypasses the resolver");
  assert.ok(!/TOWERS\[armed\]/.test(body), "currentGhost still reads TOWERS[armed] directly");
});

test("syncCards prices every card through the resolver", () => {
  const from = SRC.indexOf("function syncCards(");
  const body = SRC.slice(from, SRC.indexOf("\n}", from));
  assert.ok(body.includes("shopDef("), "syncCards bypasses the resolver");
});
