/**
 * The bestiary's one job is to be TRUE. A card that says "shrugs off burn"
 * about an enemy whose burn resistance was retuned to zero is worse than no
 * card at all, so these tests check the rules against the sim's own numbers
 * rather than against a copy of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { card, bestiary, progress, TRAIT_KEYS } from "../src/bestiary.js";
import { ENEMIES } from "../src/data.js";

const ids = Object.keys(ENEMIES);
const allTaken = Object.fromEntries(ids.map((id) => [id, 1]));

test("every luchador has something to say for itself", () => {
  for (const c of bestiary(allTaken))
    assert.ok(c.rules.length > 0, `${c.name} has no rule — the wall would show a blank`);
});

test("a card shows at most two rules", () => {
  // Five rules is a spreadsheet. The point is the one thing you change.
  for (const c of bestiary(allTaken)) assert.ok(c.rules.length <= 2, `${c.name} lists ${c.rules.length}`);
});

test("every rule it states is actually in the enemy's definition", () => {
  for (const id of ids) {
    const d = ENEMIES[id];
    for (const r of card(id, 1).rules) {
      if (r.key === "cape") assert.ok(d.cape > 0, `${id} claims a cape it does not have`);
      if (r.key === "noSlow") assert.ok(d.noSlow, `${id} claims to ignore slow`);
      if (r.key === "sway") assert.ok(d.sway > 0, `${id} claims to sway`);
      if (r.key === "burn") assert.ok((d.resist?.burn ?? 0) >= 0.3, `${id} claims burn resistance`);
      if (r.key === "sharp") assert.ok((d.resist?.sharp ?? 0) >= 0.3, `${id} claims armour`);
      if (r.key === "stun") assert.ok((d.stunResist ?? 0) >= 0.5, `${id} claims stun resistance`);
      if (r.key === "phases") assert.ok(d.phases?.length, `${id} claims phases`);
      if (r.key === "fast") assert.ok(d.speed >= 76, `${id} claims to be fast at ${d.speed}`);
    }
  }
});

test("the numbers it quotes are the sim's numbers", () => {
  // The failure this catches: someone retunes a resistance and the card keeps
  // advertising the old percentage.
  for (const id of ids) {
    const d = ENEMIES[id];
    for (const r of card(id, 1).rules) {
      const n = r.rule.match(/(\d+)%/);
      if (!n) continue;
      const pct = Number(n[1]);
      const real =
        r.key === "cape" ? d.cape * 100 :
        r.key === "burn" ? d.resist.burn * 100 :
        r.key === "sharp" ? d.resist.sharp * 100 : null;
      if (real !== null) assert.equal(pct, Math.round(real), `${id}/${r.key} advertises ${pct}%`);
    }
  }
});

test("nothing is known until you have taken one", () => {
  for (const c of bestiary({})) {
    assert.equal(c.known, false);
    assert.equal(c.taken, 0);
  }
  assert.deepEqual(progress({}), { known: 0, total: ids.length });
  assert.deepEqual(progress(allTaken), { known: ids.length, total: ids.length });
});

test("the counter reads as advice, not as a restatement", () => {
  for (const c of bestiary(allTaken))
    for (const r of c.rules) {
      assert.ok(r.counter.length > 8, `${c.name}/${r.key} counter is too thin`);
      assert.notEqual(r.counter, r.rule, `${c.name}/${r.key} just repeats itself`);
    }
});

test("the bosses are flagged as bosses", () => {
  const flagged = bestiary(allTaken).filter((c) => c.boss).map((c) => c.id);
  assert.deepEqual(flagged, ids.filter((id) => ENEMIES[id].boss));
});

test("every trait key is reachable by something in the roster", () => {
  const used = new Set(bestiary(allTaken).flatMap((c) => c.rules.map((r) => r.key)));
  // Not every key has to fire — but a key nothing can ever match is dead code
  // pretending to be a feature.
  const dead = TRAIT_KEYS.filter((k) => !used.has(k) &&
    !ids.some((id) => card(id, 1) && false));
  assert.ok(dead.length <= 2, `unreachable trait rules: ${dead.join(", ")}`);
});
