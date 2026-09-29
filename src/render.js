// Render layer. Reads sim state, never writes it.
//
// Everything is drawn into a low-resolution buffer (240x150 art pixels for a
// 960x600 board) and then scaled up with image smoothing off. Sim coordinates
// are screen pixels, so every position divides by PX on the way in and gets
// rounded — a sprite on a half pixel is the fastest way to make pixel art look
// broken.
//
// The board background never changes, so ground and lane are plotted pixel by
// pixel once per map and cached. That is crisper than stroking (canvas strokes
// antialias, which at 4x reads as mud) and cheaper per frame.

import { ENEMIES, BLINDFOLD } from "./data.js";
import { sprite, custom, blit, shadow, giantPinata, towerSprite, PX, INK } from "./art.js";
import { idleOffset, faceMarks } from "./faces.js";
import { drawFigure, drawFoe } from "./figures.js";
import * as fx from "./fx.js";
import { canSee, sightRadius, reach, LANE_CLEAR } from "./sim.js";

const A = (v) => Math.round(v / PX); // screen -> art pixels

// The drawn road is derived from the rule that governs it, not picked by eye. A
// hardcoded 6 made the road narrower than the no-build zone, so spots that
// looked like open plaza were rejected — the road has to mean what it means.
const LANE_R = A(LANE_CLEAR) - 1;

let buf = null;
function buffer(w, h) {
  if (!buf || buf.canvas.width !== w || buf.canvas.height !== h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    buf = c.getContext("2d");
    buf.imageSmoothingEnabled = false;
  }
  return buf;
}

/**
 * The street inset, in ART pixels. Without it the playfield fills whichever
 * dimension binds - on a 16:9 window `oy` came out 0, so every prop, the bunting
 * and the fountain were invisible and eight rounds of surround work only showed
 * on a squarer window. It is in art pixels because that is what the bands are
 * measured in; a percentage would shrink to nothing exactly when the scale is
 * large, which is the case that was broken. It grows with the window so a big
 * monitor gets a street wide enough to hang bunting in and a small one only
 * gives up a verge.
 */
export const streetInset = (w, h) => Math.max(16, Math.min(30, Math.round(Math.min(w, h) / 38)));

/**
 * Screen pixels per art pixel that a board box of w x h draws the playfield at.
 *
 * The street inset is reserved on the axis that is *not* binding. A fixed-aspect
 * playfield in a window of another shape always has surplus on one axis and none
 * on the other, so taking a margin off both wastes board twice: on a 785x1260
 * window the horizontal inset cost 13% of the plaza's width while 900 pixels of
 * vertical street sat there unused. The street still exists — it is just all on
 * the side that had room for it.
 */
/**
 * The smallest the board is allowed to get.
 *
 * This used to be 1 — one screen pixel per art pixel — which sounds like a floor
 * on legibility and is actually a floor on FITTING: below about 700px of window
 * the plaza plus the shop needs more room than there is, and refusing to scale
 * under 1 meant the board was drawn bigger than the window and cropped. A board
 * you cannot see the edge of is worse than a board drawn a bit small, so the
 * floor is now low enough to always fit and high enough to stay a picture.
 */
export const MIN_SCALE = 0.4;

export const boardScale = (w, h, mw, mh) => {
  const i = streetInset(w, h) * 2;
  // Even the binding axis keeps a few pixels. At zero the plaza ran flush off the
  // window edge and its kerb was cut, which reads as a board that did not finish
  // drawing rather than as terrain continuing past the screen.
  const edge = 12;
  return w / mw < h / mh
    ? Math.max(MIN_SCALE, Math.min(w / (mw + edge), h / (mh + i)))
    : Math.max(MIN_SCALE, Math.min(w / (mw + i), h / (mh + edge)));
};

/*
 * There were three comments here describing a BOTTOM-BAR arrangement of the shop
 * — which side the rail takes, how tall the bar should be, the hysteresis needed
 * near the crossover. The code they documented was deleted when the shop became a
 * reserved right-hand panel, and the comments outlived it: a careful description
 * of machinery that does not exist is worse than no comment at all, because the
 * next person goes looking for it.
 *
 * The idea is still sound and still measurable, and the numbers in it were real:
 * on a tall window the board is bound by WIDTH, so the shop's width comes
 * straight out of the playfield while its height would be nearly free. If the
 * shop is ever laid across the bottom again, that is the reason, and the choice
 * should be measured per window shape rather than picked by a media query.
 */

/**
 * The shop panel's width, and the strip of canvas the playfield must stay out of.
 *
 * BTD's anatomy: the map runs to every edge of the window and the shop is a panel
 * laid *over* it, rather than a column carved out of the screen. The panel still
 * must not cover plaza, so the playfield is centred in what is left — which costs
 * nothing on a window whose surplus street is already wider than the panel, and
 * costs real board on a narrow one. A fixed fraction of the window, for the same
 * reason BTD's is: a shop that grows with the screen stops being a strip.
 */
export const panelWidth = (winW) =>
  // Clamped to a share of the window as well as to a pixel range. A flat 136px
  // minimum is fine at 900px wide and absurd at 400, where it and the control
  // rail together left less room for the board than the board needs.
  Math.round(Math.max(Math.min(136, winW * 0.26), Math.min(250, winW * 0.17)));

/** Screen pixels the playfield leaves clear on the RIGHT: panel plus a gutter. */
export const panelReserve = (winW) => panelWidth(winW) + 14;

let reserveLeft = 0;
/** main.js owns the panel's real width; the renderer needs it to place the map. */
export const setPanelReserve = (px) => {
  reserveLeft = px;
};

/**
 * How the map sits inside the screen canvas.
 *
 * The playfield is a fixed 8:5, so on any window that is not 8:5 something has to
 * give. Leaving the difference as page background meant a void around the board,
 * which is the one thing BTD6 never does — its terrain runs to every edge. So the
 * buffer is the size of the whole canvas and the playfield is centred inside it,
 * with the surplus paved as the street outside the plaza.
 *
 * The scale is fractional, and that is a deliberate reversal. Snapping it to a
 * whole number keeps every art pixel exactly square, but the step is coarse: on a
 * 1232px window the honest fit was 2.89 and flooring to 2 threw away 31% of the
 * playfield's width and half its area — the plaza ended up a small island in a
 * large paved yard. A fractional zoom makes some art pixels one screen pixel wider
 * than their neighbours, which is a much smaller price than losing half the board.
 */
// How far the lane pokes out to the LEFT of the map, in art pixels. Every map
// starts its path off-board at x = -40 so enemies walk in from outside, and that
// stub is where you first see a wave — measured, it sat under the shop panel on
// all three boards. Memoised: it is a property of the map, not of the frame.
const bleedCache = new Map();
function leftBleed(map) {
  let hit = bleedCache.get(map.id);
  if (hit === undefined) {
    const minX = Math.min(0, ...map.path.map((p) => p[0]));
    hit = Math.ceil(-minX / PX);
    bleedCache.set(map.id, hit);
  }
  return hit;
}

