// Feedback layer. The target is Bloons' density: something satisfying
// happens 20+ times a second, and nothing on screen is silent.

import { INK } from "./art.js";

const parts = [];
const floats = [];
const rings = [];
let shakeAmt = 0;
let shakeT = 0;

const rand = (a, b) => a + Math.random() * (b - a);

export function burst(x, y, { n = 8, colors = ["#f2c53d"], spd = 150, size = 3.5, grav = 420, life = 0.5, shape = "chip" } = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(spd * 0.4, spd);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - spd * 0.3,
      r: rand(size * 0.6, size),
      c: colors[(Math.random() * colors.length) | 0],
      life: rand(life * 0.6, life),
      max: life,
      grav,
      spin: rand(-12, 12),
      rot: rand(0, 6.28),
      shape,
    });
  }
}

export function ring(x, y, r, color = "#ffe08a") {
  rings.push({ x, y, r: r * 0.35, max: r, life: 0.32, t: 0.32, c: color });
}

export function floatText(x, y, text, color = "#fdfbf5", size = 16) {
  floats.push({ x, y, text, color, size, life: 0.85, t: 0.85 });
}

/** Scaled to the event: 2px on a splash hit, 12px on a boss going down. */
export function shake(amount, secs = 0.3) {
  if (amount > shakeAmt) {
    shakeAmt = amount;
    shakeT = secs;
  }
}

export function update(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt;
    f.y -= 42 * dt;
    if (f.life <= 0) floats.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    r.r += (r.max - r.r) * Math.min(1, dt * 14);
    if (r.life <= 0) rings.splice(i, 1);
  }
  if (shakeT > 0) {
    shakeT -= dt;
    if (shakeT <= 0) shakeAmt = 0;
  }
}

export function applyShake(g) {
  if (shakeAmt <= 0) return;
  const k = shakeAmt * Math.min(1, shakeT * 4);
  g.translate(rand(-k, k), rand(-k, k));
}

// Particles and rings are drawn into the low-res buffer as whole pixels, so
// `k` converts screen units to art pixels. Floating text is NOT — 4px-tall
// glyphs are unreadable, so it draws at screen resolution after the upscale.
export function drawPixels(g, k) {
  for (const r of rings) {
    const cx = Math.round(r.x * k);
    const cy = Math.round(r.y * k);
    const rad = Math.max(1, Math.round(r.r * k));
    g.fillStyle = r.c;
    // hollow pixel circle, every other cell skipped so it reads as a shockwave
    for (let a = 0; a < 48; a++) {
      if (a % 2) continue;
      const th = (a / 48) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(th) * rad), Math.round(cy + Math.sin(th) * rad), 1, 1);
    }
  }
  for (const p of parts) {
    const size = Math.max(1, Math.round(p.r * k * 1.6));
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x * k), Math.round(p.y * k), size, size);
  }
}

/** Floating damage/label text, at screen resolution. */
export function drawText(g) {
  for (const f of floats) {
    const a = Math.min(1, f.life / 0.4);
    g.save();
    g.globalAlpha = a;
    g.font = `500 ${f.size}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = "center";
    g.lineJoin = "round";
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.strokeText(f.text, f.x, f.y);
    g.fillStyle = f.color;
    g.fillText(f.text, f.x, f.y);
    g.restore();
  }
}

export function clear() {
  parts.length = 0;
  floats.length = 0;
  rings.length = 0;
  shakeAmt = 0;
  shakeT = 0;
}
