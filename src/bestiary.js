/**
 * What each luchador does, and what beats it.
 *
 * The counter matrix has been a stated pillar of this game since R9, and until
 * now the only way to learn it was to lose. The trophy wall recorded WHAT you
 * had unmasked and said nothing about why it had been hard.
 *
 * The important decision here is that the rules are DERIVED from the enemy
 * definitions rather than written next to them. A hand-written card drifts the
 * first time somebody retunes a resistance — and this file would then be
 * teaching the player something false, which is worse than teaching nothing.
 * Everything below reads `ENEMIES` and reports what is actually in it.
 */
import { ENEMIES } from "./data.js";

/**
 * A trait worth telling the player about.
 *
 * `test` reads the definition; `rule` says what the luchador does; `counter`
 * says what to build. Order matters — the first two matched are what a card
 * shows, so the sharpest rule has to come first.
 */
const TRAITS = [
  {
    key: "phases",
    test: (d) => d.phases?.length,
    rule: (d) => `Breaks ${d.phases.length} times before it stops`,
    counter: () => "Sustained damage, not one big hit",
  },
  {
    key: "cape",
    test: (d) => d.cape > 0,
    rule: (d) => `Capes away ${Math.round(d.cape * 100)}% of aimed shots`,
    counter: () => "Splash — a bang has nothing to sidestep",
  },
  {
    key: "sway",
    test: (d) => d.sway > 0,
    rule: () => "Swings on its rope, so slow shots arrive where it was",
    counter: () => "Fast projectiles: candy, sparkler, anything that bursts",
  },
  {
    key: "noSlow",
    test: (d) => d.noSlow,
    rule: () => "Charges straight through gum",
    counter: () => "Damage, not slows",
  },
  {
    key: "burn",
    test: (d) => (d.resist?.burn ?? 0) >= 0.3,
    rule: (d) => `Foil mask — shrugs off ${Math.round(d.resist.burn * 100)}% of burn`,
    counter: () => "Anything that is not chili",
  },
  {
    key: "sharp",
    test: (d) => (d.resist?.sharp ?? 0) >= 0.3,
    rule: (d) => `Armoured — ${Math.round(d.resist.sharp * 100)}% off hard candy`,
    counter: () => "Fire, splash, or pierce from a deep candy path",
  },
  {
    key: "stun",
    test: (d) => (d.stunResist ?? 0) >= 0.5,
    rule: (d) => `Shakes off a rattle ${(1 / (1 - d.stunResist)).toFixed(1)}x faster`,
    counter: () => "Do not count on the maraca holding it",
  },
  {
    key: "fast",
    test: (d) => d.speed >= 76,
    rule: (d) => `Quick — ${d.speed} to the plaza`,
    counter: () => "Cover the entrance, not the last corner",
  },
  {
    key: "tanky",
    test: (d) => d.hp >= 200 && !d.boss,
    rule: (d) => `${d.hp} health, and slow with it`,
    counter: () => "Somewhere it has to walk past twice",
  },
  {
    key: "swarm",
    test: (d) => d.hp <= 20,
    rule: () => "Weak, quick, and never alone",
    counter: () => "Anything cheap that fires often",
  },
];

/**
 * The card for one luchador.
 *
 * `known` is false until you have taken at least one of its masks — the counter
 * matrix is meant to be learned by fighting, and a card that reads itself out
 * before the fight removes the reason waves 1-8 exist.
 */
export function card(id, taken = 0) {
  const d = ENEMIES[id];
  if (!d) return null;
  const hits = TRAITS.filter((t) => t.test(d));
  return {
    id,
    name: d.name,
    taken,
    known: taken > 0,
    boss: !!d.boss,
    hp: d.hp,
    speed: d.speed,
    // Two at most. A card with five rules on it is a spreadsheet, and the point
    // is the one thing you have to change about your build.
    rules: hits.slice(0, 2).map((t) => ({ key: t.key, rule: t.rule(d), counter: t.counter(d) })),
  };
}

/** Every card, in the order the campaign introduces them. */
export const bestiary = (taken = {}) => Object.keys(ENEMIES).map((id) => card(id, taken[id] ?? 0));

/** How much of the matrix the player has actually met. */
export function progress(taken = {}) {
  const ids = Object.keys(ENEMIES);
  const known = ids.filter((id) => (taken[id] ?? 0) > 0);
  return { known: known.length, total: ids.length };
}

export const TRAIT_KEYS = TRAITS.map((t) => t.key);