export function layout(screen, map, reserve = reserveLeft) {
  const mw = Math.ceil(map.w / PX);
  const mh = Math.ceil(map.h / PX);
  const bleed = leftBleed(map);
  const cw = screen.canvas.width;
  const ch = screen.canvas.height;
  // Reserve a street. Without this the playfield fills whichever dimension binds
  // — on a 16:9 window `oy` came out 0, so every prop, the bunting and the
  // fountain were invisible and all the surround work only showed on a squarer
  // window. The inset is in ART pixels because that is what the bands are
  // measured in; a percentage would shrink to nothing exactly when the scale is
  // large. It grows with the window so a big monitor gets a street wide enough
  // for bunting and a small one only gives up a verge.
  // The panel is a CONSTRAINT, not a subtraction. Taking its width off the window
  // before scaling made it cost 17% of the board at 1920x1080 — where the plaza
  // is bound by height and leaves 285px of surplus width the panel fits inside
  // with room to spare. So: scale the board to the window, then shrink only if
  // the plaza would not fit beside the shop.
  // The far edge keeps its band too: capping at exactly (cw - reserve) / mw put
  // the plaza flush against the window and cut its kerb off, which is the same
  // "did not finish drawing" read `boardScale` guards against on the other axis.
  const s = Math.min(boardScale(cw, ch, mw, mh), Math.max(MIN_SCALE, (cw - reserve - 10) / (mw + bleed)));
  // The shop sits on the RIGHT, so the plaza is centred in what is left of the
  // window — and the lane's entry stub, which pokes out to the left of the map,
  // has to stay on screen rather than off the near edge.
  const bufW = Math.ceil(cw / s);
  const bufH = Math.ceil(ch / s);
  const right = reserve / s;
  return {
    s,
    mw,
    mh,
    bufW,
    bufH,
    ox: Math.round(Math.max(bleed, (bufW - right - mw) / 2)),
    oy: Math.round((bufH - mh) / 2),
  };
}

// ------------------------------------------------------------- background

const bgCache = new Map();

/** "#rrggbb" -> packed [r, g, b]. Memoised; the palette is a handful of strings. */
const rgbCache = new Map();
function rgb(col) {
  let hit = rgbCache.get(col);
  if (!hit) {
    hit = [
      parseInt(col.slice(1, 3), 16),
      parseInt(col.slice(3, 5), 16),
      parseInt(col.slice(5, 7), 16),
    ];
    rgbCache.set(col, hit);
  }
  return hit;
}

