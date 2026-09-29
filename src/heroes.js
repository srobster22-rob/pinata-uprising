/**
 * Heroes: one piñata per run that grows on its own.
 *
 * Everything else in this game is bought. A hero is the one thing you place
 * once and then watch get better, which changes what the run is about: instead
 * of "what can I afford this round" the question becomes "what am I building
 * AROUND". That is the reason to have them, and it is why the three below pull
 * in three different directions rather than being three damage numbers.
 *
 *   La Reina     an aura that grows       -> you cluster
 *   El Chamaco   a carry that grows       -> you protect one chokepoint
 *   Doña Suerte  an economy that grows    -> you play the long game
 *
 * A hero is modelled as an ordinary tower with `hero: true` and a `def` that is
 * recomputed on level-up instead of through the upgrade paths — so the firing
 * loop, the aura pass, targeting and the renderer all handle it without knowing
 * heroes exist.
 */

/** Levels 1..10. The last one is meant to be reached late, not comfortably. */
export const MAX_LEVEL = 10;

/**
 * XP to REACH each level, cumulative.
 *
 * Tuned against the campaign rather than picked: a run that clears sixteen
 * rounds pays out roughly 1,050 XP through `xpForWave` below, so a hero placed
 * on round one lands around level 8 at the boss and only a freeplay run sees
 * 10. Placing a hero late costs you levels, which is the whole point of the
 * decision.
 */
export const LEVEL_XP = [0, 0, 40, 100, 185, 300, 450, 640, 880, 1180, 1550];

/** What finishing a round is worth. Later rounds are worth more. */
export const xpForWave = (wave) => 18 + wave * 6;
/** And a share from the board's work, so an idle hero still climbs slowly. */
export const xpForDefeat = 0.35;

export const levelFor = (xp) => {
  let lv = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (xp >= LEVEL_XP[i]) lv = i;
  return lv;
};

/** How far into the current level you are, 0..1. Null at max. */
export function levelProgress(xp) {
  const lv = levelFor(xp);
  if (lv >= MAX_LEVEL) return null;
  const from = LEVEL_XP[lv];
  const to = LEVEL_XP[lv + 1];
  return Math.max(0, Math.min(1, (xp - from) / (to - from)));
}

/**
 * The roster.
 *
 * `at` is a sparse table of level -> what changes. Anything not listed is
 * inherited, so a hero's growth reads as a list of moments rather than as ten
 * near-identical rows — and the moments are what a player remembers.
 */
export const HEROES = {
  reina: {
    id: "reina",
    name: "La Reina",
    title: "The one everyone plays for",
    sprite: "mariachi",
    cost: 700,
    blurb: "Hits nothing. Everything near her hits harder and faster, and it keeps growing all run.",
    pull: "Cluster your piñatas. Her reach is the shape of your board.",
    base: {
      range: 0, damage: 0, rate: 999, dmgType: "blunt", speed: 1, pierce: 0,
      shot: "none", auraRate: 0.1, auraDamage: 0, auraRange: 120,
    },
    at: {
      2: { auraRange: 132 },
      3: { auraRate: 0.16, note: "Louder — the tempo lifts" },
      4: { auraRange: 146 },
      5: { auraDamage: 0.08, note: "The neighbours hit harder too" },
      6: { auraRate: 0.22, auraRange: 160 },
      7: { auraDamage: 0.14 },
      8: { auraRate: 0.28, auraRange: 176, note: "Half the plaza is in earshot" },
      9: { auraDamage: 0.22 },
      10: { auraRate: 0.36, auraDamage: 0.3, auraRange: 196, note: "The whole plaza plays her song" },
    },
  },

  chamaco: {
    id: "chamaco",
    name: "El Chamaco",
    title: "Small, fast, and getting bigger",
    sprite: "candy",
    cost: 650,
    blurb: "Starts barely better than a candy piñata and ends the run as the hardest hitter on the board.",
    pull: "Put him where the lane doubles back, and defend that corner.",
    base: {
      range: 124, damage: 6, rate: 0.4, dmgType: "sharp", speed: 620, pierce: 2, shot: "candy",
    },
    at: {
      2: { damage: 9 },
      3: { damage: 13, rate: 0.34, note: "Quicker hands" },
      4: { damage: 18, range: 134 },
      5: { damage: 25, pierce: 3, note: "Punches through two at a time" },
      6: { damage: 34, rate: 0.28, special: "execute", note: "Finishes anything already hurt" },
      7: { damage: 46, range: 146 },
      8: { damage: 62, pierce: 4 },
      9: { damage: 84, rate: 0.24, note: "Faster than anything you can buy" },
      10: { damage: 118, range: 162, sharpPierce: 0.5, note: "Half of any armour stops mattering" },
    },
  },

  suerte: {
    id: "suerte",
    name: "Doña Suerte",
    title: "Patience, with interest",
    sprite: "coin",
    cost: 600,
    blurb: "Pays out every round and pays more every level. Place her first or do not place her at all.",
    pull: "Buy her early and spend the run compounding. She is a bet on reaching round sixteen.",
    base: {
      range: 0, damage: 0, rate: 999, dmgType: "blunt", speed: 1, pierce: 0, shot: "none", income: 40,
    },
    at: {
      2: { income: 58 },
      3: { income: 80, note: "The takings are adding up" },
      4: { income: 110 },
      5: { income: 150, interest: 0.02, note: "And now it earns on itself" },
      6: { income: 200, interest: 0.03 },
      7: { income: 265, interest: 0.04, note: "Compounding properly" },
      8: { income: 345, interest: 0.05 },
      9: { income: 450, interest: 0.06 },
      10: { income: 600, interest: 0.08, note: "The plaza's whole economy is her" },
    },
  },
};

export const HERO_ORDER = Object.keys(HEROES);

/**
 * A hero's stats at a level.
 *
 * Every level from 1 up is applied in order, so `at` can be sparse — level 7
 * inherits level 6's rate without restating it, which is what keeps the table
 * readable as a list of moments.
 */
export function heroStats(id, level = 1) {
  const h = HEROES[id];
  if (!h) return null;
  const out = { id: h.id, name: h.name, sprite: h.sprite, cost: h.cost, hero: true, ...h.base };
  const special = [];
  for (let lv = 2; lv <= Math.min(MAX_LEVEL, level); lv++) {
    const step = h.at[lv];
    if (!step) continue;
    for (const [k, v] of Object.entries(step)) {
      if (k === "note") continue;
      if (k === "special") { special.push(v); continue; }
      out[k] = v;
    }
  }
  out.special = special;
  out.level = Math.max(1, Math.min(MAX_LEVEL, level));
  return out;
}

/** The levels that actually announce themselves, for the panel. */
export function milestones(id) {
  const h = HEROES[id];
  if (!h) return [];
  return Object.entries(h.at)
    .filter(([, step]) => step.note)
    .map(([lv, step]) => ({ level: Number(lv), note: step.note }));
}
