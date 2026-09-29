// Wiring: input, HUD, the loop, and translating sim events into feedback.

import { TOWERS, TOWER_ORDER, ENEMIES, WAVES, DIFFICULTIES, DIFFICULTY_ORDER, MAPS, MAP_ORDER, BLINDFOLD } from "./data.js";
import * as sim from "./sim.js";
import { drawWorld, layout, panelWidth, panelReserve, setPanelReserve } from "./render.js";
import * as fx from "./fx.js";
import { sfx, unlock, setMuted, isMuted } from "./audio.js";
import { sprite, SPRITE_NAMES as spriteNamesConst, PX } from "./art.js";
import { card as enemyCard, progress as bestiaryProgress } from "./bestiary.js";
import { HEROES, HERO_ORDER, heroStats, levelFor, levelProgress, MAX_LEVEL, milestones } from "./heroes.js";
const spriteNames = () => spriteNamesConst;
import { PATHS, MAX_TIER, blockedBy, describeMod, sellValue, tierCost } from "./upgrades.js";
import { faceMarks } from "./faces.js";
import { towerSprite } from "./art.js";
import { handleEvents } from "./feedback.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const g = canvas.getContext("2d");

const BEST_KEY = "pinata-uprising-best";
const MASK_KEY = "pinata-uprising-masks";
const RUN_KEY = "pinata.run.v1";

/**
 * The run in progress, kept across a refresh.
 *
 * A campaign is fifteen minutes and it lives in a browser tab — a stray reload,
 * a closed laptop or a crashed page threw all of it away. Saved only between
 * rounds, which is where `sim.snapshot` can take a clean picture, and cleared
 * the moment the run ends so the menu never offers to resume a finished game.
 */
const saveRun = (g) => {
  try {
    const snap = sim.snapshot(g);
    if (snap) localStorage.setItem(RUN_KEY, JSON.stringify(snap));
  } catch {
    /* private mode; the run just does not survive a refresh */
  }
};
const loadRun = () => {
  try {
    return JSON.parse(localStorage.getItem(RUN_KEY));
  } catch {
    return null;
  }
};
const clearRun = () => {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* nothing to clear */
  }
};

const loadBest = () => {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {};
  } catch {
    return {};
  }
};
const loadMasks = () => {
  try {
    return JSON.parse(localStorage.getItem(MASK_KEY)) ?? {};
  } catch {
    return {};
  }
};
const saveMasks = (m) => {
  try {
    localStorage.setItem(MASK_KEY, JSON.stringify(m));
  } catch {
    /* private mode; the trophy wall just does not persist */
  }
};

const saveBest = (b) => {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* private mode; best runs just do not persist */
  }
};

let difficulty = "plaza";
let board = "plaza";
let blindfold = false;
let state = sim.createGame(Date.now() & 0xffff, difficulty, board, blindfold);
let armed = null; // tower type queued for placement
/** The sentinel `armed` takes when the queued placement is the run's hero. */
const HERO_ARM = "__hero";
let chosenHero = localStorage.getItem("pinata-uprising-hero") ?? HERO_ORDER[0];
let selected = null;
let pointer = { x: -999, y: -999, inside: false };
let speed = 1;
let paused = false;
// Autoplay: send the next round on its own once the last one is cleared. BTD6's
// toggle, and it earns its place here for the same reason — freeplay runs past
// wave 30 now, and a round that clears in four seconds should not need a click.
let autoplay = false;
let autoT = 0;
let bannerT = 0;
let hover = null; // tower under the cursor, for the range preview


// ------------------------------------------------------------ screen fitting

// The playfield's size in art pixels, derived from PX rather than written down so
// changing the art scale cannot leave the fitter disagreeing with the buffer. Only
// used here as a floor on the canvas; render.js picks the actual scale.
const ART_W = Math.ceil(state.map.w / PX);
const ART_H = Math.ceil(state.map.h / PX);

// BTD's anatomy: the canvas is the whole window and every panel sits on top of
// it. The shop used to take a column out of the screen, which on a tall window
// cost playfield the window could not spare — and the bottom-bar arrangement
// built to dodge that is gone with it. render.js keeps the plaza out from under
// the panel, so nothing overlaps and nothing is carved away.
// Width of the round-control rail, including its gutter. One number, used by
// both the board's reserve and the CSS that positions the rail, so they cannot
// disagree about where the playfield ends.
/**
 * The round-control rail's shape, measured rather than guessed.
 *
 * It is one column of six buttons, which is 229px tall — taller than a 196px
 * window, so on a short viewport the bottom of it (menu, sound) simply left the
 * screen. Rather than pick a breakpoint, work out how many buttons fit in the
 * height available and wrap into as many columns as that needs. The reserve the
 * board leaves is computed from the SAME numbers, so the rail can never end up
 * over the playfield or off the edge.
 */
const DOCK_BUTTONS = 6;
function dockShape(w, h) {
  const unit = w < 620 ? 40 : 58;
  const step = unit - 12 + 7; // button box plus the gap under it
  const rows = Math.max(1, Math.floor((h - 28) / step));
  const cols = Math.min(3, Math.ceil(DOCK_BUTTONS / rows));
  // Rows is what the CSS needs (the grid flows by column), cols is what the
  // board's reserve needs. Derived from each other so they cannot disagree.
  const perCol = Math.ceil(DOCK_BUTTONS / cols);
  return { unit, cols, perCol, width: unit * cols + 12 };
}

function fit() {
  // EXACTLY the window. This used to floor at `ART_W * 2` x `ART_H * 2`, which
  // on any viewport smaller than 640x400 made the canvas bigger than the window
  // — and since the page hides its overflow, the right and bottom of the board
  // were silently cropped. That is the whole of "it doesn't fit the screen": the
  // board was not too big for the window, it was drawn outside it.
  // The STAGE's size, not the window's. The game is landscape: it plays in a
  // 16:10 box centred in whatever window it is given, so every measurement below
  // — canvas, shop width, control rail, board reserve — is against that box.
  // Measured against the viewport instead, a portrait window produced a board
  // smaller than the same game gets on a much smaller landscape one.
  const stage = document.querySelector(".app");
  const w = Math.max(1, window.innerWidth);
  const winH = Math.max(1, window.innerHeight);

  // How tall the game actually WANTS to be at this width.
  //
  // The playfield is a fixed 8:5 and the shop and rail take their width off the
  // side, so on most windows the board is bound by WIDTH — and every pixel of
  // height past that binding point becomes street. Measured on a 1235x1271
  // window (the shape of the published artifact's frame) the stage was 1235x852
  // and the board 892x557: 295px, a full THIRD of the stage, was empty paving
  // above and below the plaza, and the map read as a small island in a big yard.
  //
  // So ask the renderer what scale this width supports, then take only the
  // height that scale needs. The leftover leaves the stage entirely and becomes
  // page surround, which reads as a frame around a game rather than as a map
  // that did not finish drawing.
  const dockProbe = dockShape(w, winH);
  const probe = layout({ canvas: { width: w, height: winH } }, state.map, panelReserve(w));
  // A little street, so the plaza has a kerb rather than running off the edge.
  const STREET_ART = 18;
  const wantH = Math.ceil((probe.mh + STREET_ART) * probe.s);
  const h = Math.max(160, Math.min(winH, wantH));
  stage.style.height = `${h}px`;
  document.documentElement.style.setProperty("--stagew", `${w}px`);
  document.documentElement.style.setProperty("--stageh", `${h}px`);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const shop = panelWidth(w);
  // The round controls are FURNITURE, not a decal over the board. Anchoring them
  // to the window's top-right worked while the board was small, but the board
  // scales up to meet the shop: at 2514x1269 the playfield reached x=2083 and the
  // dock sat at 1776, so the play button was 300px inside the playfield. Adding
  // the rail to the reserve makes the board stop before it — and because the
  // reserve is a CONSTRAINT on scale rather than a subtraction, it costs nothing
  // at all on any window where the board is bound by height, which is most of
  // them.
  const dock = dockShape(w, h);
  // The rail sits INSIDE the shop now, so it is already paid for by the shop's
  // own width — adding it again would reserve 58px of board for nothing.
  setPanelReserve(panelReserve(w));
  document.documentElement.style.setProperty("--shopw", `${shop}px`);
  document.documentElement.style.setProperty("--dockw", `${dock.unit}px`);
  document.documentElement.style.setProperty("--dockrows", `${dock.perCol}`);
  // The plaza's own centre, in screen pixels. Overlays that belong to the board —
  // the wave banner, the paused label — were centring on `50% - shopw/2`, which
  // is only the middle of the *leftover* space: the plaza is not exactly centred
  // in it, because the lane's entry stub is reserved on the near side.
  const L = layout(g, state.map);
  document.documentElement.style.setProperty("--boardmid", `${Math.round((L.ox + ART_W / 2) * L.s)}px`);
  requestAnimationFrame(syncPanelRoom);
  fitMenu();
}

