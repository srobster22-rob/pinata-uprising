import test from "node:test";
import assert from "node:assert/strict";
import { panelWidth, panelReserve, boardScale, layout } from "../src/render.js";
import { MAP, MAPS, MAP_ORDER } from "../src/data.js";
import { PX } from "../src/art.js";

// The playfield in art pixels. Every map is the same 960x600, so one pair serves.
const MW = Math.ceil(MAP.w / PX);
const MH = Math.ceil(MAP.h / PX);

// The canvas is always the whole window now.
const screenOf = (w, h) => ({ canvas: { width: w, height: h } });
const SHAPES = [
  [1920, 1080],
  [1600, 900],
  [1366, 768],
  [1280, 720],
  [893, 1307],
  [1350, 1307],
  [1024, 1280],
  [785, 1260],
];

// ------------------------------------------------------------ the shop panel

test("the shop is a fixed fraction of the window, floored and capped", () => {
  assert.equal(panelWidth(800), 136, "a small window still gets a usable strip");
  assert.equal(panelWidth(1200), Math.round(1200 * 0.17));
  assert.equal(panelWidth(3000), 250, "it stops being a strip past the cap");
  for (const [w] of SHAPES) assert.ok(panelWidth(w) / w <= 0.18, `${w}: shop eats too much width`);
});

// ------------------------------------------------------ the map under it

test("the plaza never sits under the shop panel", () => {
  for (const [w, h] of SHAPES) {
    const L = layout(screenOf(w, h), MAP, panelReserve(w));
    const plazaRightPx = (L.ox + MW) * L.s;
    assert.ok(
      plazaRightPx <= w - panelWidth(w),
      `${w}x${h}: plaza ends at ${Math.round(plazaRightPx)}px, panel starts at ${w - panelWidth(w)}px`,
    );
  }
});

test("the canvas is the whole window, so terrain reaches every edge", () => {
  for (const [w, h] of SHAPES) {
    const L = layout(screenOf(w, h), MAP, panelReserve(w));
    assert.ok(L.bufW * L.s >= w - 1, `${w}x${h}: buffer narrower than the window`);
    assert.ok(L.bufH * L.s >= h - 1, `${w}x${h}: buffer shorter than the window`);
  }
});

// Every map's path starts at x = -40, off the board, so enemies walk in from
// outside. That stub is where a wave is first visible and it has to clear the
// shop too — measured, it was under the panel on all three boards.
// The shop is on the right now, so the stub's problem is the window's own edge:
// every map's path starts at x = -40, off the board, and that is where a wave is
// first visible.
test("the lane's entry stub stays on screen", () => {
  for (const [w, h] of SHAPES) {
    const L = layout(screenOf(w, h), MAP, panelReserve(w));
    const entryPx = (L.ox + MAP.path[0][0] / PX) * L.s;
    assert.ok(entryPx >= 0, `${w}x${h}: lane enters at ${Math.round(entryPx)}px, off the near edge`);
  }
});

// An overlay costs nothing wherever the window's own surplus can absorb it, which
// is the whole reason the shop stopped being a column.
const scaleOf = (w, h) => layout(screenOf(w, h), MAP, panelReserve(w)).s;

test("the shop is free where the window's own surplus can absorb it", () => {
  // 2514x1269 (a real window this was played in): huge surplus, panel costs
  // nothing even with the lane's entry stub reserved as well.
  assert.equal(scaleOf(2514, 1269), boardScale(2514, 1269, MW, MH));
});

test("everywhere else the shop costs board, and the cost stays small", () => {
  const cost = (w, h) => 1 - scaleOf(w, h) / boardScale(w, h, MW, MH);
  // Smaller 16:9 windows have less surplus than the panel needs.
  for (const [w, h] of [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
    [1280, 720],
  ]) {
    assert.ok(cost(w, h) > 0, `${w}x${h}: expected the panel to bind here`);
    assert.ok(cost(w, h) < 0.14, `${w}x${h}: panel cost ${(cost(w, h) * 100).toFixed(0)}% of the scale`);
  }
  // A tall window has no horizontal surplus at all, so it pays the most — this is
  // the shape a bottom bar used to serve for free, and the trade is deliberate.
  assert.ok(cost(785, 1260) < 0.25, `785x1260: panel cost ${(cost(785, 1260) * 100).toFixed(0)}%`);
});

test("a piñata's screen position round-trips through the offset layout", () => {
  const w = 1280;
  const h = 720;
  const L = layout(screenOf(w, h), MAP, panelReserve(w));
  for (const [x, y] of [
    [0, 0],
    [480, 300],
    [MAP.w, MAP.h],
  ]) {
    const sx = (x / PX + L.ox) * L.s;
    const sy = (y / PX + L.oy) * L.s;
    const back = { x: ((sx / L.s) - L.ox) * PX, y: ((sy / L.s) - L.oy) * PX };
    assert.ok(Math.abs(back.x - x) < 1, `x ${x} -> ${back.x}`);
    assert.ok(Math.abs(back.y - y) < 1, `y ${y} -> ${back.y}`);
  }
});