/** Multiply a hex colour toward black. Used to derive the street from the plaza. */
function shade(col, f) {
  const [r, g, b] = rgb(col);
  const h = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function background(map, L) {
  const key = `${map.id}:${L.bufW}x${L.bufH}:${Math.round(reserveLeft)}`;
  let hit = bgCache.get(key);
  if (hit) return hit;
  const { bufW: w, bufH: h, mw, mh, ox, oy } = L;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  // Written straight into an ImageData rather than one fillRect per pixel. The
  // lane is stamped disc by disc along the whole route, which is ~1.6M pixel
  // writes; as fillRect calls that blocked the main thread for seconds on load
  // and the page looked hung. As typed-array writes it is a few milliseconds.
  const img = g.createImageData(w, h);
  const buf = img.data;
  const px = (x, y, col) => {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, gg, b] = rgb(col);
    const i = (y * w + x) * 4;
    buf[i] = r;
    buf[i + 1] = gg;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  // Map-space write: everything about the playfield is authored at 0,0.
  const mpx = (x, y, col) => px(x + ox, y + oy, col);
  // Lane-space write, allowed to cross the kerb but not to trail off into the
  // street. Without the bound the entrance road ended in a stub floating in the
  // middle of open paving, which read as a rendering fault rather than a gateway.
  const mpxL = (x, y, col) => {
    if (x < -3 || y < -3 || x > mw + 2 || y > mh + 2) return;
    px(x + ox, y + oy, col);
  };

  // The street outside the plaza. Same palette, walked down, on a bigger check so
  // it reads as different paving rather than as more of the same floor.
  const streetA = shade(map.groundDark ?? map.groundAlt, 0.62);
  const streetB = shade(map.groundDark ?? map.groundAlt, 0.55);
  const kerb = shade(map.groundDark ?? map.groundAlt, 0.82);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px(x, y, ((x >> 4) + (y >> 4)) % 2 === 0 ? streetA : streetB);

  // Light spilling out of the plaza onto the paving around it, dithered out over
  // 14 pixels. Without it the kerb is a hard value break and the street reads as a
  // different picture rather than the ground the plaza sits in.
  const spill = shade(map.groundDark ?? map.groundAlt, 0.78);
  for (let y = -14; y < mh + 14; y++)
    for (let x = -14; x < mw + 14; x++) {
      if (x >= -2 && x < mw + 2 && y >= -2 && y < mh + 2) continue; // plaza and kerb
      const d = Math.max(-x, x - (mw - 1), -y, y - (mh - 1));
      if (d > 14) continue;
      if (d < 5 || (x + y) % 2 === 0) mpx(x, y, spill);
    }

  // Ground: two tones on a coarse check, darkened toward the edges by dithering.
  // A gradient would band horribly in a four-colour palette; dithering is how
  // pixel art does falloff.
  //
  // Plus a scatter of accent tiles. A pure two-tone check reads as graph paper —
  // real paving is laid by someone who ran out of one batch. Hashed from the tile
  // coordinate rather than a sequential RNG so the choice is stable per tile no
  // matter what order the pixels are visited in.
  // The plaza was carrying four values at once — a hard checker between
  // `ground` and `groundAlt`, plus 11% of tiles randomly lifted or dropped by
  // 7% — and the result read as speckle. The lane and the piñatas have to be the
  // loudest things on a tower defense board; the paving is the quietest.
  const lightTile = shade(map.ground, 1.035);
  const darkTile = shade(map.ground, 0.965);
  // A dedicated step for the checker, so it can be gentle WITHOUT softening the
  // vignette, which wants `groundAlt`'s full contrast to hold the board's edge.
  const checkerAlt = shade(map.ground, 0.945);
  // Memoised: four ground tones in, four grout tones out, and this runs per pixel.
  const groutCache = new Map();
  const groutFor = (col) => {
    let hit = groutCache.get(col);
    if (!hit) {
      hit = shade(col, 0.88);
      groutCache.set(col, hit);
    }
    return hit;
  };
  const h2 = (a, b) => {
    let v = (a * 374761393 + b * 668265263) >>> 0;
    v = ((v ^ (v >>> 13)) * 1274126177) >>> 0;
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const tx = x >> 3;
      const ty = y >> 3;
      const tile = (tx + ty) % 2 === 0;
      let col = tile ? map.ground : checkerAlt;
      const t = h2(tx, ty);
      // Roughly one tile in sixteen, not one in nine, and at half the amplitude:
      // enough that the paving is not mechanical, little enough that your eye
      // does not try to read a pattern into it.
      if (t < 0.032) col = lightTile;
      else if (t < 0.064) col = darkTile;
      // Grout. A two-tone check with no seam between the squares reads as a
      // chessboard, which is what the plaza looked like once the board filled the
      // window; paving reads as paving because you can see where one slab stops.
      // One darker pixel on the top and left edge of each tile, so the seam is a
      // line and not a grid of crosses.
      if ((x & 7) === 0 || (y & 7) === 0) col = groutFor(col);
      // Vignette by dithering a band at the border, measured in pixels. The
      // first version normalised by half the board width, so "edge" exceeded 1
      // in the middle and the darkening swallowed almost the whole board.
      const b = Math.min(x, y, mw - 1 - x, mh - 1 - y);
      if (b < 16 && (x + y) % 2 === 0) col = map.groundAlt;
      if (b < 8) col = map.groundDark ?? map.groundAlt;
      mpx(x, y, col);
    }

  // Kerb: an ink edge with a lit lip, so the plaza reads as raised off the street
  // and the enemies' entrance reads as coming in from outside it.
  for (let x = -2; x < mw + 2; x++) {
    mpx(x, -1, INK);
    mpx(x, -2, kerb);
    mpx(x, mh, INK);
    mpx(x, mh + 1, kerb);
  }
  for (let y = -2; y < mh + 2; y++) {
    mpx(-1, y, INK);
    mpx(-2, y, kerb);
    mpx(mw, y, INK);
    mpx(mw + 1, y, kerb);
  }

  // A floor mosaic in the plaza's emptiest corner.
  //
  // BTD6 dresses the terrain itself, not only the edges, but anything we put
  // *inside* the kerb risks being read as a piñata you could click. A mosaic is
  // the safe version: it is inlaid, flat, has no outline and no shadow, and the
  // road paints straight over it because it is drawn before the lane walks.
  //
  // The path is sampled once here and reused by the lane passes below.
  const pathPts = [];
  for (let i = 0; i < map.path.length - 1; i++) {
    const ax0 = A(map.path[i][0]);
    const ay0 = A(map.path[i][1]);
    const ax1 = A(map.path[i + 1][0]);
    const ay1 = A(map.path[i + 1][1]);
    const len = Math.max(1, Math.hypot(ax1 - ax0, ay1 - ay0));
    for (let t = 0; t <= len; t += 4)
      pathPts.push([ax0 + ((ax1 - ax0) * t) / len, ay0 + ((ay1 - ay0) * t) / len]);
  }
  {
    // Rank every candidate rather than keeping only the winner: one motif in the
    // biggest gap left every other pocket bare. The search already knew where they
    // were, it was throwing the ranking away.
    const cands = [];
    for (let y = 26; y < mh - 26; y += 6)
      for (let x = 26; x < mw - 26; x += 6) {
        let d = Infinity;
        for (const [px2, py2] of pathPts) {
          const dd = (px2 - x) * (px2 - x) + (py2 - y) * (py2 - y);
          if (dd < d) d = dd;
        }
        cands.push([x, y, Math.sqrt(d)]);
      }
    cands.sort((a, b) => b[2] - a[2]);
    // Two at most, and they have to be in genuinely different pockets. Allowing
    // three with a small separation put all of them in the same open strip along
    // the top of the plaza — three identical stars in a row, which read as
    // wallpaper and was worse than the single one it replaced. The follow-up is
    // deliberately smaller so it reads as a companion, not a repeat.
    const picked = [];
    for (const [x, y, room] of cands) {
      if (picked.length >= 2) break;
      if (room < 22) break; // sorted, so nothing after this qualifies either
      const cap = picked.length ? 15 : 28;
      // Bounded by the plaza edge as well as by the lane, so a motif is never
      // sliced flat by the kerb. Clipping alone left a half-mosaic that read as an
      // accident rather than as inlay running under the edge.
      const r = Math.min(cap, Math.round(room) - 6, x - 2, y - 2, mw - 3 - x, mh - 3 - y);
      if (r < 9) continue;
      if (picked.some(([mx, my, mr]) => Math.hypot(mx - x, my - y) < mr + r + 52)) continue;
      picked.push([x, y, r]);
    }
    for (const [cx, cy, r] of picked) {
      // Solid shapes, not dithered ones. The first version filled the star with a
      // two-tone check at 12% contrast and it came out as a stain — at this size
      // a mosaic needs flat areas with clean boundaries, the same rule the sprites
      // follow. Contrast carries it; dithering only blurs an already small shape.
      const field = shade(map.ground, 0.84);
      const rim = shade(map.ground, 0.66);
      // The big one is the centrepiece and gets the star; the smaller pockets get
      // a rosette. Three identical motifs on one floor read as wallpaper.
      const star8 = r >= 17;
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (d > r) continue;
          let col = field;
          if (star8) {
            const lobe = r * (0.3 + 0.42 * Math.pow(Math.abs(Math.cos(Math.atan2(y, x) * 4)), 1.6));
            if (d < lobe) col = map.dash;
          } else if (d < r * 0.34 || (d > r * 0.52 && d < r * 0.68)) {
            col = map.dash;
          }
          if (d > r - 2) col = rim;
          else if (d > r - 4) col = map.dash;
          // Clipped to the plaza. The search only guarantees the *centre* is 26px
          // from the edge and the radius can reach 28, so an unclipped write would
          // paint inlay over the kerb it is supposed to sit inside.
          const mx = cx + x;
          const my = cy + y;
          if (mx >= 0 && my >= 0 && mx < mw && my < mh) mpx(mx, my, col);
        }
    }
  }

  // Lane: stamp a disc at every step along the route, rim first then floor.
  // `dither` paints every other cell, which is how the worn margin either side of
  // the road is drawn — years of feet, not a hard edge.
  const stamp = (cx, cy, r, col, dither) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        if (dither && (cx + x + cy + y) % 2) continue;
        mpxL(cx + x, cy + y, col);
      }
  };
  const walk = (r, col, dither) => {
    for (let i = 0; i < map.path.length - 1; i++) {
      const ax0 = A(map.path[i][0]);
      const ay0 = A(map.path[i][1]);
      const ax1 = A(map.path[i + 1][0]);
      const ay1 = A(map.path[i + 1][1]);
      const len = Math.max(1, Math.hypot(ax1 - ax0, ay1 - ay0));
      for (let t = 0; t <= len; t += 0.6)
        stamp(
          Math.round(ax0 + ((ax1 - ax0) * t) / len),
          Math.round(ay0 + ((ay1 - ay0) * t) / len),
          r,
          col,
          dither,
        );
    }
  };
  walk(LANE_R + 5, shade(map.groundAlt, 0.9), true); // worn margin
  walk(LANE_R + 1, map.laneRim ?? INK);
  walk(LANE_R, map.lane);

  // Worn centreline, dashed.
  let n = 0;
  for (let i = 0; i < map.path.length - 1; i++) {
    const ax0 = A(map.path[i][0]);
    const ay0 = A(map.path[i][1]);
    const ax1 = A(map.path[i + 1][0]);
    const ay1 = A(map.path[i + 1][1]);
    const len = Math.max(1, Math.hypot(ax1 - ax0, ay1 - ay0));
    for (let t = 0; t <= len; t += 1, n++) {
      if (n % 6 > 2) continue;
      mpxL(
        Math.round(ax0 + ((ax1 - ax0) * t) / len),
        Math.round(ay0 + ((ay1 - ay0) * t) / len),
        map.dash,
      );
    }
  }

  g.putImageData(img, 0, 0);

  // Dress the street. Deterministic from the cache key, so the same window always
  // produces the same arrangement and it is baked into the cached canvas — zero
  // per-frame cost. Anything overlapping the plaza or its kerb is rejected rather
  // than clipped, so no prop can be mistaken for something standing in play.
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) seed = ((seed ^ key.charCodeAt(i)) * 16777619) >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // Clustered, not scattered. An even sprinkle at this density read as a warehouse
  // floor — scenery has to clump and leave the paving between it open, and the band
  // right around the plaza has to stay clear so the eye goes to the playfield.
  // Clusters have a *kind*, not just a count. Drawing from one bag of props gave
  // every group the same read — cargo. A plaza's surroundings want landmarks you
  // would walk to, spaced further apart than the crates they sit among.
  // ...and the *bag* is the map's, not one shared bag. Every board dressed itself
  // from the same six clusters, so a graveyard at night was furnished with the
  // market's crates and told you nothing about where you were standing. A map
  // names the clusters it uses and repeats one to weight it.
  const CLUSTER = {
    cargo: { of: ["crate", "crate", "barrel", "pot"], n: 3, spread: 30, low: true },
    pots: { of: ["pot", "bench", "pot"], n: 3, spread: 30, low: true },
    stalls: { of: ["stall", "crate", "pot"], n: 3, spread: 34 },
    fountain: { of: ["fountain"], n: 1, spread: 0 },
    garden: { of: ["tree", "bench", "pot"], n: 3, spread: 32 },
    grove: { of: ["tree", "tree", "crate"], n: 3, spread: 26 },
    graves: { of: ["grave", "grave", "cross"], n: 4, spread: 34, low: true },
    shrine: { of: ["cross", "grave", "pot"], n: 3, spread: 30, low: true },
  };
  const KINDS = (map.props ?? ["cargo", "pots", "stalls", "grove"]).map((n) => CLUSTER[n]);
  const clear = (x, y, m) => !(x > ox - m && x < ox + mw + m && y > oy - m && y < oy + mh + m);
  const place = (x, y, name) => {
    const s = sprite(name);
    shadow(g, x, y + 1, Math.max(3, s.canvas.width >> 1));
    g.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay));
  };

  // Placed *inside* the street bands rather than rejected from the whole canvas.
  // Rejection needed the cluster's `room` of clearance to exist somewhere, and on
  // a wide window the band is only ~26px tall — so every candidate was rejected
  // and the street came out bare. Bands are picked by area, so a thick band gets
  // proportionally more of them, and a thin one only gets props short enough
  // to stand in it.
  const GAP = 5; // kerb breathing room
  const bands = [];
  const band = (bx, by, bw, bh, tag) => {
    if (bw > 24 && bh > 14)
      bands.push({ x: bx, y: by, w: bw, h: bh, thin: bh < 30 || bw < 30, tag });
  };
  // Everything right of this is behind the shop panel. Props scattered there are
  // not hidden, they are CUT: the panel's left edge slices whatever is under it
  // and you see half a fountain stuck to the panel. Dressing stops before it.
  const seen = Math.max(0, w - Math.round(reserveLeft / L.s));
  band(0, 0, seen, oy - GAP, "above");
  band(0, oy + mh + GAP, seen, h - (oy + mh + GAP));
  band(0, 0, ox - GAP, h);
  band(ox + mw + GAP, 0, seen - (ox + mw + GAP), h);
  const area = bands.reduce((s2, b) => s2 + b.w * b.h, 0);
  const clusters = bands.length ? Math.min(22, Math.max(2, Math.round(area / 5200))) : 0;

  for (let c = 0; c < clusters; c++) {
    // Pick a band with probability proportional to its area.
    let pick = rnd() * area;
    let b = bands[0];
    for (const cand of bands) {
      pick -= cand.w * cand.h;
      b = cand;
      if (pick <= 0) break;
    }
    // A thin band cannot hold a stall or a fountain without them leaning over the
    // kerb, so it gets the low props only.
    const low = KINDS.filter((k) => k.low);
    const pool = b.thin && low.length ? low : KINDS;
    const kind = pool[(rnd() * pool.length) | 0];
    const cx = b.x + Math.floor(rnd() * b.w);
    const cy = b.y + Math.floor(rnd() * b.h);
    if (!clear(cx, cy, 6)) continue;
    const spots = [];
    for (let j = 1 + ((rnd() * kind.n) | 0); j > 0; j--) {
      const x = cx + Math.round((rnd() - 0.5) * kind.spread);
      const y = cy + Math.round((rnd() - 0.5) * kind.spread * 0.66);
      if (clear(x, y, 8)) spots.push([x, y, kind.of[(rnd() * kind.of.length) | 0]]);
    }
    // Back to front, so a nearer prop overlaps the one behind it.
    spots.sort((a, b) => a[1] - b[1]);
    for (const [x, y, name] of spots) place(x, y, name);
  }

  // A landmark left to a one-in-six dice roll is a landmark you never see: the
  // fountain was in the pool for eight rounds and never once appeared on screen.
  // Place it deliberately, in the roomiest band, before anything else competes.
  const roomy = bands.filter((b) => !b.thin).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (roomy) {
    const fx0 = roomy.x + Math.floor(roomy.w / 2);
    const fy0 = roomy.y + Math.floor(roomy.h / 2);
    if (clear(fx0, fy0, 10)) place(fx0, fy0, "fountain");
  }

  // Bunting, hung last so it passes in front of whatever it is strung between.
  for (const b of bands) {
    if (b.h < 21 || b.w < 80) continue;
    // The plaza hangs its own two rows of papel picado across its top edge, and
    // street bunting in the band directly above stacked a third and fourth row on
    // top of them. Festive, but it read as an accident of two systems meeting.
    // The band still gets props — it just does not get more bunting.
    if (b.tag === "above" && map.banner !== false) continue;
    for (let k = 0, runs = Math.min(3, Math.floor(b.w / 150)) + 1; k < runs; k++) {
      const span = 70 + Math.floor(rnd() * 90);
      const x0 = b.x + Math.floor(rnd() * Math.max(1, b.w - span));
      const gy = b.y + 17 + Math.floor(rnd() * Math.max(1, b.h - 18));
      if (!clear(x0, gy, 8) || !clear(x0 + span, gy, 8)) continue;
      place(x0, gy, "post");
      place(x0 + span, gy, "post");
      buntingSpan(g, x0, x0 + span, gy - 13, 5);
    }
  }

  hit = c;
  // Keyed by buffer size as well as map, so resizing rebuilds rather than
  // stretching. Bounded because a session only visits a few window sizes.
  if (bgCache.size > 12) bgCache.clear();
  bgCache.set(key, hit);
  return hit;
}

