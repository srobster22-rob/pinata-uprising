import { PATHS } from "./upgrades.js";

// Pixel-art pipeline.
//
// ---------------------------------------------------------------------------
// Everything is authored on a low-resolution grid and blitted at integer
// positions into a buffer that gets scaled up with smoothing off. That is not a
// style choice you can apply to half a scene: if the lane is a smooth vector
// ribbon and the sprites are pixels, the pixels read as a mistake. So the ground,
// the lane, the projectiles, the particles and the sprites all live on the same
// grid, and `render.js` owns the buffer.
//
// PX screen pixels per art pixel. A 960x600 board is a 240x150 art grid, so a
// tower is about 16x20 art pixels — classic sprite scale, and tight enough that
// silhouette does all the work.
//
// Sprites are *generated* rather than hand-typed as string maps. A shaded pixel
// sphere is a distance function against a light vector, which is both shorter to
// write and impossible to get subtly wrong by miscounting a row. Outlines are
// derived: any empty cell touching a filled one becomes edge. That gives every
// object a clean silhouette for free, which is the one rule that survived from
// the vector version.
// ---------------------------------------------------------------------------

// PX screen pixels per art pixel — and therefore the scale of every actor
// relative to the board, since sprites are authored in art pixels and the map is
// measured in sim pixels. At 4 a luchador was ~10 art px wide, which is 40 sim px
// against wave spacing of 37-65 sim px: every group overlapped into one mass, and
// towers merged with the enemies passing them. At 3 the board is a 320x200 grid,
// so the same sprites are 25% smaller relative to it and the gaps open up. No
// sprite is redrawn and no balance number moves — spacing and speeds are in sim
// pixels, which this does not touch.
export const PX = 3;
export const INK = "#1d2b3a";

// Light comes from the upper left, as a unit-ish offset in radii.
const LX = -0.42;
const LY = -0.46;

// ------------------------------------------------------------- pixel canvas

/** A mutable grid of colour strings (null = transparent). */
function grid(w, h) {
  return { w, h, d: new Array(w * h).fill(null) };
}
const put = (G, x, y, c) => {
  x |= 0;
  y |= 0;
  if (c && x >= 0 && y >= 0 && x < G.w && y < G.h) G.d[y * G.w + x] = c;
};
const at = (G, x, y) => (x < 0 || y < 0 || x >= G.w || y >= G.h ? null : G.d[y * G.w + x]);

/**
 * A shaded disc. `ramp` runs lightest-first; the cell's index is picked from how
 * far it sits from the light, so the terminator lands where the light says.
 */
function disc(G, cx, cy, r, ramp, squashY = 1) {
  for (let y = Math.floor(cy - r * squashY) - 1; y <= Math.ceil(cy + r * squashY) + 1; y++)
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      const dx = x + 0.5 - cx;
      const dy = (y + 0.5 - cy) / squashY;
      if (dx * dx + dy * dy > r * r) continue;
      const lx = dx - LX * r;
      const ly = dy - LY * r;
      const t = Math.sqrt(lx * lx + ly * ly) / (r * 1.85);
      put(G, x, y, ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]);
    }
}

/** Axis-aligned block with a vertical light ramp. */
function block(G, x0, y0, w, h, ramp) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = (x / Math.max(1, w - 1)) * 0.45 + (y / Math.max(1, h - 1)) * 0.55;
      put(G, x0 + x, y0 + y, ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]);
    }
}

/** A trapezoid plinth, wide at the bottom. */
function plinth(G, cx, y0, wTop, wBot, h, ramp) {
  for (let y = 0; y < h; y++) {
    const w = Math.round(wTop + ((wBot - wTop) * y) / (h - 1));
    for (let x = 0; x < w; x++) {
      const t = (x / Math.max(1, w - 1)) * 0.5 + (y / Math.max(1, h - 1)) * 0.5;
      put(G, cx - (w >> 1) + x, y0 + y, ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]);
    }
  }
}

const hline = (G, x0, x1, y, c) => {
  for (let x = x0; x <= x1; x++) put(G, x, y, c);
};

/** Zig-zag crepe band — the piñata signature, at pixel scale. */
function zig(G, x0, x1, y, c, amp = 1) {
  for (let x = x0, i = 0; x <= x1; x++, i++) put(G, x, y + (i % (amp * 2) < amp ? 0 : 1), c);
}

/** Only paint where something is already painted. Used for bands and trim. */
const over = (G, x, y, c) => {
  if (at(G, x, y)) put(G, x, y, c);
};
function zigOver(G, x0, x1, y, c, amp = 1) {
  for (let x = x0, i = 0; x <= x1; x++, i++) over(G, x, y + (i % (amp * 2) < amp ? 0 : 1), c);
}

/** Derive an outline: any empty cell orthogonally touching a filled one. */
function outline(G, c) {
  const add = [];
  for (let y = 0; y < G.h; y++)
    for (let x = 0; x < G.w; x++) {
      if (at(G, x, y)) continue;
      if (at(G, x - 1, y) || at(G, x + 1, y) || at(G, x, y - 1) || at(G, x, y + 1)) add.push([x, y]);
    }
  for (const [x, y] of add) put(G, x, y, c);
}

function toCanvas(G) {
  const c = document.createElement("canvas");
  c.width = G.w;
  c.height = G.h;
  const g = c.getContext("2d");
  for (let y = 0; y < G.h; y++)
    for (let x = 0; x < G.w; x++) {
      const col = G.d[y * G.w + x];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  return c;
}

// ------------------------------------------------------------------ palettes

// Each ramp is lightest to darkest. Four steps is the sweet spot at this size:
// three reads as posterised, five is indistinguishable.
const P = {
  candy: ["#ffe0ea", "#ff9ebc", "#e05a86", "#8f2d4e"],
  ribbon: ["#ffe6f9", "#ff8fd8", "#c94fa0", "#6f2359"],
  papel: ["#eafbe0", "#7ec850", "#3f8f3a", "#1d4a22"],
  mariachi: ["#e2ddff", "#9b8ef0", "#5b47b8", "#2b1c63"],
  coin: ["#e2ffc4", "#a8e86a", "#5fae35", "#2c6b1c"],
  gum: ["#e8d0ff", "#b98ae0", "#7d4faa", "#452566"],
  bubble: ["#ffeaf8", "#ffbde6", "#e084bd", "#a3568c"],
  chili: ["#ff9d8f", "#ee5a4e", "#b32d2c", "#6e1618"],
  gold: ["#fff3bd", "#ffd45e", "#d99a1c", "#8a5c0c"],
  teal: ["#c8fbfd", "#63dbe0", "#2a9ba3", "#125c63"],
  wood: ["#e0b884", "#b8834c", "#7d5228", "#472c13"],
  leaf: ["#c8f09a", "#7cc44e", "#4a8a2c", "#26501a"],
  pink: ["#ffd3e0", "#f2789b", "#b84468", "#6e2038"],
  red: ["#ff9d8f", "#e8524f", "#a32c2e", "#5e1416"],
  blue: ["#a8c8f7", "#5b8de8", "#2f56a3", "#182f5e"],
  purple: ["#bda8d8", "#7d68a0", "#4a3866", "#251a38"],
  silver: ["#ffffff", "#d4dee8", "#93a4b8", "#4e5c6e"],
  green: ["#c0eec8", "#6cc47a", "#3a8248", "#1c4526"],
  hide: ["#c78463", "#95563d", "#5e3122", "#331810"],
  bone: ["#fffdf4", "#ded1b4", "#a89370", "#6b5a3c"],
  orange: ["#ffcb8a", "#f28b3c", "#b85a18", "#6e3208"],
  orangeHurt: ["#e8a86e", "#cf7228", "#94430e", "#552305"],
  orangeBad: ["#c98a5e", "#a8541c", "#71300a", "#3d1a04"],
  boot: ["#5c6b80", "#3a4756", "#242e3a", "#141a22"],
};
const edgeOf = (ramp) => ramp[3];

// ------------------------------------------------------------------ sprites
//
// Every builder returns { canvas, ax, ay } in ART pixels. `ax/ay` is the anchor,
// which is the point that lands on the sim coordinate — feet for anything that
// stands on the ground.


// ------------------------------------------------ the piñata construction kit
//
// The roster used to be shaded balls in ten palettes with two zig-zag rows on
// each, and it looked like a bag of marbles. What makes a shape read as a
// *piñata* is not colour, it is three things you can draw at this size: crepe
// FRINGE in stacked bands, a hanging CORD at the crown, and a silhouette that
// is not a circle. These helpers exist so every piñata gets all three.

/** The string it hangs from, plus the knot. Two pixels that say "piñata". */
function cord(G, cx, topY, col = P.hide[2]) {
  put(G, cx, topY, col);
  put(G, cx, topY - 1, col);
  put(G, cx - 1, topY + 1, col);
  put(G, cx + 1, topY + 1, col);
}

/**
 * A crepe fringe band: a solid row with cut tips hanging under it.
 *
 * `over` restricts it to pixels that already exist, which is what you want for a
 * band wrapped round a body; free-standing is what you want for a skirt hanging
 * off the bottom edge.
 */
function fringe(G, x0, x1, y, ramp, { onto = true, depth = 2 } = {}) {
  for (let x = x0; x <= x1; x++) {
    const paint = onto ? over : put;
    paint(G, x, y, ramp[1]);
    const cut = (x - x0) % 3;
    if (cut !== 1) paint(G, x, y + 1, ramp[2]);
    if (depth > 2 && cut === 0) paint(G, x, y + 2, ramp[3]);
  }
}

/** A skirt of crepe hanging off the bottom of a body. */
function ruffle(G, cx, y, halfW, ramp) {
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    const t = Math.abs(x - cx) / Math.max(1, halfW);
    const drop = 2 + Math.round((1 - t * t) * 2);
    for (let d = 0; d < drop; d++) put(G, x, y + d, ramp[d === drop - 1 ? 3 : 1 + (d % 2)]);
  }
}

