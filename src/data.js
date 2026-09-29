// Balance data. Pure — no DOM, imported by both the sim and its tests.

export const INK = "#22384a";

// --------------------------------------------------------------- the map
//
// Fiesta village courtyard. The lane is authored as waypoints; the giant
// ceremonial piñata sits at the end and is the player's life total.

export const MAPS = {
  plaza: {
    id: "plaza",
    name: "Plaza del Sol",
    props: ["fountain","garden","grove","pots","cargo"],
    tag: "Open courtyard. Room to build.",
    difficulty: "Gentle",
    w: 960,
    h: 600,
    // Palettes carry a light and a shade end for both ground and lane, so the
    // board is lit from the upper left like every sprite standing on it.
    ground: "#f0b055",
    groundAlt: "#d8933a",
    groundDark: "#b3711f",
    lane: "#fdf0d8",
    laneRim: "#7d4a14",
    dash: "#e0c49c",
    banner: true,
    // Serpentine that uses the whole plaza and terminates *at* the great
    // piñata, so a leak is something you watch arrive rather than infer.
    // The top leg sits low enough that a 1.6-scale campeón's mask still clears
    // the banners — tall enemies were being decapitated by the canvas edge.
    path: [
      [-40, 158], [252, 158], [252, 296], [96, 296], [96, 478],
      [424, 478], [424, 236], [612, 236], [612, 404], [758, 404],
      [758, 318], [846, 318],
    ],
    base: [852, 318],
  },

  // Tight switchbacks: a short lane with many corners, so range matters more
  // than raw damage and one well-placed piñata can cover three legs at once.
  //
  // This is the board where edge falloff cannot separate a wide build from a
  // coverage-optimised one: its parallel legs sit 130-150px apart against a
  // typical range of 118, so one piñata covers two legs by construction and both
  // of them are close, not near the rim. Residual gap here is +58 lives% where
  // the other two boards sit at +12 and +5.
  //
  // Widening the legs to ~190px was tried and made it WORSE — gap +67, because
  // spacing them out added converging turns elsewhere and lengthened the lane
  // from 3280 to 3990px (a longer lane is more time to shoot, i.e. easier). The
  // coverage ratio of the best 7 spots over a spread 7 rose 1.48x -> 1.62x. If
  // this board is revisited, the target to watch is that ratio, not leg spacing.
  mercado: {
    id: "mercado",
    name: "El Mercado",
    props: ["stalls","stalls","cargo","cargo","pots"],
    tag: "Tight switchbacks. Range beats power.",
    difficulty: "Tricky",
    // 1.16, not 1.22: respacing the legs took the lane from 3280px to 3115, and
    // difficulty here is traversal TIME, not length.
    speedMul: 1.16,
    w: 960,
    h: 600,
    ground: "#4fb08d",
    groundAlt: "#38876a",
    groundDark: "#256349",
    lane: "#f7efd8",
    laneRim: "#17513a",
    dash: "#d4c19a",
    banner: true,
    // Legs spaced so no two of them merge. The switchbacks used to bottom out
    // 50px above the return leg against a 68px road, and the lower jog sat 50px
    // under it: measured with `node test/lanes.mjs`, both pairs drew as a single
    // wide road with a strip of ground between them too thin to build on.
    path: [
      [-40, 110], [180, 110], [180, 230], [330, 230], [330, 110],
      [480, 110], [480, 230], [630, 230], [630, 110], [790, 110],
      [790, 350], [140, 350], [140, 470], [700, 470], [700, 560],
      [860, 560],
    ],
    base: [866, 560],
  },

  // Long straights at night: sniper country, but the lane is far from most of
  // the buildable ground so cheap short-range piñatas struggle.
  // A spiral, and the only board whose base sits in the middle of it. Every other
  // map runs the lane past you and ends at an edge; this one wraps the same
  // ground four times, so a piñata near the centre covers passes that are far
  // apart in *time* rather than in space — and the great piñata is the thing you
  // are standing around rather than the thing at the far end.
  caracol: {
    id: "caracol",
    name: "El Caracol",
    props: ["cargo","pots","grove","stalls"],
    tag: "A spiral in. The middle is worth four passes — if you can reach them.",
    difficulty: "Winding",
    // Normalised by traversal TIME, not by length: at 4810px and 0.92 an enemy
    // spent 64% longer under the guns than on Cementerio, and every profile
    // finished Máscara with 70-98% lives. Two wraps at 3500px and 1.08 puts the
    // walk at 3241 units against Cementerio's 3193.
    speedMul: 1.17,
    w: 960,
    h: 600,
    ground: "#d9834a",
    groundAlt: "#bd6836",
    groundDark: "#8f4a24",
    lane: "#ffeccd",
    laneRim: "#6b3018",
    dash: "#d9b183",
    banner: true,
    path: [
      [-40, 90], [870, 90], [870, 510], [110, 510], [110, 230], [700, 230],
      [700, 400], [330, 400],
    ],
    base: [326, 400],
  },

  cementerio: {
    id: "cementerio",
    name: "Cementerio",
    props: ["graves","graves","shrine","grove","pots"],
    tag: "Long straights after dark. Reach is everything.",
    difficulty: "Harsh",
    speedMul: 1.16,
    w: 960,
    h: 600,
    ground: "#5b4779",
    groundAlt: "#42335c",
    groundDark: "#2c2140",
    lane: "#ddd2ee",
    laneRim: "#1b1029",
    dash: "#a897c4",
    banner: false,
    // The hook at the end used to tuck back up under the long 398 leg with 54px
    // between them — one road, on a board whose whole identity is long clean
    // straights. It ends on the bottom leg now instead of doubling back.
    path: [
      [-40, 120], [880, 120], [880, 258], [70, 258], [70, 398],
      [880, 398], [880, 536], [286, 536],
    ],
    base: [278, 536],
  },
};