const FLAG = ["#f2789b", "#3fc4c9", "#f2c53d", "#7ec850", "#e8524f", "#a06cd5"];

/**
 * A run of papel picado strung between two points, drawn straight into the cached
 * background. Same flag shape as the plaza's own banners, so the street reads as
 * part of the same fiesta rather than as a service road behind it.
 */
function buntingSpan(g, x0, x1, y, sag) {
  const len = x1 - x0;
  if (len < 24) return;
  const at = (t) => Math.round(y + sag * 4 * t * (1 - t));
  g.fillStyle = INK;
  for (let x = 0; x <= len; x++) g.fillRect(x0 + x, at(x / len), 1, 1);
  let n = 0;
  for (let x = 5; x < len - 4; x += 7, n++) {
    const fy = at(x / len) + 1;
    g.fillStyle = FLAG[n % FLAG.length];
    for (let d = 0; d < 4; d++) {
      const half = 2 - (d >> 1);
      g.fillRect(x0 + x - half, fy + d, half * 2 + 1, 1);
    }
  }
}

function banners(g, map, t) {
  const w = Math.ceil(map.w / PX);
  for (let row = 0; row < 2; row++) {
    const y0 = 3 + row * 5;
    g.fillStyle = INK;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      g.fillRect(x, Math.round(y0 + 12 * u * (1 - u)), 1, 1);
    }
    for (let i = 0; i < 16; i++) {
      const u = (i + 0.5) / 16;
      const bx = Math.round(u * w);
      const by = Math.round(y0 + 12 * u * (1 - u) + (Math.sin(t * 1.4 + i) > 0 ? 0 : 1));
      g.fillStyle = FLAG[(i + row) % FLAG.length];
      for (let d = 0; d < 4; d++) {
        const half = 2 - (d >> 1);
        g.fillRect(bx - half, by + 1 + d, half * 2 + 1, 1);
      }
    }
  }
}

