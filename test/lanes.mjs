// How close does a lane come to another part of itself?
//
// Two legs closer than the road is wide draw as one merged road, and legs closer
// than LANE_CLEAR*2 leave a strip of ground too thin to build on — it looks like
// space and refuses every click.
//
//   node test/lanes.mjs
import { MAPS, MAP_ORDER } from "../src/data.js";
import { LANE_CLEAR } from "../src/sim.js";

const segSeg = (a, b, c, d) => {
  const pointSeg = (p, q, r) => {
    const vx = q[0] - p[0];
    const vy = q[1] - p[1];
    const t = Math.max(0, Math.min(1, ((r[0] - p[0]) * vx + (r[1] - p[1]) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(p[0] + vx * t - r[0], p[1] + vy * t - r[1]);
  };
  return Math.min(pointSeg(a, b, c), pointSeg(a, b, d), pointSeg(c, d, a), pointSeg(c, d, b));
};

const ROAD = LANE_CLEAR * 2;
for (const id of MAP_ORDER) {
  const p = MAPS[id].path;
  const tight = [];
  let worst = 1e9;
  for (let i = 0; i < p.length - 1; i++)
    for (let j = i + 2; j < p.length - 1; j++) {
      const d = segSeg(p[i], p[i + 1], p[j], p[j + 1]);
      if (d < worst) worst = d;
      if (d < ROAD) tight.push(`${i}-${j} @ ${Math.round(d)}px`);
    }
  const flag = worst < ROAD ? "  << legs merge" : worst < ROAD * 1.4 ? "  << thin strip" : "";
  console.log(
    `${MAPS[id].name.padEnd(14)} closest legs ${Math.round(worst).toString().padStart(4)}px ` +
      `(road ${ROAD}px)${flag}` + (tight.length ? `   tight: ${tight.slice(0, 4).join(", ")}` : ""),
  );
}
