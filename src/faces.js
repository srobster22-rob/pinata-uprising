import { INK } from "./art.js";

/**
 * Who each piñata IS, as opposed to what it shoots.
 *
 * Ten piñatas shared one line of animation — `sin(t * 2 + id) > 0.4 ? -1 : 0` —
 * so every one of them did the same 1px hop at the same speed, and none of them
 * had a face. They read as ornaments with stats attached. A tower you are asked
 * to love, name and upgrade for twenty minutes has to look back at you.
 *
 * Everything here is ART ONLY. Nothing in this file is read by `sim.js`, so a
 * personality can never move a balance number — which is also why it lives in
 * its own module rather than in `data.js` next to damage and cost.
 *
 * The two exports are pure: they take a time and an id and return offsets and
 * a list of pixels. No canvas, no globals, no randomness — so the faces are
 * unit-testable, and a blink or a pupil cannot drift off the body without a
 * test noticing.
 */

const WHITE = "#fffdf5";
const BLUSH = "#ff8fb0";
const SPARK = "#ffe89a";

/**
 * `eyeY` is art pixels above the tower's ground anchor and `faceX` across it,
 * both measured against each sprite's own silhouette rather than guessed — the
 * piñatas are neither the same height nor centred on the same axis. Measured by
 * scanning each sprite's ink for its top, its widest row and that row's centre:
 * the chili is fattest at the TOP (it hangs stalk-up), the sparkler's widest
 * point is 15px up a 30px sprite because the rest is the star, and the ribbon
 * dancer's mass sits 3px to the right of its ground anchor — which is exactly
 * how far off its body the face was floating.
 *
 * Re-measured when every body was redrawn. A face anchor is a fact about ONE
 * silhouette; redrawing the piñatas without redoing these numbers would have left
 * ten faces hanging in the air beside their bodies.
 */
export const MOODS = {
  // Eager, uncomplicated, delighted to be here. The one you meet first.
  candy: {
    idle: "hop", rate: 2.4, eyeY: -16, gap: 3, pupil: 1,
    eye: "round", brow: null, mouth: "smile", mouthDy: 4, blush: true, blink: 3.1,
  },
  // Permanently furious. Vibrates in place like a held sneeze.
  chili: {
    idle: "shiver", rate: 3.1, eyeY: -21, gap: 2, pupil: 1,
    eye: "round", brow: "angry", mouth: "grimace", mouthDy: 3, blink: 4.7,
  },
  // Half asleep, and slower than everything around it. Sags, then rebounds.
  gum: {
    idle: "squish", rate: 1.3, eyeY: -14, gap: 3, pupil: 1,
    eye: "half", brow: null, mouth: "smirk", mouthDy: 4, blink: 2.2,
  },
  // Cannot hold still. The rattle IS the character.
  maraca: {
    idle: "rattle", rate: 4.2, eyeY: -17, gap: 3, pupil: 1,
    eye: "round", brow: null, mouth: "grin", mouthDy: 4, blink: 3.7,
  },
  // Paper in a breeze. Serene, eyes mostly shut, opens them when it works.
  papel: {
    idle: "flutter", rate: 1.1, eyeY: -16, gap: 3, pupil: 1, rim: true,
    eye: "half", brow: null, mouth: "smile", mouthDy: 3, blink: 2.8,
  },
  // Knows exactly what it is full of and is not at peace about it.
  firecracker: {
    idle: "twitch", rate: 1.6, eyeY: -16, gap: 3, pupil: 2, rim: true,
    eye: "round", brow: "worried", mouth: "o", mouthDy: 4, blink: 1.4,
  },
  // Graceful, theatrical, aware of being watched.
  ribbon: {
    idle: "sway", rate: 1.7, eyeY: -20, gap: 2, pupil: 1,
    eye: "lash", brow: null, mouth: "smirk", mouthDy: 4, blink: 3.3,
  },
  // Three of them, in 3/4 time, singing. All three faces, or it is one piñata
  // with a moustache instead of a band.
  mariachi: {
    idle: "waltz", rate: 2.0, eyeY: -11, gap: 2, pupil: 1, trio: [-8, 0, 8],
    eye: "round", brow: null, mouth: "o", mouthDy: 3, tache: true, blink: 4.1,
  },
  // Overcaffeinated. Buzzes at a frequency the others cannot hear.
  sparkler: {
    idle: "buzz", rate: 6.5, eyeY: -12, gap: 3, pupil: 1, rim: true,
    eye: "star", brow: null, mouth: "grin", mouthDy: 4, blink: 5.3,
  },
  // Rich, and unbothered. Rocks back on its heels.
  coin: {
    idle: "rock", rate: 1.2, eyeY: -13, gap: 3, pupil: 1,
    eye: "half", brow: null, mouth: "smirk", mouthDy: 4, blink: 4.4,
  },
};

const DEFAULT = MOODS.candy;
const mood = (type) => MOODS[type] ?? DEFAULT;