// ------------------------------------------------------------------ actors

const BODY_LIFT = 11; // art pixels from a tower's ground anchor to its body

/**
 * The papel picado's covered ground, drawn as bunting strung round its reach.
 *
 * A field tower has no shot to watch, so without this its range is invisible
 * until you click it — and the whole decision it asks for is "does the lane pass
 * under the paper?". Deliberately not the dashed range ring: that is UI, shown on
 * hover and selection, and a permanent one would read as a selected tower. Flags
 * are terrain dressing that happens to tell you the answer.
 */
function fieldFlags(g, cx, cy, r, t) {
  // A cord first, then flags hung off it. Ten free-standing markers read as
  // litter scattered on the floor; a continuous line with flags on it reads as
  // something strung up on purpose, which is the whole point of the sprite.
  const n = Math.max(48, Math.round(r * 2.2));
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(th) * r);
    const y = Math.round(cy + Math.sin(th) * r * 0.72);
    const dip = Math.sin(i * 1.3) > 0 ? 1 : 0;
    g.fillStyle = INK;
    g.fillRect(x, y + dip, 1, 1);
    if (i % 4) continue;
    const sway = Math.sin(t * 2.2 + i) > 0.2 ? 1 : 0;
    g.fillStyle = INK;
    g.fillRect(x - 1, y + dip + 1, 3, 4);
    g.fillStyle = FLAG[(i / 4) % FLAG.length];
    g.fillRect(x, y + dip + 1 + sway, 1, 2);
  }
}

/**
 * A buff aura, drawn as notes drifting round its edge.
 *
 * Auras were not drawn at all — a coin piñata with Sugar rush bought looked
 * exactly like one without it, and the player had no way to see which piñatas
 * were inside the buff. Notes rather than a dashed ring on purpose: dashed rings
 * are UI here (hover and selection), and a permanent one reads as a stuck
 * selection. An earlier translucent disc was worse still — invisible on a light
 * board, a stain on a dark one.
 */
function auraNotes(g, cx, cy, r, t) {
  const n = Math.max(10, Math.round(r / 4.5));
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + t * 0.35;
    const x = Math.round(cx + Math.cos(th) * r);
    const y = Math.round(cy + Math.sin(th) * r * 0.72) + (Math.sin(t * 3 + i) > 0 ? -1 : 0);
    g.fillStyle = INK;
    g.fillRect(x - 1, y - 2, 4, 5);
    g.fillStyle = "#fff3bd";
    g.fillRect(x, y, 2, 2);
    g.fillRect(x + 1, y - 2, 1, 2);
  }
}

/**
 * One piñata, with its own idle, its own face, and its eyes on the thing it is
 * shooting.
 *
 * The animation used to be this single line, shared by all ten:
 *
 *     const bob = Math.sin(t * 2 + tw.id) > 0.4 ? -1 : 0;
 *
 * — the same 1px hop at the same rate, and no faces anywhere, so a board of
 * piñatas read as a shelf of ornaments. `faces.js` owns who each one is; this
 * function only paints what that module returns, which is why the personalities
 * are unit-testable without a canvas.
 */
function drawTower(g, tw, t, alert = true, mw = 320, mh = 200) {
  const x = A(tw.x);
  const y = A(tw.y);
  const idle = idleOffset(tw.type, { t, id: tw.id });
  const bob = idle.dy;
  const kick = tw.recoil > 0.5 ? 1 : 0;
  if (tw.def.field) fieldFlags(g, x, y - 4, A(tw.def.range), t);
  if (tw.def.auraRate > 0 || tw.def.auraDamage > 0) {
    // ENCORE turns the aura's radius into the whole plaza, and a ring drawn at
    // the OLD radius said the opposite — the one ability whose entire point is
    // "range no longer matters" was drawn as a range. Draw it at the board's
    // reach instead, so what you see is what the sim is doing.
    const boardWide = (tw.def.special ?? []).includes("encore");
    auraNotes(g, x, y - 6, boardWide ? Math.round(Math.max(mw, mh) * 0.62) : A(tw.def.auraRange), t);
  }
  shadow(g, x, y + 1, 6);
  blit(g, sprite("stand"), x, y + 1);
  const bx = x + idle.dx;
  if (tw.def.damage > 0) {
    const sx = bx + Math.round(Math.cos(tw.aim) * 6);
    const sy = y - BODY_LIFT + bob + Math.round(Math.sin(tw.aim) * 6);
    g.fillStyle = INK;
    g.fillRect(sx - 1, sy - 1, 3, 3);
    g.fillStyle = "#fdf0d8";
    g.fillRect(sx, sy, 1, 1);
  }
  // The piñata you are looking at IS its upgrade state — a 2-0-3 candy piñata is
  // a different object on the board from a fresh one, which is the half of BTD's
  // upgrade loop that numbers alone cannot carry.
  blit(g, towerSprite(tw.type, tw.tiers), bx - Math.round(Math.cos(tw.aim) * kick), y - 3 + bob, {
    squash: idle.squash,
  });

  // The face goes on last so nothing in the body can cover it, and it moves with
  // the body: same dx, same dy, and `squash` so the eyes ride a squashing piñata
  // instead of hovering where its head used to be.
  const face = faceMarks(tw.type, {
    t,
    id: tw.id,
    aim: tw.aim,
    recoil: tw.recoil,
    squash: idle.squash,
    alert,
  });
  for (const mk of face) {
    g.fillStyle = mk.c;
    g.fillRect(bx + mk.x, y + bob + mk.y, 1, 1);
  }

  // tier pips: one gold dot per tier on the strongest path
  const best = Math.max(...tw.tiers);
  for (let i = 0; i < best; i++) {
    g.fillStyle = INK;
    g.fillRect(x - 5 + i * 3, y + 3, 2, 3);
    g.fillStyle = i >= 3 ? "#fff3bd" : "#ffd45e";
    g.fillRect(x - 5 + i * 3, y + 3, 2, 2);
  }

  if (tw.recoil > 0.45) {
    const fx0 = x + Math.round(Math.cos(tw.aim) * 8);
    const fy0 = y - BODY_LIFT + Math.round(Math.sin(tw.aim) * 8);
    g.fillStyle = "#ffd45e";
    g.fillRect(fx0 - 2, fy0 - 1, 1, 1);
    g.fillRect(fx0 + 2, fy0 + 1, 1, 1);
    g.fillStyle = "#ffffff";
    g.fillRect(fx0 - 1, fy0, 3, 1);
    g.fillRect(fx0, fy0 - 1, 1, 3);
  }
}

// A stable half-step across the lane, derived from the enemy's id so it never
// changes during its life. Sim position is untouched — this is silhouette
// separation only. A queue of identical figures sitting on the exact centreline
// merges into one shape; one art pixel of stagger is enough to read them apart,
// and is nothing against a 34px click radius.
const LANE_STAGGER = [0, 1, -1, 2, -2, 1, -1, 0];