/**
 * One point of a star piñata: a cone off the body, tapering to a fringed tip.
 * Angles are in radians, screen convention (y down).
 */
function cone(G, cx, cy, ang, len, halfW, ramp, tip = null) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  for (let t = 0; t <= len; t++) {
    const w = halfW * (1 - t / (len + 1));
    const px = cx + dx * t;
    const py = cy + dy * t;
    for (let o = -Math.ceil(w); o <= Math.ceil(w); o++) {
      if (Math.abs(o) > w) continue;
      // Offset perpendicular to the cone's axis.
      put(G, Math.round(px - dy * o), Math.round(py + dx * o), ramp[Math.min(3, 1 + ((t + o) % 2))]);
    }
  }
  if (tip) {
    put(G, Math.round(cx + dx * (len + 1)), Math.round(cy + dy * (len + 1)), tip);
    put(G, Math.round(cx + dx * (len + 2)), Math.round(cy + dy * (len + 2)), tip);
  }
}

/**
 * The classic seven-point star piñata, at a size where seven points would be
 * mush: five that read plus the body, which is what the eye takes from the real
 * thing anyway.
 */
function starBody(G, cx, cy, r, ramp, alt) {
  const ANG = [-Math.PI / 2, -Math.PI * 0.86, -Math.PI * 0.14, Math.PI * 0.78, Math.PI * 0.22];
  // Fat cones, not spikes. At 2.2 half-width they came out as spindly antennae;
  // a real star piñata's points are as thick at the base as the body is deep.
  ANG.forEach((a, i) => cone(G, cx, cy, a, r + 4, 3.4, i % 2 ? alt : ramp, (i % 2 ? ramp : alt)[0]));
  disc(G, cx, cy, r, ramp);
  fringe(G, cx - r, cx + r, cy - 2, alt);
  fringe(G, cx - r, cx + r, cy + 3, alt);
}

/** A ball piñata: shaded sphere, two crepe bands, spout hole, on nothing. */
function ballPinata(ramp) {
  const G = grid(20, 20);
  disc(G, 9.5, 9, 8, ramp);
  zigOver(G, 2, 17, 6, ramp[0]);
  zigOver(G, 2, 17, 11, ramp[3]);
  // specular
  put(G, 6, 4, "#ffffff");
  put(G, 7, 4, "#ffffff");
  put(G, 6, 5, ramp[0]);
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 9.5, ay: 18 };
}

/**
 * The coin piñata: a stack of coins, not a ball in a different palette.
 *
 * It was `ballPinata(P.coin)`, which meant that with colour removed it and the
 * candy piñata were the same sprite — and the coin is the one support tower a
 * player has to find in a hurry. Colour was doing all the work. Three squashed
 * discs with a dark seam under each read as a stack at 20 art pixels, and the
 * coin standing on edge on top is the tell that still survives at 1x.
 */
function coinPinata(ramp) {
  const G = grid(20, 20);
  for (const [cy, r] of [
    [15, 7.6],
    [11.2, 7],
    [7.6, 6.2],
  ]) {
    disc(G, 9.5, cy, r, ramp, 0.42);
    // The seam. Without it the three discs melt into one lumpy column, which is
    // the ball silhouette all over again.
    hline(G, Math.round(9.5 - r) + 2, Math.round(9.5 + r) - 2, Math.round(cy + r * 0.42), ramp[3]);
  }
  disc(G, 12.5, 3.4, 2.9, ramp, 1);
  put(G, 11, 2, ramp[0]);
  put(G, 5, 13, "#ffffff");
  put(G, 6, 13, "#ffffff");
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 9.5, ay: 18 };
}

/**
 * The ribbon dancer: a spinning-top body with two streamers curling off it.
 *
 * The roster already owns sphere (candy), stack (coin), twin blob (gum), pod
 * (chili), cylinder (firecracker), ball-on-a-stick (maraca) and stick-and-star
 * (sparkler). What was left unclaimed was a *curve leaving the body*, so the
 * streamers are the silhouette and the body is deliberately plain.
 */
function ribbonPinata(ramp) {
  const G = grid(22, 22);
  // Body: a top, wide at the shoulder and tapering to the point it spins on.
  for (let y = 6; y <= 17; y++) {
    const t = (y - 6) / 11;
    const w = Math.round(8 - t * 6);
    for (let x = 0; x < w; x++) put(G, 8 - (w >> 1) + x, y, ramp[Math.min(3, 1 + ((x + (y % 2)) % 2))]);
  }
  disc(G, 8, 6, 4, ramp, 0.8);
  zigOver(G, 4, 12, 8, ramp[0]);
  // Two streamers, one curling up and out, one trailing low. Drawn as arcs so the
  // outline leaves the body and comes back — the thing nothing else on the board
  // does.
  const streamer = (x0, y0, dx, dy, n, col) => {
    let x = x0;
    let y = y0;
    for (let i = 0; i < n; i++) {
      put(G, Math.round(x), Math.round(y), col);
      x += dx;
      y += dy + Math.sin(i / 1.6) * 0.55;
    }
  };
  streamer(11, 5, 0.95, -0.15, 9, P.gold[1]);
  streamer(11, 9, 1, 0.5, 8, ramp[1]);
  put(G, 6, 8, "#ffffff");
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 8, ay: 19 };
}

/**
 * Papel picado: a piñata made of stacked cut-paper sheets, fringed along the
 * bottom the way the real banners are.
 *
 * The silhouette nothing else in the roster owns is a *flat wide slab with a
 * ragged lower edge* — every other piñata is round, tapered or on a stick. The
 * fringe is cut from the block rather than drawn onto it, so it survives at 1x.
 */
function papelPinata(ramp) {
  const G = grid(22, 20);
  // Three sheets, each narrower than the one above and set a row lower, so every
  // cut edge is visible. The first version stacked them flush and each fringe was
  // painted over by the sheet below it: the whole tell existed in the code and
  // none of it reached the screen.
  const sheets = [
    [2, 4, 18, 4],
    [4, 9, 14, 4],
    [6, 14, 10, 3],
  ];
  sheets.forEach(([x0, y0, w, h], i) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        // Cut-out pattern punched through the paper, not painted on it.
        const hole = (x - x0 + (y - y0) * 2) % 5 === 0 && y > y0;
        put(G, x, y, hole ? ramp[3] : ramp[i % 2 ? 2 : 1]);
      }
    // The fringe: every third column of the bottom row is cut away.
    for (let x = x0; x < x0 + w; x++) if (x % 3 !== 1) put(G, x, y0 + h, ramp[i % 2 ? 3 : 2]);
  });
  hline(G, 0, 21, 3, P.wood[2]);
  put(G, 5, 5, "#ffffff");
  put(G, 6, 5, "#ffffff");
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 11, ay: 18 };
}

/**
 * The mariachi trio: one piñata with three players in it, read as three brimmed
 * hats along the top.
 *
 * Support towers have to be findable in a hurry, and the roster's unclaimed
 * silhouette was a *repeated element* — three of anything. The brims are what do
 * it: a flat wide line broken into three, which no other piñata has anywhere.
 */
