// Throwaway: how close does a lane come to another part of itself?
import { MAPS, MAP_ORDER, LANE_CLEAR } from "../src/data.js";

const segDist = (a, b, c, d) => {
  // distance between segment ab and segment cd
  const seg = (p, q, r) => {
    const vx = q[0] - p[0], vy = q[1] - p[1];
    const wx = r[0] - p[0], wy = r[1] - p[1];
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(p[0] + vx * t - r[0], p[1] + vy * t - r[1]);
  };
  return Math.min(seg(a, b, c), seg(a, b, d), seg(c, d, a), seg(c, d, b));
};

for (const id of MAP_ORDER) {
  const p = MAPS[id].path;
  let worst = { d: 1e9, i: -1, j: -1 };
  for (let i = 0; i < p.length - 1; i++)
    for (let j = i + 2; j < p.length - 1; j++) {
      // adjacent segments share a corner; skip those and their neighbours
      if (j === i + 1) continue;
      const d = segDist(p[i], p[i + 1], p[j], p[j + 1]);
      if (d < worst.d) worst = { d, i, j };
    }
  console.log(
    `${MAPS[id].name.padEnd(14)} closest non-adjacent legs ${worst.d.toFixed(0).padStart(4)}px  ` +
      `(seg ${worst.i} vs ${worst.j})   road width ${LANE_CLEAR * 2}px`,
  );
}