function drawEnemy(g, e) {
  const def = ENEMIES[e.type];
  // `e.sprite` is a per-enemy override: El Coloso loses his mask on the way down,
  // and a phase you can only read from a health bar is a phase you will miss.
  const s = sprite(e.sprite ?? def.sprite);
  const off = LANE_STAGGER[e.id & 7];
  const x = A(e.x) + Math.round(-(e.uy ?? 0) * off);
  const y = A(e.y) + Math.round((e.ux ?? 0) * off);
  // Hop as a whole-pixel step, not a smooth curve: sub-pixel motion is the other
  // classic way to break the look.
  const lift = Math.sin(e.phase) > 0.35 ? ((def.hop ?? 4) > 5 ? 2 : 1) : 0;
  shadow(g, x, y + 1, Math.max(3, Math.round(4 * (def.scale ?? 1))), lift);
  blit(g, s, x, y - lift, { flip: (e.ux ?? 1) < -0.3 });

  if (e.stunT > 0) {
    g.fillStyle = "#ffd45e";
    for (let i = 0; i < 3; i++) {
      const a = e.phase * 2 + (i * Math.PI * 2) / 3;
      g.fillRect(Math.round(x + Math.cos(a) * 4), Math.round(y - 9 + Math.sin(a) * 2), 1, 1);
    }
  }
  if (e.slowT > 0 && e.slow < 1) {
    g.fillStyle = "#ffbde6";
    g.fillRect(x - 2, y, 5, 1);
  }
  if (e.burnT > 0) {
    g.fillStyle = Math.sin(e.phase * 4) > 0 ? "#ffd45e" : "#ee5a4e";
    g.fillRect(x - 1, y - 8, 1, 2);
    g.fillRect(x + 1, y - 9, 1, 2);
  }
  // Only once it is actually hurt. BTD6 shows no health bars at all — you read a
  // bloon's state from what it is. A crowd where every chipped enemy carried a bar
  // turned into a thicket of little rectangles above the sprites, and a bar at 95%
  // changes no decision. Bosses always show one; that one you are counting down.
  if (e.hp < e.maxHp * (def.boss ? 1 : 0.7)) {
    const w = 6;
    const frac = Math.max(0, e.hp / e.maxHp);
    const by = y - Math.round(s.ay) - 2;
    g.fillStyle = INK;
    g.fillRect(x - w / 2 - 1, by - 1, w + 2, 3);
    g.fillStyle = frac > 0.5 ? "#7cc44e" : frac > 0.22 ? "#ffd45e" : "#ee5a4e";
    g.fillRect(x - w / 2, by, Math.max(1, Math.round(w * frac)), 1);
  }
}

/**
 * A dashed range ring. Each dash is an ink block with a bright pixel on it: a
 * single pale pixel was nearly invisible against the orange plaza, and a marker
 * that has to read over arbitrary terrain must carry its own contrast rather
 * than borrow it from the ground. Dash count scales with radius so a big range
 * does not turn into a sparse dotted line.
 */
function dashRing(g, bx, by, r, col, step, bold = false) {
  const n = Math.max(48, r * 3);
  for (let a = 0; a < n; a++) {
    if (a % step) continue;
    const th = (a / n) * Math.PI * 2;
    const x = Math.round(bx + Math.cos(th) * r);
    const y = Math.round(by + Math.sin(th) * r);
    // Bold inverts the block and its core: the ring reads as its own colour from
    // across the board instead of as ink with a coloured pixel in it. Reserved
    // for the refusal, which is the one ring that has to answer a question.
    g.fillStyle = bold ? col : INK;
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = bold ? INK : col;
    g.fillRect(x, y, 1, 1);
  }
}

/**
 * The refusal mark, stamped on the placement ghost.
 *
 * "You may build here" and "you may not" differed by the hue of one pixel per
 * ring dash - 39 art pixels on the whole screen, at the rim of a circle, for the
 * interaction a player reads more often than any other. The ghost sits under the
 * cursor, so the answer belongs on the ghost. Drawn in two passes so the ink halo
 * never paints over the bright cores; same self-contrast rule as the rings.
 */
function noMark(g, cx, cy, col = "#ff9d8f", r = 5) {
  const arms = [];
  for (let i = -r; i <= r; i++) arms.push([i, i], [i, -i]);
  // Halo first, then the mark ON TOP of it and thick enough to be the thing you
  // see. Drawn the other way round - an ink block with a one-pixel core, which is
  // how the rings are built - the cross came out as ink on a dark sprite and was
  // invisible at gameplay scale even though the pixels were all there.
  g.fillStyle = INK;
  for (const [dx, dy] of arms) g.fillRect(cx + dx - 1, cy + dy - 1, 4, 4);
  g.fillStyle = col;
  for (const [dx, dy] of arms) g.fillRect(cx + dx, cy + dy, 2, 2);
}

const SHOT_COLOUR = {
  candy: ["#ffe0ea", "#ff9ebc"],
  flame: ["#ffd45e", "#ee5a4e"],
  cracker: ["#fff3bd", "#ffd45e"],
  gum: ["#ffeaf8", "#ffbde6"],
  beads: ["#fff3bd", "#d99a1c"],
  spark: ["#ffffff", "#ffd45e"],
  coin: ["#fff3bd", "#d99a1c"],
  ribbon: ["#ffe6f9", "#ff8fd8"],
};

/**
 * What a piñata throws once it has been upgraded.
 *
 * Every shot used to be the same three-by-three blob in a different colour, so a
 * piñata that had bought a fire path and one that had bought a pierce path threw
 * identical pellets — the upgrade existed only in the panel. From tier 2 the
 * shot takes the shape of its path: fire streams, blades tumble, bursts have
 * arms, coins are round and flat.
 */