// Each board dresses itself from its own bag, so the names it lists have to
// resolve — a typo would silently hand the scatter loop `undefined` and the
// board would draw bare rather than throw somewhere you would notice.
test("every map's prop bag names real clusters, one of them low", () => {
  const KNOWN = ["cargo", "pots", "stalls", "fountain", "garden", "grove", "graves", "shrine"];
  const LOW = ["cargo", "pots", "graves", "shrine"];
  for (const id of MAP_ORDER) {
    const props = MAPS[id].props;
    assert.ok(Array.isArray(props) && props.length >= 3, `${id} needs a prop bag`);
    for (const n of props) assert.ok(KNOWN.includes(n), `${id}: unknown cluster ${n}`);
    assert.ok(props.some((n) => LOW.includes(n)), `${id}: thin street bands need a low cluster`);
  }
});

// Cementerio is the only board that gets the headstones, and El Mercado the only
// one that does not get greenery — the point of the bags is that they differ.
test("the four boards do not share one dressing", () => {
  const bags = MAP_ORDER.map((id) => new Set(MAPS[id].props));
  assert.ok(bags[MAP_ORDER.indexOf("cementerio")].has("graves"));
  for (const id of MAP_ORDER)
    if (id !== "cementerio") assert.ok(!MAPS[id].props.includes("graves"), `${id} is not a graveyard`);
  const sigs = new Set(MAP_ORDER.map((id) => [...new Set(MAPS[id].props)].sort().join(",")));
  assert.equal(sigs.size, MAP_ORDER.length, "two boards dress identically");
});

// The bug this pins: `fit()` floored the canvas at 640x400 and `boardScale`
// refused to go under 1:1, so on a small viewport the board was drawn OUTSIDE
// the window and the page's hidden overflow cropped it. Nothing threw, nothing
// logged — the board simply had no right-hand edge. These sizes are the ones
// that broke it, plus the ordinary ones that must not regress.
const SIZES = [
  [389, 196], [420, 300], [500, 360], [560, 420], [640, 400],
  [700, 500], [800, 540], [900, 600], [1024, 768], [1280, 720],
  [1512, 784], [1920, 1080], [2514, 1269], [520, 900], [400, 1000],
];

test("the whole board lands inside the window, at every size", () => {
  for (const [w, h] of SIZES) {
    const screen = { canvas: { width: w, height: h } };
    const reserve = panelReserve(w) + 58;
    const L = layout(screen, MAP, reserve);
    const right = (L.ox + L.mw) * L.s;
    const bottom = (L.oy + L.mh) * L.s;
    assert.ok(L.s >= 0.4 - 1e-9, `${w}x${h}: scale ${L.s} is below the floor`);
    assert.ok(L.ox >= 0, `${w}x${h}: the plaza starts off the left edge`);
    assert.ok(L.oy >= 0, `${w}x${h}: the plaza starts off the top edge`);
    assert.ok(bottom <= h + 1, `${w}x${h}: the plaza runs ${Math.round(bottom - h)}px off the bottom`);
    assert.ok(right <= w + 1, `${w}x${h}: the plaza runs ${Math.round(right - w)}px off the right`);
  }
});

// The panel is a constraint on scale, not a subtraction — but on a small window
// it has to actually leave room, or the board is squeezed to nothing.
test("the shop never takes more of the window than the board", () => {
  for (const [w] of SIZES) {
    const panel = panelWidth(w);
    assert.ok(panel <= w * 0.3 + 1, `${w}px wide: the shop takes ${Math.round((panel / w) * 100)}% of it`);
    assert.ok(panel >= 60, `${w}px wide: a ${panel}px shop cannot show a card`);
  }
});

// The stage is landscape by construction: full width, height capped so it can
// never be taller than this. Sizes now come from the stage, not the window, so
// the fit test above is only meaningful if the stage itself is the right shape.
const STAGE_MAX_TALL = 1.45;
const stageOf = (w, h) => {
  const sw = w;
  const sh = Math.min(h, w / STAGE_MAX_TALL);
  return [sw, sh];
};

test("the stage is never taller than landscape, and never narrower than the window", () => {
  for (const [w, h] of SIZES) {
    const [sw, sh] = stageOf(w, h);
    assert.equal(sw, w, `${w}x${h}: the stage gave up width`);
    assert.ok(sh <= h + 1e-9, `${w}x${h}: the stage is taller than the window`);
    assert.ok(sw / sh >= STAGE_MAX_TALL - 1e-9, `${w}x${h}: stage aspect ${(sw / sh).toFixed(2)} is portrait`);
  }
});

// A landscape window must lose nothing to letterboxing — that was the bug in the
// first version, which capped at 16:10 and threw away 484px on a 2514x1269.
test("a landscape window is not letterboxed at all", () => {
  for (const [w, h] of SIZES) {
    if (w / h < STAGE_MAX_TALL) continue;
    const [, sh] = stageOf(w, h);
    assert.equal(sh, h, `${w}x${h}: a landscape window lost ${Math.round(h - sh)}px of height`);
  }
});

// And the board still has to fit inside the STAGE, which is what layout is now
// handed. Re-runs the same envelope check against stage dimensions.
test("the board fits inside the stage at every window size", () => {
  for (const [w, h] of SIZES) {
    const [sw, sh] = stageOf(w, h);
    const screen = { canvas: { width: Math.round(sw), height: Math.round(sh) } };
    const reserve = panelReserve(sw) + 58;
    const L = layout(screen, MAP, reserve);
    assert.ok(L.ox >= 0 && L.oy >= 0, `${w}x${h}: plaza starts off the stage`);
    assert.ok((L.ox + L.mw) * L.s <= sw + 1, `${w}x${h}: plaza runs off the stage's right`);
    assert.ok((L.oy + L.mh) * L.s <= sh + 1, `${w}x${h}: plaza runs off the stage's bottom`);
  }
});