/** A per-piñata phase so twenty of them on a board never march in lockstep. */
const phase = (id) => (id * 2.399963) % (Math.PI * 2);

/**
 * The idle: whole-pixel offsets and a squash factor, per character.
 *
 * Whole pixels on purpose. Sub-pixel drift is the classic way to make pixel art
 * look like a rendered sprite sheet instead of pixel art, and the enemies
 * already hop in whole steps — the towers were the ones cheating.
 */
export function idleOffset(type, opts = {}) {
  const o = rawIdle(type, opts);
  // Rounded once, at the exit, rather than in ten branches that can each
  // forget — which is how the first version shipped a `smooth:false` that
  // silently returned fractions.
  return opts.smooth === false
    ? { dx: Math.round(o.dx), dy: Math.round(o.dy), squash: o.squash }
    : o;
}

function rawIdle(type, { t = 0, id = 0 } = {}) {
  const m = mood(type);
  const p = t * m.rate + phase(id);
  const s = Math.sin(p);
  // `smooth` exists because these numbers used to be WHOLE PIXELS: the piñatas
  // were 24px sprites blitted into a 320x200 buffer, and a fractional offset
  // there is a lie. They are drawn at screen resolution now, so the rounding
  // that used to be honest became a visible step — the stutter. Callers still
  // working in the buffer can ask for the old integers back.
  switch (m.idle) {
    case "hop": {
      // A real hop: up fast, hang, down slow. `sin > 0.35` gave a two-state
      // pop, which is a flicker rather than a jump.
      const up = Math.max(0, s);
      return { dx: 0, dy: -2.2 * up * up, squash: 1 + up * 0.09 - (1 - up) * 0.02 };
    }
    case "shiver":
      // Fast, tiny, and never still — a hum rather than a wobble.
      return { dx: Math.sin(p * 5) * 0.9, dy: Math.sin(p * 7.3) * 0.3, squash: 1 };
    case "squish": {
      return { dx: 0, dy: -Math.max(0, s) * 0.5, squash: 1 + s * 0.07 };
    }
    case "rattle":
      return { dx: Math.sin(p * 3) * 1.1, dy: Math.max(0, Math.sin(p * 6)) * -1.1, squash: 1 + Math.cos(p * 6) * 0.03 };
    case "flutter":
      return { dx: s * 1.5, dy: -Math.abs(Math.sin(p * 1.5)) * 1.1, squash: 1 + Math.cos(p * 2) * 0.02 };
    case "twitch": {
      // Still, still, still, JOLT. A tense character is one that is NOT moving
      // most of the time — a constant jitter reads as excited, not nervous. The
      // jolt now has a fall-off instead of switching on and off.
      const beat = (p / (Math.PI * 2)) % 1;
      const k = beat > 0.86 ? 1 - (beat - 0.86) / 0.14 : 0;
      return { dx: Math.sin(beat * 90) * 1.3 * k, dy: -1.2 * k, squash: 1 + 0.06 * k };
    }
    case "sway":
      return { dx: s * 1.5, dy: Math.cos(p * 2) * 0.25, squash: 1 + Math.cos(p) * 0.025 };
    case "waltz": {
      // ONE-two-three: the lift lands on the first beat of every three, and now
      // decays across the beat instead of snapping.
      const beat = (p / (Math.PI * 2 / 3)) % 3;
      const lift = beat < 1 ? Math.sin(beat * Math.PI) : 0;
      return { dx: s * 1.4, dy: -lift * 1.4, squash: 1 + lift * 0.04 };
    }
    case "buzz":
      return { dx: Math.sin(p * 2.1) * 0.7, dy: Math.sin(p * 3.7) * 0.7, squash: 1 };
    case "rock":
      return { dx: s * 1.8, dy: -Math.abs(s) * 0.4, squash: 1 + Math.abs(s) * 0.02 };
    default:
      return { dx: 0, dy: 0, squash: 1 };
  }
}

/** Blinking, derived from time so it needs no per-tower state. */
function blinking(m, t, id) {
  if (!m.blink) return false;
  const cycle = (t + phase(id) * 0.9) % m.blink;
  return cycle < 0.11;
}

function browCells(kind, cx, s, ey, out) {
  if (!kind) return;
  // The pixel nearer the middle of the face is the one that moves: down for a
  // scowl, up for a worry. Same two cells either way, so the brow never grows.
  const inner = s < 0 ? cx : cx - 1;
  const outer = s < 0 ? cx - 1 : cx;
  out.push({ x: inner, y: kind === "angry" ? ey - 2 : ey - 3, c: INK });
  out.push({ x: outer, y: kind === "angry" ? ey - 3 : ey - 2, c: INK });
}

