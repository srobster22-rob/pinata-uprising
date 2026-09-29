// Headless playtest. Plays two skill profiles across the campaign so balance
// shows up as a band rather than a single number:
//
//   spread  — buys towers wide and upgrades cheapest-first. A weak-but-sane
//             player. Should struggle late; if this profile cruises, the game
//             is too easy.
//   focused — builds fewer towers and pushes a couple of carries to tier 4,
//             the way an experienced player actually spends. Should win.
//
// Tuning target: focused wins with lives to spare, spread finishes tight or
// loses. If both win comfortably or both die, the curve is wrong.
//
//   node test/playtest.mjs [runs] [--trace] [--maps] [--all] [--blind]
//
// `--blind` measures only the blindfold's *candy premium*. It cannot measure the
// mode itself: the handicap is on the player's information, and a bot does not
// use information, so the harness sees the payout and nothing else. Treat the
// difference as an upper bound on how much the premium gives away.

// MUST be first: binds PU_* env knobs onto globalThis before data.js loads.
import { overrides } from "./knobs.mjs";
import * as sim from "../src/sim.js";
import { TOWERS, WAVES, DIFFICULTY_ORDER, DIFFICULTIES, MAPS, MAP_ORDER } from "../src/data.js";
import { PATHS, MAX_TIER, canBuy, tierCost } from "../src/upgrades.js";

// The bots' build order. Sixteen entries, so `spread` ends up with sixteen towers
// and `focused` with the first seven — which means **a piñata missing from this
// list is never bought by any profile**, and a grid re-run after adding one
// measures nothing about it. That is how the ribbon dancer first came out
// looking perfectly balanced: it was never on the board.
const PLAN = [
  "candy", "candy", "coin", "gum", "chili", "maraca",
  "firecracker", "sparkler", "ribbon", "papel", "firecracker", "mariachi",
  "sparkler", "chili", "candy", "firecracker",
];

/**
 * The band's build: a mariachi trio and the piñatas that stand around it.
 *
 * Exists for the same reason `deep` does — to answer a question the other
 * profiles physically cannot. An aura is worth what its neighbours are worth,
 * and `spread` puts the trio twelfth (never bought below Fiesta: measured, seven
 * of nine grid cells were byte-identical with and without it) while `focused`
 * stops at seven towers and never buys one at all. Neither of them clusters, so
 * neither can price the one tower whose whole mechanic is standing close.
 */
const PLAN_BAND = ["candy", "mariachi", "candy", "chili", "firecracker", "candy", "gum", "candy"];

/** Every legal next-tier purchase on a tower, cheapest first. */
function options(t) {
  const out = [];
  for (let p = 0; p < 3; p++) {
    if (!canBuy(t.tiers, p)) continue;
    out.push({ tower: t, path: p, cost: tierCost(t.type, p, t.tiers[p]) });
  }
  return out;
}

const PROFILES = {
  // Wide and shallow: one more tower, else the cheapest upgrade anywhere.
  spread(g, next) {
    if (next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost) return { place: true };
    const all = g.towers.flatMap(options).sort((a, b) => a.cost - b.cost);
    const pick = all.find((o) => o.cost <= g.money);
    return pick ? { buy: pick } : null;
  },

  // Saves. Pours everything into ONE carry's main path, holding candy rather
  // than spending it on something cheap — the only policy that ever reaches
  // tier 4. Exists to answer "does investment depth ever pay?": the other two
  // profiles physically cannot buy a top tier, because a greedy buyer never
  // accumulates, which is what made tier 4 look like dead content.
  deep(g, next) {
    if (g.towers.length < 6 && next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost)
      return { place: true };
    const isSupport = (t) => t.def.income > 0 || t.def.slow > 0 || t.def.stun > 0;
    const carries = g.towers.filter((t) => t.def.damage > 0 && !isSupport(t));
    for (const c of carries) {
      if (c.tiers[0] >= MAX_TIER || !canBuy(c.tiers, 0)) continue;
      const cost = tierCost(c.type, 0, c.tiers[0]);
      // Hold rather than settle for something cheaper.
      return cost <= g.money ? { buy: { tower: c, path: 0, cost } } : null;
    }
    for (const t of carries) {
      const pick = options(t).sort((a, b) => a.cost - b.cost).find((o) => o.cost <= g.money);
      if (pick) return { buy: pick };
    }
    return null;
  },

  // Narrow and deep: cap the tower count, then pour everything into carries.
  focused(g, next) {
    if (g.towers.length < 7 && next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost)
      return { place: true };
    // Carries are the damage piñatas. Support towers deal token damage — gum 3,
    // maraca 7 — and treating them as carries starves the real ones. This has
    // now bitten twice (gum in R3, maraca in R12), so the test is on the
    // *mechanic* a tower owns, not on whether its damage happens to be zero.
    const isSupport = (t) => t.def.income > 0 || t.def.slow > 0 || t.def.stun > 0;
    const carries = g.towers.filter((t) => t.def.damage > 0 && !isSupport(t));
    for (const order of [0, 2, 1]) {
      for (const t of carries) {
        if (t.tiers[order] >= MAX_TIER || !canBuy(t.tiers, order)) continue;
        const cost = tierCost(t.type, order, t.tiers[order]);
        if (cost <= g.money) return { buy: { tower: t, path: order, cost } };
      }
    }
    const banks = g.towers.filter(isSupport);
    for (const t of banks) {
      const all = options(t).sort((a, b) => a.cost - b.cost);
      const pick = all.find((o) => o.cost <= g.money);
      if (pick) return { buy: pick };
    }
    if (next < PLAN.length && g.money >= TOWERS[PLAN[next]].cost) return { place: true };
    return null;
  },

  // Clustered and shallow: the whole build inside one trio's earshot, then the
  // cheapest upgrade anywhere. Same spending policy as `spread`, so the only
  // variable between them is how tightly the towers stand.
  band(g, next) {
    if (next < PLAN_BAND.length && g.money >= TOWERS[PLAN_BAND[next]].cost) return { place: true };
    const all = g.towers.flatMap(options).sort((a, b) => a.cost - b.cost);
    const pick = all.find((o) => o.cost <= g.money);
    return pick ? { buy: pick } : null;
  },
};

