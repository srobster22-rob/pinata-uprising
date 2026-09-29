/**
 * Soak every top-tier ability through a full campaign.
 *
 * The unit tests prove each ability is granted and that the sim does not throw
 * on a single hit. They do not prove one survives sixteen waves against every
 * enemy in the game — and the abilities reach into the parts of the sim most
 * likely to break on an edge case: removing enemies mid-iteration (`execute`),
 * spawning shots from inside the shot loop (`volley`), touching every enemy on
 * the board (`wildfire`, `shockwave`), and paying out from `defeat` (`payday`).
 *
 *   node test/abilities.mjs
 */
import * as sim from "../src/sim.js";
import { PATHS, computeStats } from "../src/upgrades.js";
import { TOWERS, TOWER_ORDER } from "../src/data.js";

const WAVES_TO_RUN = 16;

/** Every (piñata, path) whose tier 4 grants an ability, with the ability named. */
const CASES = [];
for (const id of TOWER_ORDER)
  PATHS[id].forEach((p, pi) => CASES.push({ id, pi, name: p.name, special: p.tiers[3].special }));

function spots(g, want) {
  const out = [];
  for (let x = 90; x < 900 && out.length < want; x += 20)
    for (let y = 90; y < 550 && out.length < want; y += 20)
      if (sim.canPlace(g, x, y) && out.every(([px, py]) => Math.hypot(px - x, py - y) > 60)) out.push([x, y]);
  return out;
}

let failures = 0;
const rows = [];

for (const c of CASES) {
  // Sandbox: the point is to exercise the ability, not to afford it.
  const g = sim.createGame(11, "sandbox", "plaza");
  const where = spots(g, 8);
  // The piñata under test, maxed on its path, plus a few candy piñatas so waves
  // actually die and the run reaches the boss.
  const built = [];
  for (const [x, y] of where) {
    const t = sim.placeTower(g, built.length === 0 ? c.id : "candy", x, y);
    if (!t) continue;
    if (built.length === 0) {
      t.tiers = [0, 0, 0];
      t.tiers[c.pi] = 4;
      t.def = computeStats(c.id, t.base, t.tiers);
    } else {
      t.tiers = [2, 2, 0];
      t.def = computeStats("candy", t.base, t.tiers);
    }
    built.push(t);
  }
  const subject = built[0];
  let err = null;
  let fired = 0;
  let waves = 0;
  try {
    for (let w = 0; w < WAVES_TO_RUN && !g.over; w++) {
      if (!sim.startWave(g)) break;
      waves += 1;
      for (let i = 0; i < 6000 && g.phase !== "build" && !g.over; i++) {
        const ev = sim.update(g, 0.016);
        for (const e of ev) if (e.t === "execute" || e.t === "quake") fired += 1;
      }
    }
  } catch (e) {
    err = e;
  }
  const ok = !err;
  if (!ok) failures += 1;
  rows.push({
    who: `${c.id} ${c.name}`,
    special: c.special,
    waves,
    lives: Math.max(0, Math.round(g.lives)),
    money: Math.round(g.money),
    events: fired,
    err: err ? `${err.message}` : "",
    granted: subject ? (subject.def.special ?? []).includes(c.special) : false,
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("piñata / path", 30), pad("ability", 12), pad("waves", 6), pad("lives", 6), pad("granted", 8), "note");
for (const r of rows)
  console.log(
    pad(r.who, 30),
    pad(r.special, 12),
    pad(r.waves, 6),
    pad(r.lives, 6),
    pad(r.granted ? "yes" : "NO", 8),
    r.err ? `THREW: ${r.err}` : r.events ? `${r.events} ability events` : "",
  );

const ungranted = rows.filter((r) => !r.granted);
const stalled = rows.filter((r) => r.waves < WAVES_TO_RUN);
console.log(`\n${rows.length} cases, ${failures} threw, ${ungranted.length} not granted, ${stalled.length} stalled`);
if (ungranted.length) console.log("not granted:", ungranted.map((r) => r.who).join(", "));
if (stalled.length) console.log("stalled:", stalled.map((r) => `${r.who}@${r.waves}`).join(", "));
process.exit(failures || ungranted.length ? 1 : 0);