function mouthCells(kind, cx, my, out, open) {
  if (open) {
    // Every character opens the same startled mouth when it fires. A shared
    // reaction is fine; a shared idle is what made them interchangeable.
    out.push({ x: cx, y: my, c: INK }, { x: cx, y: my + 1, c: INK });
    out.push({ x: cx - 1, y: my, c: INK }, { x: cx + 1, y: my, c: INK });
    return;
  }
  switch (kind) {
    case "smile":
      out.push({ x: cx - 1, y: my, c: INK }, { x: cx, y: my + 1, c: INK }, { x: cx + 1, y: my, c: INK });
      break;
    case "grin":
      out.push(
        { x: cx - 2, y: my, c: INK }, { x: cx - 1, y: my + 1, c: INK },
        { x: cx, y: my + 1, c: INK }, { x: cx + 1, y: my, c: INK },
        { x: cx - 1, y: my, c: WHITE }, { x: cx, y: my, c: WHITE },
      );
      break;
    case "grimace":
      out.push(
        { x: cx - 1, y: my, c: INK }, { x: cx, y: my, c: WHITE }, { x: cx + 1, y: my, c: INK },
        { x: cx - 1, y: my + 1, c: INK }, { x: cx + 1, y: my + 1, c: INK },
      );
      break;
    case "o":
      out.push({ x: cx, y: my, c: INK }, { x: cx, y: my + 1, c: INK });
      break;
    case "smirk":
      out.push({ x: cx, y: my, c: INK }, { x: cx + 1, y: my + 1, c: INK });
      break;
    default:
      break;
  }
}

/**
 * The face, as pixels to paint over the body.
 *
 * Coordinates are art pixels relative to the tower's GROUND anchor, the same
 * origin `drawTower` already uses, so the caller adds x and y and nothing else.
 * `squash` scales the height exactly the way `blit` scales the sprite — both
 * about the ground anchor — so a squashing piñata's eyes squash with it instead
 * of floating off its head.
 */
export function faceMarks(type, { t = 0, id = 0, aim = 0, recoil = 0, squash = 1, alert = true, still = false } = {}) {
  const m = mood(type);
  const out = [];
  const ey = Math.round(m.eyeY * squash);
  const firing = recoil > 0.45;

  // Where the eyes point. With something to shoot they follow the gun; with the
  // board empty they wander, which is the difference between a turret and a
  // creature waiting for something to happen.
  const dir = alert ? aim : Math.sin(t * 0.6 + phase(id)) * Math.PI;
  const look = firing ? 0 : (m.pupil ?? 1);
  const px = Math.cos(dir) * look;
  const py = Math.sin(dir) * look;

  // A shop portrait must never be caught mid-blink: it does not animate, so a
  // blink there is permanent and the card just looks like it has no eyes.
  const shut = (!still && blinking(m, t, id)) || (m.eye === "closed" && !firing);

  for (const base of m.trio ?? [0]) {
    const side = base + (m.faceX ?? 0);
    for (const s of [-1, 1]) {
      const cx = side + s * m.gap;
      if (shut) {
        // A closed eye is a line, not an absence — leaving the pixels out makes
        // the piñata look like it lost its face for two frames.
        out.push({ x: cx - 1, y: ey, c: INK }, { x: cx, y: ey, c: INK });
        continue;
      }
      const lidded = m.eye === "half" && !firing;
      // A heavy lid is a dark bar ACROSS a full eye, not a half-height eye. The
      // half-height version left the gum piñata with two 2x1 slivers that read
      // as highlights on the body rather than as something looking at you.
      out.push({ x: cx - 1, y: ey, c: WHITE }, { x: cx, y: ey, c: WHITE });
      out.push({ x: cx - 1, y: ey - 1, c: lidded ? INK : WHITE }, { x: cx, y: ey - 1, c: lidded ? INK : WHITE });
      // The pupil takes the quadrant of the eye it is looking into.
      const qx = cx + (px > 0.3 ? 0 : -1);
      const qy = lidded ? ey : ey + (py > 0.3 ? 0 : -1);
      out.push({ x: qx, y: qy, c: INK });
      if (m.rim) out.push({ x: cx - 1, y: ey + 1, c: INK }, { x: cx, y: ey + 1, c: INK });
      if (m.eye === "lash") out.push({ x: cx + s, y: ey - 1, c: INK });
      if (m.eye === "star" && !firing) out.push({ x: cx + (s < 0 ? -1 : 1), y: ey - 2, c: SPARK });
      if (m.brow) browCells(m.brow, cx, s, ey, out);
    }
    const my = ey + (m.mouthDy ?? 4);
    if (m.tache) {
      out.push({ x: side - 1, y: my - 1, c: INK }, { x: side + 1, y: my - 1, c: INK });
    }
    mouthCells(m.mouth, side, my, out, firing);
    if (m.blush && !firing) {
      out.push({ x: side - m.gap - 2, y: ey + 2, c: BLUSH }, { x: side + m.gap + 1, y: ey + 2, c: BLUSH });
    }
  }
  return out;
}