function mariachiPinata(ramp) {
  const G = grid(22, 20);
  // The body: a squat barrel, so the hats have something to sit on.
  for (let y = 9; y <= 17; y++) {
    const t = (y - 9) / 8;
    const w = Math.round(15 - Math.abs(t - 0.35) * 6);
    for (let x = 0; x < w; x++) put(G, 11 - (w >> 1) + x, y, ramp[Math.min(3, 1 + ((x + y) % 2))]);
  }
  zigOver(G, 4, 18, 12, ramp[0]);
  // Three hats: a dome each on a brim, with a clear gap between them. The first
  // version used 7-wide brims at x 5/11/17, which touch — three hats merged into
  // one continuous rim and the whole thing read as a basket.
  for (const cx of [4, 11, 18]) {
    disc(G, cx, 6, 2, ramp, 0.9);
    hline(G, cx - 2, cx + 2, 8, P.gold[2]);
    hline(G, cx - 1, cx + 1, 7, ramp[2]);
    put(G, cx, 4, P.gold[1]);
  }
  put(G, 7, 11, "#ffffff");
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 11, ay: 18 };
}


/**
 * A piñata with nothing bought yet.
 *
 * Deliberately the SAME code path as an upgraded one — an earlier version built
 * the base sprite separately and it came out on a different anchor, so the shop
 * card and the board disagreed about where the piñata's feet were.
 */
function baseTower(type) {
  return towerSprite(type, [0, 0, 0]);
}

const BUILD = {
  stand() {
    const G = grid(16, 8);
    plinth(G, 8, 2, 5, 10, 5, P.wood);
    hline(G, 4, 11, 4, P.wood[2]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 8, ay: 7 };
  },

  // ------------------------------------------------------------ street props
  //
  // Scattered on the paving outside the plaza. Flat, tiled paving reads as filler;
  // BTD6's off-track terrain is always dressed. These are deliberately plainer
  // and darker than anything in play — set dressing must never be mistaken for a
  // piñata you can click.

  crate() {
    const G = grid(11, 10);
    block(G, 1, 2, 9, 7, P.wood);
    hline(G, 1, 9, 5, P.wood[2]);
    for (let i = 0; i < 7; i++) put(G, 1 + i + 1, 2 + i, P.wood[2]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 5, ay: 9 };
  },

  // Cementerio's own furniture. Every board drew from one prop bag, so a
  // graveyard at night was dressed with the same market crates as El Mercado.
  grave() {
    const G = grid(11, 13);
    block(G, 2, 4, 7, 8, P.bone);
    disc(G, 5.5, 4.5, 3.5, P.bone, 0.8);
    hline(G, 3, 7, 7, P.hide[2]);
    hline(G, 4, 6, 9, P.hide[2]);
    put(G, 5, 3, P.bone[0]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 5, ay: 12 };
  },

  cross() {
    const G = grid(11, 14);
    block(G, 4, 2, 3, 11, P.wood);
    block(G, 1, 5, 9, 3, P.wood);
    put(G, 5, 3, P.wood[0]);
    put(G, 2, 6, P.wood[0]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 5, ay: 13 };
  },

  pot() {
    const G = grid(11, 11);
    disc(G, 5, 6.5, 4.2, P.hide, 0.92);
    hline(G, 1, 8, 2, P.hide[1]);
    hline(G, 1, 8, 3, P.hide[2]);
    put(G, 2, 2, P.hide[0]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 5, ay: 10 };
  },

  barrel() {
    const G = grid(10, 13);
    block(G, 2, 2, 6, 10, P.wood);
    put(G, 1, 4, P.wood[1]);
    put(G, 8, 4, P.wood[1]);
    put(G, 1, 9, P.wood[1]);
    put(G, 8, 9, P.wood[1]);
    hline(G, 1, 8, 4, P.boot[0]);
    hline(G, 1, 8, 9, P.boot[0]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 5, ay: 12 };
  },

  bench() {
    const G = grid(18, 9);
    block(G, 1, 2, 16, 3, P.wood);
    block(G, 2, 5, 2, 3, P.boot);
    block(G, 14, 5, 2, 3, P.boot);
    hline(G, 1, 16, 2, P.wood[0]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 9, ay: 8 };
  },

  // Landmarks. Crates and barrels alone read as a service yard; a plaza needs
  // things somebody would walk to.

  stall() {
    const G = grid(26, 19);
    block(G, 2, 9, 2, 8, P.wood); // posts
    block(G, 22, 9, 2, 8, P.wood);
    block(G, 3, 12, 20, 3, P.wood); // counter
    // Scalloped awning, striped: the scallop is what says market rather than roof.
    for (let x = 1; x < 25; x++) {
      const c = (x >> 1) % 2 ? P.red[1] : P.bone[0];
      const dip = x % 4 < 2 ? 0 : 1;
      for (let y = 0; y < 3; y++) put(G, x, 6 + y + dip, c);
    }
    hline(G, 1, 24, 5, P.wood[2]);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 13, ay: 17 };
  },

  fountain() {
    const G = grid(24, 17);
    disc(G, 12, 11, 10, P.silver, 0.52); // basin, seen at a low angle
    disc(G, 12, 11, 7, P.teal, 0.46); // water
    block(G, 11, 3, 2, 7, P.silver); // spout column
    disc(G, 12, 3, 2.2, P.teal, 0.85);
    put(G, 10, 2, "#ffffff");
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 12, ay: 15 };
  },

  // Bunting needs something to hang from. Tall and thin so a pair of them reads
  // as a span rather than as two more objects.
  post() {
    const G = grid(5, 16);
    block(G, 1, 3, 2, 12, P.wood);
    disc(G, 2, 2, 1.7, P.gold);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 2, ay: 15 };
  },

  tree() {
    const G = grid(17, 21);
    block(G, 7, 10, 2, 7, P.wood);
    disc(G, 8, 7, 6, P.leaf, 0.88);
    put(G, 5, 4, P.leaf[0]);
    plinth(G, 8, 15, 5, 9, 4, P.hide);
    outline(G, INK);
    return { canvas: toCanvas(G), ax: 8, ay: 18 };
  },

  // Every piñata now comes from TOWER_ART at tier 0-0-0, so the shop card, the
  // mask wall and the board all draw the same creature.
  candy: () => baseTower("candy"),
  coin: () => baseTower("coin"),
  ribbon: () => baseTower("ribbon"),
  papel: () => baseTower("papel"),
  mariachi: () => baseTower("mariachi"),
  gum: () => baseTower("gum"),
  chili: () => baseTower("chili"),
  firecracker: () => baseTower("firecracker"),
  maraca: () => baseTower("maraca"),
  sparkler: () => baseTower("sparkler"),





};

// -------------------------------------------------------------- luchadores
//
// Tier reads off the mask ramp; the accessory says what it does. At 13x18 the
// silhouette is nearly all you get, so every enemy needs a distinct outline.

/**
 * A masked wrestler. The greyscale contact sheet showed all seven reading as one
 * blob, so the *shape* varies now, not just the palette: `tw` torso width, `th`
 * torso height, `legs` leg length, `head` head radius. Colour is the last thing
 * a player can use in a crowd, so it cannot be the first thing that distinguishes
 * one enemy from another.
 */
function luchador(suit, opts = {}) {
  const {
    trim,
    boots = P.boot,
    extra,
    pre,
    mask,
    tw = 6, // torso width
    th = 8, // torso height
    legs = 4,
    head = 3.5,
    stance = 2, // gap between feet
    // Extra rows above the head. El Campeón is tall enough that its head disc ran
    // off the top of a 24-row grid and came out with a flat lid and no outline —
    // which is most of why the boss read as a slab rather than a champion.
    lift = 0,
  } = opts;
  const G = grid(22, 24 + lift);
  const cx = 8;
  const baseY = 20 + lift; // the feet line
  const top = baseY - legs - th; // torso top, so feet always land on it
  if (pre) pre(G, { cx, top, th, legs });
  const footY = baseY - legs;
  block(G, cx - tw / 2 - stance / 2, footY, 2, legs, boots);
  block(G, cx + stance / 2 - 0.5, footY, 2, legs, boots);
  block(G, cx - tw / 2 - 2, top + 1, 2, th - 2, suit); // arms
  block(G, cx + tw / 2, top + 1, 2, th - 2, suit);
  block(G, cx - tw / 2, top, tw, th, suit); // torso
  const hy = top - head + 0.5;
  disc(G, cx, hy, head, mask ?? suit);
  put(G, cx - 2, Math.round(hy), "#fdfbf5");
  put(G, cx + 1, Math.round(hy), "#fdfbf5");
  put(G, cx - 2, Math.round(hy) + 1, INK);
  put(G, cx + 1, Math.round(hy) + 1, INK);
  if (trim) {
    over(G, cx - 2, Math.round(hy - head + 0.5), trim);
    over(G, cx + 1, Math.round(hy - head + 0.5), trim);
  }
  put(G, cx - 2, Math.round(hy) - 1, (mask ?? suit)[0]);
  if (extra) extra(G, { cx, top, th, legs, hy, head, tw });
  outline(G, INK);
  return { canvas: toCanvas(G), ax: cx, ay: baseY };
}