function play(seed, profile, difficulty = "plaza", mapId = "plaza", blind = false) {
  const g = sim.createGame(seed, difficulty, mapId, blind);
  // Spots come from the map itself, so a new board needs no hand-written list.
  // The profiles pick differently on purpose: a weak player spreads along the
  // route, a strong one builds where the most lane is coverable. `deep` shares
  // `focused`'s placement so the only difference between them is the *spending*
  // policy — giving it the weak spot list too confounded the two and made it look
  // like depth was fatal when its placement was.
  const plan = profile === "band" ? PLAN_BAND : PLAN;
  let SPOTS;
  if (profile === "spread") SPOTS = sim.suggestSpots(g, plan.length);
  else if (profile === "band") {
    // The best position on the board, then the nearest legal spots to it — a
    // knot rather than a line. Sorted by distance from the anchor so the trio,
    // placed second, has everything else inside its aura.
    const pool = sim.bestSpots(g, 24);
    const anchor = pool[0];
    SPOTS = pool
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(a[0] - anchor[0], a[1] - anchor[1]) - Math.hypot(b[0] - anchor[0], b[1] - anchor[1]),
      )
      .slice(0, plan.length);
  } else SPOTS = sim.bestSpots(g, plan.length);
  const used = new Set();

  /**
   * How good a spot is *for this piñata*, which is not the same question for all
   * of them:
   *
   * - anything that shoots or cuts: how much route it covers **at its own reach**.
   *   Spots are scored once at 118, so handing them out in order gave the 92-range
   *   papel picado 228 units of lane where its spot was picked for 516.
   * - an aura: how many piñatas are already standing in earshot. Lane coverage is
   *   irrelevant to a tower that never touches the lane, and scoring it that way
   *   is why the mariachi trio measured as a break-even purchase.
   * - pure income: any legal ground will do.
   */
  const spotScore = (def, s) => {
    if (def.auraRate > 0 || def.auraDamage > 0)
      return g.towers.filter((t) => Math.hypot(t.x - s[0], t.y - s[1]) <= def.auraRange).length;
    if (def.damage <= 0 && def.income > 0) return 0;
    return sim.laneCoverage(g, s[0], s[1], def.range || 118);
  };

  /**
   * The spot this piñata takes: the best of the next few unused ones, in the
   * profile's own order.
   *
   * A window rather than the whole list on purpose. Picking the global best every
   * time turns `spread` into `focused` — the profiles differ *by their spot
   * order*, so re-sorting it destroys the thing being measured.
   */
  const LOOKAHEAD = 3;
  const SWAP_GAIN = 1.25;
  const spotFor = (type) => {
    const def = TOWERS[type];
    const window = [];
    for (let i = 0; i < SPOTS.length && window.length < LOOKAHEAD; i++)
      if (!used.has(i)) window.push(i);
    if (!window.length) return null;
    // Default to the profile's own next spot. Taking the best of the window every
    // time turned `focused` into something else entirely: it is *defined* as the
    // seven highest-coverage positions, and letting each tower shop around pushed
    // it down the list and cost it 27 lives% on Plaza del Sol. A swap has to earn
    // itself — 25% better *for this piñata* — which in practice moves the papel
    // picado and the mariachi trio and leaves everything else where it was.
    let best = window[0];
    const baseline = spotScore(def, SPOTS[best]);
    for (const i of window.slice(1))
      if (spotScore(def, SPOTS[i]) > Math.max(baseline, 0.001) * SWAP_GAIN) {
        best = i;
        break;
      }
    used.add(best);
    return SPOTS[best];
  };
  let next = 0;
  const trace = [];

  // `--free N` carries the run N waves past the authored campaign, which nobody
  // had ever measured: freeplay multiplies enemy health by an extra 35% per wave
  // on top of the campaign ramp, and the question is whether that is a wall a
  // build hits immediately or a slope it climbs for a while.
  const freeWaves = Number((process.argv.find((a) => a.startsWith("--free=")) ?? "").split("=")[1] ?? 0);
  for (let wave = 0; wave < WAVES.length + freeWaves; wave++) {
    if (wave >= WAVES.length) sim.continueFreeplay(g);
    // Spend down before each wave until nothing affordable is left.
    for (let guard = 0; guard < 400; guard++) {
      const move = PROFILES[profile](g, next);
      if (!move) break;
      if (move.place) {
        const spot = spotFor(plan[next]);
        if (!spot || !sim.placeTower(g, PLAN[next], ...spot)) break;
        next += 1;
      } else if (!sim.upgradeTower(g, move.buy.tower, move.buy.path)) break;
    }

    const before = g.lives;
    sim.startWave(g);
    let guard = 0;
    while (g.phase === "wave" && guard < 90 / 0.016) {
      sim.update(g, 0.016);
      guard += 1;
    }
    trace.push({
      wave: wave + 1,
      lost: Math.round(before - g.lives),
      lives: Math.ceil(g.lives),
      towers: g.towers.length,
      tiers: g.towers.reduce((n, t) => n + t.tiers.reduce((a, b) => a + b, 0), 0),
    });
    if (g.phase === "over") return { wave: wave + 1, lives: 0, trace, towers: g.towers.length };
  }
  return {
    wave: WAVES.length + freeWaves,
    lives: Math.ceil(g.lives),
    towers: g.towers.length,
    money: Math.round(g.money),
    defeated: g.stats.defeated,
    leaked: g.stats.leaked,
    trace,
  };
}