export const MAP_ORDER = ["plaza", "mercado", "caracol", "cementerio"];

// Kept for anything that still wants the default board.
export const MAP = MAPS.plaza;

// ------------------------------------------------------------- damage types
//
// Five counter rules, each guessable from the costume:
//   sharp   — punches paper, useless on clay
//   blunt   — cracks clay, absorbed by paper
//   splash  — area, ignores the cape
//   burn    — damage over time, reflected by foil
//   fast    — high projectile speed, beats the cape's deflect

export const DMG = { SHARP: "sharp", BLUNT: "blunt", SPLASH: "splash", BURN: "burn" };

// ------------------------------------------------------------------ towers
//
// Every tower is a piñata. What is inside it is what it shoots, so the art
// telegraphs the mechanic with no tutorial.

export const TOWERS = {
  candy: {
    id: "candy",
    name: "Candy piñata",
    sprite: "candy",
    cost: 200,
    range: 118,
    damage: 5,
    rate: 0.42,
    dmgType: DMG.SHARP,
    speed: 560,
    pierce: 2,
    shot: "candy",
    blurb: "Sprays hard candy. Cheap, quick, shreds papier-mâché.",
  },
  chili: {
    id: "chili",
    name: "Chili piñata",
    sprite: "chili",
    cost: 340,
    range: 104,
    damage: 4,
    rate: 0.7,
    dmgType: DMG.BURN,
    speed: 420,
    pierce: 1,
    burn: { dps: 9, secs: 3 },
    shot: "flame",
    blurb: "Sets them alight. Damage keeps ticking after the hit.",
  },
  firecracker: {
    id: "firecracker",
    name: "Firecracker piñata",
    sprite: "firecracker",
    cost: 480,
    range: 132,
    damage: 16,
    rate: 1.15,
    dmgType: DMG.SPLASH,
    speed: 330,
    pierce: 1,
    splash: 54,
    shot: "cracker",
    blurb: "Bursts on impact. Blows through capes and packed groups.",
  },
  gum: {
    id: "gum",
    name: "Gum piñata",
    sprite: "gum",
    cost: 340,
    range: 106,
    damage: 3,
    rate: 0.6,
    dmgType: DMG.BLUNT,
    speed: 400,
    pierce: 2,
    slow: 0.68,
    slowSecs: 1.15,
    shot: "gum",
    blurb: "Gums them up so everything else gets more shots in. The toro charges straight through.",
  },
  maraca: {
    id: "maraca",
    name: "Maraca piñata",
    sprite: "maraca",
    cost: 390,
    range: 96,
    damage: 7,
    rate: 1.5,
    dmgType: DMG.BLUNT,
    speed: 480,
    pierce: 3,
    stun: 0.5,
    shot: "beads",
    blurb: "The rattle stops them dead for a moment. Heavies shake it off faster.",
  },
  sparkler: {
    id: "sparkler",
    name: "Sparkler piñata",
    sprite: "sparkler",
    cost: 560,
    range: 250,
    damage: 60,
    rate: 1.9,
    dmgType: DMG.SHARP,
    speed: 900,
    pierce: 1,
    shot: "spark",
    blurb: "Enormous reach and a heavy single hit. Too slow to hold a lane alone.",
  },
  ribbon: {
    id: "ribbon",
    name: "Ribbon dancer piñata",
    sprite: "ribbon",
    // Priced against a repeat candy buy, which is what a wide build spends the
    // slot on otherwise. At 9 damage / 0.85s it measured 8 lives% WORSE than the
    // 200-candy piñata it replaced across every board — candy-tier crowd damage
    // for two and a half times the price.
    cost: 500,
    range: 112,
    damage: 13,
    rate: 0.8,
    dmgType: DMG.SHARP,
    // Under 500, so a cape waves it off and a colgado swings clear of it. The
    // crowd tool is deliberately the one that cannot answer a dodger: it buys
    // its area damage with a counter that beats it outright.
    speed: 470,
    pierce: 1,
    chain: 2,
    chainRange: 78,
    chainFalloff: 0.72,
    shot: "ribbon",
    blurb: "Whips a streamer from one luchador to the next. Best where they bunch; a cape waves it off.",
  },
  papel: {
    id: "papel",
    name: "Papel picado piñata",
    sprite: "papel",
    // Priced against a repeat gum buy, which is what the slot goes on otherwise.
    // At 5 damage every 0.5s it measured worse than that gum everywhere — a slow
    // is a force multiplier on the whole defence, so a field has to be worth real
    // damage, not just reliable damage.
    cost: 460,
    range: 92,
    // `field`: no projectile at all. `damage` is what one snip takes off
    // everything standing under the paper and `rate` is the gap between snips,
    // so every damage and rate upgrade works on it unchanged.
    field: true,
    damage: 11,
    rate: 0.45,
    // 1 means "walks at full speed". The Tangled path multiplies this down, and a
    // multiplicative mod cannot lift a value off zero — with no base the whole
    // path bought nothing, which the test caught before it shipped.
    slow: 1,
    slowSecs: 0.4,
    dmgType: DMG.SHARP,
    // Nothing to aim, nothing to see coming: the cape and the swing are both
    // rules about *projectiles*, so this is the one piñata neither can answer.
    // Short reach and no burst is what it pays for that.
    speed: 0,
    pierce: 0,
    shot: "none",
    blurb: "Strung paper cuts whatever walks under it. No shot to dodge — but it barely reaches.",
  },
  mariachi: {
    id: "mariachi",
    name: "Mariachi trio piñata",
    sprite: "mariachi",
    cost: 540,
    range: 0,
    // Pure support: no damage at all, so the playtest bot classifies it by the
    // mechanic it owns rather than mistaking a token hit for a carry.
    damage: 0,
    rate: 999,
    dmgType: DMG.BLUNT,
    speed: 1,
    pierce: 0,
    auraRate: 0.12,
    auraRange: 132,
    shot: "none",
    blurb: "Plays for the neighbours: every piñata in earshot swings faster. Hits nothing itself.",
  },
  coin: {
    id: "coin",
    name: "Coin piñata",
    sprite: "coin",
    cost: 420,
    range: 90,
    damage: 0,
    rate: 999,
    dmgType: DMG.BLUNT,
    speed: 1,
    pierce: 0,
    income: 130,
    shot: "coin",
    blurb: "Pays out every wave. Buy early, it compounds.",
  },
};