/**
 * Show the who-is-who reference under the tower cards when the panel has height
 * to spare, which on a big screen is most of it.
 *
 * Measured rather than guessed from a media query: how much room is left depends
 * on the card count, the panel width and how many columns that yields, and the
 * failure mode of guessing is a reference panel clipped to a stub of border with
 * a sliced line of text in it — which reads as a glitch.
 */
/**
 * Where the dock sits when it has stacked under the counters.
 *
 * Measured, because the counters' height is not a constant: the round pips and
 * the blindfold flag both change it. Called when the pips are rebuilt as well as
 * on resize — measuring once at startup put the dock 17px inside the HUD, because
 * the pips had not been filled in yet.
 */
function placeDock() {
  const hud = document.querySelector(".hud");
  if (!hud) return;
  const root = document.documentElement;
  root.style.setProperty("--dock-top", `${Math.round(hud.getBoundingClientRect().bottom) + 10}px`);
  // And where the boss bar goes when it cannot share the top row with them.
  const dock = document.querySelector(".dock");
  if (dock) root.style.setProperty("--boss-top", `${Math.round(dock.getBoundingClientRect().bottom) + 10}px`);
}

function syncPanelRoom() {
  const shop = document.querySelector(".shop");
  const list = $("tower-list");
  placeDock();
  if (!shop || !list) return;
  // One threshold now that the who-is-who is gone: does the hover detail fit
  // under the cards, or does it have to float beside the panel?
  document.body.classList.toggle("has-detail", shop.clientHeight - list.scrollHeight - 10 >= 118);

  // COMPACT SHOP.
  //
  // Tying the stage's height to what the BOARD needs stopped it wasting a third
  // of itself on street, but it also stopped the shop getting height it was
  // quietly relying on: at 900x1400 the stage came out 472px and the card list
  // showed 1.8 rows of a 5-row grid, so seven of the ten piñatas were below the
  // fold. Rather than give the board's width back to fix a height problem, the
  // shop packs tighter — three narrower columns instead of two — and nine of the
  // ten fit.
  //
  // Decided from the room available and the roster size, NOT from whether the
  // list is currently overflowing: overflow disappears the moment compact turns
  // on, so testing it directly makes the class flap on and off every frame.
  const rail = document.querySelector(".rail");
  const cards = list.children.length || TOWER_ORDER.length;
  const rowH = list.firstElementChild ? list.firstElementChild.offsetHeight + 10 : 142;
  const roomyRows = Math.ceil(cards / 2);
  rail.classList.toggle("compact", list.clientHeight > 0 && list.clientHeight < roomyRows * rowH * 0.72);
}

window.addEventListener("resize", fit);

// --------------------------------------------------------------- tower cards

/**
 * Draw a sprite into an icon canvas at a whole-number scale. `sprite()` returns
 * art resolution — about 20x20 — so blitting it 1:1 into a 74px button leaves a
 * stamp in the middle of an empty card.
 */
function drawIcon(pg, spr, w, h, fill = 0.86) {
  const k = Math.max(1, Math.floor(Math.min((w * fill) / spr.canvas.width, (h * fill) / spr.canvas.height)));
  pg.imageSmoothingEnabled = false;
  const ox = Math.round((w - spr.canvas.width * k) / 2);
  const oy = Math.round((h - spr.canvas.height * k) / 2);
  pg.drawImage(spr.canvas, ox, oy, spr.canvas.width * k, spr.canvas.height * k);
  return { k, ox, oy };
}

/**
 * The same face the piñata wears on the board, on its shop card.
 *
 * The cards are where you meet each character — and they were showing ten
 * faceless ornaments while the board showed ten characters, so the thing you
 * chose from and the thing you placed did not look like the same creature.
 *
 * `faceMarks` measures from a tower's GROUND anchor and `drawTower` blits the
 * body 3px above it, so the icon has to reproduce that same 3px or every face
 * sits three pixels low.
 */
function drawIconFace(pg, type, spr, { k, ox, oy }) {
  const marks = faceMarks(type, { t: 0, aim: 0.9, alert: true, still: true });
  for (const mk of marks) {
    pg.fillStyle = mk.c;
    pg.fillRect(ox + (spr.ax + mk.x) * k, oy + (spr.ay + 3 + mk.y) * k, k, k);
  }
}

function buildCards() {
  const list = $("tower-list");
  list.innerHTML = "";
  if (state?.heroId && !state.heroPlaced) {
    const h = HEROES[state.heroId];
    const card = document.createElement("button");
    card.className = "card hero-card";
    card.dataset.id = HERO_ARM;
    const pic = document.createElement("canvas");
    pic.width = 96;
    pic.height = 96;
    drawIconFace(pic.getContext("2d"), h.sprite, sprite(h.sprite),
      drawIcon(pic.getContext("2d"), sprite(h.sprite), 96, 96));
    card.appendChild(pic);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.innerHTML = `<strong>${h.name.split(" ").at(-1)}</strong><span class="cost">${h.cost}</span>`;
    card.appendChild(meta);
    card.title = `${h.name} — ${h.blurb}\n\n${h.pull}`;
    card.addEventListener("click", () => {
      unlock();
      armed = armed === HERO_ARM ? null : HERO_ARM;
      syncHud();
    });
    list.appendChild(card);
  }
  for (const id of TOWER_ORDER) {
    const def = TOWERS[id];
    const card = document.createElement("button");
    card.className = "card";
    card.dataset.id = id;
    const pic = document.createElement("canvas");
    pic.width = 96;
    pic.height = 96;
    const picg = pic.getContext("2d");
    const spr = sprite(def.sprite);
    drawIconFace(picg, id, spr, drawIcon(picg, spr, 96, 96));
    card.appendChild(pic);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    // One word on the button. "Papel picado" and "Mariachi trio" wrapped to two
    // lines, and with ten cards in the grid that second line ate the icon: the
    // sprite dropped to its 1x whole-number scale and became a stamp in an empty
    // card. The full name is on the hover and in the upgrade window.
    meta.innerHTML =
      `<strong>${def.name.replace(" piñata", "").split(" ")[0]}</strong>` +
      `<span class="cost">${def.cost}</span>`;
    card.appendChild(meta);
    card.title = `${def.name} — ${def.blurb}`;
    card.addEventListener("click", () => {
      unlock();
      armed = armed === id ? null : id;
      selected = null;
      syncCards();
    });
    card.addEventListener("pointerenter", () => {
      hoveredId = id;
      syncDetail();
    });
    // Falls back to whatever is armed rather than to nothing: picking a piñata
    // with a hotkey used to leave the panel blank about the thing now on your
    // cursor.
    card.addEventListener("pointerleave", () => {
      if (hoveredId === id) hoveredId = null;
      syncDetail();
    });
    list.appendChild(card);
  }
}

/**
 * What a piñata does, in the panel, before you spend on it.
 *
 * It shares the who-is-who's slot rather than opening its own box: two panels
 * that appear and disappear under the cursor make the shop jump, and the shop is
 * the one place a player's hand lives. Hover swaps the contents, nothing moves.
 */
const cardFor = (id) => (id ? $("tower-list").querySelector(`.card[data-id="${id}"]`) : null);

// What the panel is describing: the card under the cursor, or failing that the
// piñata on it. Held in a variable rather than read from the DOM because
// `syncCards()` runs from `syncHud()` on every frame — the first version rebuilt
// the detail from `armed` sixty times a second and wiped the hover the instant it
// happened.
let hoveredId = null;
const syncDetail = () => {
  const id = hoveredId ?? armed;
  showDetail(id, cardFor(id));
};

