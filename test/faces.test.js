import test from "node:test";
import assert from "node:assert/strict";
import { MOODS, idleOffset, faceMarks } from "../src/faces.js";
import { TOWER_ORDER, TOWERS } from "../src/data.js";

// Ten piñatas shared one line of animation and had no faces at all. These tests
// exist so a roster that grows an eleventh piñata cannot quietly ship it as an
// ornament, and so the measured face positions cannot drift off the bodies they
// were measured against.

test("every piñata in the roster has a personality", () => {
  for (const id of TOWER_ORDER) {
    assert.ok(MOODS[id], `${id} has no mood — it would fall back to the candy piñata's`);
    const m = MOODS[id];
    assert.equal(typeof m.idle, "string");
    assert.ok(m.rate > 0, `${id} needs an idle rate`);
    assert.ok(m.eyeY < 0, `${id}'s eyes must be ABOVE the ground anchor`);
  }
});

// The point of the exercise. If two piñatas share an idle style AND a rate they
// move as one creature in two colours, which is what this replaced.
test("no two piñatas share an idle", () => {
  const seen = new Map();
  for (const id of TOWER_ORDER) {
    const key = `${MOODS[id].idle}@${MOODS[id].rate}`;
    assert.ok(!seen.has(key), `${id} moves exactly like ${seen.get(key)}`);
    seen.set(key, id);
  }
  // Styles, not just rates: five characters doing "hop" at five speeds is still
  // five hopping piñatas.
  const styles = new Set(TOWER_ORDER.map((id) => MOODS[id].idle));
  assert.ok(styles.size >= 8, `only ${styles.size} distinct idle styles for ${TOWER_ORDER.length} piñatas`);
});

test("faces differ from each other, not just bodies", () => {
  const sigs = TOWER_ORDER.map((id) => {
    const m = MOODS[id];
    return [m.eye, m.mouth, m.brow ?? "-", m.blush ? "blush" : "-", m.trio ? "trio" : "-"].join("/");
  });
  assert.ok(new Set(sigs).size >= 7, `only ${new Set(sigs).size} distinct faces: ${sigs.join(" ")}`);
});

// Both exports are pure and deterministic, which is the whole reason the
// personalities can be tested at all.
test("idle and face are pure functions of time and id", () => {
  for (const id of TOWER_ORDER) {
    const a = idleOffset(id, { t: 3.25, id: 7 });
    const b = idleOffset(id, { t: 3.25, id: 7 });
    assert.deepEqual(a, b);
    const fa = faceMarks(id, { t: 3.25, id: 7, aim: 1.1 });
    const fb = faceMarks(id, { t: 3.25, id: 7, aim: 1.1 });
    assert.deepEqual(fa, fb);
  }
});

// The invariant this test used to assert — whole pixels only — was correct
// while the piñatas were 24px sprites blitted into a 320x200 buffer, where a
// fractional offset is a lie. They are drawn at SCREEN resolution now, and the
// rounding that used to be honest became a visible step: the reported symptom
// was "the animations stutter". So the rule is inverted, deliberately.
test("idle motion is continuous, not stepped", () => {
  for (const id of TOWER_ORDER) {
    let steps = 0, samples = 0;
    let prev = idleOffset(id, { t: 0, id: 3 });
    for (let t = 0.02; t < 8; t += 0.02) {
      const o = idleOffset(id, { t, id: 3 });
      // A 20ms tick should never move a resting piñata a whole pixel and a
      // half — that is a jump, and a jump is what reads as a stutter. The
      // twitch mood is allowed its jolt, which is the point of it.
      const d = Math.hypot(o.dx - prev.dx, o.dy - prev.dy);
      if (d > 1.5) steps++;
      samples++;
      prev = o;
      assert.ok(Math.abs(o.dx) <= 2.5 && Math.abs(o.dy) <= 2.5, `${id} lurches at t=${t}`);
      assert.ok(o.squash >= 0.9 && o.squash <= 1.12, `${id} squash ${o.squash} is a deformation, not a breath`);
      assert.ok(Number.isFinite(o.dx) && Number.isFinite(o.dy), `${id} produced a non-number`);
    }
    assert.ok(steps / samples < 0.02, `${id} jumps on ${((steps / samples) * 100).toFixed(1)}% of ticks`);
  }
});

// The old integer behaviour is still reachable, because anything still drawing
// into the low-resolution buffer genuinely does want whole pixels.
test("smooth:false still gives whole pixels, for the buffer path", () => {
  for (const id of TOWER_ORDER)
    for (let t = 0; t < 4; t += 0.1) {
      const o = idleOffset(id, { t, id: 3, smooth: false });
      assert.equal(o.dx, Math.trunc(o.dx), `${id} dx fractional at t=${t}`);
      assert.equal(o.dy, Math.trunc(o.dy), `${id} dy fractional at t=${t}`);
    }
});

// "The animations look the same" was the other half of the report. Ten moods
// exist; this asserts they actually produce ten different motions rather than
// ten phase offsets of one.
test("no two piñatas idle the same way", () => {
  const sigs = TOWER_ORDER.map((id) => {
    const out = [];
    for (let t = 0; t < 4; t += 0.08) {
      const o = idleOffset(id, { t, id: 0 });
      out.push(`${o.dx.toFixed(2)},${o.dy.toFixed(2)},${o.squash.toFixed(3)}`);
    }
    return out.join("|");
  });
  assert.equal(new Set(sigs).size, TOWER_ORDER.length, "two piñatas share an idle animation");
});

