// Simulation. Pure: no DOM, no canvas, no timers. Runs headless under
// `node --test`, which is why the render and audio layers read events off it
// rather than reaching into state.

import {
  MAPS, TOWERS, ENEMIES, WAVES, DMG,
  HP_RAMP, BONUS_BASE, BONUS_PER_WAVE, DIFFICULTIES, BLINDFOLD,
  HP_MUL, INCOME_MUL, BOUNTY_MUL, RANGE_MUL, EDGE_MUL,
} from "./data.js";
import { PATHS, MAX_TIER, canBuy, computeStats, sellValue, tierCost } from "./upgrades.js";
import { HEROES, heroStats, levelFor, xpForWave, xpForDefeat, MAX_LEVEL } from "./heroes.js";

// Names of every sprite art.js can build. Duplicated here as data rather than
// imported, because art.js touches `document` and the sim must stay headless.
export const SPRITE_NAMES = [
  "stand", "candy", "coin", "gum", "chili", "firecracker", "maraca", "sparkler", "ribbon", "papel", "mariachi",
  "grave", "cross",
  "nino", "matador", "tecnico", "rudo", "plateado", "colgado", "campeon", "toro",
  "coloso", "coloso2", "coloso3",
];

// ------------------------------------------------------------------ path

export function buildPath(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    segs.push({ x0, y0, ux: dx / len, uy: dy / len, len, start: total });
    total += len;
  }
  return { segs, total };
}

export function pointAt(path, d) {
  const c = Math.max(0, Math.min(path.total, d));
  let s = path.segs[0];
  for (const seg of path.segs) if (c >= seg.start) s = seg;
  const k = c - s.start;
  return { x: s.x0 + s.ux * k, y: s.y0 + s.uy * k, ux: s.ux, uy: s.uy };
}

/**
 * Nearest point on the lane: how far away it is, and how far along the lane
 * that point sits. The `at` value is what lets spots be spread over the whole
 * route instead of piling onto one leg.
 */
export function nearestOnPath(path, px, py) {
  let best = Infinity;
  let at = 0;
  for (const s of path.segs) {
    const vx = px - s.x0;
    const vy = py - s.y0;
    const t = Math.max(0, Math.min(s.len, vx * s.ux + vy * s.uy));
    const d = Math.hypot(vx - s.ux * t, vy - s.uy * t);
    if (d < best) {
      best = d;
      at = s.start + t;
    }
  }
  return { d: best, at };
}

/** Shortest distance from a point to the lane. Used for placement legality. */
export function distToPath(path, px, py) {
  return nearestOnPath(path, px, py).d;
}

// ------------------------------------------------------------------ state

let nextId = 1;

export function createGame(seed = 1, difficulty = "plaza", mapId = "plaza", blindfold = false) {
  const diff = DIFFICULTIES[difficulty] ?? DIFFICULTIES.plaza;
  const map = MAPS[mapId] ?? MAPS.plaza;
  return {
    map,
    path: buildPath(map.path),
    diff,
    money: diff.money,
    lives: diff.lives,
    maxLives: diff.lives,
    wave: 0,
    phase: "build", // build | wave | over | won
    towers: [],
    enemies: [],
    shots: [],
    candy: [],
    queue: [],
    // Rounds currently on the road. More than one once you send early.
    live: [],
    sentEarly: 0,
    // One hero per run. `heroId` is chosen at the menu, `heroXp` accumulates
    // from the WHOLE board's work — a hero that only levelled off its own kills
    // would punish the support heroes for doing their job.
    heroId: null,
    heroXp: 0,
    heroPlaced: false,
    time: 0,
    speed: 1,
    rng: mulberry(seed),
    freeplay: false,
    blindfold,
    payout: (diff.reward ?? 1) * (blindfold ? BLINDFOLD.premium : 1) * INCOME_MUL,
    stats: { defeated: 0, leaked: 0, earned: 0, masks: {} },
  };
}

/**
 * A run, small enough to keep in localStorage.
 *
 * Only ever taken BETWEEN rounds, which is what makes this tractable: in the
 * build phase there are no enemies, no shots, no candy in the air and no
 * half-finished RNG sequence, so the only things that cannot be recomputed are
 * the board you chose, the piñatas you built and the numbers on the HUD.
 * Serialising a wave in flight would mean pinning the RNG's internal state and
 * every projectile, for a checkpoint nobody wants — you would resume mid-fight
 * having forgotten what was happening.
 */
export function snapshot(g) {
  if (g.phase !== "build" || g.over) return null;
  return {
    v: 1,
    diff: g.diff.id,
    map: g.map.id,
    wave: g.wave,
    money: Math.round(g.money),
    lives: g.lives,
    freeplay: !!g.freeplay,
    blindfold: !!g.blindfold,
    stats: g.stats,
    towers: g.towers.map((t) => ({ type: t.type, x: t.x, y: t.y, tiers: t.tiers.slice(), targeting: t.targeting ?? 0 })),
  };
}

/**
 * Put a run back. Returns null for anything it does not recognise, so a save
 * from an older build — a piñata that no longer exists, a map that was renamed —
 * fails to a fresh menu rather than to a broken game.
 */