// Smallest thing on the board, with a stick held high.
BUILD.nino = () =>
  luchador(P.pink, {
    trim: "#fff3f7",
    tw: 4, th: 5, legs: 3, head: 2.5, stance: 1,
    extra: (G, m) => {
      for (let i = 0; i < 5; i++) put(G, m.cx + 3 + (i >> 1), m.top + 1 - i, P.wood[1]);
    },
  });

// A cape held out to the side, and a flat montera.
//
// The cape used to hang behind the body, which in greyscale did nothing but make
// the torso look wider — and matador, técnico and plateado were three
// interchangeable humanoids on the contact sheet even though the cape is the
// whole reason its counter is guessable. Held out at arm's length with a
// one-column gap from the arm, `outline()` lays ink between the two and the eye
// reads cloth beside a man. One pixel bridges the gap at hand height, so it is
// held rather than floating.
BUILD.matador = () =>
  luchador(P.red, {
    trim: P.gold[1],
    tw: 5, th: 8, legs: 4, head: 3,
    pre: (G, m) => {
      const x0 = m.cx + 4;
      const h = m.th + 3;
      for (let y = m.top; y < m.top + h; y++) {
        const t = (y - m.top) / (h - 1);
        const w = Math.round(3 + t * 2);
        // Lit face outward, fold in shadow against the body. The first version
        // used the suit's two darkest tones and read as a stick: a shape that
        // has been separated by outline still needs its own value to say cloth.
        for (let x = x0; x < x0 + w; x++) put(G, x, y, x === x0 ? P.red[2] : P.gold[1]);
      }
      zig(G, x0 + 1, x0 + 4, m.top + h, P.gold[2], 1);
      put(G, m.cx + 3, m.top + 3, P.red[2]);
    },
    extra: (G, m) => hline(G, m.cx - 4, m.cx + 3, Math.round(m.hy - m.head) - 1, INK),
  });

// Tall and lean, with a crest.
BUILD.tecnico = () =>
  luchador(P.blue, {
    trim: "#fdfbf5",
    tw: 5, th: 9, legs: 5, head: 3,
    extra: (G, m) => {
      put(G, m.cx, Math.round(m.hy - m.head) - 1, P.blue[0]);
      put(G, m.cx, Math.round(m.hy - m.head) - 2, P.blue[1]);
    },
  });

// The heavyweight: broadest torso, shortest legs, widest stance.
BUILD.rudo = () =>
  luchador(P.purple, {
    trim: P.gold[1],
    // Head scaled with the torso. At 4 against a 9-wide chest he read as a slab
    // with a pea on top — the widest body in the roster needs the heaviest head,
    // or the proportion says "wearing armour" rather than "is a heavyweight".
    tw: 9, th: 7, legs: 3, head: 4.8, stance: 4, lift: 2,
    extra: (G, m) => {
      hline(G, m.cx - 4, m.cx + 4, m.top + 4, P.gold[1]);
      // A jaw guard across the mask, so the extra head mass reads as mask rather
      // than as a bigger ball.
      hline(G, m.cx - 3, m.cx + 2, Math.round(m.hy) + 2, P.gold[2]);
    },
  });

// Angular shoulder pads make the outline jagged where everyone else is smooth,
// and the hard white streaks read as metal rather than pale cloth.
BUILD.plateado = () =>
  luchador(P.silver, {
    trim: "#ffffff",
    tw: 6, th: 8, legs: 4, head: 3.5,
    extra: (G, m) => {
      // Pauldrons that actually flare. The old pads were three 2x2 blocks stepping
      // down the arm, which in greyscale disappeared into the arm itself — beside
      // the técnico the two were the same rectangle-with-a-bump, and the plateado
      // is the one carrying a counter rule you have to read on sight.
      //
      // Two pixels beyond the arms, tapering over three rows. Four plus a helmet
      // crest was tried first and read as *wings*: at 20 pixels tall a flare that
      // wide stops being armour on a man and becomes a different animal.
      const L = m.cx - m.tw / 2 - 2;
      const R = m.cx + m.tw / 2;
      for (let i = 0; i < 3; i++) {
        block(G, L - 2 + i, m.top + i, 3 - i, 1, P.silver);
        block(G, R, m.top + i, 4 - i, 1, P.silver);
      }
      put(G, m.cx - 1, Math.round(m.hy) - 1, "#ffffff");
      put(G, m.cx - 2, m.top + 2, "#ffffff");
      put(G, m.cx + 2, m.top + 4, "#ffffff");
    },
  });

// Slung from a rope: legs tucked together and a rope running off the top, so the
// silhouette is a hanging bundle rather than a standing figure.
BUILD.colgado = () =>
  luchador(P.green, {
    trim: "#eafbe0",
    tw: 6, th: 7, legs: 2, head: 3, stance: 0,
    extra: (G, m) => {
      for (let y = 0; y < Math.round(m.hy - m.head); y++) put(G, m.cx, y, P.wood[2]);
      block(G, m.cx - 2, Math.round(m.hy - m.head) - 2, 5, 2, P.wood);
      put(G, m.cx - m.tw / 2 - 3, m.top + 2, P.green[2]); // arms out for balance
      put(G, m.cx + m.tw / 2 + 2, m.top + 2, P.green[2]);
    },
  });

// Tallest, with a crown and a title belt.
BUILD.campeon = () =>
  luchador(P.gold, {
    tw: 8, th: 10, legs: 5, head: 4, stance: 3, lift: 7,
    extra: (G, m) => {
      hline(G, m.cx - 4, m.cx + 3, m.top + 6, "#8a2f3f");
      hline(G, m.cx - 4, m.cx + 3, m.top + 7, "#5e1c28");
      put(G, m.cx, m.top + 6, P.gold[0]);
      const cy = Math.round(m.hy - m.head);
      for (const dx of [-3, 0, 3]) {
        put(G, m.cx + dx, cy - 1, P.gold[0]);
        put(G, m.cx + dx, cy - 2, P.gold[1]);
      }
      hline(G, m.cx - 3, m.cx + 3, cy, P.gold[2]);
    },
  });

// El Coloso, in three states. He is the goal of the campaign, so he is built to
// be legible at a glance from across the board: the biggest silhouette in the
// game, and each phase changes the SHAPE — mask, then a broken mask, then bare
// head and shoulders hunched — rather than only the palette.
const coloso = (opts = {}) =>
  luchador(P.gold, {
    tw: 12, th: 13, legs: 6, head: 5.4, stance: 5, lift: 9,
    trim: P.red[1],
    ...opts,
  });

BUILD.coloso = () =>
  coloso({
    mask: P.red,
    extra: (G, m) => {
      // Championship belt, and a full mask with laces.
      hline(G, m.cx - 6, m.cx + 5, m.top + 7, "#8a2f3f");
      hline(G, m.cx - 6, m.cx + 5, m.top + 8, "#5e1c28");
      put(G, m.cx, m.top + 7, P.gold[0]);
      const cy = Math.round(m.hy - m.head);
      for (const dx of [-4, -2, 0, 2, 4]) put(G, m.cx + dx, cy + 1, P.gold[1]);
      hline(G, m.cx - 4, m.cx + 3, cy, P.gold[2]);
      // Shoulders: two plates that make him wider than anything else on screen.
      for (let i = 0; i < 3; i++) {
        block(G, m.cx - m.tw / 2 - 3 + i, m.top + i, 4 - i, 1, P.gold);
        block(G, m.cx + m.tw / 2, m.top + i, 5 - i, 1, P.gold);
      }
    },
  });

BUILD.coloso2 = () =>
  coloso({
    mask: P.red,
    extra: (G, m) => {
      hline(G, m.cx - 6, m.cx + 5, m.top + 7, "#8a2f3f");
      hline(G, m.cx - 6, m.cx + 5, m.top + 8, "#5e1c28");
      // The mask, torn: the top half gone, a bare jaw underneath.
      const hy = Math.round(m.hy);
      for (let x = m.cx - 4; x <= m.cx + 3; x++) put(G, x, hy + 1, P.bone[1]);
      put(G, m.cx - 3, hy - 1, INK);
      put(G, m.cx + 2, hy - 1, INK);
      for (const dx of [-5, 5]) put(G, m.cx + dx, hy - 3, P.red[2]);
      for (let i = 0; i < 3; i++) block(G, m.cx + m.tw / 2, m.top + i, 5 - i, 1, P.gold);
    },
  });

