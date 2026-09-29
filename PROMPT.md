# Piñata Uprising — working prompt

Paste this to pick the project up cold. It encodes the decisions that were
expensive to reach, so re-deriving them is waste.

---

You are continuing **Piñata Uprising**, a Bloons TD 6-shaped tower defense at
`C:\Users\srobs\pinata-uprising`. Static single folder — HTML, CSS, vanilla ES
modules. No build step, no asset files, no dependencies. Serve it with:

```bash
npx -y http-server C:/Users/srobs/pinata-uprising -p 8140 -c-1
```

## The premise, which is settled

The piñatas fight back. **Piñatas are the towers and what is inside one is what
it shoots** — a chili piñata sprays fire, a coin piñata pays out. The enemies are
the people who came to smash them: luchadores, matadors, a bull, a tag-team
champion. Do not redesign this. It was arrived at by iterating over penguins,
jellyfish, jawbreakers and gumballs, and it is the reason every tower explains
its own mechanic without a tutorial.

Four design pillars, all load-bearing:

- **Lives are an object, not a number.** The great piñata at the end of the lane
  darkens, cracks, sags, changes expression and leaks candy. In Blindfold mode
  the HUD number is replaced with `???` and reading that object is the only way
  to know your health — so it stays lit even under the fog.
- **Income is a physical event.** Defeated luchadores spill looted candy across
  the lane; it is collected a beat later. Money never silently ticks up.
- **Defeat is losing the mask** — *máscara contra máscara*. That is the pop, and
  the masks you take are the run-to-run keepsake.
- **Every counter rule is guessable on sight.** A cape deflects slow shots. A
  foil mask sheds fire. A bull ignores slows. Nobody should need telling.

## ART: pixel art, and the rules are not negotiable

The art has been rebuilt twice. The first version enforced *"flat fills only, no
gradients, no realistic lighting"* — which is the exact opposite of the look it
was copying, and it is why it read as cheap for eighteen rounds. The second was
soft-shaded vector. **The current and chosen direction is pixel art.**

Pixel art is not a filter you apply to sprites. It is a property of the whole
scene, and breaking any of these makes it read as a mistake rather than a style:

1. **One low-res buffer.** `PX = 4`, so a 960×600 board is a **240×150 art
   grid**. Everything — ground, lane, sprites, projectiles, particles, the fog —
   is drawn into that buffer, which is then scaled up with
   `imageSmoothingEnabled = false`. `render.js` owns it.
2. **Integer positions, always.** Sim coordinates are screen pixels; divide by
   `PX` and round. A sprite on a half pixel is the single fastest way to ruin it.
3. **Whole-pixel motion.** Enemy hops step 1–2 whole pixels, they do not ease.
   Sub-pixel animation is the other classic tell.
4. **Four-tone ramps.** Lightest to darkest, in `P` in `art.js`. Three reads as
   posterised, five is indistinguishable at this size.
5. **Dither, never fade.** Gradients band horribly in four colours. The ground
   vignette, contact shadows and the Blindfold veil all dither.
6. **Derived outlines.** `outline()` paints any empty cell touching a filled one.
   Every sprite gets a clean silhouette for free — the one rule that survived
   both rewrites.
7. **Silhouette rules.** At 16–20 art pixels there is no room for detail, so each
   tower and enemy must be identifiable by shape alone. Enemies must read
   *smaller* than the piñatas defending against them.

Sprites are **generated, not hand-typed as string maps** — `disc()` is a distance
function against a light vector, which is shorter to write and impossible to get
subtly wrong by miscounting a row. Light always comes from the upper left.

Text is the one exception: floating labels draw at screen resolution after the
upscale, because 4px glyphs are unreadable.

## What exists

| | |
|---|---|
| Piñatas | candy, chili, gum, maraca, firecracker, sparkler, coin |
| Upgrades | 3 paths × 4 tiers, BTD6's two-paths-max restriction rule |
| Enemies | 8 tiers, 6 counter rules |
| Maps | Plaza del Sol, El Mercado, Cementerio |
| Difficulties | Fiesta, Plaza, Máscara |
| Waves | 15 authored, then endless freeplay |
| Extras | 4 targeting modes, mask collection, Blindfold challenge |
| Tests | 88, plus two measurement harnesses |

