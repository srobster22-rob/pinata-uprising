/**
 * Every window shape, checked without a browser.
 *
 * The layout has three moving parts that all feed each other — the stage's
 * height comes from the board's scale, the board's scale comes from the shop's
 * reserve, and the shop's reserve comes from the stage's width — and a change to
 * any one of them has twice now broken a window shape nobody was looking at.
 * Driving a real browser catches those one shape at a time, at about a minute
 * each; this catches all of them in a second.
 *
 * It models what `fit()` does rather than importing it, because `fit()` needs a
 * DOM. The one thing that must stay true is the modelling: if `fit()` changes,
 * the constants at the top of this file change with it.
 *
 *   node test/shapes.mjs
 */
import { panelReserve, panelWidth, layout, MIN_SCALE } from "../src/render.js";
import { MAP } from "../src/data.js";

// Mirrors fit(): full width, height capped so the stage is never taller than
// this, and then trimmed to what the board actually needs.
const MAX_TALL = 1.45;
const STREET_ART = 18;

const SHAPES = [
  [389, 196], [420, 300], [480, 800], [520, 900], [560, 420],
  [640, 400], [700, 500], [800, 540], [900, 600], [900, 1400],
  [1024, 768], [1235, 1271], [1280, 720], [1366, 768], [1512, 784],
  [1600, 2000], [1920, 1080], [2514, 1269], [2560, 1080], [3440, 1440],
];

function stageFor(winW, winH) {
  const w = winW;
  const capped = Math.min(winH, w / MAX_TALL);
  const reserve = panelReserve(w);
  const probe = layout({ canvas: { width: w, height: Math.round(capped) } }, MAP, reserve);
  const want = Math.ceil((probe.mh + STREET_ART) * probe.s);
  const h = Math.max(160, Math.min(capped, want));
  return { w, h: Math.round(h), reserve };
}

let bad = 0;
const rows = [];
for (const [winW, winH] of SHAPES) {
  const st = stageFor(winW, winH);
  const L = layout({ canvas: { width: st.w, height: st.h } }, MAP, st.reserve);
  const right = (L.ox + L.mw) * L.s;
  const bottom = (L.oy + L.mh) * L.s;
  const problems = [];
  if (L.s < MIN_SCALE - 1e-9) problems.push(`scale ${L.s.toFixed(2)} under floor`);
  if (L.ox < 0 || L.oy < 0) problems.push("plaza starts off the stage");
  if (right > st.w + 1) problems.push(`${Math.round(right - st.w)}px off the right`);
  if (bottom > st.h + 1) problems.push(`${Math.round(bottom - st.h)}px off the bottom`);
  if (st.h > winH + 1) problems.push("stage taller than the window");
  if (st.w > winW + 1) problems.push("stage wider than the window");
  // The plaza must clear the shop, which is what the reserve is for.
  if (right > st.w - panelWidth(st.w) + 1) problems.push("plaza runs under the shop");
  // And the board should actually USE the stage it asked for, or the stage
  // height calculation has drifted from what the board needs.
  const fillH = (L.mh * L.s) / st.h;
  if (fillH < 0.7) problems.push(`board fills only ${(fillH * 100) | 0}% of the stage height`);
  if (problems.length) bad += 1;
  rows.push({
    win: `${winW}x${winH}`,
    stage: `${st.w}x${st.h}`,
    board: `${Math.round(L.mw * L.s)}x${Math.round(L.mh * L.s)}`,
    scale: L.s.toFixed(2),
    fill: `${(fillH * 100) | 0}%`,
    note: problems.join("; "),
  });
}

const pad = (v, n) => String(v).padEnd(n);
console.log(pad("window", 12), pad("stage", 12), pad("board", 12), pad("scale", 7), pad("fillH", 6), "problems");
for (const r of rows)
  console.log(pad(r.win, 12), pad(r.stage, 12), pad(r.board, 12), pad(r.scale, 7), pad(r.fill, 6), r.note);
console.log(`\n${rows.length} shapes, ${bad} with problems`);
process.exit(bad ? 1 : 0);