export const TOWER_ORDER = ["candy", "chili", "gum", "maraca", "papel", "firecracker", "ribbon", "mariachi", "sparkler", "coin"];

// ----------------------------------------------------------------- enemies
//
// Tier reads off the mask colour; the accessory says what it does.
//   cape    — deflects slow projectiles (needs fast shots or splash)
//   charge  — immune to slows, accelerates down the lane
//   heavy   — resists sharp, cracks to blunt and splash
//   tag     — on defeat, brings in a partner

export const ENEMIES = {
  nino: {
    id: "nino",
    name: "Niño",
    sprite: "nino",
    hp: 12,
    speed: 62,
    bounty: 9,
    leak: 1,
    scale: 0.74,
    hop: 5,
  },
  matador: {
    id: "matador",
    name: "Matador",
    sprite: "matador",
    hp: 34,
    speed: 54,
    bounty: 18,
    leak: 2,
    scale: 0.86,
    hop: 4,
    cape: 0.6, // fraction of slow projectiles waved off
  },
  tecnico: {
    id: "tecnico",
    name: "Técnico",
    sprite: "tecnico",
    hp: 58,
    speed: 88,
    bounty: 26,
    leak: 2,
    scale: 0.94,
    hop: 8,
  },
  rudo: {
    id: "rudo",
    name: "Rudo",
    sprite: "rudo",
    hp: 140,
    speed: 44,
    bounty: 44,
    leak: 4,
    scale: 1.12,
    hop: 3,
    resist: { [DMG.SHARP]: 0.35 },
    stunResist: 0.5,
  },
  // Foil-masked: fire reflects straight off. The counter to a pure chili build.
  plateado: {
    id: "plateado",
    name: "Plateado",
    sprite: "plateado",
    hp: 130,
    speed: 58,
    bounty: 44,
    leak: 3,
    scale: 1.0,
    hop: 5,
    resist: { [DMG.BURN]: 0.85 },
  },
  // Slung from a rope like the piñatas they came to smash. Swings across the
  // lane, so a slow projectile arrives where it used to be. Needs speed.
  colgado: {
    id: "colgado",
    name: "Colgado",
    sprite: "colgado",
    hp: 84,
    speed: 76,
    bounty: 38,
    leak: 3,
    scale: 0.96,
    hop: 2,
    sway: 26,
    swayRate: 3.4,
  },
  toro: {
    id: "toro",
    name: "Toro",
    sprite: "toro",
    hp: 210,
    speed: 66,
    bounty: 60,
    leak: 5,
    scale: 1.06,
    hop: 6,
    noSlow: true,
    stunResist: 0.6,
    charge: 1.9, // top speed multiplier, ramps over the lane
  },
  campeon: {
    id: "campeon",
    name: "El Campeón",
    sprite: "campeon",
    hp: 900,
    speed: 34,
    bounty: 340,
    leak: 20,
    scale: 1.42,
    hop: 2,
    resist: { [DMG.SHARP]: 0.4 },
    stunResist: 0.8,
    boss: true,
    tag: ["rudo", "rudo", "tecnico", "tecnico"], // tags in a partner squad
  },

  // El Coloso. The whole point of the campaign: fifteen waves are the road, this
  // is the destination. One enormous luchador who does not tag in a squad — he
  // *is* the squad — and who changes what he is twice on the way down, so the
  // build that opens the fight is not the build that finishes it.
  //
  // Phases fire on health, not on time, which is what makes the fight learnable:
  // you can see the next one coming and spend for it.
  coloso: {
    id: "coloso",
    name: "El Coloso",
    sprite: "coloso",
    hp: 5200,
    speed: 22,
    bounty: 1500,
    leak: 100, // he does not walk past; if he arrives, the plaza is done
    scale: 2.15,
    hop: 1.4,
    resist: { [DMG.SHARP]: 0.6, [DMG.BURN]: 0.45 },
    stunResist: 0.95,
    noSlow: false,
    boss: true,
    phases: [
      {
        at: 0.66,
        name: "The mask comes off",
        sprite: "coloso2",
        speed: 30,
        resist: { [DMG.SHARP]: 0.3, [DMG.BURN]: 0.2 },
        adds: ["tecnico", "tecnico", "tecnico"],
      },
      {
        at: 0.3,
        name: "El Coloso is furious",
        sprite: "coloso3",
        speed: 41,
        noSlow: true,
        resist: { [DMG.SHARP]: 0.15, [DMG.BURN]: 0.1 },
        adds: ["toro", "toro", "rudo"],
      },
    ],
  },
};