export function restore(snap) {
  if (!snap || snap.v !== 1) return null;
  if (!DIFFICULTIES[snap.diff] || !MAPS[snap.map]) return null;
  if (!Array.isArray(snap.towers) || snap.towers.some((t) => !TOWERS[t.type])) return null;
  const g = createGame(Date.now() & 0xffff, snap.diff, snap.map, snap.blindfold);
  g.wave = snap.wave | 0;
  g.money = Number(snap.money) || 0;
  g.lives = Number(snap.lives) || g.lives;
  g.freeplay = !!snap.freeplay;
  if (snap.stats) g.stats = { defeated: 0, leaked: 0, earned: 0, masks: {}, ...snap.stats };
  // Rebuilt through placeTower so the placement rules still apply — a save that
  // would put a piñata on the lane (because the map's route changed) drops that
  // piñata rather than producing a board the game could not have made. It
  // already appends to `g.towers`, so nothing here pushes: the first version
  // spread `g` into a throwaway object to fake free placement, which shares the
  // same towers ARRAY, and every piñata was restored twice.
  const realDiff = g.diff;
  const realMoney = g.money;
  g.diff = { ...realDiff, free: true };
  for (const t of snap.towers) {
    const built = placeTower(g, t.type, t.x, t.y);
    if (!built) continue;
    built.tiers = t.tiers.slice(0, 3).map((n) => Math.max(0, Math.min(MAX_TIER, n | 0)));
    built.targeting = t.targeting | 0;
    built.def = computeStats(t.type, built.base, built.tiers);
  }
  g.diff = realDiff;
  g.money = realMoney;
  return g;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- placement

export const TOWER_RADIUS = 22;
export const LANE_CLEAR = 34;

/**
 * Legal build positions on this map, best first — nearest the lane wins, since
 * that is where coverage matters. Used by the playtest harness so a new map
 * does not need a hand-written spot list, and by the "where can I build?" hint.
 */
/**
 * How much lane a piñata at (x, y) can actually shoot, in pixels of route
 * within `range`. Inside corners score highly because several legs pass close
 * together — which is exactly where an experienced player builds.
 */
export function laneCoverage(g, x, y, range = 118, sample = 12) {
  let hit = 0;
  for (let d = 0; d < g.path.total; d += sample) {
    const p = pointAt(g.path, d);
    if (Math.hypot(p.x - x, p.y - y) <= range) hit += sample;
  }
  return hit;
}

/** The strongest build positions by lane coverage, spaced apart. */
export function bestSpots(g, limit = 12, range = 118 * RANGE_MUL, step = 22) {
  const m = g.map;
  const cand = [];
  for (let y = 40; y < m.h - 30; y += step)
    for (let x = 40; x < m.w - 30; x += step) {
      if (!canPlace(g, x, y)) continue;
      cand.push({ x, y, c: laneCoverage(g, x, y, range) });
    }
  cand.sort((a, b) => b.c - a.c);
  const picked = [];
  for (const s of cand) {
    if (picked.length >= limit) break;
    if (picked.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < TOWER_RADIUS * 2 + 4)) continue;
    picked.push(s);
  }
  return picked.map((p) => [p.x, p.y]);
}

export function suggestSpots(g, limit = 24, step = 24, reach = 118 * RANGE_MUL) {
  const m = g.map;
  const cand = [];
  for (let y = 40; y < m.h - 30; y += step)
    for (let x = 40; x < m.w - 30; x += step) {
      const { d, at } = nearestOnPath(g.path, x, y);
      // Bounded by what a tower can actually shoot, not a fixed 140px. With a
      // hardcoded bound, shrinking range silently stranded this bot's towers out
      // of reach of the lane, which made range look like it widened the skill
      // gap when it was really just breaking the weaker bot's placement.
      if (d < LANE_CLEAR + 6 || d > Math.max(LANE_CLEAR + 20, reach)) continue;
      cand.push({ x, y, d, at });
    }
  // Bucket by lane progress and take the closest spot in each, round-robin.
  // Sorting purely by distance-to-lane piles every tower onto one leg and
  // leaves the rest of the route naked — it made the bot look much worse than
  // a hand-picked list, which is what surfaced this.
  const buckets = new Map();
  const span = Math.max(1, g.path.total / limit);
  for (const c of cand) {
    const k = Math.floor(c.at / span);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.d - b.d);
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const picked = [];
  for (let round = 0; picked.length < limit && round < 8; round++) {
    let added = 0;
    for (const k of keys) {
      if (picked.length >= limit) break;
      const list = buckets.get(k);
      const spot = list.find(
        (c) => !picked.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < TOWER_RADIUS * 2 + 4),
      );
      if (spot) {
        picked.push(spot);
        added += 1;
      }
    }
    if (!added) break;
  }
  return picked.map((p) => [p.x, p.y]);
}

export function canPlace(g, x, y) {
  const m = g.map;
  // Every bounds test below is a `<` or `>`, and both are false against NaN or
  // undefined — so a non-numeric coordinate used to pass the whole gauntlet and
  // placeTower would build a tower whose shots carried NaN damage. Enemies then
  // took NaN health and never died. Found while probing from the console.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 26 || y < 26 || x > m.w - 26 || y > m.h - 26) return false;
  if (distToPath(g.path, x, y) < LANE_CLEAR) return false;
  for (const t of g.towers)
    if (Math.hypot(t.x - x, t.y - y) < TOWER_RADIUS * 2) return false;
  return true;
}

export function placeTower(g, typeId, x, y) {
  const def = TOWERS[typeId];
  // Sandbox pays for nothing. Placement rules are untouched — you still cannot
  // build on the lane or on top of another piñata, because a sandbox that let you
  // do that would not show you a real build.
  const free = g.diff?.free === true;
  if (!def || (!free && g.money < def.cost) || !canPlace(g, x, y)) return null;
  if (!free) g.money -= def.cost;
  const tiers = [0, 0, 0];
  const t = {
    id: nextId++,
    type: typeId,
    base: def,
    tiers,
    def: computeStats(typeId, def, tiers),
    x,
    y,
    cool: 0,
    aim: 0,
    recoil: 0,
    defeats: 0,
    targeting: 0,
    buffRate: 0,
    buffDamage: 0,
  };
  g.towers.push(t);
  return t;
}

/**
 * Put the run's hero on the board. One only, ever.
 *
 * Modelled as an ordinary tower with `hero: true`, so the firing loop, the aura
 * pass, targeting, selling and the renderer all handle it without knowing that
 * heroes exist. What differs is that its `def` comes from a level rather than
 * from upgrade tiers.
 */