BUILD.coloso3 = () =>
  coloso({
    suit: P.red,
    mask: P.bone,
    extra: (G, m) => {
      // Unmasked and hunched: the belt is gone, the shoulders come UP, and the
      // whole figure reads as leaning forward at you.
      const hy = Math.round(m.hy);
      put(G, m.cx - 3, hy, INK);
      put(G, m.cx + 2, hy, INK);
      hline(G, m.cx - 3, m.cx + 2, hy + 2, "#8a2f3f");
      for (let i = 0; i < 4; i++) {
        block(G, m.cx - m.tw / 2 - 2 + i, m.top - 1 + i, 3, 1, P.red);
        block(G, m.cx + m.tw / 2 - 1, m.top - 1 + i, 3, 1, P.red);
      }
      // Steam off the shoulders.
      for (const [dx, dy] of [[-7, -4], [-6, -6], [7, -4], [8, -6]])
        put(G, m.cx + dx, m.top + dy, "#ffd9d8");
    },
  });

BUILD.toro = () => {
  const G = grid(28, 20);
  // legs
  for (const x of [5, 9, 14, 18]) block(G, x, 12, 2, 6, P.hide);
  // body
  block(G, 3, 5, 18, 8, P.hide);
  disc(G, 21, 6, 4.5, P.hide);
  // horns
  put(G, 18, 1, P.bone[1]);
  put(G, 19, 2, P.bone[0]);
  put(G, 24, 1, P.bone[1]);
  put(G, 23, 2, P.bone[0]);
  // snout + eye + nose ring
  block(G, 23, 7, 4, 3, P.hide);
  put(G, 24, 8, INK);
  put(G, 26, 8, INK);
  put(G, 21, 4, "#e8524f");
  put(G, 25, 11, P.gold[1]);
  put(G, 24, 11, P.gold[1]);
  // tail
  put(G, 2, 6, P.hide[2]);
  put(G, 1, 7, P.hide[2]);
  put(G, 1, 8, P.hide[2]);
  put(G, 5, 6, P.hide[0]);
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 13, ay: 18 };
};

// ------------------------------------------------------- the great piñata
//
// The player's life total, rendered as an object: it darkens, cracks, sags and
// leaks candy, so health never needs a number.

export function giantPinata(damage) {
  const tier = damage > 0.66 ? 2 : damage > 0.33 ? 1 : 0;
  const ramp = [P.orange, P.orangeHurt, P.orangeBad][tier];
  const G = grid(40, 44);
  const cx = 19.5;
  const cy = 18;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 7.5 : 17;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const inside = (x, y) => {
    let n = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
    }
    return n;
  };
  for (let y = 0; y < G.h; y++)
    for (let x = 0; x < G.w; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const dx = x + 0.5 - cx - LX * 15;
      const dy = y + 0.5 - cy - LY * 15;
      const t = Math.sqrt(dx * dx + dy * dy) / 30;
      put(G, x, y, ramp[Math.min(3, Math.floor(t * 4))]);
    }
  const droop = [0, 1, 2][tier];
  zigOver(G, 9, 30, 13 + droop, tier === 2 ? "#e8c9ac" : "#ffe6cf");
  zigOver(G, 9, 30, 20 + droop, ramp[3]);
  // face
  if (tier === 2) {
    put(G, 15, 15, INK); put(G, 17, 17, INK); put(G, 17, 15, INK); put(G, 15, 17, INK);
    put(G, 22, 15, INK); put(G, 24, 17, INK); put(G, 24, 15, INK); put(G, 22, 17, INK);
    block(G, 18, 21, 4, 2, ["#3d1704", "#3d1704", "#3d1704", "#3d1704"]);
  } else {
    block(G, 15, 15, 2, 2, ["#3d1704", "#3d1704", "#3d1704", "#3d1704"]);
    block(G, 23, 15, 2, 2, ["#3d1704", "#3d1704", "#3d1704", "#3d1704"]);
    const m = tier === 1 ? [[18,22],[19,21],[20,21],[21,22]] : [[18,21],[19,22],[20,22],[21,21]];
    for (const [x, y] of m) put(G, x, y, "#3d1704");
  }
  // cracks widen with damage
  if (tier >= 1) for (const [x, y] of [[13,10],[13,11],[14,12],[13,13],[14,14]]) put(G, x, y, "#5e2408");
  if (tier === 2)
    for (const [x, y] of [[25,11],[26,12],[25,13],[26,14],[19,8],[20,9],[9,17],[10,18]])
      put(G, x, y, "#4a1c05");
  // Chunks knocked out of the SHAPE. Cracks drawn inside the body are two dark
  // pixels at gameplay scale and read as texture; the great piñata is the health
  // display — the only one there is when blindfolded — so damage has to change
  // its outline. `outline()` runs after this, so each bite gets its own ink edge.
  const bite = (bx, by, r) => {
    for (let y = Math.floor(by - r); y <= Math.ceil(by + r); y++)
      for (let x = Math.floor(bx - r); x <= Math.ceil(bx + r); x++) {
        const dx = x + 0.5 - bx;
        const dy = y + 0.5 - by;
        if (dx * dx + dy * dy <= r * r && x >= 0 && y >= 0 && x < G.w && y < G.h) G.d[y * G.w + x] = null;
      }
  };
  if (tier >= 1) bite(33, 17, 3.2);
  if (tier === 2) {
    bite(6, 17, 3.6);
    bite(19.5, 2.5, 3.2);
    bite(28, 27, 2.6);
  }

  // The rope goes on after the bites: the top chunk overlapped it, and a piñata
  // that has lost the rope it hangs from is a piñata on the floor.
  for (let y = 0; y < 6; y++) put(G, 19, y, P.wood[2]);

  // leaking candy
  if (tier === 2) {
    disc(G, 14, 31, 1.6, P.pink);
    disc(G, 19, 34, 1.6, P.teal);
    disc(G, 24, 32, 1.6, P.gold);
  }
  outline(G, INK);
  return { canvas: toCanvas(G), ax: 19.5, ay: 30 };
}

// --------------------------------------------------------------- pipeline