// ------------------------------------------------------------------- waves
//
// group: [enemyId, count, spacing seconds, delay before group]

const G = (id, n, gap, delay = 0) => ({ id, n, gap, delay });

// Gaps are set so a group never packs tighter than its own sprite width —
// a wall of overlapping wrestlers reads as one blob instead of a crowd.
export const WAVES = [
  [G("nino", 6, 1.1)],
  [G("nino", 10, 0.85)],
  [G("nino", 8, 0.8), G("matador", 2, 1.4, 3)],
  [G("matador", 6, 1.1)],
  [G("nino", 14, 0.6), G("matador", 4, 1.2, 2)],
  [G("tecnico", 5, 1.2), G("nino", 10, 0.7, 1)],
  [G("matador", 8, 0.95), G("colgado", 3, 1.4, 4)],
  [G("rudo", 3, 1.8), G("nino", 12, 0.6, 1)],
  [G("plateado", 3, 1.6), G("colgado", 3, 1.4, 2), G("tecnico", 7, 0.9, 5)],
  [G("toro", 2, 2.6), G("rudo", 4, 1.4, 2)],
  [G("nino", 24, 0.45), G("plateado", 3, 1.6, 3)],
  [G("rudo", 7, 1.1), G("colgado", 4, 1.2, 2)],
  [G("toro", 4, 1.8), G("plateado", 3, 1.4, 2), G("tecnico", 8, 0.9, 6)],
  [G("rudo", 10, 0.95), G("toro", 3, 2.2, 5)],
  [G("campeon", 1, 1), G("rudo", 6, 1.3, 4)],
  // Wave 16 is the reason for the other fifteen. He walks in alone: the first
  // version gave him a four-rudo escort on top of his phase adds, and measured,
  // the escort did the killing while the boss died on schedule — which is the
  // wrong fight. What comes with him arrives *because* of him.
  [G("coloso", 1, 1)],
];