export function placeHero(g, x, y) {
  if (!g.heroId || g.heroPlaced) return null;
  const h = HEROES[g.heroId];
  const free = g.diff?.free === true;
  if (!h || (!free && g.money < h.cost) || !canPlace(g, x, y)) return null;
  if (!free) g.money -= h.cost;
  const level = levelFor(g.heroXp);
  const t = {
    id: nextId++,
    type: g.heroId,
    hero: true,
    base: h,
    tiers: [0, 0, 0],
    def: heroStats(g.heroId, level),
    level,
    x,
    y,
    cool: 0,
    aim: 0,
    recoil: 0,
    defeats: 0,
    targeting: 0,
    buffRate: 0,
    buffDamage: 0,
  };
  g.towers.push(t);
  g.heroPlaced = true;
  return t;
}

/**
 * Award experience and re-stat the hero if it crossed a level.
 *
 * Returns the new level when one was gained, so the caller can say so — a hero
 * that levels silently is a number changing in a panel nobody is looking at.
 */
export function addHeroXp(g, amount) {
  // Only once it is actually ON the board. Accruing from the moment the hero
  // was CHOSEN made placing it on round one and on round nine land at exactly
  // the same level — measured — which quietly removed the decision the cost is
  // supposed to buy you.
  if (!g.heroId || !g.heroPlaced || !(amount > 0)) return null;
  const before = levelFor(g.heroXp);
  g.heroXp += amount;
  const after = levelFor(g.heroXp);
  if (after === before) return null;
  const hero = g.towers.find((t) => t.hero);
  if (hero) {
    hero.level = after;
    hero.def = heroStats(g.heroId, after);
  }
  return after;
}

/** The hero on the board, if it has been placed. */
export const heroTower = (g) => g.towers.find((t) => t.hero) ?? null;

/**
 * How far a piñata lights the ground when blindfolded: the reach it actually
 * works over, plus a margin.
 *
 * The mariachi trio works over its *aura*, and its firing range is zero — keyed
 * on `range` alone it stood in the dark with no lit ground under it, which reads
 * as a rendering fault. Exported because `render.drawVeil` needs the same
 * number: it had its own copy of the expression, and the two drifted apart the
 * moment this one was fixed.
 */
export const sightRadius = (def) => reach(def) + BLINDFOLD.sight;

/**
 * How far a piñata actually WORKS, which is not always how far it shoots.
 *
 * The mariachi trio has `range: 0` and does its whole job through `auraRange`.
 * The range ring was drawn from `def.range`, so selecting, hovering or placing
 * a trio drew a ring of radius ZERO — you positioned the one tower whose entire
 * value is which neighbours fall inside it with nothing to aim by.
 *
 * `sightRadius` had already solved this for the Blindfold veil and the ring
 * never borrowed the idea. Ported from shelf-life, which shares this engine.
 */
export const reach = (def) => Math.max(def.range ?? 0, def.auraRange ?? 0);

/**
 * Can the player make out what is at (x, y)? Always true unless blindfolded,
 * in which case only ground within reach of a piñata is legible. The piñatas
 * themselves are unaffected — they target exactly as they always did, which is
 * the point: the handicap is on the player's information, not on the defence.
 */
export function canSee(g, x, y) {
  if (!g.blindfold) return true;
  // Your own great piñata is always lit — see the note in render.js. Without
  // this the leak that finishes you off happens somewhere you cannot look.
  const [bx, by] = g.map.base;
  if (Math.hypot(bx - x, by - 30 - y) <= BLINDFOLD.baseSight) return true;
  for (const t of g.towers) if (Math.hypot(t.x - x, t.y - y) <= sightRadius(t.def)) return true;
  return false;
}

/** Cycle a tower's targeting mode. Returns the new mode. */
export function cycleTargeting(g, tower, step = 1) {
  tower.targeting = (((tower.targeting ?? 0) + step) % TARGETING.length + TARGETING.length) % TARGETING.length;
  return TARGETING[tower.targeting];
}

export function sellTower(g, tower) {
  const i = g.towers.indexOf(tower);
  if (i < 0) return 0;
  /**
   * A hero cannot be sold, and the guard belongs HERE rather than in the UI.
   *
   * Ported from shelf-life, which shares this engine and found it by probing:
   * `sellValue` reads `PATHS[type]`, which has no hero keys, so calling this on
   * a hero throws `Cannot read properties of undefined (reading 'forEach')` —
   * the same crash class as the upgrade panel's `PATHS[t.type].forEach`, which
   * froze this game once already. The sell button is hidden for heroes, but
   * `hidden` is a CSS class on a button that still exists, and anything else
   * that reaches this function gets the throw out of a click handler.
   *
   * Refusing is also the right rule: a hero's value is the XP it accumulated,
   * so selling would either refund a growing unit at a flat price or reset its
   * levels.
   */
  if (tower.hero) return null;
  const refund = sellValue(tower.type, tower.base, tower.tiers);
  g.money += refund;
  g.towers.splice(i, 1);
  return refund;
}

/**
 * Buy the next tier on one of a tower's three paths. Returns the tier bought,
 * or null if the restriction rule or the bank says no.
 */
export function upgradeTower(g, tower, path) {
  if (!PATHS[tower.type] || path < 0 || path > 2) return null;
  if (!canBuy(tower.tiers, path)) return null;
  const cost = tierCost(tower.type, path, tower.tiers[path]);
  // Sandbox pays for nothing. The restriction rule still applies — a sandbox that
  // let you buy 4-4-4 would not show you what the game's builds actually look
  // like, which is the only reason to have one.
  const free = g.diff?.free === true;
  if (!free && g.money < cost) return null;
  if (!free) g.money -= cost;
  tower.tiers[path] += 1;
  tower.def = computeStats(tower.type, tower.base, tower.tiers);
  return { path, tier: tower.tiers[path], cost, name: PATHS[tower.type][path].tiers[tower.tiers[path] - 1].name };
}