// ------------------------------------------------------------- the ten piñatas
//
// Each entry is a grid size, a ground anchor, a body, and the ANCHORS upgrade art
// hangs off: `top` (crown height), `belt` (where a band wraps), `sideY` (wing
// height) and `halfW` (how far out the body reaches). Upgrade decorations are
// drawn generically at those anchors, so one vocabulary of marks lands correctly
// on ten different silhouettes instead of needing 120 hand-drawn combinations.
//
// Silhouette is the whole job at this size. Before this pass eight of the ten
// were a shaded disc and you told them apart by hue alone — which fails the
// moment two of them sit on the same stretch of lane.
export const TOWER_ART = {
  // THE piñata: a seven-point star, and the one you meet first.
  candy: {
    w: 26, h: 27, ax: 12.5, ay: 25, top: 1, belt: 13, sideY: 12, halfW: 7, ramp: P.candy,
    build(G) {
      cord(G, 12, 0);
      starBody(G, 12, 12, 6.5, P.candy, P.gold);
      put(G, 9, 9, "#ffffff");
    },
  },

  // A chili hung stalk-up, fat end at the top, fringed in three bands.
  chili: {
    w: 18, h: 27, ax: 8, ay: 25, top: 2, belt: 13, sideY: 11, halfW: 5, ramp: P.chili,
    build(G) {
      cord(G, 8, 0);
      for (let y = 4; y < 23; y++) {
        const t = (y - 4) / 18;
        const w = Math.round(5.4 - t * 3.8 + Math.sin(t * 3.0) * 1.0);
        const cx = 8 + Math.round(Math.sin(t * 2.1) * 1.5);
        for (let x = cx - w; x <= cx + w; x++) {
          const u = (x - (cx - w)) / Math.max(1, 2 * w);
          put(G, x, y, P.chili[u < 0.28 ? 0 : u < 0.55 ? 1 : u < 0.82 ? 2 : 3]);
        }
      }
      // GREEN bands, not gold. With gold fringe on a red taper it was the
      // firecracker in a different hat — two of ten silhouettes reading as the
      // same object is worse than either of them being plain.
      fringe(G, 3, 13, 9, P.leaf);
      fringe(G, 3, 13, 15, P.leaf);
      // Stalk and leaf.
      put(G, 8, 3, P.leaf[1]);
      put(G, 7, 2, P.leaf[0]);
      put(G, 9, 2, P.leaf[2]);
      put(G, 6, 4, P.leaf[1]);
      put(G, 5, 5, "#ffffff");
    },
  },

  // Round, sagging, with a bubble it is too sleepy to pop.
  gum: {
    w: 26, h: 24, ax: 9.5, ay: 22, top: 1, belt: 13, sideY: 12, halfW: 7, ramp: P.gum,
    build(G) {
      cord(G, 9, 0);
      disc(G, 9.5, 11, 7, P.gum);
      fringe(G, 3, 16, 8, P.bubble);
      fringe(G, 3, 16, 14, P.bubble);
      ruffle(G, 9, 17, 6, P.gum);
      disc(G, 20, 7, 4.5, P.bubble);
      put(G, 16, 9, P.gum[2]);
      put(G, 17, 8, P.gum[2]);
      put(G, 6, 6, "#ffffff");
    },
  },

  // The only one with a stick, and it never stops moving.
  maraca: {
    w: 22, h: 25, ax: 8, ay: 23, top: 1, belt: 11, sideY: 10, halfW: 6, ramp: P.gold,
    build(G) {
      cord(G, 8, 0);
      for (let i = 0; i < 8; i++) block(G, 9 + i, 13 + i, 3, 2, P.wood);
      disc(G, 8, 9, 6.2, P.gold);
      fringe(G, 2, 14, 6, P.red);
      fringe(G, 2, 14, 12, P.teal);
      // Rattle dots: the pattern that says "shake me".
      for (const [x, y] of [[5, 9], [8, 10], [11, 8], [7, 13], [10, 12]]) put(G, x, y, P.red[2]);
      put(G, 5, 5, "#ffffff");
    },
  },

  // Not a body at all: a sheet of cut paper on a taut cord.
  papel: {
    w: 24, h: 22, ax: 11, ay: 20, top: 0, belt: 11, sideY: 10, halfW: 9, ramp: P.papel,
    build(G) {
      // The cord it hangs from, drawn taut across the whole sprite.
      hline(G, 0, 23, 1, P.hide[2]);
      for (const x of [3, 11, 19]) put(G, x, 2, P.hide[3]);
      // Three stacked sheets, each narrower than the one above.
      const sheets = [
        [2, 3, 20, 6, P.papel],
        [3, 9, 18, 5, P.leaf],
        [4, 14, 16, 4, P.papel],
      ];
      for (const [x0, y0, w, h, ramp] of sheets) {
        block(G, x0, y0, w, h, ramp);
        // The cut-outs. Punched as small DIAMONDS rather than single pixels: at
        // this size a lone hole reads as a speck of dirt, and a diamond is the
        // shape actually cut into papel picado.
        for (let cx = x0 + 3; cx < x0 + w - 2; cx += 5) {
          const cy = y0 + Math.floor(h / 2);
          put(G, cx, cy - 1, null);
          put(G, cx - 1, cy, null);
          put(G, cx, cy, null);
          put(G, cx + 1, cy, null);
          put(G, cx, cy + 1, null);
        }
        // A cut hem, from the kit, so it hangs like paper instead of ending in a
        // ruled line.
        fringe(G, x0, x0 + w - 1, y0 + h - 1, ramp, { onto: false, depth: 3 });
      }
      put(G, 5, 4, "#ffffff");
    },
  },

  // A cracker with a lit fuse, and it knows what it is full of.
  firecracker: {
    w: 20, h: 29, ax: 9, ay: 27, top: 2, belt: 16, sideY: 15, halfW: 6, ramp: P.red,
    build(G) {
      // Fuse, lit.
      for (let y = 0; y < 4; y++) put(G, 11 + (y & 1), y + 1, P.hide[2]);
      put(G, 12, 0, P.gold[0]);
      put(G, 13, 1, "#ffffff");
      // Cap.
      for (let y = 0; y < 6; y++) {
        const w = Math.round((y / 5) * 5);
        for (let x = 9 - w; x <= 9 + w; x++) put(G, x, 4 + y, P.red[x < 9 - w + 2 ? 0 : x < 10 ? 1 : 2]);
      }
      block(G, 4, 10, 11, 13, P.gold);
      fringe(G, 4, 14, 13, P.red);
      fringe(G, 4, 14, 19, P.red);
      ruffle(G, 9, 22, 5, P.red);
      put(G, 5, 12, "#ffffff");
    },
  },

  // Streamers off a slim body: the one silhouette that leaves its own outline.
  ribbon: {
    w: 26, h: 25, ax: 8, ay: 23, top: 1, belt: 12, sideY: 11, halfW: 5, ramp: P.ribbon,
    build(G) {
      cord(G, 8, 0);
      for (let y = 7; y <= 19; y++) {
        const t = (y - 7) / 12;
        const w = Math.round(7 - t * 5);
        for (let x = 0; x < w; x++)
          put(G, 8 - (w >> 1) + x, y, P.ribbon[Math.min(3, 1 + ((x + (y % 2)) % 2))]);
      }
      disc(G, 8, 6, 4, P.ribbon, 0.85);
      fringe(G, 4, 12, 9, P.gold);
      // Three streamers, arcing away and back — nothing else on the board does
      // this, and it is why the silhouette reads at a glance.
      const streamer = (x0, y0, dx, dy, n, col, wob) => {
        let x = x0;
        let y = y0;
        for (let i = 0; i < n; i++) {
          put(G, Math.round(x), Math.round(y), col);
          x += dx;
          y += dy + Math.sin(i / wob) * 0.7;
        }
      };
      streamer(11, 5, 0.95, -0.1, 12, P.gold[1], 1.5);
      streamer(11, 10, 1, 0.35, 12, P.ribbon[1], 1.8);
      streamer(11, 14, 0.9, 0.5, 11, P.pink[1], 2.2);
      put(G, 6, 8, "#ffffff");
    },
  },

  // Three of them, in sombreros. A band, not a piñata with a moustache.
  mariachi: {
    w: 26, h: 22, ax: 12, ay: 20, top: 2, belt: 13, sideY: 12, halfW: 9, ramp: P.mariachi,
    build(G) {
      for (const [cx, lift] of [[4, 2], [12, 0], [20, 2]]) {
        disc(G, cx, 12 + lift, 4, P.mariachi);
        fringe(G, cx - 4, cx + 4, 14 + lift, P.gold, { depth: 3 });
        // Sombrero: a brim wider than the head, which is the whole read.
        hline(G, cx - 5, cx + 5, 7 + lift, P.gold[1]);
        hline(G, cx - 4, cx + 4, 6 + lift, P.gold[2]);
        block(G, cx - 2, 3 + lift, 5, 4, P.gold);
        put(G, cx - 1, 4 + lift, "#ffffff");
      }
    },
  },

  // Tall, thin, and topped with a star that is doing its best.
  sparkler: {
    w: 20, h: 31, ax: 9, ay: 29, top: 0, belt: 20, sideY: 19, halfW: 5, ramp: P.teal,
    build(G) {
      block(G, 5, 17, 9, 10, P.teal);
      fringe(G, 5, 13, 19, P.silver);
      fringe(G, 5, 13, 24, P.silver);
      ruffle(G, 9, 26, 4, P.teal);
      for (let y = 9; y < 17; y++) put(G, 9, y, P.wood[2]);
      // A five-point star, drawn as two crossed strokes plus arms.
      for (const [x, y] of [[9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7],
                            [6, 4], [7, 4], [8, 4], [10, 4], [11, 4], [12, 4],
                            [7, 6], [11, 6], [7, 2], [11, 2]]) put(G, x, y, P.gold[1]);
      put(G, 9, 4, "#ffffff");
      put(G, 8, 3, P.gold[0]);
      put(G, 10, 5, P.gold[0]);
      // Sparks.
      put(G, 5, 2, P.gold[0]);
      put(G, 13, 7, P.gold[0]);
      put(G, 6, 15, "#ffffff");
    },
  },

  // A fat pot stuffed with coins, one spilling out of the slot.
  coin: {
    w: 24, h: 24, ax: 10, ay: 22, top: 2, belt: 13, sideY: 12, halfW: 7, ramp: P.coin,
    build(G) {
      cord(G, 10, 0);
      // Pot: wide at the belly, narrow at the neck.
      for (let y = 6; y <= 20; y++) {
        const t = (y - 6) / 14;
        const w = Math.round(3.4 + Math.sin(t * Math.PI * 0.92) * 4.6);
        for (let x = 10 - w; x <= 10 + w; x++) {
          const u = (x - (10 - w)) / Math.max(1, 2 * w);
          put(G, x, y, P.coin[u < 0.25 ? 0 : u < 0.55 ? 1 : u < 0.82 ? 2 : 3]);
        }
      }
      fringe(G, 4, 16, 10, P.gold);
      fringe(G, 4, 16, 16, P.gold);
      // The slot, and a coin escaping it.
      hline(G, 8, 12, 5, INK);
      disc(G, 14, 3, 2.6, P.gold, 0.85);
      put(G, 13, 2, "#ffffff");
      put(G, 6, 9, "#ffffff");
    },
  },
};

const cache = new Map();

/** A built sprite, in art pixels. Cached — building is not free. */
export function sprite(name) {
  let hit = cache.get(name);
  if (!hit) {
    hit = BUILD[name]();
    cache.set(name, hit);
  }
  return hit;
}

/** Build a one-off sprite under an explicit cache key. */
export function custom(key, factory) {
  let hit = cache.get(key);
  if (!hit) {
    hit = factory();
    cache.set(key, hit);
  }
  return hit;
}