// Measured against each sprite's real silhouette. A face outside this envelope
// is floating next to its piñata rather than on it.
test("every mark lands on the body, never in the air", () => {
  for (const id of TOWER_ORDER)
    for (const t of [0, 0.4, 1.3, 2.9, 5.5])
      for (const aim of [0, 1.6, 3.1, 4.7]) {
        for (const mk of faceMarks(id, { t, id: 2, aim, recoil: 0 })) {
          assert.ok(mk.y < 0, `${id} face mark below the ground line at t=${t}`);
          assert.ok(mk.y > -26, `${id} face mark above the tallest sprite at t=${t}`);
          assert.ok(Math.abs(mk.x) <= 11, `${id} face mark ${mk.x} is off the widest sprite`);
          assert.match(mk.c, /^#[0-9a-f]{6}$/i, `${id} mark has no colour`);
        }
      }
});

test("a piñata always has eyes, even mid-blink", () => {
  for (const id of TOWER_ORDER) {
    for (let t = 0; t < 6; t += 0.02) {
      const marks = faceMarks(id, { t, id: 5, aim: 0.5 });
      const pairs = MOODS[id].trio ? MOODS[id].trio.length : 1;
      // A blink is a LINE, not an absence: two cells per eye at the very least.
      assert.ok(marks.length >= pairs * 4, `${id} loses its face at t=${t.toFixed(2)}`);
    }
  }
});

// Blinking has to actually happen, or the "always has eyes" test above is
// passing on a piñata that simply never blinks.
test("piñatas that blink, blink", () => {
  const blinkers = TOWER_ORDER.filter((id) => MOODS[id].blink > 0);
  assert.ok(blinkers.length >= 8, "most of the roster should blink");
  for (const id of blinkers) {
    let widest = 0;
    let narrowest = 1e9;
    for (let t = 0; t < MOODS[id].blink * 2; t += 0.01) {
      const n = faceMarks(id, { t, id: 1, aim: 0 }).length;
      widest = Math.max(widest, n);
      narrowest = Math.min(narrowest, n);
    }
    assert.ok(narrowest < widest, `${id} never closes its eyes`);
  }
});

// The eyes follow the gun. This is the single strongest "alive" signal in the
// whole pass, so it gets a test rather than a comment.
test("pupils track what the piñata is aiming at", () => {
  const pupilFor = (aim) => {
    const marks = faceMarks("candy", { t: 1.0, id: 0, aim, alert: true });
    // The pupils are the ink cells sitting inside the eye rows. The window is
    // DERIVED from the mood, not hardcoded: these numbers move whenever a body
    // is redrawn, and a literal here just fails the next time one is.
    const ey = MOODS.candy.eyeY;
    return marks.filter((m) => m.c.toLowerCase() !== "#fffdf5" && m.y <= ey && m.y >= ey - 1).map((m) => m.x);
  };
  const right = pupilFor(0);
  const left = pupilFor(Math.PI);
  assert.notDeepEqual(right, left, "the pupils do not move with the aim");
  assert.ok(Math.max(...right) > Math.max(...left), "looking right should put the pupils further right");
});

test("a firing piñata reacts", () => {
  for (const id of TOWER_ORDER) {
    const calm = faceMarks(id, { t: 1.0, id: 0, aim: 0.5, recoil: 0 });
    const shot = faceMarks(id, { t: 1.0, id: 0, aim: 0.5, recoil: 1 });
    assert.notDeepEqual(calm, shot, `${id} has the same face firing as idling`);
  }
});

// With nothing on the board there is nothing to aim at, and eyes frozen on a
// stale angle read as broken rather than as watchful.
test("with the board empty the eyes wander instead of freezing", () => {
  const held = new Set();
  for (let t = 0; t < 12; t += 0.25)
    held.add(JSON.stringify(faceMarks("coin", { t, id: 0, aim: 0.5, alert: false }).map((m) => [m.x, m.y])));
  assert.ok(held.size > 2, "the idle gaze never moves");
});

// A shop card does not animate, so a face caught mid-blink there is permanent.
test("a still portrait never blinks", () => {
  for (const id of TOWER_ORDER) {
    let min = 1e9;
    for (let t = 0; t < 8; t += 0.01)
      min = Math.min(min, faceMarks(id, { t, id: 0, aim: 0.9, still: true }).length);
    const closedByNature = MOODS[id].eye === "closed";
    if (!closedByNature) {
      const open = faceMarks(id, { t: 0, id: 0, aim: 0.9, still: true }).length;
      assert.equal(min, open, `${id}'s card can be caught mid-blink`);
    }
  }
});

// faces.js is art. If it ever reads a balance number, a personality tweak could
// move the grid — which is exactly what the module comment promises it cannot.
test("personality cannot touch balance", () => {
  for (const id of TOWER_ORDER) {
    const keys = Object.keys(MOODS[id]);
    for (const k of ["damage", "range", "cost", "rate", "cool", "pierce"])
      if (k !== "rate") assert.ok(!keys.includes(k), `${id}'s mood carries a balance field: ${k}`);
    assert.ok(TOWERS[id], `${id} is a real piñata`);
  }
});