/** Support auras from Sugar rush coin piñatas. Best-of, never stacking. */
function applyAuras(g) {
  for (const t of g.towers) {
    t.buffRate = 0;
    t.buffDamage = 0;
  }
  for (const a of g.towers) {
    if (!a.def.auraRate && !a.def.auraDamage) continue;
    for (const t of g.towers) {
      if (t === a) continue;
      // ENCORE: the band stops being a radius and becomes the whole plaza. The
      // mariachi's three paths all end here, and it is the one upgrade that
      // changes where you would put the piñata rather than how strong it is.
      const heard = (a.def.special ?? EMPTY).includes("encore");
      if (!heard && Math.hypot(t.x - a.x, t.y - a.y) > a.def.auraRange) continue;
      t.buffRate = Math.max(t.buffRate, a.def.auraRate);
      t.buffDamage = Math.max(t.buffDamage, a.def.auraDamage);
    }
  }
}

// ------------------------------------------------------------------ waves

/**
 * Waves past the authored campaign cycle the last third of it rather than
 * repeating wave 15 forever, so freeplay still varies in shape while the
 * scale multiplier carries the difficulty.
 */
/** How many authored rounds the campaign has. The UI needs this to know
 * whether there is anything left to send early. */
export const WAVE_COUNT = WAVES.length;

export function waveGroups(wave) {
  if (wave < WAVES.length) return WAVES[wave];
  const tail = Math.max(1, Math.floor(WAVES.length / 3));
  return WAVES[WAVES.length - tail + ((wave - WAVES.length) % tail)];
}

/** Carry on past the last authored wave instead of ending the run. */
export function continueFreeplay(g) {
  if (g.phase !== "won") return false;
  g.freeplay = true;
  g.phase = "build";
  return true;
}

export function startWave(g) {
  // "build" is the normal case; "wave" is a round sent EARLY, on top of one
  // still walking. Everything else — won, lost, the freeplay gate — is not a
  // state you can send from.
  if (g.phase !== "build" && g.phase !== "wave") return false;
  if (!g.freeplay && g.wave >= WAVES.length) return false;
  const groups = waveGroups(g.wave);
  // Steady ramp through the campaign, then a steeper one for freeplay past the
  // last authored wave. Without this a greedy opening wins untroubled.
  //
  // The freeplay term was 0.35 and that made "endless" four waves long: measured,
  // every profile on every board died between 16 and 19 no matter how well it had
  // played, because the extra multiplier reached 3x within five waves. At 0.18 the
  // tail separates builds instead of clamping them — the saving bot reaches 29 on
  // Plaza del Sol and 34 on El Mercado where the greedy ones still stop at 19 —
  // which is what makes "how far did you get" worth recording.
  const scale =
    (1 + g.wave * (g.diff?.hpRamp ?? HP_RAMP)) *
    (1 + Math.max(0, g.wave - WAVES.length + 1) * 0.18);
  g.wave += 1;
  g.phase = "wave";
  // Every queued spawn and every enemy carries the round it belongs to, so two
  // rounds can share the road and each still knows when IT is finished. Without
  // the tag there is no way to say which round just ended, and the wave bonus
  // either pays twice or not at all.
  const wave = g.wave;
  g.queue = g.queue ?? [];
  for (const grp of groups)
    for (let i = 0; i < grp.n; i++)
      g.queue.push({ id: grp.id, at: g.time + grp.delay + i * grp.gap, scale, wave });
  g.queue.sort((a, b) => a.at - b.at);
  g.live = g.live ?? [];
  if (!g.live.includes(wave)) g.live.push(wave);
  // How many rounds are on the road at once, for the payout below and for the
  // HUD, which has to be able to say "two rounds out".
  g.sentEarly = (g.sentEarly ?? 0) + (g.live.length > 1 ? 1 : 0);
  return true;
}

/** Rounds currently on the road, oldest first. */
export const liveWaves = (g) => (g.live ?? []).slice();

function spawn(g, id, hpScale = 1, dist = 0) {
  const def = ENEMIES[id];
  const hp = def.hp * hpScale * HP_MUL;
  const e = {
    id: nextId++,
    type: id,
    def,
    hp,
    maxHp: hp,
    dist,
    x: 0,
    y: 0,
    slow: 1,
    slowT: 0,
    stunT: 0,
    burn: 0,
    burnT: 0,
    travelled: 0,
    phase: g.rng() * 6.28,
    // Per-enemy overrides, so a boss can change what it *is* mid-fight without
    // mutating the shared definition every other enemy of its type reads from.
    sprite: null,
    speedMul: 1,
    resist: null,
    noSlow: false,
    phaseIx: 0,
    // Counts down after a hit; the renderer flashes the luchador while it runs.
    hitT: 0,
    // Which round this belongs to. Defaulted HERE rather than at the queue,
    // because a boss shedding a phase and the campeón's tag-in partners are
    // spawned outside the queue entirely — untagged, they let their round
    // report itself finished while they were still on the road.
    wave: g.wave,
  };
  const p = pointAt(g.path, dist);
  e.x = p.x;
  e.y = p.y;
  g.enemies.push(e);
  return e;
}

// ----------------------------------------------------------------- combat

/**
 * Deal damage from outside the projectile path — burn ticks, splash, and
 * later on hero abilities. Returns the events it generated.
 */
export function damage(g, e, amount, dmgType, pen = 0) {
  const ev = [];
  applyDamage(g, e, amount, dmgType, ev, pen);
  return ev;
}

function applyDamage(g, e, amount, dmgType, ev, pen = 0) {
  const resist = Math.max(0, ((e.resist ?? e.def.resist)?.[dmgType] ?? 0) - pen);
  const dealt = amount * (1 - resist);
  e.hp -= dealt;
  // Juice: the frame it takes a hit, it flashes. Cheap to store, and the single
  // most effective piece of feedback in the game — you can see WHICH luchador
  // your piñata is actually hitting in a crowd.
  e.hitT = 0.12;
  ev.push({ t: "hit", x: e.x, y: e.y, dmgType, resisted: resist > 0, amount: dealt });
  if (e.hp > 0) checkPhases(g, e, ev);
  else defeat(g, e, ev);
  return dealt;
}

