// Board shape, in one command.
//
// `ratio` is how much more lane the seven best positions cover than seven spread
// along the route — R17 nominated it as the number that says whether a board
// rewards a narrow build. Measured across all three boards it does not: El
// Mercado has the LOWEST ratio and the LARGEST narrow-build advantage. What the
// advantage does track is `speedMul` — dropping El Mercado from 1.22 to 1.0
// halved the focused-minus-spread gap at Plaza difficulty, +30 to +15 lives%.
// A fast lane rewards concentration, because a thinly spread piñata gets fewer
// seconds on each enemy while a knot puts several on the same enemy at once.
//
//   node test/boards.mjs
import * as sim from "../src/sim.js";
import { MAPS, MAP_ORDER } from "../src/data.js";

const N = 7;
const sum = (g, spots, range) =>
  spots.slice(0, N).reduce((a, s) => a + sim.laneCoverage(g, s[0], s[1], range), 0);

// focused - spread, lives%, at Plaza difficulty, from the grid in README.md.
// Recorded here so the shape numbers can be read against the outcome they are
// meant to explain.
const GAP = { plaza: -5, mercado: 30, caracol: 27, cementerio: 19 };

for (const id of MAP_ORDER) {
  const g = sim.createGame(1, "plaza", id);
  const best = sum(g, sim.bestSpots(g, N * 2), 118);
  const wide = sum(g, sim.suggestSpots(g, N * 2), 118);
  console.log(
    `${MAPS[id].name.padEnd(14)} lane ${Math.round(g.path.total).toString().padStart(4)}px  ` +
      `speedMul ${(MAPS[id].speedMul ?? 1).toFixed(2)}  ` +
      `best7 ${Math.round(best).toString().padStart(5)}  spread7 ${Math.round(wide).toString().padStart(5)}  ` +
      `ratio ${(best / wide).toFixed(2)}x  ` +
      `narrow-build gap ${GAP[id] > 0 ? "+" : ""}${GAP[id]}`,
  );
}