export const START_MONEY = 650;
export const START_LIVES = 100;

// Difficulty knobs, kept together so the curve can be tuned in one place and
// checked with `node test/playtest.mjs`. The globals are sweep overrides.
export const HP_RAMP = Number(globalThis.PU_HP_RAMP ?? 0.15); // per wave, on base hp
export const BONUS_BASE = Number(globalThis.PU_BONUS_BASE ?? 98);
export const BONUS_PER_WAVE = Number(globalThis.PU_BONUS_PER_WAVE ?? 11);

// Global multiplier on every piñata's range, including upgrade bonuses. Applied
// in computeStats so a tower's effective range is always the scaled one.
//
// Note for anyone reaching for this to tune the skill gap: it does not work.
// Scaling range moves both build styles together, because the coverage advantage
// of a converging corner is scale-invariant — measured flat at ~1.4x from range
// 70 through 190. Shrinking it just kills the weaker build first. EDGE_MUL below
// is the range mechanic that actually discriminates.
export const RANGE_MUL = Number(globalThis.PU_RANGE_MUL ?? 1);

// Damage multiplier at the very edge of a piñata's range, scaling linearly from
// 1.0 at its feet. 1 = a hard circle, every target equal wherever it stands.
// At 0.55 a target at the very rim takes 55% damage, scaling linearly in.
//
// This is the one range mechanic that targets *placement* rather than power.
//
// Measured effect on the skill gap (focused minus spread, lives% per board, with
// the overall power loss compensated so only the *gap* moves):
//
//   edge   Plaza   Mercado   Cementerio
//   1.00     +8       +67        +29
//   0.55    +12       +58         +5
//   0.40     -5       +58        +16
//
// It works because the two build styles engage at different distances: a narrow
// coverage-optimised build holds 88-91% of its covered lane in the *outer half*
// of its range, against 70-72% for a wide one, so falloff charges it for the
// reach it is exploiting. El Mercado is the stubborn board — its switchbacks put
// several lane legs inside any radius, so falloff cannot tell them apart. That
// residue is map geometry, not range.
export const EDGE_MUL = Number(globalThis.PU_EDGE_MUL ?? 0.55);

// Flat enemy health scale. Doubles as the sensitivity harness's HP knob —
// HP_RAMP changes the *shape* of the difficulty curve, this scales the whole
// thing, which is what makes it comparable to a payout change.
//
// 0.72 pays back the DPS that EDGE_MUL falloff costs. Charging towers for shots
// taken near the rim removes roughly 28% of effective damage over a campaign,
// and without repaying it every board is unwinnable. The two constants move
// together: change one and re-sweep both.
export const HP_MUL = Number(globalThis.PU_HP_MUL ?? 0.72);
export const INCOME_MUL = Number(globalThis.PU_INCOME_MUL ?? 1);