/**
 * A boss changing what it is, on the way down.
 *
 * Triggered by health rather than by a timer, which is what makes the fight
 * learnable instead of memorised: you can watch the bar approach the next phase
 * and spend for it. Each phase fires once — `phaseIx` only moves forward — and
 * the changes are written onto the *enemy*, never onto the shared definition,
 * or the second Coloso of the session would start where the first one finished.
 */
function checkPhases(g, e, ev) {
  const list = e.def.phases;
  if (!list) return;
  const frac = e.hp / e.maxHp;
  while (e.phaseIx < list.length && frac <= list[e.phaseIx].at) {
    const ph = list[e.phaseIx];
    e.phaseIx += 1;
    if (ph.sprite) e.sprite = ph.sprite;
    if (ph.speed) e.speedMul = ph.speed / e.def.speed;
    if (ph.resist) e.resist = ph.resist;
    if (ph.noSlow) e.noSlow = true;
    // The adds come in behind him, not on top of him: a squad that spawns at his
    // feet walks in front and eats the shots meant for the boss.
    for (const id of ph.adds ?? [])
      spawn(g, id, 1 + g.wave * (g.diff?.hpRamp ?? HP_RAMP), Math.max(0, e.dist - 40 - g.rng() * 80));
    ev.push({ t: "phase", x: e.x, y: e.y, name: ph.name, boss: e.def.name });
  }
}

function defeat(g, e, ev) {
  // A share from the board's work as well as from finished rounds, so a hero
  // placed mid-round is not stuck at its level until the round ends.
  addHeroXp(g, xpForDefeat);
  const i = g.enemies.indexOf(e);
  if (i < 0) return;
  g.enemies.splice(i, 1);
  g.stats.defeated += 1;
  g.stats.masks[e.type] = (g.stats.masks[e.type] ?? 0) + 1;
  ev.push({ t: "defeat", x: e.x, y: e.y, type: e.type, boss: !!e.def.boss });

  // PAYDAY: the treasury takes a cut of every defeat on the board, not just the
  // ones it caused — it causes none, having no damage at all. Paid once however
  // many treasuries you own, so stacking accountants is not a strategy.
  if (g.towers.some((t) => (t.def.special ?? EMPTY).includes("payday"))) {
    const cut = Math.round(e.def.bounty * 0.25);
    g.money += cut;
    // Said out loud, at the kill. Without this the treasury is a number that
    // goes up slightly faster than you remember, which is indistinguishable
    // from not having bought it.
    ev.push({ t: "payday", x: e.x, y: e.y, amount: cut });
  }

  // The mask comes off — máscara contra máscara. That is the death beat.
  ev.push({ t: "mask", x: e.x, y: e.y, type: e.type });

  // They are carrying looted candy. Spill it; it is collected a beat later.
  const n = Math.min(14, 4 + Math.floor(e.def.bounty / 6));
  for (let k = 0; k < n; k++) {
    const a = g.rng() * Math.PI * 2;
    const sp = 40 + g.rng() * 90;
    g.candy.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.5,
      z: 10 + g.rng() * 14,
      vz: 90 + g.rng() * 90,
      value: (e.def.bounty * BOUNTY_MUL * (g.payout ?? 1)) / n,
      rest: 0,
      hue: Math.floor(g.rng() * 5),
    });
  }

  // El Campeón tags in his partners rather than simply dying.
  if (e.def.tag) {
    ev.push({ t: "tag", x: e.x, y: e.y });
    for (const id of e.def.tag) spawn(g, id, 1, Math.max(0, e.dist - 30 - g.rng() * 60));
  }
}

// Targeting. BTD6's core piece of player agency over a placed tower: the same
// piñata is a completely different tool depending on what it points at.
export const TARGETING = [
  { id: "first", name: "First", tip: "Whatever is furthest down the lane." },
  { id: "last", name: "Last", tip: "Whatever just arrived." },
  { id: "strong", name: "Strong", tip: "The biggest health pool in range." },
  { id: "close", name: "Close", tip: "Whatever is nearest this piñata." },
];

/** The target a tower would choose right now. Exported so it is testable. */
export function pickTarget(g, t) {
  const mode = TARGETING[t.targeting ?? 0].id;
  let best = null;
  let score = -Infinity;
  for (const e of g.enemies) {
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if (d > t.def.range) continue;
    let s;
    if (mode === "first") s = e.dist;
    else if (mode === "last") s = -e.dist;
    else if (mode === "strong") s = e.maxHp * 1e6 - e.hp;
    else s = -d;
    if (s > score) {
      score = s;
      best = e;
    }
  }
  return best;
}

// Muzzle height, and the torso height shots are checked against. Both live
// here so the projectile that looks like it hit is the one that did.
export const MUZZLE_Y = 46;

/**
 * Damage multiplier for a shot taken at `dist` from a tower with `range`.
 * Linear from 1.0 at the tower's feet to EDGE_MUL at the rim. Exported so the
 * curve can be tested without staging a projectile — assigning an enemy's x/y
 * to place it at a chosen distance does not work, because `update()` recomputes
 * position from `dist` every frame.
 */
export const edgeFalloff = (dist, range) =>
  EDGE_MUL === 1 ? 1 : 1 - (1 - EDGE_MUL) * Math.min(1, dist / Math.max(1, range));
export const hitY = (e) => e.y - 20 * (e.def.scale ?? 1);

/** Frozen empty list, so a tower with no abilities allocates nothing per shot. */
const EMPTY = Object.freeze([]);

const has = (list, name) => list !== EMPTY && list.includes(name);

