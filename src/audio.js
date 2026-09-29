// Synthesized SFX. No audio files — everything is WebAudio primitives, so
// the game stays a single folder with no assets to load.

let ac = null;
let master = null;
let muted = false;

function ctx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
  }
  if (ac.state === "suspended") ac.resume();
  return ac;
}

export function unlock() {
  ctx();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

function env(node, t, a, d, peak = 1) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  node.connect(g);
  g.connect(master);
  return g;
}

function tone(freq, { type = "square", a = 0.004, d = 0.12, peak = 0.3, slide = 0, at = 0 } = {}) {
  const c = ctx();
  if (muted) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + a + d);
  env(o, t, a, d, peak);
  o.start(t);
  o.stop(t + a + d + 0.02);
}

function noise(dur, { peak = 0.3, lp = 2200, hp = 200, at = 0 } = {}) {
  const c = ctx();
  if (muted) return;
  const t = c.currentTime + at;
  // A context with no output device reports sampleRate 0, and createBuffer then
  // throws on a zero-frame request. Sound going missing is a nuisance; the throw
  // propagates out of the event handler and kills the frame loop, so bail early.
  const n = Math.floor(c.sampleRate * dur);
  if (n < 1) return;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const h = c.createBiquadFilter();
  h.type = "highpass";
  h.frequency.value = hp;
  src.connect(f);
  f.connect(h);
  env(h, t, 0.002, dur, peak);
  src.start(t);
}

export const sfx = {
  // Hard candy cracking against paper. Scales with the hit.
  hit(weight = 1) {
    noise(0.06 + weight * 0.03, { peak: 0.1 + weight * 0.07, lp: 3600, hp: 700 });
    tone(420 + Math.random() * 160, { type: "triangle", d: 0.05, peak: 0.06 });
  },
  deflect() {
    tone(880, { type: "sine", d: 0.09, peak: 0.12, slide: 400 });
    noise(0.05, { peak: 0.05, lp: 5000, hp: 1800 });
  },
  // The mask comes off.
  mask() {
    tone(660, { type: "square", d: 0.1, peak: 0.14, slide: 520 });
    tone(990, { type: "sine", d: 0.14, peak: 0.1, slide: 700, at: 0.03 });
    noise(0.1, { peak: 0.09, lp: 4200, hp: 900 });
  },
  burst() {
    noise(0.3, { peak: 0.32, lp: 1400, hp: 90 });
    tone(120, { type: "sawtooth", d: 0.22, peak: 0.18, slide: -70 });
  },
  // Rises with the tier, so a tier-4 purchase sounds like an event.
  upgrade(tier = 1) {
    const root = 392 * Math.pow(1.09, tier);
    [0, 4, 7, 12].forEach((semi, i) =>
      tone(root * Math.pow(2, semi / 12), {
        type: "triangle",
        d: 0.22 + tier * 0.03,
        peak: 0.1 + tier * 0.02,
        at: i * 0.055,
      }),
    );
    if (tier >= 3) noise(0.35, { peak: 0.1, lp: 3000, hp: 400, at: 0.18 });
  },
  // A top-tier ability firing. These were silent, which made the most expensive
  // purchases in the game the least noticeable ones — the piñata just happened
  // to kill something slightly sooner and you had no idea why.

  // EXECUTE: a clean snap upward. Short, bright, and over before the mask sound
  // that follows it, so the two read as cause and effect rather than as noise.
  execute() {
    tone(1240, { type: "sine", d: 0.07, peak: 0.13, slide: 620 });
    tone(1860, { type: "triangle", d: 0.05, peak: 0.07, at: 0.03 });
  },

  // SHOCKWAVE: felt rather than heard. Almost all low noise, because a bright
  // tone here would compete with the hit it arrives on top of.
  quake() {
    noise(0.26, { peak: 0.24, lp: 520, hp: 40 });
    tone(74, { type: "sawtooth", d: 0.28, peak: 0.2, slide: -26 });
    tone(148, { type: "square", d: 0.12, peak: 0.07, at: 0.02 });
  },

  // A dry wooden rattle, not a tone — it has to read as percussion.
  stun() {
    for (let i = 0; i < 4; i++)
      noise(0.035, { peak: 0.11 - i * 0.02, lp: 6000, hp: 1800, at: i * 0.035 });
    tone(180, { type: "square", d: 0.07, peak: 0.05 });
  },
  place() {
    tone(320, { type: "triangle", d: 0.1, peak: 0.16, slide: 220 });
    tone(540, { type: "sine", d: 0.14, peak: 0.12, at: 0.06 });
  },
  coin() {
    tone(1180, { type: "sine", d: 0.07, peak: 0.07 });
    tone(1560, { type: "sine", d: 0.09, peak: 0.06, at: 0.04 });
  },
  leak() {
    tone(150, { type: "sawtooth", d: 0.3, peak: 0.22, slide: -80 });
    noise(0.24, { peak: 0.16, lp: 900, hp: 60 });
  },
  waveStart() {
    [523, 659, 784].forEach((f, i) => tone(f, { type: "square", d: 0.16, peak: 0.13, at: i * 0.07 }));
  },
  waveEnd() {
    [784, 988, 1175].forEach((f, i) => tone(f, { type: "triangle", d: 0.2, peak: 0.12, at: i * 0.08 }));
  },
  // Mariachi trumpet fanfare — the champion is arriving.
  boss() {
    [392, 392, 523, 659].forEach((f, i) =>
      tone(f, { type: "sawtooth", d: 0.3, peak: 0.16, at: i * 0.16 }),
    );
    noise(0.5, { peak: 0.08, lp: 900, hp: 100, at: 0.5 });
  },
  tag() {
    [659, 587, 523].forEach((f, i) => tone(f, { type: "square", d: 0.22, peak: 0.15, at: i * 0.1 }));
  },
  over() {
    [392, 349, 294, 233].forEach((f, i) =>
      tone(f, { type: "triangle", d: 0.42, peak: 0.2, at: i * 0.18 }),
    );
  },
  won() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone(f, { type: "square", d: 0.3, peak: 0.16, at: i * 0.11 }),
    );
  },
};
