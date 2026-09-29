// Lever sensitivity. Applies the same +/- swing to enemy health and to income,
// and reports how much each moves the outcome — so "which knob is sharp" is a
// measurement rather than an impression.
//
//   node test/sensitivity.mjs [runs]
//
// Why this exists: R15 concluded from one sweep that income was a far sharper
// lever than HP_RAMP. But HP_RAMP had already shown its own cliff (0.155 -> 0.16
// flipped a board from 47% to 15%), which suggests the game is simply tuned to
// an edge where every knob looks sharp. `lives remaining` is a threshold-y
// measure near that edge, so this also reports smoother metrics:
//
//   held      fraction of runs that finished the campaign
//   lives%    lives remaining, the headline but the least stable number
//   margin    total damage headroom: sum over waves of (lives left / max), so a
//             run that coasts scores near 1 per wave and one that scrapes scores
//             low, and it keeps varying even when lives% is pinned at 0
//   firstLeak wave of the first life lost — pure early-game pressure
//   tiers     upgrade tiers bought, i.e. what the economy actually converted to

import { spawnSync } from "node:child_process";

const runs = Number(process.argv[2] ?? 5);

const CASES = [
  { label: "baseline", env: {} },
  { label: "hp -10%", env: { PU_HP_MUL: 0.9 } },
  { label: "hp +10%", env: { PU_HP_MUL: 1.1 } },
  { label: "income -10%", env: { PU_INCOME_MUL: 0.9 } },
  { label: "income +10%", env: { PU_INCOME_MUL: 1.1 } },
];

// The child prints one JSON line so this stays a plain subprocess sweep; the
// knobs are read at module load, which is why each case needs its own process.
const CHILD = `
await import("./test/knobs.mjs"); // binds PU_* env knobs before data.js loads
const sim = await import("./src/sim.js");
const { WAVES, TOWERS } = await import("./src/data.js");
const { MAX_TIER, canBuy, tierCost } = await import("./src/upgrades.js");

const PLAN = ${JSON.stringify([
  "candy", "candy", "coin", "gum", "chili", "maraca",
  "firecracker", "sparkler", "candy", "gum", "firecracker", "maraca",
  "sparkler", "chili", "candy", "firecracker",
])};
const isSupport = (t) => t.def.income > 0 || t.def.slow > 0 || t.def.stun > 0;
const options = (t) => {
  const out = [];
  for (let p = 0; p < 3; p++)
    if (canBuy(t.tiers, p)) out.push({ tower: t, path: p, cost: tierCost(t.type, p, t.tiers[p]) });
  return out;
};
const PROFILES = {
  spread(g, next) {
    if (next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost) return { place: true };
    const pick = g.towers.flatMap(options).sort((a, b) => a.cost - b.cost).find((o) => o.cost <= g.money);
    return pick ? { buy: pick } : null;
  },
  focused(g, next) {
    if (g.towers.length < 7 && next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost)
      return { place: true };
    const carries = g.towers.filter((t) => t.def.damage > 0 && !isSupport(t));
    for (const order of [0, 2, 1])
      for (const t of carries) {
        if (t.tiers[order] >= MAX_TIER || !canBuy(t.tiers, order)) continue;
        const cost = tierCost(t.type, order, t.tiers[order]);
        if (cost <= g.money) return { buy: { tower: t, path: order, cost } };
      }
    for (const t of g.towers.filter(isSupport)) {
      const pick = options(t).sort((a, b) => a.cost - b.cost).find((o) => o.cost <= g.money);
      if (pick) return { buy: pick };
    }
    if (next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost) return { place: true };
    return null;
  },
};

// SURVIVE mode tops lives up before every wave so the run always reaches wave
// 15. Loop gain has to be measured this way: total earned otherwise mostly
// reflects how far a run got, so a small income change that kills the run reads
// as a negative loop. That confound made the first version swing 0.63x to 3.29x
// on noise alone. (No backticks in here - this block lives inside a template.)
function play(seed, profile, mapId, survive = false) {
  const g = sim.createGame(seed, "plaza", mapId);
  const SPOTS = profile === "focused" ? sim.bestSpots(g, PLAN.length) : sim.suggestSpots(g, PLAN.length);
  let next = 0;
  let margin = 0;
  let firstLeak = 0;
  for (let wave = 0; wave < WAVES.length; wave++) {
    for (let guard = 0; guard < 400; guard++) {
      const move = PROFILES[profile](g, next);
      if (!move) break;
      if (move.place) {
        if (!SPOTS[next] || !sim.placeTower(g, PLAN[next], ...SPOTS[next])) break;
        next += 1;
      } else if (!sim.upgradeTower(g, move.buy.tower, move.buy.path)) break;
    }
    const before = g.lives;
    if (survive) g.lives = g.maxLives = 1e6;
    sim.startWave(g);
    let guard = 0;
    while (g.phase === "wave" && guard++ < 90 / 0.016) sim.update(g, 0.016);
    margin += Math.max(0, g.lives) / g.maxLives;
    if (!firstLeak && g.lives < before) firstLeak = wave + 1;
    if (g.phase === "over") break;
  }
  return {
    waves: Math.min(WAVES.length, g.wave),
    held: g.phase !== "over" ? 1 : 0,
    lives: Math.max(0, g.lives) / g.maxLives,
    margin: margin / WAVES.length,
    firstLeak: firstLeak || WAVES.length + 1,
    tiers: g.towers.reduce((n, t) => n + t.tiers.reduce((a, b) => a + b, 0), 0),
    earned: g.stats.earned,
  };
}

const runs = Number(process.env.PU_RUNS ?? 5);
const out = {};
for (const profile of ["spread", "focused"]) {
  const rows = [];
  const survivors = [];
  for (const mapId of ["plaza", "mercado", "cementerio"])
    for (let i = 0; i < runs; i++) {
      rows.push(play(i + 1, profile, mapId));
      survivors.push(play(i + 1, profile, mapId, true));
    }
  const mean = (list, k) => list.reduce((s, r) => s + r[k], 0) / list.length;
  out[profile] = {
    held: mean(rows, "held"),
    lives: mean(rows, "lives"),
    margin: mean(rows, "margin"),
    firstLeak: mean(rows, "firstLeak"),
    tiers: mean(rows, "tiers"),
    earned: mean(rows, "earned"),
    // measured on runs that always complete all 15 waves
    econEarned: mean(survivors, "earned"),
    econTiers: mean(survivors, "tiers"),
  };
}
process.stdout.write(JSON.stringify(out));
`;