const SHOT_ART = {
  fire: (g, x, y) => {
    g.fillStyle = "#ee5a4e";
    g.fillRect(x - 2, y - 1, 4, 3);
    g.fillStyle = "#ffd45e";
    g.fillRect(x - 1, y, 3, 1);
    g.fillStyle = "#fff3bd";
    g.fillRect(x, y, 1, 1);
  },
  ember: (g, x, y) => {
    g.fillStyle = "#b85a18";
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = "#f28b3c";
    g.fillRect(x, y - 1, 1, 3);
  },
  sharp: (g, x, y) => {
    // A blade, not a pellet: long on the axis it is travelling.
    g.fillStyle = "#4e5c6e";
    g.fillRect(x - 2, y, 5, 1);
    g.fillStyle = "#ffffff";
    g.fillRect(x - 1, y, 3, 1);
    g.fillRect(x, y - 1, 1, 3);
  },
  spread: (g, x, y) => {
    g.fillStyle = "#d99a1c";
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = "#fff3bd";
    g.fillRect(x - 2, y - 2, 1, 1);
    g.fillRect(x + 2, y - 2, 1, 1);
    g.fillRect(x - 2, y + 2, 1, 1);
    g.fillRect(x + 2, y + 2, 1, 1);
  },
  blast: (g, x, y) => {
    g.fillStyle = INK;
    g.fillRect(x - 2, y - 2, 5, 5);
    g.fillStyle = "#ffd45e";
    g.fillRect(x - 1, y - 1, 3, 3);
  },
  sticky: (g, x, y) => {
    g.fillStyle = "#2f56a3";
    g.fillRect(x - 1, y - 1, 3, 4);
    g.fillStyle = "#a8c8f7";
    g.fillRect(x, y - 1, 1, 2);
  },
  bubble: (g, x, y) => {
    g.fillStyle = "#e084bd";
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = "#ffeaf8";
    g.fillRect(x - 1, y - 1, 1, 1);
  },
  acid: (g, x, y) => {
    g.fillStyle = "#3a8248";
    g.fillRect(x - 1, y - 1, 3, 4);
    g.fillStyle = "#c0eec8";
    g.fillRect(x, y, 1, 1);
  },
  sound: (g, x, y) => {
    g.fillStyle = "#9b8ef0";
    g.fillRect(x - 2, y, 5, 1);
    g.fillRect(x, y - 2, 1, 5);
    g.fillStyle = "#e2ddff";
    g.fillRect(x, y, 1, 1);
  },
  chain: (g, x, y) => {
    g.fillStyle = "#c94fa0";
    g.fillRect(x - 2, y - 1, 5, 2);
    g.fillStyle = "#ffe6f9";
    g.fillRect(x - 1, y - 1, 2, 1);
  },
  music: (g, x, y) => {
    g.fillStyle = "#4a3866";
    g.fillRect(x - 1, y, 2, 2);
    g.fillRect(x + 1, y - 2, 1, 3);
  },
  brass: (g, x, y) => {
    g.fillStyle = "#d99a1c";
    g.fillRect(x - 1, y - 1, 2, 3);
    g.fillStyle = "#fff3bd";
    g.fillRect(x + 1, y - 2, 2, 5);
  },
  light: (g, x, y) => {
    g.fillStyle = "#ffffff";
    g.fillRect(x - 1, y, 3, 1);
    g.fillRect(x, y - 1, 1, 3);
    g.fillStyle = "#ffd45e";
    g.fillRect(x - 2, y - 2, 1, 1);
    g.fillRect(x + 2, y + 2, 1, 1);
  },
  gold: (g, x, y) => {
    g.fillStyle = "#8a5c0c";
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = "#ffd45e";
    g.fillRect(x - 1, y, 3, 1);
    g.fillStyle = "#fff3bd";
    g.fillRect(x, y - 1, 1, 1);
  },
  reach: (g, x, y) => {
    g.fillStyle = "#5fae35";
    g.fillRect(x - 2, y, 5, 1);
    g.fillStyle = "#e2ffc4";
    g.fillRect(x, y - 1, 1, 3);
  },
};

/** Every projectile look, for the coverage test. */
export const SHOT_ART_NAMES = Object.keys(SHOT_ART);

function drawShot(g, s) {
  const x = A(s.x);
  const y = A(s.y);
  const art = s.art && SHOT_ART[s.art];
  if (art) {
    art(g, x, y);
    return;
  }
  const [hot, cool] = SHOT_COLOUR[s.kind] ?? SHOT_COLOUR.candy;
  g.fillStyle = cool;
  g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle = hot;
  g.fillRect(x, y - 1, 1, 3);
  g.fillRect(x - 1, y, 3, 1);
}

const CANDY_COLOUR = ["#ff9ebc", "#63dbe0", "#ffd45e", "#7cc44e", "#ee5a4e"];

function drawCandy(g, c) {
  const x = A(c.x);
  const y = A(c.y - c.z);
  g.fillStyle = INK;
  g.fillRect(x - 1, y - 1, 4, 3);
  g.fillStyle = CANDY_COLOUR[c.hue];
  g.fillRect(x, y, 2, 1);
}

// -------------------------------------------------------------- blindfold

// The veil is rebuilt every frame because the holes follow the towers, so it has
// to be cheap. Per-pixel fillRect over the whole buffer plus a fillRect per hole
// cell was ~110k canvas calls a frame. Now: the dither is built once as a byte
// array, memcpy'd in, and holes are punched by writing alpha directly.
let veil = null;
let veilBase = null;

function drawVeil(g, state, L) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  if (!veil || veil.canvas.width !== w || veil.canvas.height !== h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    veil = c.getContext("2d");
    // Two-tone dither rather than a translucent wash: it stays inside the palette
    // and reads as pixel art rather than a filter laid over the top of it.
    const dark = rgb("#140b1e");
    const lit = rgb("#241636");
    veilBase = new Uint8ClampedArray(w * h * 4);
    for (let y = 0, i = 0; y < h; y++)
      for (let x = 0; x < w; x++, i += 4) {
        const c3 = (x + y) % 2 === 0 ? dark : lit;
        veilBase[i] = c3[0];
        veilBase[i + 1] = c3[1];
        veilBase[i + 2] = c3[2];
        veilBase[i + 3] = 255;
      }
  }
  const img = veil.createImageData(w, h);
  img.data.set(veilBase);
  const buf = img.data;

  const hole = (cx, cy, r) => {
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(h - 1, cy + r);
    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(w - 1, cx + r);
    const rr = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const d = (dx * dx + dy * dy) / rr;
        if (d > 1) continue;
        if (d > 0.62 && (x + y) % 2) continue; // dithered rim
        buf[(y * w + x) * 4 + 3] = 0;
      }
    }
  };
  // Holes are in map space; the veil covers the whole canvas, street included.
  const [bx, by] = state.map.base;
  hole(A(bx) + L.ox, A(by - 30) + L.oy, A(BLINDFOLD.baseSight));
  for (const t of state.towers)
    hole(A(t.x) + L.ox, A(t.y - 20) + L.oy, A(sightRadius(t.def)));

  veil.putImageData(img, 0, 0);
  g.drawImage(veil.canvas, 0, 0);
}

// ------------------------------------------------------------------- scene

/**
 * A tower's reach, drawn at screen resolution.
 *
 * Three parts, and each is doing a job: a very faint fill so the area reads as
 * an area rather than an outline; a soft inner edge so the boundary is not a
 * hard cut on a busy board; and a dashed stroke that rotates slowly, because a
 * moving dash says "this is an overlay" where a static one competes with the
 * art underneath it.
 */
function rangeRing(screen, cx, cy, r, { strong = false, t = 0 } = {}) {
  if (!(r > 1)) return;
  screen.save();

  const fill = screen.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  fill.addColorStop(0, strong ? "rgba(255,255,255,0.055)" : "rgba(255,233,184,0.03)");
  fill.addColorStop(1, strong ? "rgba(255,255,255,0.14)" : "rgba(255,233,184,0.07)");
  screen.beginPath();
  screen.arc(cx, cy, r, 0, Math.PI * 2);
  screen.fillStyle = fill;
  screen.fill();

  // A dark liner under the bright dash, so the ring holds on a pale plaza and
  // on a dark cemetery without being tuned per map.
  screen.beginPath();
  screen.arc(cx, cy, r, 0, Math.PI * 2);
  screen.lineWidth = strong ? 5 : 4;
  screen.strokeStyle = "rgba(26,14,30,0.45)";
  screen.stroke();

  const dash = Math.max(7, r * 0.12);
  screen.setLineDash([dash, dash * 0.75]);
  screen.lineDashOffset = -t * (strong ? 16 : 9);
  screen.lineWidth = strong ? 2.5 : 2;
  screen.strokeStyle = strong ? "rgba(255,255,255,0.92)" : "rgba(255,226,150,0.72)";
  screen.lineCap = "round";
  screen.beginPath();
  screen.arc(cx, cy, r, 0, Math.PI * 2);
  screen.stroke();

  screen.restore();
}

/**
 * Where a piñata looks when nothing is in range.
 *
 * Two sines at unrelated rates, so no two piñatas fall into step with each
 * other and none of them repeats on a beat you can count. Held inside a
 * half-cone either side of a resting facing that is stable per piñata.
 */