// ------------------------------------------------------------ upgrade THEMES
//
// The first version of this drew the same three marks for path 0, path 1 and
// path 2 on every piñata — a belt, some wings, a hat. Mechanically the paths are
// already different (burn, stun, splash, chain, slow), but you could not SEE any
// of that, so buying one felt like buying a number. What a piñata wears now comes
// from what the upgrade DOES: `PATHS[type][i].art` names a theme, and the theme
// owns a tint and a glyph.
//
// Two rules keep it readable with two paths open:
//   - only the HIGHEST path tints the body, so a piñata has one identity rather
//     than a muddy average of two;
//   - glyphs are placed on an arc over the crown, so two themes sit side by side
//     instead of on top of each other.

/** Blend a hex colour toward another. */
function mix(hex, to, t) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const h = (i) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, "0");
  return `#${h(0)}${h(1)}${h(2)}`;
}

/**
 * Push the whole body toward a colour.
 *
 * This is the half of the request that art alone could not fake: "a fire upgrade
 * should turn the piñata red" means the BODY changes, not that a flame is stuck
 * on the side of an unchanged one. The ink outline and the speculars are left
 * alone — tinting those flattens the sprite into a silhouette.
 */
function tintBody(G, ramp, t) {
  for (let i = 0; i < G.d.length; i++) {
    const c = G.d[i];
    if (!c || c === INK || c === "#ffffff") continue;
    // Toward the ramp entry that MATCHES this pixel's own lightness, not toward
    // one flat colour. Mixing every pixel toward a single hex pulls the light
    // and the dark ends of the body together, so a fully upgraded piñata came
    // out muted and flat — ten of them on a board looked washed out rather than
    // festive. Picking the entry by luminance shifts the hue and leaves the
    // shading where it was.
    const lum = (parseInt(c.slice(1, 3), 16) * 0.3 + parseInt(c.slice(3, 5), 16) * 0.59 + parseInt(c.slice(5, 7), 16) * 0.11) / 255;
    const idx = Math.min(3, Math.max(0, Math.round((1 - lum) * 3)));
    G.d[i] = mix(c, ramp[idx], t);
  }
}

// Small stamps. Each takes the grid and a point, and draws the thing that theme
// means. Kept to a handful of pixels each: at this size a glyph that needs more
// than about nine is a blob.
const G_FLAME = (G, x, y, hot) => {
  put(G, x, y + 1, hot[2]);
  put(G, x, y, hot[1]);
  put(G, x, y - 1, hot[0]);
  put(G, x - 1, y, hot[2]);
  put(G, x + 1, y, hot[2]);
  put(G, x, y - 2, "#fff3bd");
};
const G_SPIKE = (G, x, y, ramp) => {
  put(G, x, y + 1, ramp[2]);
  put(G, x, y, ramp[1]);
  put(G, x, y - 1, ramp[0]);
  put(G, x, y - 2, ramp[0]);
};
const G_DROP = (G, x, y, ramp) => {
  put(G, x, y, ramp[1]);
  put(G, x, y + 1, ramp[2]);
  put(G, x, y + 2, ramp[3]);
  put(G, x - 1, y + 1, ramp[1]);
};
const G_RING = (G, x, y, ramp) => {
  put(G, x - 1, y, ramp[1]);
  put(G, x + 1, y, ramp[1]);
  put(G, x, y - 1, ramp[0]);
  put(G, x, y + 1, ramp[2]);
};
const G_BURST = (G, x, y, ramp) => {
  put(G, x, y, ramp[0]);
  put(G, x - 1, y - 1, ramp[1]);
  put(G, x + 1, y - 1, ramp[1]);
  put(G, x - 1, y + 1, ramp[2]);
  put(G, x + 1, y + 1, ramp[2]);
};
const G_NOTE = (G, x, y, ramp) => {
  put(G, x, y, ramp[3]);
  put(G, x + 1, y, ramp[3]);
  put(G, x + 1, y - 1, ramp[1]);
  put(G, x + 1, y - 2, ramp[1]);
  put(G, x + 2, y - 2, ramp[0]);
};
const G_COIN = (G, x, y, ramp) => {
  put(G, x, y, ramp[0]);
  put(G, x + 1, y, ramp[1]);
  put(G, x, y + 1, ramp[1]);
  put(G, x + 1, y + 1, ramp[2]);
};
const G_BUBBLE = (G, x, y, ramp) => {
  put(G, x, y, ramp[0]);
  put(G, x + 1, y, ramp[1]);
  put(G, x, y + 1, ramp[1]);
  put(G, x + 1, y + 1, ramp[1]);
  put(G, x, y - 1, "#ffffff");
};
const G_RAY = (G, x, y, ramp) => {
  put(G, x, y - 1, ramp[0]);
  put(G, x, y, ramp[0]);
  put(G, x, y + 1, ramp[1]);
  put(G, x - 1, y - 2, ramp[1]);
  put(G, x + 1, y - 2, ramp[1]);
};
const G_LINK = (G, x, y, ramp) => {
  put(G, x, y, ramp[1]);
  put(G, x + 1, y - 1, ramp[0]);
  put(G, x + 2, y, ramp[1]);
  put(G, x + 1, y + 1, ramp[2]);
};
const G_WING = (G, x, y, ramp) => {
  for (let i = 0; i < 3; i++) {
    put(G, x + i, y + i, ramp[1]);
    put(G, x + i, y + i - 1, ramp[0]);
  }
};
const G_DRUM = (G, x, y, ramp) => {
  // A squat drum: two rows, and the only glyph wider than it is tall. That is
  // what makes it read as percussion rather than as one more sparkle.
  put(G, x - 1, y - 1, ramp[0]);
  put(G, x, y - 1, ramp[0]);
  put(G, x + 1, y - 1, ramp[0]);
  put(G, x - 1, y, ramp[2]);
  put(G, x, y, ramp[1]);
  put(G, x + 1, y, ramp[2]);
};
const G_FAN = (G, x, y, ramp) => {
  // Three diverging strokes — something going WIDE, as against G_BURST, which
  // goes off in every direction at once. The gap either side is the whole tell.
  put(G, x, y + 1, ramp[2]);
  put(G, x, y, ramp[1]);
  put(G, x - 2, y - 1, ramp[0]);
  put(G, x, y - 1, ramp[0]);
  put(G, x + 2, y - 1, ramp[0]);
};
const G_STACK = (G, x, y, ramp) => {
  // A rising stack of three: compounding, stated as a shape. The only glyph
  // with a stepped edge.
  put(G, x - 1, y, ramp[2]);
  put(G, x, y - 1, ramp[1]);
  put(G, x, y, ramp[2]);
  put(G, x + 1, y - 2, ramp[0]);
  put(G, x + 1, y - 1, ramp[1]);
  put(G, x + 1, y, ramp[2]);
};
const G_HORN = (G, x, y, ramp) => {
  put(G, x, y, ramp[2]);
  put(G, x + 1, y, ramp[1]);
  put(G, x + 2, y - 1, ramp[0]);
  put(G, x + 2, y + 1, ramp[0]);
  put(G, x + 2, y, ramp[0]);
};

export const THEMES = {
  fire:   { tint: "#e8524f", ramp: P.red,      glyph: G_FLAME, hot: true },
  ember:  { tint: "#f28b3c", ramp: P.orange,   glyph: G_FLAME, hot: true },
  blast:  { tint: "#f2c53d", ramp: P.gold,     glyph: G_BURST },
  spread: { tint: "#ffd45e", ramp: P.leaf,     glyph: G_FAN },
  sharp:  { tint: "#d4dee8", ramp: P.silver,   glyph: G_SPIKE },
  swift:  { tint: "#63dbe0", ramp: P.teal,     glyph: G_WING },
  sticky: { tint: "#5b8de8", ramp: P.blue,     glyph: G_DROP },
  bubble: { tint: "#ffbde6", ramp: P.bubble,   glyph: G_BUBBLE },
  acid:   { tint: "#6cc47a", ramp: P.green,    glyph: G_DROP },
  sound:  { tint: "#9b8ef0", ramp: P.mariachi, glyph: G_RING },
  chain:  { tint: "#ff8fd8", ramp: P.ribbon,   glyph: G_LINK },
  music:  { tint: "#7d68a0", ramp: P.purple,   glyph: G_NOTE },
  brass:  { tint: "#ffd45e", ramp: P.gold,     glyph: G_HORN },
  light:  { tint: "#fff3bd", ramp: P.gold,     glyph: G_RAY },
  gold:   { tint: "#ffd45e", ramp: P.gold,     glyph: G_COIN },
  reach:  { tint: "#a8e86a", ramp: P.coin,     glyph: G_SPIKE },
  drum:   { tint: "#e8524f", ramp: P.chili,    glyph: G_DRUM },
  vault:  { tint: "#7cc44e", ramp: P.green,    glyph: G_STACK },
};