function measure(env) {
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", CHILD],
    {
      encoding: "utf8",
      cwd: process.cwd(),
      env: { ...process.env, ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])), PU_RUNS: String(runs) },
    },
  );
  if (r.status !== 0) {
    console.error(r.stderr.slice(-1200));
    process.exit(1);
  }
  return JSON.parse(r.stdout);
}

const results = [];
for (const c of CASES) {
  const r = measure(c.env);
  results.push({ label: c.label, ...r });
}

const base = results[0];
const fmt = (n, d = 2) => n.toFixed(d).padStart(6);

console.log(`runs per map: ${runs}   maps: 3   difficulty: Plaza\n`);
for (const profile of ["spread", "focused"]) {
  console.log(profile);
  console.log("  case            held  lives%  margin  1stLeak   tiers   earned");
  for (const r of results) {
    const p = r[profile];
    console.log(
      `  ${r.label.padEnd(14)}${fmt(p.held)}  ${fmt(p.lives * 100, 1)}  ${fmt(p.margin, 3)}  ` +
        `${fmt(p.firstLeak, 1)}  ${fmt(p.tiers, 1)}  ${String(Math.round(p.earned)).padStart(7)}`,
    );
  }
  // Elasticity on `margin`, the metric that keeps moving when lives% is pinned.
  const el = (a, b) => {
    const d = (results[b][profile].margin - results[a][profile].margin) / base[profile].margin;
    return (d / 0.2) * 100; // per 100% lever change, across the -10%..+10% span
  };
  // Loop gain: how much *total* candy a payout change ends up producing. Bounty
  // candy is performance-dependent, so candy buys defence, defence kills more,
  // and more kills pay more candy. A gain near 1 means no amplification; well
  // above 1 means the economy is a feedback loop and income cannot be tuned
  // gently, because a small nudge compounds over fifteen waves.
  // Measured on the always-survive runs only. Using total earned from ordinary
  // runs conflates the loop with how far the run got.
  const gain =
    (results[4][profile].econEarned - results[3][profile].econEarned) /
    base[profile].econEarned /
    0.2;
  console.log(
    `  elasticity of margin:  hp ${el(1, 2).toFixed(0)}%   income ${el(3, 4).toFixed(0)}%`,
  );
  console.log(
    `  income loop gain: ${gain.toFixed(2)}x   (1.00x = none; 15-wave base earn ` +
      `${Math.round(base[profile].econEarned)}, ${base[profile].econTiers.toFixed(1)} tiers)\n`,
  );
}