function idleAim(t, id) {
  const rest = ((id * 2.399) % 2) - 1 > 0 ? -0.35 : Math.PI + 0.35;
  const wander = Math.sin(t * 0.47 + id * 1.7) * 0.34 + Math.sin(t * 0.19 + id * 0.6) * 0.16;
  return rest + wander;
}

export function drawWorld(screen, state, view) {
  const map = state.map;
  const L = layout(screen, map);
  const g = buffer(L.bufW, L.bufH);
  const seen = (x, y) => canSee(state, x, y);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(background(map, L), 0, 0);

  // Everything below is authored in map space. Clipping to the playfield is what
  // lets enemies spawn off the left edge at x=-40 and walk out from behind the
  // kerb instead of appearing in the middle of visible street.
  g.save();
  g.beginPath();
  g.rect(L.ox, L.oy, L.mw, L.mh);
  g.clip();
  g.translate(L.ox, L.oy);

  for (const c of state.candy) if (c.z <= 0 && seen(c.x, c.y)) drawCandy(g, c);

  {
    const dmg = 1 - state.lives / state.maxLives;
    const tier = dmg > 0.66 ? 2 : dmg > 0.33 ? 1 : 0;
    const s = custom(`base${tier}`, () => giantPinata(dmg));
    const [bx, by] = map.base;
    shadow(g, A(bx), A(by) + 1, 10);
    blit(g, s, A(bx), A(by) + (Math.sin(state.time * 1.1) > 0.5 ? -1 : 0));
  }

  // Sorted by y, then by lane progress. The tie-break is the point: on a leg that
  // runs horizontally every enemy shares a y, so sorting by y alone left the order
  // to whatever the array happened to hold — a bunched group re-stacked itself
  // every frame and read as one flickering mass. Leader last means the front of
  // the queue overlaps the ones behind it, consistently, in every frame.
  const actors = [
    ...state.towers.map((t) => ({ y: t.y, d: 0, kind: "t", o: t })),
    ...state.enemies
      .filter((e) => seen(e.x, e.y))
      .map((e) => ({ y: e.y, d: e.dist, kind: "e", o: e })),
  ].sort((a, b) => a.y - b.y || a.d - b.d);
  // Actors are NOT drawn here any more. They used to be blitted into this
  // low-res buffer as 24px sprites and upscaled with the terrain, which capped
  // how much a piñata could ever say about itself — ten of them read as coloured
  // blobs with eyes. They are drawn after the buffer is blitted, at screen
  // resolution, from `figures.js`. The sort order computed above still governs
  // them, so a luchador in front of a piñata still overlaps it.

  for (const s of state.shots) if (seen(s.x, s.y)) drawShot(g, s);
  for (const c of state.candy) if (c.z > 0 && seen(c.x, c.y)) drawCandy(g, c);

  fx.drawPixels(g, 1 / PX);

  if (view.ghost) {
    const { x, y, ok, range, sprite: sp } = view.ghost;
    const ax = A(x);
    const ay = A(y);
    dashRing(g, ax, ay, A(range), ok ? "#a8f078" : "#ff9d8f", 3, !ok);
    blit(g, sprite("stand"), ax, ay + 1);
    blit(g, sprite(sp), ax, ay - 3);
    if (!ok) noMark(g, ax, ay - 9);
  }
  // The hover and selected range rings USED to be drawn here, into the art
  // buffer. They are now drawn at screen resolution further down — see
  // `rangeRing` — because a dash plotted at PX scale becomes a ~9px block once
  // the buffer is upscaled, and a circle made of blocks reads as litter on the
  // tiles rather than as "this is how far it reaches".

  if (map.banner !== false) banners(g, map, state.time);
  g.restore();

  if (state.blindfold) drawVeil(g, state, L);

  // Upscale, nearest neighbour. The scale is fractional so pixel widths alternate
  // by one — see `layout` for why that is the better trade.
  screen.imageSmoothingEnabled = false;
  screen.save();
  fx.applyShake(screen);
  screen.clearRect(0, 0, screen.canvas.width, screen.canvas.height);
  screen.drawImage(g.canvas, 0, 0, L.bufW * L.s, L.bufH * L.s);

  // The actors, at full resolution. Map space -> screen space is the same
  // transform the buffer just used, so nothing has to be re-derived: an art
  // pixel is `L.s` screen pixels and the plaza starts at (L.ox, L.oy).
  const toX = (wx) => (L.ox + wx / PX) * L.s;
  const toY = (wy) => (L.oy + wy / PX) * L.s;
  const alert = state.enemies.length > 0;

  // Rings first: they belong under the figures, so a piñata is never veiled by
  // its own reach. `toX(range)` would be wrong — a range is a length, not a
  // position — so it scales by the same factor without the origin.
  const toR = (wr) => (wr / PX) * L.s;
  if (view.hover && view.hover !== view.selected) {
    rangeRing(screen, toX(view.hover.x), toY(view.hover.y), toR(reach(view.hover.def)), { t: state.time });
  }
  if (view.selected) {
    rangeRing(screen, toX(view.selected.x), toY(view.selected.y), toR(reach(view.selected.def)), {
      strong: true, t: state.time,
    });
  }

  for (const a of actors) {
    if (a.kind === "t") {
      const tw = a.o;
      const idle = idleOffset(tw.type, { t: state.time, id: tw.id });
      drawFigure(screen, tw.type, {
        x: toX(tw.x) + idle.dx * L.s * 0.4,
        y: toY(tw.y) + idle.dy * L.s * 0.4,
        // Matches the footprint the sprites had, so placement and the click
        // radius still line up with what you see.
        h: 30 * L.s * idle.squash,
        t: state.time,
        // The idle aim used to sweep the FULL +/-pi, which walked the weapon
        // all the way around the body and mirrored the whole sprite every time
        // it crossed — the "rotating left to right". A piñata at rest should
        // look about, not spin. It now sways around its OWN resting facing,
        // which `phase(id)` makes different for every piñata on the board, and
        // the amplitude is small enough that `cos(aim)` never changes sign, so
        // the sprite cannot flip.
        aim: alert ? tw.aim : idleAim(state.time, tw.id),
        blink: (state.time + tw.id * 0.7) % 3.2 < 0.11,
        // The sim already tracks recoil for the muzzle flash; the figure uses it
        // to wind the weapon arm back and kick it forward, so a piñata visibly
        // WORKS rather than sitting still while pellets appear near it.
        fire: tw.recoil ?? 0,
      });
    } else {
      const e = a.o;
      if (!seen(e.x, e.y)) continue;
      const def = ENEMIES[e.type];
      // Juice: a hop stretches, a stun squashes. Both about the feet.
      const hop = Math.sin(e.phase) > 0.35 ? 1.06 : 1;
      drawFoe(screen, e.sprite ?? def.sprite ?? e.type, {
        x: toX(e.x),
        y: toY(e.y),
        h: 26 * L.s * (def.scale ?? 1) * hop,
        t: state.time + e.id,
        facing: (e.ux ?? 1) < -0.3 ? -1 : 1,
        squash: e.stunT > 0 ? 0.86 : hop,
        flash: Math.max(0, (e.hitT ?? 0) * 3),
      });
    }
  }
  // Floating text stays at screen resolution — 4px-tall glyphs are unreadable.
  // Same offset and scale the actors got, so it lands on them.
  screen.translate(L.ox * L.s, L.oy * L.s);
  screen.scale(L.s / PX, L.s / PX);
  fx.drawText(screen);
  screen.restore();
}