function showDetail(id, card) {
  const box = $("tower-detail");
  if (!id) {
    box.classList.add("hidden");
    box.classList.remove("floating");
    box.style.cssText = "";
    return;
  }
  const d = shopDef(id);
  if (!d) {
    box.classList.add("hidden");
    return;
  }
  const rows = [];
  if (d.field) rows.push(["Cuts", `${d.damage} every ${d.rate}s`], ["Reach", d.range]);
  else if (d.damage > 0) {
    rows.push(["Damage", d.damage], ["Range", d.range], ["Rate", `${(1 / d.rate).toFixed(1)}/s`]);
    if (d.chain) rows.push(["Chains", `${d.chain} more`]);
    if (d.splash) rows.push(["Splash", d.splash]);
    if (d.slow && d.slow < 1) rows.push(["Slows to", `${Math.round(d.slow * 100)}%`]);
    if (d.stun) rows.push(["Stuns", `${d.stun}s`]);
  }
  if (d.income) rows.push(["Pays", `${d.income}/wave`]);
  if (d.auraRate) rows.push(["Nearby fire", `+${Math.round(d.auraRate * 100)}%`], ["Earshot", d.auraRange]);
  box.innerHTML =
    `<h3>${d.name.replace(" piñata", "")}</h3><p class="detail-blurb">${d.blurb}</p>` +
    `<dl class="detail-stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` +
    `<p class="detail-cost">${d.cost} candy</p>`;
  box.classList.remove("hidden");
  // No room under the cards — at 1280x720 there is none — so it floats beside the
  // shop instead of silently doing nothing, which is what it did first. Pinned to
  // the card's own row so the eye does not have to travel.
  const floats = !document.body.classList.contains("has-detail");
  box.classList.toggle("floating", floats);
  if (floats && card) {
    const r = card.getBoundingClientRect();
    box.style.cssText = "";
    box.style.top = "0px";
    const h = box.getBoundingClientRect().height;
    const stageH = document.querySelector(".app").clientHeight || window.innerHeight;
    box.style.top = `${Math.max(12, Math.min(stageH - h - 12, r.top))}px`;
  } else {
    box.style.cssText = "";
  }
}

/**
 * Resolve a shop-card id to something with `cost`, `range` and `sprite`.
 *
 * The shop list holds piñatas AND the run's hero, and the hero is not in
 * `TOWERS`. Four separate places assumed otherwise and dereferenced
 * `TOWERS[id].something` directly; each one throws a TypeError the moment the
 * id is the hero's, and two of them run inside the frame loop, so the failure is
 * not "one card misbehaves" — it is the game stopping.
 *
 * One lookup, used everywhere, so there is no fifth place to forget.
 */
function shopDef(id) {
  if (!id) return null;
  if (id === HERO_ARM) {
    const h = HEROES[state?.heroId];
    return h ? { ...h.base, cost: h.cost, name: h.name, sprite: h.sprite, blurb: h.blurb } : null;
  }
  return TOWERS[id] ?? null;
}

function syncCards() {
  syncDetail();
  for (const card of $("tower-list").children) {
    const id = card.dataset.id;
    // THE BUG THIS GUARD FIXES, and it broke the whole game rather than one
    // card: the hero's card lives in this same list but is NOT a piñata, so
    // `TOWERS[id]` is undefined and `state.money < def.cost` threw a TypeError.
    // It threw on the FIRST child, which meant:
    //
    //   - no card ever received the `armed` class, so clicking one appeared to
    //     do nothing and nothing could be placed;
    //   - the exception escaped the click handler AND the per-frame sync, so
    //     the frame loop stopped and the page went unresponsive.
    //
    // "I can't place towers", "the towers are invisible" and a tab that would
    // not screenshot were all this one line.
    const cost = shopDef(id)?.cost;
    if (cost === undefined) continue;
    card.classList.toggle("armed", armed === id);
    card.classList.toggle("broke", state.money < cost);
  }
}

// ---------------------------------------------------------------------- HUD