function fire(g, tower, target, ev) {
  const d = tower.def;
  const dx = target.x - tower.x;
  const dy = hitY(target) - (tower.y - MUZZLE_Y);
  const len = Math.hypot(dx, dy) || 1;
  tower.aim = Math.atan2(dy, dx);
  tower.cool = d.rate * (1 - (tower.buffRate ?? 0));
  tower.recoil = 1;
  g.shots.push({
    x: tower.x,
    y: tower.y - MUZZLE_Y,
    vx: (dx / len) * d.speed,
    vy: (dy / len) * d.speed,
    speed: d.speed,
    // Falloff is priced at the moment of firing, from how far the target was.
    dmg:
      d.damage *
      (1 + (tower.buffDamage ?? 0)) *
      edgeFalloff(Math.hypot(dx, dy), d.range),
    dmgType: d.dmgType,
    pen: d.sharpPierce ?? 0,
    burnSpread: d.burnSpread ?? 0,
    slow: d.slow ?? 0,
    slowSecs: d.slowSecs ?? 0,
    slowSplash: d.slowSplash ?? 0,
    stun: d.stun ?? 0,
    stunSplash: d.stunSplash ?? 0,
    pierce: d.pierce,
    chain: d.chain ?? 0,
    chainRange: d.chainRange ?? 0,
    chainFalloff: d.chainFalloff ?? 1,
    splash: d.splash ?? 0,
    burn: d.burn ?? null,
    kind: d.shot,
    // What the piñata throws, and what it can do. Both ride on the shot rather
    // than being looked up from the tower at impact, so a tower sold mid-flight
    // cannot change what its shot in the air does.
    art: d.shotArt ?? null,
    special: d.special ?? EMPTY,
    owner: tower,
    life: 1.6,
    hits: new Set(),
  });
  // VOLLEY: a second projectile, fanned a few degrees off the first. Deliberately
  // a real extra shot rather than a damage multiplier — you can see two things
  // leave the piñata, which is the whole point of a top-tier upgrade.
  if (has(d.special ?? EMPTY, "volley")) {
    const twin = { ...g.shots[g.shots.length - 1], hits: new Set() };
    const a = Math.atan2(twin.vy, twin.vx) + 0.17;
    twin.vx = Math.cos(a) * twin.speed;
    twin.vy = Math.sin(a) * twin.speed;
    twin.dmg *= 0.6;
    g.shots.push(twin);
  }
  // No `shot` event: nothing consumed it, the muzzle flash is driven off
  // `tower.recoil`, and firing is the hottest path in the sim.
}

/**
 * One snip of a papel picado piñata: everything under the paper takes a cut at
 * once, with the same range falloff a shot would have had.
 *
 * Ticked rather than applied per frame, and that is a feedback decision as much
 * as a cost one: continuous damage raises a `hit` event every frame for every
 * enemy in range, which is several hundred particles a second. On a beat it is a
 * rhythm, and the whole field shares one `cut` event so the effect can be drawn
 * once rather than per victim.
 */
function fieldTick(g, t, ev) {
  t.cool = t.def.rate * (1 - (t.buffRate ?? 0));
  let any = false;
  for (const e of [...g.enemies]) {
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if (d > t.def.range) continue;
    any = true;
    t.recoil = 1;
    applyDamage(
      g,
      e,
      t.def.damage * (1 + (t.buffDamage ?? 0)) * edgeFalloff(d, t.def.range),
      t.def.dmgType,
      ev,
      t.def.sharpPierce ?? 0,
    );
    if (t.def.slow > 0 && t.def.slow < 1 && e.hp > 0) {
      if (e.def.noSlow || e.noSlow) {
        ev.push({ t: "shrug", x: e.x, y: e.y, type: e.type });
      } else {
        e.slow = Math.min(e.slow, t.def.slow);
        e.slowT = Math.max(e.slowT, t.def.slowSecs || 0.4);
      }
    }
  }
  if (any) ev.push({ t: "cut", x: t.x, y: t.y, r: t.def.range });
}

/**
 * The next luchador a ribbon can whip to: nearest to the one just hit, within
 * `chainRange`, and not already on this shot's hit list. Nearest rather than
 * furthest-along deliberately — the tower is priced as a crowd tool, so it should
 * follow the crowd, not race the leader.
 */