const runs = Number(process.argv[2]?.match(/^\d+$/) ? process.argv[2] : 5);
const modes = process.argv.includes("--all") ? DIFFICULTY_ORDER : ["plaza"];
const boards = process.argv.includes("--maps") ? MAP_ORDER : ["plaza"];
console.log(
  `waves: ${WAVES.length}   runs: ${runs}` +
    (Object.keys(overrides).length ? `   overrides: ${JSON.stringify(overrides)}` : ""),
);

for (const board of boards) {
  const laneLen = sim.createGame(1, "plaza", board).path.total;
  console.log(
    `\n=== ${MAPS[board].name} — lane ${Math.round(laneLen)}px, ` +
      `speedMul ${MAPS[board].speedMul ?? 1} ===`,
  );
  for (const mode of modes) {
    if (modes.length > 1) console.log(` ${DIFFICULTIES[mode].name} (ramp ${DIFFICULTIES[mode].hpRamp})`);
    for (const profile of Object.keys(PROFILES)) {
      const results = [];
      for (let i = 0; i < runs; i++)
        results.push(play(i + 1, profile, mode, board, process.argv.includes("--blind")));
      const wins = results.filter((r) => r.lives > 0).length;
      const avg = results.reduce((s, r) => s + r.lives, 0) / runs;
      const died = results.filter((r) => r.lives === 0).map((r) => r.wave);
      const pct = (avg / DIFFICULTIES[mode].lives) * 100;
      // Average wave reached as well as lives: lives% saturates at 0, so two
      // builds that both lose look identical even when one dies three waves
      // earlier. That is exactly the gap the mariachi trio shows up in.
      const avgWave = results.reduce((s2, r) => s2 + r.wave, 0) / runs;
      console.log(
        `  ${profile.padEnd(8)} held ${wins}/${runs}   avg lives ${avg.toFixed(1)}` +
          ` (${pct.toFixed(0)}%)   avg wave ${avgWave.toFixed(1)}` +
          (died.length ? `   broke on wave ${[...new Set(died)].join(", ")}` : ""),
      );
      if (process.argv.includes("--trace"))
        for (const t of results[0].trace)
          console.log(
            `      wave ${String(t.wave).padStart(2)}  ${String(t.towers).padStart(2)} piñatas ` +
              `${String(t.tiers).padStart(2)} tiers  lost ${String(t.lost).padStart(2)}  lives ${t.lives}`,
          );
    }
  }
}