// How much of the economy is performance-dependent. Bounty candy is a feedback
// loop — candy buys defence, defence kills more, kills pay more candy — so the
// larger the bounty share, the harder income is to tune gently. The fixed wave
// bonus has no such loop. These two move together: cut one, raise the other.
// 0.8: bounties pay four fifths of what they used to and the fixed wave bonus
// (raised from 75/9) makes up the difference. Measured with
// `node test/sensitivity.mjs`, this drops income loop gain from 2.12x/1.56x to
// 0.94x/1.18x — near 1, meaning a 10% income nudge now produces about 10% more
// candy instead of ~20%. Income is finally tunable in small steps.
//
// The share cannot be pushed much further, and not because of the loop: bounty
// candy rewards board coverage while fixed candy rewards concentration, so the
// mix silently picks a favourite strategy. Measured at Plaza across three maps:
//
//   bounty  loop gain      spread / focused lives%
//   1.00    2.12 / 1.56    30/0    10/23   0/5      <- old, both die somewhere
//   0.80    0.94 / 1.18    38/46   6/73    16/45    <- both alive everywhere
//   0.70    0.66 / 1.43    0/47    0/75    0/45     <- spread wiped out
//   0.55    1.57 / 1.07    0/64    15/62   5/58
//
// 0.8 is the only row where both strategies survive on all three boards.
export const BOUNTY_MUL = Number(globalThis.PU_BOUNTY_MUL ?? 0.8);

// Ramps come straight off `node test/playtest.mjs --maps --all`. The two bot
// profiles measure different things — `spread` (16 towers) degrades gracefully
// as enemy hp rises, `focused` (7 towers) falls off a cliff once its carries
// stop one-shotting — so the target is "both mostly finish, neither cruises"
// rather than one beating the other. Maps normalise via `speedMul`, because a
// long switchback lane is a coverage *gift*, not a challenge.
export const DIFFICULTIES = {
  fiesta: {
    id: "fiesta",
    name: "Fiesta",
    tag: "A party. Learn the piñatas.",
    hpRamp: 0.132,
    lives: 150,
    money: 850,
    reward: 1.15,
  },
  plaza: {
    id: "plaza",
    name: "Plaza",
    tag: "The real fight.",
    hpRamp: HP_RAMP,
    lives: 100,
    money: 650,
    reward: 1,
  },
  mascara: {
    id: "mascara",
    name: "Máscara",
    tag: "Tougher opponents, thinner purse. Only a sharp build holds.",
    hpRamp: 0.16,
    lives: 100,
    money: 650,
    reward: 0.95,
  },
  // A workshop, not a difficulty. There are thirty upgrade paths and ten
  // piñatas, and at 200-2100 candy a piece you cannot see most of them in a run
  // — which makes it very hard to tell whether an upgrade is interesting or just
  // a number. `free` is read by placeTower and upgradeTower; nothing else in the
  // sim knows about it, so it cannot leak into the balance grid.
  sandbox: {
    id: "sandbox",
    name: "Sandbox",
    tag: "Everything free. Build anything, upgrade anything, break nothing.",
    hpRamp: 0.132,
    lives: 999,
    money: 999999,
    reward: 1.15,
    free: true,
  },
};

export const DIFFICULTY_ORDER = ["fiesta", "plaza", "mascara", "sandbox"];

// ---------------------------------------------------------- the blindfold
//
// The real piñata game is played blindfolded and spun around, so in this one
// *you* are the one who cannot see — your piñatas know perfectly well where to
// swing. It layers on top of any difficulty rather than replacing it, so the
// balance grid stays valid: nothing about the fight changes, only what you are
// told about it.
//
// It pays nothing. A payout bonus was the original plan, but the harness showed
// the economy is extraordinarily leveraged — even a 10% income bump swung a
// `focused` run from dying on wave 14 to finishing with 71% of its lives, because
// the extra candy compounds into upgrade tiers and tiers multiply DPS. There is
// no safe size for a premium, and the offsetting cost of the handicap cannot be
// measured by a bot that does not use information. So it is a challenge mode:
// strictly harder, its own entry on the best-run list, nothing else.
//
//   sight     how far past a piñata's range you can make anything out
//   baseSight your own great piñata is always lit
//   premium   kept at 1; see above
export const BLINDFOLD = {
  sight: 26,
  baseSight: 130,
  premium: 1,
  name: "Blindfold",
  tag: "You cannot see what is coming. Bragging rights only.",
};