```
src/art.js       pixel grid helpers, sprite builders, palettes
src/data.js      maps, towers, enemies, waves, difficulty knobs
src/upgrades.js  three paths per tower + the restriction rule
src/sim.js       pure simulation — no DOM, no canvas, no timers
src/render.js    owns the low-res buffer; reads sim state, never writes it
src/feedback.js  sim events to particles, sound, banners, modals
src/fx.js        particles (buffer) and floating text (screen)
src/audio.js     synthesized WebAudio SFX, no files
src/main.js      input, menu, HUD, loop
test/knobs.mjs   binds PU_* env knobs — MUST be imported before data.js
```

## How to work

**Verify visually, every time.** The Browser pane is often not displayed, so
`computer{screenshot}` times out. The workaround: run a throwaway Node collector
and have the page POST `canvas.toBlob()` to it.

A hidden tab pauses `requestAnimationFrame`, so drive the game by hand:

- `window.__game()` — live state
- `window.__step(secs)` — advance sim and fx without rAF
- `window.__draw()` — force one render frame
- `window.__sim`, `window.__menu` — scripted placement and menu control

**Measure balance, do not guess:**

```bash
node --test "test/*.test.js"
node test/playtest.mjs 5 --maps --all     # three bots x three maps x three modes
node test/sensitivity.mjs 3               # lever elasticity + income loop gain
```

Three bot profiles: `spread` (wide, cheap upgrades), `focused` (7 towers on
coverage-optimal spots), `deep` (saves for top tiers). They are not
weak-to-strong — they fail in different places by design, so read the set.
All nine map/difficulty cells are currently clearable and none of the three
strategies dominates. Keep it that way.

Tuning constants come in **pairs**, with their measurement tables beside them in
`data.js`. Change one and re-sweep the other:

- `EDGE_MUL` 0.55 costs ~28% DPS; `HP_MUL` 0.72 repays it.
- `BOUNTY_MUL` 0.8 with `BONUS_BASE` 98 / `BONUS_PER_WAVE` 11 holds the income
  feedback loop near 1.0× gain.
- `DEEP_POWER` 3 is what stops a top tier being a trap.

## Traps, each already paid for at least twice

- **Assigning `e.x`/`e.y` in a test is silently undone** — `update()` recomputes
  position from `e.dist` every frame. Walk enemies down the lane instead.
- **A support tower with token damage gets misread as a carry** by the playtest
  bot. Classify on the mechanic a tower owns, not on `damage > 0`.
- **A new event kind ships with no handler** because the coverage test never
  builds the tower that raises it. `feedback.test.js` builds one of each.
- **A new enemy rule lands far harder than intended** because it excludes more
  towers than you pictured. Check which towers a rule *spares* before sizing it.
- **A harness that silently ignores its knobs** returns identical numbers for
  every sweep case. Import `test/knobs.mjs` first.
- **An outcome metric that conflates two things.** Total `earned` mixes income
  loop gain with run length; `lives%` collapses to 0 near the tuning edge.
- **A global nerf drowns the differential you are measuring.** Compensate the
  overall power change first, then read the gap.
- **A bot's policy limits look like game facts.** "Tier 4 is never bought" was
  really "a greedy buyer never saves".
- **Two profiles differing in more than one variable prove nothing.**
- **Scaling tower range does not change the skill gap** — the coverage advantage
  of a converging corner is scale-invariant, flat at ~1.4× from range 70 to 190.
  Falloff discriminates; scaling does not.

## Standing instructions

- **Do not add a feature until the art is right.** That is the whole reason the
  render layer was rebuilt. If something looks bad, fix that before building.
- Report what the numbers say, including when they contradict something written
  above. Every entry in the trap list started as a confident wrong claim.
- Keep `LOOP_LOG.md` current: one line per round, what was built and what it
  turned up. It is the handoff.
- Do not commit — this repo is deliberately left uncommitted.
- Work in visible iterations. After each, screenshot it.

## Where to pick up

`LOOP_LOG.md` has the running log and a next-step list. As of the pixel-art
rebuild, the sprite craft is a first pass and the known rough edges are:

1. **Enemy distinctiveness at 17px.** The masked luchadores differ mainly by
   palette; at this size several read as the same blob in a crowd. They need
   silhouette differences — headgear, stance, props — not just colour.
2. **The great piñata's face** is cramped in its shaded star.
3. **Contact shadows over the pale lane** read as a grey smudge rather than a
   shadow. They may need a palette-matched dither per surface.
4. Then: the last three piñatas (ribbon dancer, papel picado, mariachi trio),
   and El Mercado's coverage ratio.