// One pip per scripted wave. Rebuilt only when the wave actually changes —
// syncHud runs every frame, and 15 elements a frame is 900 pointless nodes a
// second.
let pipWave = -1;
function syncPips() {
  if (pipWave === state.wave && $("wave-pips").children.length) return;
  pipWave = state.wave;
  requestAnimationFrame(placeDock);
  $("wave-pips").innerHTML = WAVES.map((groups, i) => {
    const boss = groups.some((grp) => ENEMIES[grp.id].boss);
    const cls = [
      boss ? "boss" : "",
      i + 1 < state.wave ? "done" : "",
      i + 1 === state.wave ? "now" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<i class="${cls}"></i>`;
  }).join("") + (state.freeplay ? `<i class="free"></i>` : "");
}

// The coming wave as sprite rows. Keyed so it only rebuilds when the wave or the
// blindfold changes: this used to reset innerHTML every frame, which threw away
// and re-created the canvases sixty times a second.
let intelKey = "";
/**
 * What to bring, derived from the wave itself.
 *
 * The counter matrix is the game's one real rule and it lives in a reference
 * panel the player has to go and read. The next-round card already knows exactly
 * who is coming, so it can say the rule that applies — read off the same enemy
 * flags the sim uses, so a rule change cannot leave the advice behind.
 */
// Ordered by how much each rule actually takes away, so a wave carrying two of
// them leads with the one that hurts more: foil sheds 85% of burn, a cape waves
// off 60% of slow shots, a swing dodges ~45% of them, and the rudo's hide eats
// 35% of sharp. Ordered the other way round, a wave of plateados and colgados
// advised against slow shots and never mentioned that chili does nothing.
const COUNTER_TIP = [
  [(d) => (d.resist?.burn ?? 0) > 0.5, "anything but chili — fire slides off foil"],
  [(d) => d.cape > 0, "fast shots or splash — capes wave slow ones off"],
  [(d) => d.sway > 0, "speed or splash — they swing clear of slow shots"],
  [(d) => (d.resist?.sharp ?? 0) > 0.2, "blunt or splash — sharp candy just bounces"],
  [(d) => d.noSlow, "damage, not slows — the toro charges through gum"],
];
function waveTip(groups) {
  const defs = groups.map((grp) => ENEMIES[grp.id]);
  // Two at most: a wave can carry several rules, and a list of five is a wall of
  // text on a card meant to be read between rounds.
  return COUNTER_TIP.filter(([test]) => defs.some((d) => d && test(d)))
    .slice(0, 2)
    .map(([, text]) => text);
}

function syncIntel() {
  const key = `${state.wave}:${state.blindfold}:${state.freeplay}`;
  if (key === intelKey) return;
  intelKey = key;
  const host = $("intel");
  host.innerHTML = "";
  const next = sim.waveGroups(state.wave);
  if (state.blindfold) {
    // Blindfolded you get the shape of the wave — how many kinds, how many of
    // each — but not who. Hiding the counts too would remove all planning.
    for (const grp of next) {
      const row = document.createElement("div");
      row.className = "foe unknown";
      row.innerHTML = `<canvas width="60" height="60"></canvas><span>? ? ?</span><b>×${grp.n}</b>`;
      host.appendChild(row);
    }
    return;
  }
  for (const grp of next) {
    const def = ENEMIES[grp.id];
    const row = document.createElement("div");
    row.className = "foe" + (def.boss ? " boss" : "");
    const pic = document.createElement("canvas");
    pic.width = 60;
    pic.height = 60;
    drawIcon(pic.getContext("2d"), sprite(def.sprite), 60, 60, 0.95);
    row.appendChild(pic);
    const cap = document.createElement("div");
    cap.style.cssText = "display:flex;align-items:center;gap:8px;flex:1;min-width:0";
    cap.innerHTML = `<span>${def.name}</span><b>×${grp.n}</b>`;
    row.appendChild(cap);
    host.appendChild(row);
  }
  for (const tip of waveTip(next)) {
    const line = document.createElement("p");
    line.className = "foe-tip";
    line.textContent = tip;
    host.appendChild(line);
  }
}

// Which side the upgrade window opens on.
//
// It used to be pinned left, and on Plaza del Sol the lane's left leg runs
// straight down behind it — the panel sat on top of live gameplay. BTD6 draws its
// maps around where its panel goes; ours are already balanced and are not moving,
// so the panel moves instead. Two rules: prefer the side with less lane under it,
// and never cover the piñata you are upgrading.
//
// The shop owns the RIGHT edge, so "right" here means *tucked against the shop*
// rather than against the window — the two can never overlap either way.
const laneCache = new Map();
function laneInBands(map, bandSim) {
  const key = `${map.id}:${Math.round(bandSim)}`;
  let hit = laneCache.get(key);
  if (hit) return hit;
  let left = 0;
  let right = 0;
  let total = 0;
  const p = map.path;
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(len / 12));
    for (let k = 0; k <= steps; k++) {
      const x = x0 + ((x1 - x0) * k) / steps;
      total += len / steps;
      if (x <= bandSim) left += len / steps;
      else if (x >= map.w - bandSim) right += len / steps;
    }
  }
  // Returned as fractions of the whole route. Raw lengths are scale-dependent —
  // the band is narrower on a big window — so comparing them against a fixed
  // penalty made the panel jump sides when the window resized, for reasons that
  // had nothing to do with what was actually covered.
  hit = { left: left / Math.max(1, total), right: right / Math.max(1, total) };
  laneCache.set(key, hit);
  return hit;
}

function panelSide(t) {
  const L = layout(g, state.map);
  // Panel width plus its margins, converted from screen pixels back to sim.
  const bandSim = ((274 + 28) / L.s) * PX;
  const { left, right } = laneInBands(state.map, bandSim);
  let l = left;
  let r = right;
  // Costs are in "fraction of the route covered". Hiding the great piñata is worth
  // about 6% of the lane: it is static and its health is also in the pill. Except
  // blindfolded, where its condition IS the health display — then it dominates.
  const bx = state.map.base[0];
  const basePenalty = state.blindfold ? 10 : 0.06;
  if (bx <= bandSim) l += basePenalty;
  if (bx >= state.map.w - bandSim) r += basePenalty;
  // A tower under the panel outweighs everything: hiding the thing you clicked,
  // and its range ring, defeats the window.
  if (t && t.x <= bandSim) l += 100;
  if (t && t.x >= state.map.w - bandSim) r += 100;
  return r < l ? "right" : "left";
}

/**
 * The boss bar: on screen only while he is, and coloured by the phase he is in.
 *
 * Reads the live enemy rather than tracking its own copy of his health — a boss
 * bar that keeps its own number is a boss bar that lies the moment something else
 * damages him.
 */
function syncBoss() {
  const bar = $("bossbar");
  const boss = state.enemies.find((e) => e.def.phases);
  if (!boss) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.classList.toggle("p1", boss.phaseIx === 1);
  bar.classList.toggle("p2", boss.phaseIx >= 2);
  $("boss-name").textContent = boss.def.name;
  $("boss-fill").style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  const next = boss.def.phases[boss.phaseIx];
  $("boss-phase").textContent = next
    ? `${Math.ceil((boss.hp / boss.maxHp) * 100)}% · next at ${Math.round(next.at * 100)}%`
    : `${Math.ceil((boss.hp / boss.maxHp) * 100)}% · no mask left`;
}

let statsKey = "";

function syncHud() {
  // Sandbox has money but spends none of it, and a six-figure counter ticking
  // nowhere is just noise on the screen.
  $("money").textContent = state.diff?.free ? "∞" : Math.floor(state.money);
  syncPips();
  // Blindfolded, your health is the great piñata's condition, not a number —
  // which is exactly what the art was built to carry.
  $("lives").textContent = state.blindfold ? "???" : Math.ceil(state.lives);
  syncBoss();
  $("wave").textContent = state.freeplay
    ? `${state.wave} · freeplay`
    : `${state.wave} / ${WAVES.length}`;
  $("lives-fill").style.width = state.blindfold
    ? "100%"
    : `${(state.lives / state.maxLives) * 100}%`;
  const go = $("start-wave");
  // A round can be sent on top of one already walking, so the button stays live
  // through a fight. It only goes dark when there is genuinely nothing to send.
  const canSend =
    state.phase === "build" ||
    (state.phase === "wave" && (state.freeplay || state.wave < sim.WAVE_COUNT));
  const out = sim.liveWaves(state).length;
  go.disabled = !canSend;
  // Breathing only between rounds. During a fight the button is available but
  // must not nag — sending early is an option you take, not one you are pushed
  // into, and a pulsing button in a fight reads as "you are behind".
  go.classList.toggle("ready", state.phase === "build");
  go.classList.toggle("early", state.phase === "wave" && canSend);
  go.querySelector(".go-word").textContent =
    state.phase === "build" ? "Send" : out > 1 ? `${out} rounds out` : "Send early";
  go.title =
    state.phase === "wave"
      ? "Send the next round now, on top of this one — more candy, more on the road (space)"
      : $("go-label").textContent;
  $("go-label").textContent =
    state.phase === "build"
      ? state.wave
        ? `Send round ${state.wave + 1}`
        : "Send the first round"
      : `Round ${state.wave} running`;
  syncIntel();

  if (selected) {
    const t = selected;
    $("sel").classList.remove("hidden");
    $("sel").classList.toggle("right", panelSide(t) === "right");
    $("sel-name").textContent = t.def.name;
    $("sel-rank").textContent = t.tiers.join("-");
    drawPortrait(t);
    // No blurb here. The prose lives on the shop card you hover before buying;
    // in the upgrade window it was a sentence competing with the numbers that
    // actually decide the click.
    const dps = t.def.damage > 0 ? Math.round((t.def.damage * (t.def.pierce || 1)) / t.def.rate) : 0;
    // Same rebuild-every-frame pattern as the rows above. Nothing here is
    // clickable so it broke nothing, but it churned the DOM at 60Hz for numbers
    // that change only when you buy something or the piñata scores a defeat.
    const statKey = `${t.id}|${t.tiers.join("-")}|${t.defeats}|${Math.round(t.def.damage)}`;
    if (statKey !== statsKey) {
      statsKey = statKey;
      $("sel-stats").innerHTML =
      (t.def.income
        ? `<div><span>Per wave</span><strong>${Math.round(t.def.income)}</strong></div>`
        : `<div><span>Damage</span><strong>${Math.round(t.def.damage) || "—"}</strong></div>`) +
      `<div><span>Range</span><strong>${Math.round(t.def.range)}</strong></div>` +
      (t.def.damage > 0
        ? `<div><span>DPS</span><strong>${dps}</strong></div>`
        : `<div><span>Defeats</span><strong>${t.defeats}</strong></div>`);
    }
    const mode = sim.TARGETING[t.targeting ?? 0];
    $("sel-target").textContent = `Target: ${mode.name}`;
    $("sel-target").title = mode.tip;
    renderPaths(t);
    $("sel-sell").textContent = `Sell for ${sellValue(t.type, t.base, t.tiers)}`;
  } else {
    $("sel").classList.add("hidden");
  }
  syncCards();
}

// Three paths, four tiers, at most two paths open and only one past tier 2 —
// BTD6's 5-2-0 rule, scaled. The row is the whole explanation: how far along the
// path you are, what the next tier is called, what it *does* as numbers, and what
// it costs. No sentences; the blurbs that used to sit here were 36 lines of prose
// that said less than "+6 dmg".
/**
 * What the three rows are currently showing. Anything NOT in this key is either
 * fixed for the life of the row or updated in place below.
 */
let pathsKey = "";

/**
 * The selected piñata, drawn at its current upgrade state.
 *
 * Redrawn only when the tiers change, for the same reason the rows are: this
 * runs inside `syncHud`, which the frame loop calls sixty times a second, and
 * rebuilding a 64x64 canvas at that rate to show a picture that changes maybe
 * four times a run is pure waste.
 */
let portraitKey = "";
// Which row the cursor is over, so the portrait can show what the purchase would
// turn the piñata into. Null means "show what it is now".
let previewTiers = null;

function drawPortrait(t, tiers = previewTiers ?? t.tiers) {
  const key = `${t.id}|${t.type}|${tiers.join("-")}`;
  if (key === portraitKey) return;
  portraitKey = key;
  const pic = $("sel-pic");
  const pg = pic.getContext("2d");
  pg.clearRect(0, 0, pic.width, pic.height);
  const spr = towerSprite(t.type, tiers);
  // Its OWN scale, not drawIcon's 0.86 fill: at 64px with a 0.86 margin a 36px
  // sprite floors to 1x and the portrait comes out the size of a postage stamp.
  // The canvas is oversized and scaled down by CSS instead, so it lands on 2x.
  drawIconFace(pg, t.type, spr, drawIcon(pg, spr, pic.width, pic.height, 1));
}

function renderPaths(t) {
  const host = $("sel-paths");
  // THE BUG THIS GUARD FIXES, and it is the one that made "I click upgrade and
  // nothing happens" true no matter how the rows were styled:
  //
  //   frame()  ->  syncHud()  ->  renderPaths()  ->  host.innerHTML = ""
  //
  // ran sixty times a second, so the row you pressed down on was destroyed and
  // replaced about 16ms later. A browser only fires `click` when mousedown and
  // mouseup land on the SAME element; yours landed on two different buttons, so
  // the event resolved to their container and the row's own handler never ran.
  // A human click takes 60-150ms — four to nine rebuilds — so it never worked.
  // Every automated click DID work, because a dispatched click completes inside
  // a single frame. That is why three rounds of testing missed it.
  const key = `${t.id}|${t.type}|${t.tiers.join("-")}`;
  if (key === pathsKey && host.children.length === PATHS[t.type].length) {
    // Only affordability moves between frames, and it is a class on a row that
    // already exists — never a new node.
    for (const row of host.children) {
      const cost = Number(row.dataset.cost);
      if (cost) row.classList.toggle("broke", state.money < cost);
    }
    return;
  }
  pathsKey = key;
  host.innerHTML = "";
  PATHS[t.type].forEach((path, pi) => {
    const tier = t.tiers[pi];
    const block = blockedBy(t.tiers, pi);
    const maxed = block?.code === "MAXED";
    const locked = !!block && !maxed;
    // Priced through tierCost so the panel agrees with what upgradeTower charges.
    const next = tier < MAX_TIER ? { ...path.tiers[tier], cost: tierCost(t.type, pi, tier) } : null;
    const afford = next && state.money >= next.cost;

    const row = document.createElement("button");
    row.className = "path" + (maxed ? " maxed" : locked ? " blocked" : afford ? "" : " broke");
    if (next && !block) row.dataset.cost = String(next.cost);
    // NEVER disabled. A dead button is exactly what "I click upgrade and nothing
    // happens" feels like, and all three refusals used to be dead: no money, no
    // path left, nothing left to buy. Every row now answers, and the answer says
    // which of the three it is.

    // The track: filled behind you, lit for what this click buys, empty ahead.
    const slots = Array.from({ length: MAX_TIER }, (_, i) => {
      const cls = i < tier ? "on" : i === tier && !block ? "lit" : "";
      return `<i class="${cls}"></i>`;
    }).join("");

    // A locked row shows the *rule* where the numbers would go, so the reason is
    // on screen before the click rather than hidden in a tooltip you have to
    // hover and wait for. Three words, no sentence.
    const name = block ? path.name : next.name;
    const chips = block
      ? locked
        ? [block.short]
        : []
      : describeMod(next.mod, { top: tier === MAX_TIER - 1, special: next.special });
    const tail = maxed
      ? `<b class="price maxed">MAX</b>`
      : locked
        ? `<b class="price locked">\u{1F512}</b>`
        : `<b class="price">${next.cost}</b>`;
    row.innerHTML =
      `<span class="track">${slots}</span>` +
      `<span class="path-copy"><strong>${name}</strong>` +
      `<span class="chips">${chips.map((c) => `<em>${c}</em>`).join("")}</span></span>` +
      tail;
    row.title = block ? block.why : `${path.name} \u2014 tier ${tier + 1}`;

    // One refusal path for all three reasons: shake the row the click landed on,
    // say why over the pi\u00f1ata the row belongs to, and make a noise. Silence was
    // the bug.
    const refuse = (why) => {
      row.classList.remove("shake");
      void row.offsetWidth;
      row.classList.add("shake");
      fx.floatText(t.x, t.y - 70, why, "#ffb3a8", 16);
      sfx.deflect();
      syncHud();
    };

    // Hovering a row shows what buying it would DO to the piñata. The whole
    // theme system exists to make an upgrade a visible object; this is the one
    // moment where you are deciding between them and can compare.
    if (!block) {
      const after = t.tiers.slice();
      after[pi] += 1;
      row.addEventListener("pointerenter", () => {
        previewTiers = after;
        drawPortrait(t, after);
        $("sel-pic").classList.add("preview");
      });
      row.addEventListener("pointerleave", () => {
        previewTiers = null;
        drawPortrait(t, t.tiers);
        $("sel-pic").classList.remove("preview");
      });
    }

    row.addEventListener("click", () => {
      unlock();
      if (block) return refuse(block.why);
      const bought = sim.upgradeTower(state, t, pi);
      if (!bought) return refuse(`${next.cost} candy`);
      previewTiers = null;
      $("sel-pic").classList.remove("preview");
      // Saved on every purchase, not only when a round is sent. Quitting during
      // a long build phase used to lose all the shopping you had just done.
      saveRun(state);
      sfx.upgrade(bought.tier);
      fx.floatText(t.x, t.y - 70, bought.name, "#ffe08a", 17);
      fx.ring(t.x, t.y - 40, 54, "#ffe08a");
      fx.burst(t.x, t.y - 40, {
        n: 14,
        colors: ["#f2c53d", "#fdf6e8", "#f2789b"],
        spd: 210,
        size: 4,
        shape: "streamer",
      });
      fx.shake(3);
      syncHud();
    });
    host.appendChild(row);
  });
}

// ---------------------------------------------------------------- the menu

// The trophy wall. Losing your mask is the highest stake in lucha libre, so
// the masks you have taken are the run-to-run keepsake. Display only — giving
// it stat perks would quietly invalidate every number in the balance grid.
function buildMasks() {
  const host = $("menu-masks");
  const taken = loadMasks();
  host.innerHTML = "";
  for (const id of Object.keys(ENEMIES)) {
    const n = taken[id] ?? 0;
    const c = enemyCard(id, n);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "mask" + (n ? "" : " none") + (c.boss ? " boss" : "");
    const pic = document.createElement("canvas");
    pic.width = 60;
    pic.height = 60;
    drawIcon(pic.getContext("2d"), sprite(ENEMIES[id].sprite), 60, 60, 0.95);
    cell.appendChild(pic);
    const cap = document.createElement("div");
    cap.innerHTML = `<b>${n}</b><span>${c.name}</span>`;
    cell.appendChild(cap);
    // The rules are earned. Reading the counter matrix off a menu before the
    // first wave would remove the reason waves 1-8 exist — you are supposed to
    // learn this by meeting them.
    cell.title = c.known
      ? `${c.name} — ${n} unmasked\n\n` + c.rules.map((r) => `${r.rule}\n  → ${r.counter}`).join("\n")
      : `${c.name} — never unmasked. Take one to learn what it does.`;
    cell.addEventListener("click", () => showCard(c));
    host.appendChild(cell);
  }
  const pr = bestiaryProgress(taken);
  const label = document.querySelector(".menu-masks-wrap .menu-label");
  if (label) label.textContent = `Masks taken · ${pr.known}/${pr.total} known`;
}

/**
 * One luchador's card, over the menu.
 *
 * Reuses the modal rather than adding a second overlay, so there is one thing
 * on screen that means "read this and dismiss it".
 */
function showCard(c) {
  const host = $("card-pop");
  if (!host) return;
  if (!c.known) {
    host.innerHTML =
      `<h3>${c.name}</h3><p class="card-none">You have never taken one of these. ` +
      `Beat one and its rules go on the wall.</p>`;
  } else {
    host.innerHTML =
      `<h3>${c.name}${c.boss ? ' <span class="boss-tag">boss</span>' : ""}</h3>` +
      `<p class="card-stats">${c.hp} health · speed ${c.speed} · ${c.taken} unmasked</p>` +
      c.rules
        .map((r) => `<div class="card-rule"><strong>${r.rule}</strong><span>${r.counter}</span></div>`)
        .join("");
  }
  host.classList.add("show");
}

// Banked at every wave end, not just when the run finishes — otherwise closing
// the tab mid-run throws away everything taken. Only the delta since the last
// bank is added, so repeated calls never double count.
let bankedMasks = {};

function recordMasks() {
  const taken = loadMasks();
  for (const [id, n] of Object.entries(state.stats.masks ?? {})) {
    const delta = n - (bankedMasks[id] ?? 0);
    if (delta > 0) taken[id] = (taken[id] ?? 0) + delta;
  }
  bankedMasks = { ...state.stats.masks };
  saveMasks(taken);
  return taken;
}

/**
 * Choose the run's hero before it starts.
 *
 * Three cards, and the copy leads with what each one PULLS your build towards
 * rather than with its numbers — the reason to pick one over another is the
 * shape of the run, not a damage figure.
 */
function buildHeroPicker() {
  const host = $("menu-heroes");
  if (!host) return;
  host.innerHTML = "";
  for (const id of HERO_ORDER) {
    const h = HEROES[id];
    const b = document.createElement("button");
    b.className = "herocard" + (id === chosenHero ? " on" : "");
    b.dataset.id = id;
    b.innerHTML =
      `<strong>${h.name}</strong><em>${h.title}</em>` +
      `<span class="hero-pull">${h.pull}</span>` +
      `<span class="cost">${h.cost}</span>`;
    b.title = `${h.blurb}\n\n` + milestones(id).map((m) => `Lv ${m.level} — ${m.note}`).join("\n");
    b.addEventListener("click", () => {
      chosenHero = id;
      localStorage.setItem("pinata-uprising-hero", id);
      buildHeroPicker();
    });
    host.appendChild(b);
  }
}

function buildMaps() {
  const host = $("menu-maps");
  host.innerHTML = "";
  for (const id of MAP_ORDER) {
    const m = MAPS[id];
    const b = document.createElement("button");
    b.className = "mapcard" + (id === board ? " on" : "");
    b.dataset.id = id;
    const pic = document.createElement("canvas");
    pic.width = 132;
    pic.height = 84;
    drawMapThumb(pic.getContext("2d"), m, 132, 84);
    b.appendChild(pic);
    const cap = document.createElement("div");
    cap.innerHTML = `<strong>${m.name}</strong><span>${m.difficulty}</span>`;
    b.appendChild(cap);
    b.title = m.tag;
    b.addEventListener("click", () => {
      board = id;
      for (const c of host.children) c.classList.toggle("on", c.dataset.id === id);
      $("menu-tag").textContent = m.tag;
    });
    host.appendChild(b);
  }
  $("menu-tag").textContent = MAPS[board].tag;
}

// Tiny route preview so a board is chosen by shape, not by name.
function drawMapThumb(c, m, w, h) {
  const k = Math.min(w / m.w, h / m.h);
  c.fillStyle = m.ground;
  c.fillRect(0, 0, w, h);
  c.lineJoin = "round";
  c.lineCap = "round";
  for (const [colour, width] of [
    ["#22384a", 9],
    [m.lane, 6],
  ]) {
    c.beginPath();
    m.path.forEach((p, i) =>
      i ? c.lineTo(p[0] * k, p[1] * k) : c.moveTo(p[0] * k, p[1] * k),
    );
    c.strokeStyle = colour;
    c.lineWidth = width;
    c.stroke();
  }
  c.fillStyle = "#f28b3c";
  c.strokeStyle = "#22384a";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(m.base[0] * k, m.base[1] * k, 6, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

/**
 * Make the menu fit, whatever shape the window is.
 *
 * The media queries below get it close — flattening the map grid, dropping the
 * trophy wall, keeping the two columns side by side on a short window — but
 * "close" is not "fits", and the failure mode is the difficulty buttons sitting
 * below the fold, which are the only controls the screen exists for. Measuring
 * and scaling is the one approach that cannot be wrong about a window shape
 * nobody tested: at 520x900 the card ran 299px over, and no threshold I could
 * have guessed would have caught that AND the 800x540 case.
 */
function fitMenu() {
  const card = document.querySelector(".menu-card");
  // Guarded on measured height, not on a class name: the menu is shown with
  // `.show` and hidden without it, and a guard that reads the wrong class is a
  // guard that silently never runs.
  if (!card || $("menu").clientHeight === 0) return;
  card.style.transform = "";
  const room = $("menu").clientHeight - 16;
  // offsetHeight, not scrollHeight: the card is sized to its content now, so its
  // own box IS what has to fit.
  const need = card.offsetHeight;
  const k = need > room ? Math.max(0.5, room / need) : 1;
  card.style.transform = k < 1 ? `scale(${k})` : "";
}

function buildMenu() {
  buildMaps();
  buildHeroPicker();
  buildMasks();
  const host = $("menu-diffs");
  host.innerHTML = "";
  for (const id of DIFFICULTY_ORDER) {
    const d = DIFFICULTIES[id];
    const b = document.createElement("button");
    b.className = `diff diff-${id}`;
    b.innerHTML =
      `<strong>${d.name}</strong><span>${d.tag}</span>` +
      // "999999 candy" is a number nobody needs to read.
      `<em>${d.free ? "Unlimited candy · nothing to lose" : `${d.lives} lives · ${d.money} candy`}</em>`;
    b.addEventListener("click", () => {
      unlock();
      startRun(id);
    });
    host.appendChild(b);
  }
  syncBest();
}

function syncBest() {
  const best = loadBest();
  const parts = Object.entries(best)
    .filter(([k]) => k.includes(":"))
    .map(([k, v]) => {
      const [m, d, blind] = k.split(":");
      return (
        `${MAPS[m]?.name ?? m} ${DIFFICULTIES[d]?.name ?? d}` +
        `${blind ? " blindfolded" : ""} wave ${v.wave}${v.won ? " ✔" : ""}`
      );
    });
  $("menu-best").textContent = parts.length ? `Best so far — ${parts.join(" · ")}` : "";
}

function recordBest() {
  const best = loadBest();
  const key = `${board}:${difficulty}${blindfold ? ":blind" : ""}`;
  const prev = best[key];
  const won = state.phase === "won";
  if (!prev || state.wave > prev.wave || (won && !prev.won)) {
    best[key] = { wave: state.wave, won: won || !!prev?.won || state.freeplay };
    saveBest(best);
  }
}

/**
 * Offer the run in progress, if there is one and it still loads.
 *
 * `sim.restore` is the judge, not this: a save from an older build — a piñata
 * that no longer exists, a map whose route moved — comes back null and the
 * button simply does not appear, rather than starting a game that cannot work.
 */
function syncResume() {
  const snap = loadRun();
  const btn = $("menu-resume");
  const ok = snap && sim.restore(snap);
  btn.classList.toggle("hidden", !ok);
  if (ok) {
    const where = MAPS[snap.map]?.name ?? snap.map;
    const how = DIFFICULTIES[snap.diff]?.name ?? snap.diff;
    $("resume-tag").textContent = `${where} · ${how} · wave ${snap.wave + 1}`;
  }
}

function resumeRun() {
  const g = sim.restore(loadRun());
  if (!g) return;
  bankedMasks = {};
  pipWave = -1;
  intelKey = "";
  difficulty = g.diff.id;
  board = g.map.id;
  state = g;
  fx.clear();
  armed = null;
  selected = null;
  speed = 1;
  paused = false;
  autoplay = false;
  autoT = 0;
  $("auto").classList.remove("on");
  $("speed").textContent = "1×";
  $("speed").classList.remove("fast");
  $("pause").title = "Pause";
  $("menu").classList.remove("show");
  $("modal").classList.remove("show");
  fit();
  syncHud();
}

function startRun(id, mapId = board) {
  // A new run invalidates the old save immediately. Without this, quitting to
  // the menu mid-campaign and starting something else left the menu offering to
  // resume a run you had already walked away from.
  clearRun();
  bankedMasks = {};
  pipWave = -1;
  intelKey = "";
  difficulty = id;
  board = mapId;
  state = sim.createGame(Date.now() & 0xffff, id, mapId, blindfold);
  state.heroId = chosenHero;
  // The shop is built once at boot, before a run exists. The hero card reads
  // off the run, so it has to be rebuilt here — and again the moment the hero
  // is placed, since there is only one and its card must then go away.
  buildCards();
  fx.clear();
  armed = null;
  selected = null;
  speed = 1;
  paused = false;
  autoplay = false;
  autoT = 0;
  $("auto").classList.remove("on");
  $("speed").textContent = "1×";
  $("speed").classList.remove("fast");
  $("pause").title = "Pause";
  document.body.classList.remove("paused");
  $("modal").classList.remove("show");
  $("menu").classList.remove("show");
  $("diff-label").textContent = DIFFICULTIES[id].name;
  $("map-label").textContent = MAPS[mapId].name;
  $("blind-flag").classList.toggle("hidden", !blindfold);
  syncHud();
}

function toMenu() {
  $("modal").classList.remove("show");
  if (state.over) clearRun();
  syncResume();
  $("menu").classList.add("show");
  syncBest();
  buildMasks();
  // The trophy wall changes height as masks are taken, so the fit is remeasured
  // every time the menu is opened rather than once at startup.
  fitMenu();
}

function banner(title, sub, kind = "") {
  const b = $("banner");
  b.className = `banner show ${kind}`;
  b.innerHTML = `<strong>${title}</strong><span>${sub}</span>`;
  bannerT = kind === "boss" ? 2.6 : 1.7;
}

function modal(title, text, canContinue = false) {
  $("modal-title").textContent = title;
  $("modal-text").textContent = text;
  $("modal-continue").classList.toggle("hidden", !canContinue);
  $("modal").classList.add("show");
}

// -------------------------------------------------------------------- input

// The canvas is now bigger than the playfield — the surplus is street. So a click
// converts to buffer pixels first, then subtracts the playfield's offset. Using
// the old map-proportional form would have skewed every placement by the margin.
function toWorld(evt) {
  const r = canvas.getBoundingClientRect();
  const L = layout(g, state.map);
  return {
    x: (((evt.clientX - r.left) / r.width) * L.bufW - L.ox) * PX,
    y: (((evt.clientY - r.top) / r.height) * L.bufH - L.oy) * PX,
  };
}

// Whichever tower is under the cursor, so its range can be previewed. Same hit
// test the click uses, factored out so hover and selection can never disagree
// about which piñata you are pointing at.
function towerAt(px_, py) {
  let best = 34;
  let found = null;
  for (const t of state.towers) {
    const d = Math.min(Math.hypot(t.x - px_, t.y - 40 - py), Math.hypot(t.x - px_, t.y - py));
    if (d < best) {
      best = d;
      found = t;
    }
  }
  return found;
}

canvas.addEventListener("pointermove", (e) => {
  const p = toWorld(e);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.inside = true;
  hover = armed ? null : towerAt(p.x, p.y);
});
canvas.addEventListener("pointerleave", () => {
  pointer.inside = false;
  hover = null;
});

canvas.addEventListener("pointerdown", (e) => {
  unlock();
  const p = toWorld(e);
  if (armed) {
    const wasHero = armed === HERO_ARM;
    const t = wasHero ? sim.placeHero(state, p.x, p.y) : sim.placeTower(state, armed, p.x, p.y);
    if (t) {
      if (wasHero) buildCards();
      sfx.place();
      fx.burst(p.x, p.y - 10, { n: 12, colors: ["#f2c53d", "#f2789b", "#3fc4c9"], spd: 190, shape: "streamer" });
      fx.ring(p.x, p.y - 10, 46);
      if (!e.shiftKey) armed = null;
      saveRun(state);
    } else {
      const price = shopDef(armed)?.cost ?? 0;
      fx.floatText(p.x, p.y - 20, state.money < price ? "Not enough candy" : "No room", "#ffb0ae", 15);
    }
    syncHud();
    return;
  }
  // Hit box covers the piñata body and its stand, not just the ground anchor.
  selected = towerAt(p.x, p.y);
  previewTiers = null;
  syncHud();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    armed = null;
    selected = null;
    syncHud();
  }
  if (e.key === " ") {
    e.preventDefault();
    if (state.phase === "build") doStartWave();
  }
  if (e.key === "a" || e.key === "A") {
    $("auto").click();
    return;
  }
  if ((e.key === "t" || e.key === "T") && selected) {
    const mode = sim.cycleTargeting(state, selected, e.shiftKey ? -1 : 1);
    fx.floatText(selected.x, selected.y - 62, mode.name, "#fdf6e8", 16);
    syncHud();
    return;
  }
  // 1-9 then 0 for the tenth, the usual hotbar convention. The roster grew to ten
  // and the coin piñata — the one you want early and often — was the one left
  // with no key at all.
  const n = e.key === "0" ? 10 : Number(e.key);
  if (n >= 1 && n <= TOWER_ORDER.length) {
    armed = TOWER_ORDER[n - 1];
    selected = null;
    syncCards();
  }
});

/**
 * Autoplay's countdown between rounds.
 *
 * Its own function so `window.__step()` can run it too: the frame loop is where
 * it lives, a hidden tab pauses the frame loop, and a QA hook that skips it would
 * report "autoplay does nothing" on a feature that works.
 *
 * A beat rather than instantly — the wave-held banner and the candy shower need a
 * moment to be read, and BTD6 leaves the same gap.
 */
function tickAuto(dt) {
  if (!autoplay || state.phase !== "build") {
    if (state.phase !== "build") autoT = 0;
    return;
  }
  autoT += dt;
  if (autoT > 1.4) {
    autoT = 0;
    doStartWave();
  }
}

function doStartWave() {
  // Saved BEFORE the wave rather than after it: the snapshot is of the build
  // phase, and this is the last moment the board is in the state you decided on.
  saveRun(state);
  if (!sim.startWave(state)) return;
  sfx.waveStart();
  const boss = WAVES[state.wave - 1].some((grp) => ENEMIES[grp.id].boss);
  banner(`Wave ${state.wave}`, boss ? "El Campeón is here" : "They are coming for the piñata", boss ? "boss" : "");
  syncHud();
}

$("start-wave").addEventListener("click", () => {
  unlock();
  doStartWave();
});
$("speed").addEventListener("click", () => {
  speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
  $("speed").textContent = `${speed}×`;
  $("speed").classList.toggle("fast", speed > 1);
});
$("auto").addEventListener("click", () => {
  autoplay = !autoplay;
  autoT = 0;
  $("auto").classList.toggle("on", autoplay);
});

$("pause").addEventListener("click", () => {
  paused = !paused;
  $("pause").title = paused ? "Resume" : "Pause";
  $("pause").classList.toggle("on", paused);
  // On the board, not just on the button: the button lives in the shop panel now
  // and a paused game that looks identical to a game between rounds is a game you
  // stare at wondering why nothing is happening.
  document.body.classList.toggle("paused", paused);
});
$("mute").addEventListener("click", () => {
  setMuted(!isMuted());
  $("mute").title = isMuted() ? "Muted" : "Sound";
  $("mute").textContent = isMuted() ? "\u25c2" : "\u25c2\u1d34";
});
$("menu-resume").addEventListener("click", () => {
  unlock();
  resumeRun();
});
$("quit").addEventListener("click", toMenu);
$("sel-target").addEventListener("click", (e) => {
  if (!selected) return;
  unlock();
  const mode = sim.cycleTargeting(state, selected, e.shiftKey ? -1 : 1);
  fx.floatText(selected.x, selected.y - 62, mode.name, "#fdf6e8", 16);
  sfx.coin();
  syncHud();
});
$("sel-sell").addEventListener("click", () => {
  if (!selected) return;
  const r = sim.sellTower(state, selected);
  // `null` means the sim refused (a hero). Without this the float text read
  // "+null" over the piñata and the run carried on as though it had sold.
  if (r === null) return;
  fx.floatText(selected.x, selected.y - 30, `+${r}`, "#ffe08a");
  sfx.coin();
  selected = null;
  syncHud();
  saveRun(state);
});
$("modal-retry").addEventListener("click", () => startRun(difficulty));
$("modal-menu").addEventListener("click", toMenu);
$("modal-continue").addEventListener("click", () => {
  unlock();
  if (!sim.continueFreeplay(state)) return;
  $("modal").classList.remove("show");
  banner("Freeplay", "They keep coming. See how far you get.");
  sfx.waveStart();
  syncHud();
});

// ------------------------------------------------------------------- events

// Refilled once per frame so a busy wave cannot turn into a wall of noise.
let budget = { sound: 4, resist: 1 };

function handle(events) {
  handleEvents(events, {
    state,
    fx,
    sfx,
    banner,
    modal,
    recordBest,
    recordMasks,
    difficultyName: DIFFICULTIES[difficulty].name,
    budget,
  });
}

// --------------------------------------------------------------------- loop

let last = performance.now();

/**
 * The placement preview under the cursor. Shared with `window.__draw()` so a QA
 * screenshot shows what a player would be looking at — drawing with no ghost was
 * making the armed state invisible in every shot taken by hand.
 */
function currentGhost() {
  if (!armed || !pointer.inside) return null;
  // Not `TOWERS[armed]`: `armed` can be the hero's sentinel, and this runs on
  // every frame — an unguarded lookup here stops the game, it does not just
  // hide a preview.
  const g = shopDef(armed);
  if (!g) return null;
  return {
    x: pointer.x,
    y: pointer.y,
    ok: sim.canPlace(state, pointer.x, pointer.y) && state.money >= (g?.cost ?? 0),
    // Effective reach, not firing range. The mariachi trio has `range: 0` and
    // works entirely through its aura, so this drew a zero-radius ghost ring.
    range: sim.reach(g ?? {}),
    sprite: g?.sprite ?? "candy",
  };
}

// Set by `__sheet()`. Taking a screenshot of a background tab wakes it, which
// resumes rAF, which redraws the game over anything drawn into the canvas by
// hand — so the contact sheet only survives if the loop agrees to stand still.
let frozen = false;

function frame(now) {
  if (frozen) {
    // Keep painting the sheet rather than skipping the frame outright: a page
    // that never commits a frame makes Page.captureScreenshot hang, so "stand
    // still" has to mean "draw the same thing again", not "draw nothing".
    last = now;
    drawSheet();
    requestAnimationFrame(frame);
    return;
  }
  const dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  budget = { sound: 4, resist: 1 };

  if (!paused) {
    tickAuto(dtReal);
    const steps = speed;
    for (let i = 0; i < steps; i++) handle(sim.update(state, dtReal));
    fx.update(dtReal * speed);
    if (bannerT > 0) {
      bannerT -= dtReal;
      if (bannerT <= 0) $("banner").className = "banner";
    }
  }

  drawWorld(g, state, { ghost: currentGhost(), selected, hover });
  syncHud();
  requestAnimationFrame(frame);
}

fit();
buildCards();
syncPanelRoom();
buildMenu();
// The menu is built after `fit()` ran, so its first measurement has to happen
// here or the very first screen you see is the one that does not fit. Called
// directly, NOT through rAF: a hidden tab pauses the frame loop, and "the menu
// only fits once you look at it" is a bug that hides itself.
syncResume();
fitMenu();
// Web fonts change every measurement in the card, so once they land, again.
if (document.fonts?.ready) document.fonts.ready.then(fitMenu);
syncHud();
requestAnimationFrame(frame);

// QA hooks. A hidden preview tab pauses rAF, so stepping and drawing have to
// be drivable by hand — otherwise screenshots come back blank.
window.__game = () => state;
// The frame loop's DOM pass, on its own hook. Without it the only way to test
// what sixty syncs a second do to the panel is to have a visible tab and real
// time, and a hidden tab pauses rAF — which is exactly how the rebuild bug
// stayed invisible.
window.__sync = () => syncHud();
// Sprite builders on a hook. A dynamic `import()` from the devtools evaluator
// hangs the renderer, so judging art needs the module handed out from inside.
window.__art = { towerSprite };
window.__step = (secs = 1) => {
  const n = Math.ceil(secs / 0.016);
  for (let i = 0; i < n; i++) {
    tickAuto(0.016);
    handle(sim.update(state, 0.016));
    fx.update(0.016);
  }
};
window.__draw = (ghost = currentGhost()) => {
  frozen = false;
  document.body.classList.remove("sheeting");
  drawWorld(g, state, { ghost, selected, hover });
  syncHud();
};
window.__sim = sim;
// The live layout — scale, buffer size and the playfield's offset inside it.
// Exposed because every screenshot probe needs to turn a sim position into a
// screen one, and hand-recomputing that formula in a console snippet is how the
// veil and the fitter ended up with rules that disagreed.
window.__layout = () => layout(g, state.map);
window.__toScreen = (x, y) => {
  const L = layout(g, state.map);
  const r = canvas.getBoundingClientRect();
  return [r.left + ((x / PX + L.ox) / L.bufW) * r.width, r.top + ((y / PX + L.oy) / L.bufH) * r.height];
};

/**
 * Contact sheet: every sprite at 1x, at gameplay scale, and in greyscale. The
 * greyscale row is the point — it removes colour, which is the crutch that makes
 * a weak silhouette look fine. Renders onto the game canvas; reload to clear.
 */
// Greyscale copies are cached: the sheet redraws every frame while frozen, and
// getImageData per sprite per frame is both slow and pointless when the sprites
// never change.
const greyCache = new Map();
function greyscale(spr) {
  let hit = greyCache.get(spr.canvas);
  if (!hit) {
    hit = document.createElement("canvas");
    hit.width = spr.canvas.width;
    hit.height = spr.canvas.height;
    const t = hit.getContext("2d");
    t.drawImage(spr.canvas, 0, 0);
    const d = t.getImageData(0, 0, hit.width, hit.height);
    for (let k = 0; k < d.data.length; k += 4) {
      const v = (d.data[k] * 0.299 + d.data[k + 1] * 0.587 + d.data[k + 2] * 0.114) | 0;
      d.data[k] = d.data[k + 1] = d.data[k + 2] = v;
    }
    t.putImageData(d, 0, 0);
    greyCache.set(spr.canvas, hit);
  }
  return hit;
}

/**
 * The contact sheet: every sprite at 1x, at gameplay scale, and in greyscale.
 *
 * The greyscale column is the point — it removes colour, which is the crutch that
 * makes a weak silhouette look fine. It used to draw the two big columns at
 * PX/2, which is not gameplay scale and is exactly the size at which a silhouette
 * problem hides, and it drew under the HUD so the first row was behind the life
 * and candy pills.
 */
function drawSheet() {
  const names = spriteNames();
  frozen = true;
  document.body.classList.add("sheeting");
  const cellW = Math.max(150, Math.floor(canvas.width / Math.max(1, Math.floor(canvas.width / 176))));
  const cols = Math.max(1, Math.floor(canvas.width / cellW));
  const cellH = Math.min(168, Math.floor((canvas.height - 20) / Math.ceil(names.length / cols)));
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#2b2038";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.textAlign = "center";
  names.forEach((n, i) => {
    const s = sprite(n);
    const w = s.canvas.width * PX;
    const h = s.canvas.height * PX;
    const cx = (i % cols) * cellW;
    const cy = Math.floor(i / cols) * cellH + 8;
    // Baselines aligned so a row reads as one comparison, not three sizes.
    const foot = cy + cellH - 24;
    const put = (img, x, sw, sh) => g.drawImage(img, Math.round(x), Math.round(foot - sh), sw, sh);
    put(s.canvas, cx + 10, s.canvas.width, s.canvas.height);
    put(s.canvas, cx + 18 + s.canvas.width, w, h);
    put(greyscale(s), cx + 26 + s.canvas.width + w, w, h);
    g.fillStyle = "#f3ecff";
    g.font = "600 12px system-ui, sans-serif";
    g.fillText(n, cx + cellW / 2, cy + cellH - 8);
  });
  return names;
}

window.__sheet = () => drawSheet();
window.__menu = {
  start: startRun,
  toMenu,
  best: loadBest,
  masks: loadMasks,
  // The blindfold has no menu control any more — the campaign is about El Coloso
  // and a second toggle above the difficulty buttons was competing with him. The
  // mode itself is intact and still tested; this is how it is reached.
  setBlind: (v) => {
    blindfold = v;
    syncBest();
  },
  isBlind: () => blindfold,
};
