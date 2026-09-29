import test from "node:test";
import assert from "node:assert/strict";
import { TOWER_ART, TOWER_ART_NAMES, THEMES, THEME_NAMES } from "../src/art.js";
import { PATHS } from "../src/upgrades.js";
import { TOWER_ORDER } from "../src/data.js";

// The upgrade marks are drawn generically at each body's declared anchors, so an
// anchor that is wrong or missing does not throw — it silently puts a crown in
// mid-air or a sombrero brim half outside the sprite. These tests are the only
// thing standing between a redrawn body and that.

// The padding `towerSprite` adds around every body so the marks have somewhere
// to go. Kept in step with art.js by the bounds test below.
const PAD_TOP = 7;
const PAD_SIDE = 5;

test("every piñata in the roster has a body", () => {
  for (const id of TOWER_ORDER)
    assert.ok(TOWER_ART[id], `${id} has no body — it would fall back to a name lookup`);
  assert.equal(TOWER_ART_NAMES.length, TOWER_ORDER.length);
});

test("every body declares the anchors the upgrade marks hang off", () => {
  for (const id of TOWER_ORDER) {
    const a = TOWER_ART[id];
    for (const k of ["w", "h", "ax", "ay", "top", "belt", "sideY", "halfW", "ramp"])
      assert.ok(a[k] !== undefined, `${id} is missing anchor ${k}`);
    assert.equal(typeof a.build, "function", `${id} has no body to draw`);
    assert.ok(a.top < a.belt, `${id}: the crown must sit above the belt`);
    assert.ok(a.belt < a.ay, `${id}: the belt must sit above the ground`);
    assert.ok(a.halfW >= 4, `${id}: too narrow for a band to read`);
  }
});

// The bug this catches: marks are drawn into a padded grid, and if the padding
// is smaller than the widest or tallest mark, the crown loses its top and the
// glyphs lose their ends. `put` clips silently, so nothing else would notice.
test("the theme glyphs and crown fit inside the padding", () => {
  for (const id of TOWER_ORDER) {
    const a = TOWER_ART[id];
    const top = a.top + PAD_TOP;
    const ax = a.ax + PAD_SIDE;
    const width = a.w + PAD_SIDE * 2;
    // The tier-4 crown rings the body at halfW + 3 and sits 2 above `top`;
    // glyphs stand up to 2px proud of their own point.
    const reach = a.halfW + 3 + 2;
    assert.ok(top - 3 >= 0, `${id}: the crown ring would be clipped off the top`);
    assert.ok(ax - reach >= 0, `${id}: theme glyphs run off the left`);
    assert.ok(ax + reach <= width - 1, `${id}: theme glyphs run off the right`);
    // The tier-3 band spans the body plus a pixel each side.
    assert.ok(ax - a.halfW - 1 >= 0 && ax + a.halfW + 1 <= width - 1, `${id}: the band runs off the edge`);
  }
});

// Silhouette is the whole job at this size. Ten bodies that are all the same
// box are ten piñatas you tell apart by hue, which is what this replaced.
test("the ten bodies are not the same shape", () => {
  const shapes = TOWER_ORDER.map((id) => `${TOWER_ART[id].w}x${TOWER_ART[id].h}`);
  assert.ok(new Set(shapes).size >= 7, `only ${new Set(shapes).size} distinct sprite shapes: ${shapes}`);
});

// A piñata is not a coloured ball: it needs the crepe and the cord. Every body
// is checked for calling the kit rather than just filling a disc.
test("every body is built from the piñata kit", () => {
  for (const id of TOWER_ORDER) {
    const src = TOWER_ART[id].build.toString();
    const kit = ["fringe(", "ruffle(", "starBody(", "cord("].filter((k) => src.includes(k));
    assert.ok(kit.length > 0, `${id} uses none of the piñata kit — it is just a shape`);
  }
});

// Upgrades that look the same are upgrades that feel like numbers. Every path
// declares what it IS, and the theme table has to know that name.
test("every upgrade path names a visual theme that exists", () => {
  for (const [id, paths] of Object.entries(PATHS)) {
    assert.equal(paths.length, 3, `${id} should have three paths`);
    for (const path of paths) {
      assert.ok(path.art, `${id} / "${path.name}" has no visual theme`);
      assert.ok(THEMES[path.art], `${id} / "${path.name}" uses unknown theme ${path.art}`);
    }
  }
});

// A theme that shares a tint AND a glyph with another is not a theme, it is a
// duplicate — the fire path and the damage path would look identical again.
test("themes are actually distinct from one another", () => {
  const sigs = THEME_NAMES.map((n) => `${THEMES[n].tint}|${THEMES[n].glyph.name || THEMES[n].glyph.toString().length}`);
  const dupes = sigs.filter((v, i) => sigs.indexOf(v) !== i);
  assert.ok(new Set(sigs).size >= THEME_NAMES.length - 3, `themes collapse into ${new Set(sigs).size} looks: ${dupes}`);
  for (const n of THEME_NAMES) {
    assert.match(THEMES[n].tint, /^#[0-9a-f]{6}$/i, `${n} has no tint`);
    assert.equal(typeof THEMES[n].glyph, "function", `${n} has no glyph`);
    assert.ok(Array.isArray(THEMES[n].ramp) && THEMES[n].ramp.length === 4, `${n} has no ramp`);
  }
});

// The point of the tint: a piñata that bought a fire path is RED. Not a red
// sticker on a pink piñata — the body itself.
test("the fire themes tint warm and the cold ones tint cold", () => {
  const warmth = (hex) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
  for (const n of ["fire", "ember", "blast"])
    assert.ok(warmth(THEMES[n].tint) > 40, `${n} does not tint warm`);
  for (const n of ["sticky", "swift"])
    assert.ok(warmth(THEMES[n].tint) < 0, `${n} does not tint cold`);
});

// The defect this catches, measured before it was fixed: 48 of the 490 legal
// builds in the game rasterised to pixels identical to another build of the
// same piñata. All of them were in three piñatas — the maraca and the coin each
// handed two of their own paths the SAME theme, and `spread` shared both its
// ramp and its glyph with `blast`, which is the pair the firecracker owns.
//
// That breaks the one promise the upgrade system makes: that spending candy
// changes what the thing looks like, so you can read a board and know what is
// on it. A stats-only difference is invisible in a fight.
test("no two paths of the same piñata share an art theme", () => {
  for (const id of TOWER_ORDER) {
    const themes = PATHS[id].map((p) => p.art);
    for (const t of themes) assert.ok(THEMES[t], `${id}: unknown theme "${t}"`);
    assert.equal(
      new Set(themes).size,
      themes.length,
      `${id}: two of its paths share a theme (${themes.join(", ")}), so their builds look identical`,
    );
  }
});

test("no two themes draw the same mark", () => {
  // Sharing a name is not the only way to collide: `spread` and `blast` had
  // different names, different tints and still drew the same pixels, because
  // the tint is not what the mark is made of — the ramp and the glyph are.
  const seen = new Map();
  for (const [name, th] of Object.entries(THEMES)) {
    const key = `${th.glyph.name || th.glyph.toString().length}|${th.ramp.join(",")}`;
    assert.ok(
      !seen.has(key),
      `themes "${name}" and "${seen.get(key)}" draw the same mark — same glyph on the same ramp`,
    );
    seen.set(key, name);
  }
});