/** Every theme name, for the coverage test. */
export const THEME_NAMES = Object.keys(THEMES);

/**
 * Where a theme's glyphs sit: an arc over the crown, spreading outward as the
 * tier climbs. Two open paths get opposite halves of the arc, so their marks
 * never land on the same pixel.
 */
function arcSpots(a, n, side) {
  const out = [];
  const r = a.halfW + 2;
  for (let i = 0; i < n; i++) {
    // -0.15pi..-0.85pi is the top half; `side` picks which end it grows from.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ang = Math.PI * (side < 0 ? -0.55 - t * 0.3 : -0.45 + t * 0.3);
    out.push([Math.round(a.ax + Math.cos(ang) * r), Math.round(a.top + 2 + Math.sin(ang) * 3 + r * 0.15)]);
  }
  return out;
}


/**
 * A piñata at a given upgrade state.
 *
 * Cached per (type, tiers) — the restriction rule keeps the reachable
 * combinations to a few dozen per piñata and they are built lazily, so in a real
 * run only the handful you actually buy ever get drawn.
 */
// Room for the marks to live in. A crown sits above the crown of the head and a
// sombrero brim is wider than the body, so drawing them into a grid sized to the
// BODY silently clipped both — the tier-4 candy piñata lost the top of its crown
// and the papel picado lost the end of its brim. Every piñata is built into a
// grid with this much slack on the top and sides, and the anchors shift with it,
// so no builder had to be re-authored to make room.
const PAD_TOP = 7;
const PAD_SIDE = 5;

/**
 * What one bought path adds to a piñata.
 *
 * Escalation is the same shape for every theme so it stays legible — one glyph,
 * then two, then four with a band, then a full crown — but WHICH glyph and what
 * colour comes from the upgrade, so "Hotter" and "Harder candy" are two different
 * objects rather than the same object with a different tooltip.
 */
function themeMarks(G, a, theme, tier, side) {
  const T = THEMES[theme];
  if (!T || tier < 1) return;
  // Tier 4 draws the crown ring BELOW and nothing on the arc: drawing both put
  // nine glyphs on a 26px sprite and they merged into a spiky mess, which reads
  // as damage rather than as a crown.
  const n = tier >= 4 ? 0 : tier >= 3 ? 3 : tier >= 2 ? 2 : 1;
  for (const [x, y] of arcSpots(a, n, side)) T.glyph(G, x, y, T.ramp);
  if (tier >= 3) {
    // A band in the theme's colour, so the body carries the path even where the
    // glyphs do not reach.
    fringe(G, a.ax - a.halfW - 1, a.ax + a.halfW + 1, a.belt, T.ramp, { depth: 3 });
  }
  if (tier >= 4) {
    // The crown: the tier-4 mark is a ring of the theme's own glyph, which is
    // both the loudest thing on the piñata and unmistakably that path's.
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI * (-0.88 + i * 0.19);
      T.glyph(G, Math.round(a.ax + Math.cos(ang) * (a.halfW + 3)),
                 Math.round(a.top - 1 + Math.sin(ang) * 2), T.ramp);
    }
  }
}

/**
 * A piñata at a given upgrade state.
 *
 * Cached per (type, tiers) — the restriction rule keeps the reachable
 * combinations to a few dozen per piñata and they are built lazily, so in a real
 * run only the handful you actually buy ever get drawn.
 */
export function towerSprite(type, tiers = [0, 0, 0], paths = null) {
  const a = TOWER_ART[type];
  if (!a) return sprite(type);
  const themes = (paths ?? PATHS[type] ?? []).map((p) => p?.art ?? null);
  return custom(`T:${type}:${tiers.join("")}:${themes.join(",")}`, () => {
    const body = grid(a.w, a.h);
    a.build(body);
    const G = grid(a.w + PAD_SIDE * 2, a.h + PAD_TOP);
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) put(G, x + PAD_SIDE, y + PAD_TOP, at(body, x, y));
    const anchors = {
      ...a,
      ax: a.ax + PAD_SIDE,
      ay: a.ay + PAD_TOP,
      top: a.top + PAD_TOP,
      belt: a.belt + PAD_TOP,
      sideY: a.sideY + PAD_TOP,
    };

    // ONE identity. The deepest path tints the body; a piñata that is 3-1-0 is
    // the colour of its 3, not a blend of both, because a blend reads as neither.
    let lead = -1;
    for (let i = 0; i < tiers.length; i++)
      if ((tiers[i] ?? 0) > (tiers[lead] ?? 0)) lead = i;
    const leadTheme = lead >= 0 && tiers[lead] > 0 ? THEMES[themes[lead]] : null;
    if (leadTheme) tintBody(G, leadTheme.ramp, Math.min(0.68, 0.18 * tiers[lead]));

    // Glyphs from every bought path, each on its own half of the crown arc.
    let placed = 0;
    for (let i = 0; i < tiers.length; i++) {
      if (!(tiers[i] > 0) || !themes[i]) continue;
      themeMarks(G, anchors, themes[i], tiers[i], placed === 0 ? -1 : 1);
      placed += 1;
    }
    // A piñata whose paths have no themes still shows that it was upgraded.
    if (!placed && Math.max(...tiers) > 0) themeMarks(G, anchors, "sharp", Math.max(...tiers), -1);

    // Outlined LAST, so the upgrade marks get the same black edge as the body
    // instead of floating on top of an already-outlined sprite.
    outline(G, INK);
    return { canvas: toCanvas(G), ax: anchors.ax, ay: anchors.ay };
  });
}

/** Every piñata that has a redesigned body, for the coverage tests. */
export const TOWER_ART_NAMES = Object.keys(TOWER_ART);

/** Every sprite name, for the coverage test. */
export const SPRITE_NAMES = Object.keys(BUILD);

/**
 * Blit into the low-res buffer so the sprite's anchor lands on art-pixel (x, y).
 * Positions are floored: a sprite drawn on a half pixel is the single fastest way
 * to make pixel art look broken.
 */
export function blit(g, s, x, y, { flip = false, squash = 1 } = {}) {
  const w = s.canvas.width;
  const h = s.canvas.height;
  const dh = squash === 1 ? h : Math.max(1, Math.round(h * squash));
  const dw = squash === 1 ? w : Math.max(1, Math.round(w / squash));
  const dx = Math.round(x - (s.ax * dw) / w);
  const dy = Math.round(y - (s.ay * dh) / h);
  if (flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(s.canvas, 0, 0, dw, dh);
    g.restore();
  } else {
    g.drawImage(s.canvas, dx, dy, dw, dh);
  }
}

// Contact shadows, cached per radius. Dithered rather than alpha-blended, so
// they stay inside the palette instead of muddying it.
const shadowCache = new Map();

function shadowSprite(rx) {
  const key = Math.max(2, Math.round(rx));
  let hit = shadowCache.get(key);
  if (!hit) {
    const G = grid(key * 2 + 3, key + 3);
    const cx = G.w / 2;
    const cy = G.h / 2;
    for (let y = 0; y < G.h; y++)
      for (let x = 0; x < G.w; x++) {
        const dx = (x + 0.5 - cx) / key;
        const dy = (y + 0.5 - cy) / (key * 0.5);
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        // checker the outer ring: pixel-art shadows dither, they do not fade
        if (d > 0.55 && (x + y) % 2) continue;
        // Opaque, and multiplied onto the ground rather than washed over it — see
        // `shadow()`.
        put(G, x, y, SHADOW_MUL);
      }
    hit = toCanvas(G);
    shadowCache.set(key, hit);
  }
  return hit;
}

/**
 * The colour a shadow multiplies the ground by. Warm, so the hue of whatever it
 * lands on survives: a cream lane shadows to tan, orange paving to a deeper
 * orange, the dark street to brown.
 */
const SHADOW_MUL = "#b0968a";

/**
 * Ground shadow, in art-pixel space. Stays put while the body hops.
 *
 * Drawn with `multiply` rather than as a translucent black ellipse. An alpha wash
 * is the same grey everywhere it lands, and on the pale lane — the one surface a
 * player watches most — it read as a smudge of dirt rather than as shade. A
 * multiply keeps the surface's own hue and only takes light out of it, which is
 * what shade does, and it costs one composite instead of a per-pixel pass.
 */
export function shadow(g, x, y, rx, lift = 0) {
  const s = shadowSprite(rx * (lift > 0 ? 0.82 : 1));
  const prev = g.globalCompositeOperation;
  g.globalCompositeOperation = "multiply";
  g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
  g.globalCompositeOperation = prev;
}