function chainTarget(g, shot, from) {
  let best = null;
  let bestD = shot.chainRange;
  for (const o of g.enemies) {
    if (o === from || shot.hits.has(o.id) || o.hp <= 0) continue;
    const d = Math.hypot(o.x - from.x, hitY(o) - hitY(from));
    if (d <= bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

// The cape only works against something slow enough to see coming, and a
// firecracker does not care what you wave at it.
/** Exported so the dodge rule can be tested without staging a projectile. */
export function wouldDodge(g, e, shot) {
  return deflects(g, e, shot);
}

function deflects(g, e, shot) {
  if (shot.dmgType === DMG.SPLASH) return false;
  if (shot.speed >= 500) return false;
  // A cape is waved at a slow shot; a swinging piñata simply is not there any
  // more. Both are "you needed something faster", so both read as a dodge.
  if (e.def.cape && g.rng() < e.def.cape) return "cape";
  // Only the fast middle of the arc dodges, and not reliably. At 0.55/0.7 this
  // ate ~44% of every sub-500 shot, which is chili, gum and maraca — most of
  // the support roster — and wiped all three boards.
  if (e.def.sway && Math.abs(e.swayV ?? 0) > e.def.sway * e.def.swayRate * 0.78)
    return g.rng() < 0.45 ? "sway" : false;
  return false;
}

// ------------------------------------------------------------------ update

export function update(g, dtRaw) {
  const ev = [];
  if (g.phase === "over" || g.phase === "won") return ev;
  const dt = Math.min(0.05, dtRaw);
  g.time += dt;

  while (g.queue.length && g.queue[0].at <= g.time) {
    const s = g.queue.shift();
    const e = spawn(g, s.id, s.scale);
    e.wave = s.wave;
    if (e.def.boss) ev.push({ t: "boss", name: e.def.name });
  }

  applyAuras(g);

  for (const t of g.towers) {
    t.cool -= dt;
    t.recoil = Math.max(0, t.recoil - dt * 5);
    if (t.def.field) {
      if (t.cool <= 0) fieldTick(g, t, ev);
      continue;
    }
    if (t.def.damage <= 0 || t.cool > 0) continue;
    const best = pickTarget(g, t);
    if (best) fire(g, t, best, ev);
  }

  for (let i = g.shots.length - 1; i >= 0; i--) {
    const s = g.shots[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    let dead =
      s.life <= 0 || s.x < -40 || s.x > g.map.w + 40 || s.y < -40 || s.y > g.map.h + 40;

    if (!dead) {
      for (const e of g.enemies) {
        if (s.hits.has(e.id)) continue;
        const r = 12 + (e.def.scale ?? 1) * 10;
        if (Math.hypot(e.x - s.x, hitY(e) - s.y) > r) continue;
        s.hits.add(e.id);
        const dodge = deflects(g, e, s);
        if (dodge) {
          // `how` lets the feedback layer say *which* counter fired, so the
          // player learns the rule rather than just seeing a miss.
          ev.push({ t: "deflect", x: e.x, y: e.y, how: dodge });
          dead = true;
          break;
        }
        if (s.splash > 0) {
          ev.push({ t: "burst", x: s.x, y: s.y, r: s.splash });
          for (const o of [...g.enemies])
            if (Math.hypot(o.x - s.x, hitY(o) - s.y) <= s.splash) {
              applyDamage(g, o, s.dmg, s.dmgType, ev, s.pen);
              if (s.burn && o.hp > 0) {
                o.burn = Math.max(o.burn, s.burn.dps);
                o.burnT = Math.max(o.burnT, s.burn.secs);
              }
            }
          dead = true;
          break;
        }
        applyDamage(g, e, s.dmg, s.dmgType, ev, s.pen);
        if (s.slow > 0 && e.hp > 0) {
          if (e.def.noSlow || e.noSlow) {
            ev.push({ t: "shrug", x: e.x, y: e.y, type: e.type });
          } else {
            e.slow = Math.min(e.slow, s.slow);
            e.slowT = Math.max(e.slowT, s.slowSecs);
            ev.push({ t: "slowed", x: e.x, y: e.y });
          }
          // Bubble trap: the gum splatters onto everyone standing nearby.
          if (s.slowSplash > 0)
            for (const o of g.enemies)
              if (o !== e && !(o.def.noSlow || o.noSlow) && Math.hypot(o.x - e.x, o.y - e.y) <= s.slowSplash) {
                o.slow = Math.min(o.slow, s.slow);
                o.slowT = Math.max(o.slowT, s.slowSecs);
              }
        }
        if (s.stun > 0 && e.hp > 0) {
          // Heavies shake a rattle off faster; the campeón nearly ignores it.
          const secs = s.stun * (1 - (e.def.stunResist ?? 0));
          if (secs > 0.03) {
            e.stunT = Math.max(e.stunT, secs);
            ev.push({ t: "stunned", x: e.x, y: e.y, secs });
          } else {
            ev.push({ t: "shrug", x: e.x, y: e.y, type: e.type });
          }
          if (s.stunSplash > 0)
            for (const o of g.enemies)
              if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= s.stunSplash) {
                const os = s.stun * (1 - (o.def.stunResist ?? 0));
                if (os > 0.03) o.stunT = Math.max(o.stunT, os);
              }
        }
        // EXECUTE: finish anything already on its knees. A threshold of the
        // enemy's OWN max health, so it reads the same on a niño and on a boss —
        // except bosses, which cannot be executed or the fight would end on a
        // lucky shot rather than on the fight.
        if (e.hp > 0 && !e.def.boss && has(s.special, "execute") && e.hp <= e.maxHp * 0.12) {
          ev.push({ t: "execute", x: e.x, y: hitY(e) });
          applyDamage(g, e, e.hp + 1, s.dmgType, ev, 1);
        }
        // SHOCKWAVE: the impact itself rattles everything around it. The maraca
        // already stuns what it hits; this is the upgrade that makes the hit an
        // area event.
        if (has(s.special, "shockwave")) {
          for (const o of g.enemies)
            if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= 70) {
              // Scaled by the same resistance the ordinary stun respects. The
              // first version skipped anything with ANY resistance, which made
              // the ability read as "does nothing to half the roster".
              const os = 0.35 * (1 - (o.def.stunResist ?? 0));
              if (os > 0.03) o.stunT = Math.max(o.stunT, os);
            }
          ev.push({ t: "quake", x: e.x, y: hitY(e) });
        }
        // FREEZE: a slow deep enough to be a stop. Reuses the stun clock rather
        // than inventing a second one, so everything that already draws "held in
        // place" keeps working.
        // Through `stunResist`, NOT around it. Setting stunT flat let a gum
        // piñata hold El Coloso still for the entire fight — he carries
        // `stunResist: 0.95` for exactly that reason, and freeze was the one
        // path in the game that ignored it. Caught by the ability soak: every
        // freeze build finished the campaign without leaking a single life while
        // every other build leaked the boss's 100.
        if (has(s.special, "freeze") && !e.def.noSlow && !e.noSlow) {
          const fs = 0.5 * (1 - (e.def.stunResist ?? 0));
          if (fs > 0.03) e.stunT = Math.max(e.stunT, fs);
        }
        if (s.burn && e.hp > 0) {
          e.burn = Math.max(e.burn, s.burn.dps);
          e.burnT = Math.max(e.burnT, s.burn.secs);
        }
        // Eternal flame: the fire jumps to whoever is standing nearby.
        // WILDFIRE: the whole plaza catches, not just whoever was standing next
        // to the one you hit.
        if (has(s.special, "wildfire") && s.burn) {
          for (const o of g.enemies)
            if (Math.hypot(o.x - e.x, o.y - e.y) <= 150) {
              o.burn = Math.max(o.burn, s.burn.dps);
              o.burnT = Math.max(o.burnT, s.burn.secs);
            }
        }
        if (s.burnSpread > 0 && s.burn) {
          for (const o of g.enemies)
            if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= s.burnSpread) {
              o.burn = Math.max(o.burn, s.burn.dps);
              o.burnT = Math.max(o.burnT, s.burn.secs);
            }
        }
        // The ribbon whips on to the next luchador rather than stopping. Distinct
        // from pierce, which only carries a shot along the line it was already
        // travelling: a chain turns, so it pays off where they bunch sideways
        // and does nothing to a single runner.
        if (s.chain > 0) {
          const next = chainTarget(g, s, e);
          if (next) {
            s.chain -= 1;
            s.dmg *= s.chainFalloff;
            const nx = next.x - e.x;
            const ny = hitY(next) - hitY(e);
            const len = Math.hypot(nx, ny) || 1;
            s.x = e.x;
            s.y = hitY(e);
            s.vx = (nx / len) * s.speed;
            s.vy = (ny / len) * s.speed;
            // Long enough to cross the jump it just committed to, and no longer:
            // a chain shot that outlives its hop wanders off across the board.
            s.life = Math.max(s.life, len / s.speed + 0.15);
            ev.push({ t: "chain", x: e.x, y: hitY(e), tx: next.x, ty: hitY(next) });
            break;
          }
        }
        // PIERCE ALL: the shot never stops. A separate branch rather than a huge
        // pierce number, because "carries on through everything" is a promise the
        // panel makes and a big number is only usually true.
        if (!has(s.special, "pierceAll")) {
          s.pierce -= 1;
          if (s.pierce <= 0) {
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) g.shots.splice(i, 1);
  }

  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i];
    if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt);
    if (e.burnT > 0) {
      e.burnT -= dt;
      applyDamage(g, e, e.burn * dt, DMG.BURN, ev);
      if (e.hp <= 0) continue;
    }
    if (e.slowT > 0) {
      e.slowT -= dt;
      if (e.slowT <= 0) e.slow = 1;
    }
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.phase += dt * 9; // shake in place rather than freezing solid
      continue;
    }
    let v = e.def.speed * e.speedMul * (e.def.noSlow || e.noSlow ? 1 : e.slow) * (g.map.speedMul ?? 1);
    if (e.def.charge) {
      const ramp = Math.min(1, e.dist / (g.path.total * 0.7));
      v *= 1 + (e.def.charge - 1) * ramp;
    }
    e.dist += v * dt;
    const p = pointAt(g.path, e.dist);
    e.x = p.x;
    e.y = p.y;
    e.ux = p.ux;
    e.uy = p.uy;
    if (e.def.sway) {
      e.swayT = (e.swayT ?? e.phase) + dt * e.def.swayRate;
      const off = Math.sin(e.swayT) * e.def.sway;
      // Perpendicular to travel, so it reads as swinging across the lane.
      e.x += -p.uy * off;
      e.y += p.ux * off;
      e.swayV = Math.cos(e.swayT) * e.def.sway * e.def.swayRate;
    }
    e.phase += dt * (4 + v / 22);
    if (e.dist >= g.path.total) {
      g.enemies.splice(i, 1);
      g.lives = Math.max(0, g.lives - e.def.leak);
      g.stats.leaked += 1;
      ev.push({ t: "leak", x: e.x, y: e.y, amount: e.def.leak });
      if (g.lives <= 0) {
        g.phase = "over";
        ev.push({ t: "over" });
        return ev;
      }
    }
  }

  for (let i = g.candy.length - 1; i >= 0; i--) {
    const c = g.candy[i];
    if (c.z > 0 || c.vz > 0) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vz -= 420 * dt;
      c.z += c.vz * dt;
      if (c.z <= 0) {
        c.z = 0;
        c.vz = 0;
        c.vx = 0;
        c.vy = 0;
      }
    } else {
      c.rest += dt;
      if (c.rest > 0.75) {
        g.money += c.value;
        g.stats.earned += c.value;
        ev.push({ t: "collect", x: c.x, y: c.y, value: c.value });
        g.candy.splice(i, 1);
      }
    }
  }

  // A round is finished when nothing of ITS is left queued and nothing of its
  // is still walking — not when the board happens to be empty, which is a
  // different question once two rounds can share the road.
  if (g.phase === "wave" && g.live?.length) {
    for (const w of g.live.slice()) {
      if (g.queue.some((q) => q.wave === w)) continue;
      if (g.enemies.some((e) => e.wave === w)) continue;
      g.live.splice(g.live.indexOf(w), 1);

      let income = 0;
      let interest = 0;
      for (const t of g.towers) {
        if (t.def.income) income += t.def.income;
        if (t.def.interest) interest += g.money * t.def.interest;
      }
      interest = Math.min(interest, 4000); // keep compounding from running away
      // Priced off the round that just ended, not off `g.wave` — with an early
      // send those differ, and paying round 7's bonus at round 9's rate is free
      // money for pressing a button.
      const bonus = (BONUS_BASE + w * BONUS_PER_WAVE) * (g.payout ?? 1) + income + interest;
      g.money += bonus;
      g.stats.earned += bonus;
      ev.push({ t: "waveEnd", wave: w, bonus, income, interest: Math.round(interest) });
      // Finishing a round is most of a hero's experience, so a support hero
      // climbs at the same rate as a carry.
      const lv = addHeroXp(g, xpForWave(w));
      if (lv) ev.push({ t: "heroLevel", level: lv, name: HEROES[g.heroId].name, max: lv >= MAX_LEVEL });
    }
  }

  // Outside the block above on purpose. An empty board ends the fight whatever
  // `live` happens to hold — gating this on `live.length` meant one bad tag
  // could strand the game in "wave" with nothing on the board.
  if (g.phase === "wave" && !g.live?.length && !g.queue.length && !g.enemies.length) {
    g.phase = "build";
    if (g.wave >= WAVES.length && !g.freeplay) {
      g.phase = "won";
      ev.push({ t: "won" });
    }
  }

  return ev;
}
