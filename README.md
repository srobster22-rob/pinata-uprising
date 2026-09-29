# Piñata Uprising

> **At a glance** — A Bloons TD–style tower defense game built in vanilla JavaScript
> ES modules and HTML5 Canvas, with no engine, assets or dependencies: all art is drawn
> in code. Towers with upgrade paths, 16 waves ending in a boss fight, and an automated
> test suite. Built by Robert Schwartz.

They came with sticks. The piñatas were ready.

A Bloons TD 6-shaped tower defense where the piñatas are the towers and the
people trying to smash them are the enemies. Static single-folder site — HTML,
CSS and vanilla ES modules. No build step, no asset files, no dependencies.

```bash
npx -y http-server C:/Users/srobs/pinata-uprising -p 8140 -c-1
```

Then open <http://localhost:8140>.

## The design

**Piñatas are the towers, and what is inside one is what it shoots.** A chili
piñata sprays fire, a firecracker piñata bursts, a gum piñata gums them up, a
ribbon dancer whips a streamer from one luchador to the next, a papel picado
cuts whatever walks under the paper, a mariachi trio plays for the neighbours,
a coin piñata pays out. Every tower explains its own mechanic without a tutorial,
and upgrading one means stuffing it fuller, so it visibly swells.

**Enemies are the people with sticks**, tiered by mask colour and silhouette —
niño, matador, técnico, rudo, plateado, colgado, toro, El Campeón. Two
independent readable channels instead of one.

**Your lives are an object, not a number.** The great ceremonial piñata at the
end of the lane sags, changes expression, leaks candy — and **loses chunks of its
own silhouette**: a star point at a third damaged, three more past two thirds.
Cracks drawn inside the body read as texture at gameplay scale; only the outline
survives every zoom, and this is the one health display the blindfold leaves you.

**Income is a physical event.** The luchadores are carrying candy they have
already looted. Defeat one and it showers across the lane, then gets collected
a beat later.

**Defeat means losing the mask** — *máscara contra máscara*, the real sport's
highest stake. That is the pop.

## What is in it

| | |
|---|---|
| Piñatas | candy, chili, gum, maraca, papel picado, firecracker, ribbon dancer, mariachi trio, sparkler, coin — all ten |
| Upgrades | 3 paths x 4 tiers each, BTD6's restriction rule |
| Enemies | 8 tiers, 6 counter rules |
| Maps | Plaza del Sol, El Mercado, El Caracol, Cementerio |
| Difficulties | Fiesta, Plaza, Máscara |
| Waves | 15 authored, then endless freeplay |
| Targeting | First / Last / Strong / Close |
| Controls | 1-9 and 0 pick a piñata, space sends, **A** auto-sends, T retargets, esc cancels |
| Keepsake | mask collection, banked every wave |
| Challenge | Blindfold — fog of war, hidden intel, hidden life count |

### Counter matrix

Six rules, each guessable on sight before you have been taught it — and the
next-round card names the ones that apply to the wave actually coming, ordered by
how much each takes away (foil sheds 85% of burn, a cape 60% of slow shots, a
swing ~45%, the rudo's hide 35% of sharp). Blindfolded it says nothing: advice is
intel, and that mode withholds intel.

| Enemy | Reads as | Counter |
|---|---|---|
| Matador | a cape | deflects slow shots — use fast candy or splash |
| Rudo | a heavyweight | resists sharp, and shrugs a stun off in half the time |
| Plateado | a foil mask | fire slides off — bring anything but chili |
| Colgado | slung on a rope | swings clear of slow shots; needs speed or splash |
| Toro | a charging bull | immune to slows, accelerates down the lane |
| El Campeón | a title belt | tags in a partner squad, and barely feels a stun |

Projectile **speed** is a real axis, not flavour: the matador's cape and the
colgado's swing both only work below 500. Candy (560) and the sparkler (900)
punch through both; chili (420), gum (400), the maraca (480) and the ribbon
dancer (470) do not — the ribbon's whole trade is area damage bought with a
counter that beats it outright. The papel picado sits outside the axis
altogether: it has no projectile, so neither the cape nor the swing has anything
to answer, and it pays for that with the shortest reach in the game and no burst.

### The blindfold

The real piñata game is played blindfolded and spun around, so here **you** are
the one who cannot see — your piñatas know perfectly well where to swing. It
toggles on top of any map and difficulty:

- **Fog of war.** Only ground within reach of a piñata is legible. Enemies,
  shots and spilled candy outside that are not drawn at all. Your own great
  piñata stays lit, because the mode withholds the life *number* and expects
  you to read its condition instead — veiling it too would leave no health
  information whatsoever, which is not the trade being offered.
  A piñata lights **what it works over**, which is its aura for the mariachi
  trio and its field for the papel picado, not its firing range — so the trio,
  which does no damage at all, lights the widest circle on the board (158 against
  the candy piñata's 144). `sightRadius()` is exported from `sim.js` because the
  veil needs the same number: it used to carry its own copy of the expression and
  the two drifted the moment one was fixed.
- **No intel.** The next-wave panel shows `?`, so the counter matrix becomes
  something you react to rather than look up.
- **No life count.** The HUD reads `???`.
- **It pays nothing.** A candy premium was the original plan and got cut — see
  below.

Best runs are filed separately, so a blindfolded clear is its own record.

**Why there is no reward.** A premium here cannot be priced. The harness sees
only the payout — a bot does not use information, so it banks the bonus and
ignores the fog — so `node test/playtest.mjs --blind` measures the wrong half of
the trade. With the premium at 1 the blindfolded grid is identical to the normal
one, and that identity is the proof the mode touches nothing but presentation.

### Upgrades

BTD6's shape: three paths, four tiers each, and BTD6's 5-2-0 rule scaled —
**at most two paths may be opened, and only one of them may go past tier 2**, so
3-2-0 is legal and 3-3-0 is not. That is what stops every maxed piñata being the
same piñata. `upgrades.js` owns it.

**A row is the whole explanation, and it has no sentences in it**: a four-slot
track showing how far along you are, the tier's name, what it *does* as chips —
`+6 dmg`, `-18% cool`, `+1 chain` — and the price. Those chips are generated from
the same `mod` the sim applies (`describeMod()`), so a row cannot promise
something the tower does not do; the alternative was 36 hand-written blurbs that
could go stale in silence. Two things it takes care to say right: a *cut* to
cooldown or to enemy speed is a gain, not a loss, and a fraction of a whole is
never advertised past 100% — `DEEP_POWER` triples a top tier's additive part, and
"+105% pierce" is a promise the sim cannot keep.

**A refusal answers.** A row you cannot afford is dimmed with a red price but is
still a live button: clicking it shakes the row, floats the price over the piñata
and plays the refusal sound. Disabling it instead is exactly what "I click upgrade
and nothing happens" feels like. A row blocked by the path rule shows a padlock
and its own path name — naming the upgrade behind the lock made a row you cannot
buy look like one you can.

**Every refusal answers.** Three things could refuse an upgrade click — no
candy, no path left under the restriction rule, nothing left to buy — and two of
them were `disabled` buttons, which fire no event at all. Clicking a locked path
did literally nothing: no sound, no message, no movement, with the reason hidden
in a hover tooltip. That is precisely what "I click upgrade and nothing happens"
is, and it was reported twice.

No row is ever disabled now. Each one shakes, plays the refusal note and floats
the reason over the piñata, and a locked row carries the rule as a badge where
its numbers would go — `2 paths max`, `1 path past T2` — so you know before you
click rather than after.

A **finished** path was caught by the same branch and rendered with the same
padlock and the same grey as a forbidden one, so completing a path looked like
being told off. `blockedBy` now returns a code, and MAX is gold and filled while
the two actual rules stay locked. One table carries both phrasings — badge and
sentence — so the row and the refusal cannot drift apart.

## The screen

**Nothing carves a column out of the screen.** The board is the whole window and
every panel — the shop, the counters, the controls, the next-round card, the
upgrade window — is laid over it. A shop rail that takes a column shrinks the
playfield exactly on the window shapes where the playfield is already scarce.

- **Shop:** right edge, full height, `17%` of the window width (min 136, max 250).
  Tower cards, and under them whatever piñata you are pointing at.
- **Counters and controls:** top-left, one cluster — the corner an eye already
  goes to for lives and candy is the corner a hand goes to for the round.
- **Next round:** bottom-left. **Upgrade window:** the side away from the shop.
- **Scrolling:** the tower list, and nothing else. The page never scrolls.

**No manual on screen.** There is no cheat sheet panel and no instruction line:
the counter rules that matter arrive on the next-round card when the wave that
needs them is coming, and what a piñata does is on the card you are hovering.

**The panel is a constraint on the map, not a subtraction from it.** Taking its
width off the window before scaling cost 17% of the board at 1920x1080 — a window
where the plaza is bound by *height* and leaves 285px of surplus width the panel
fits inside with room to spare. So the board is scaled to the window, then shrunk
only if the plaza would not otherwise clear the shop:

| window | playfield | shop costs |
|---|---|---|
| 2514x1269 | 1915x1197 | nothing |
| 1920x1080 | 1630x1019 | nothing |
| 1280x720 | 1038x649 | 8% |
| 785x1260 | 625x391 | 17% |

**The street inset is reserved on the axis that is not binding.** A fixed-aspect
playfield in a window of another shape always has surplus on one axis and none on
the other, so taking a margin off both wastes board twice. Both axes still keep a
few pixels of band, because at zero the plaza runs flush off the edge and its kerb
is cut, which reads as a board that did not finish drawing.

**The panels wear the game's colours.** The shop was near-white against warm plaza
and deep street, which read as a browser dialog parked on a game; it is the same
dark plum as the page and the blindfold veil now, with cream type, gold cost
badges and cream cards so the sprites still pop.

## Art rules

These are load-bearing. The previous attempt at this game (`../pulse-defense`)
failed because it drew everything with `ctx.arc()`, and no amount of systems
work fixed that.

1. One ink colour (`#22384a`), constant **3px on screen** at every sprite
   scale — `art.js` divides the line width back out of the scale to hold this.
2. Every object in five layers: shadow, base, body, highlight, outline.
3. Each tower passes the silhouette test — identifiable as a solid black shape
   at 32px.
4. The lane is a light high-contrast ribbon with a dark border and a dashed
   centreline, over saturated ground.
5. Flat fills only. No gradients, no realistic lighting.

Sprites are authored as SVG path data in `art.js`, rasterized once to offscreen
canvases at load, then blitted. Enemies use a hop-and-squash cycle rather than
a walk cycle — cheaper to build and more cartoon, not less.

## Layout

```
index.html         shell, menu, HUD
style.css          chunky bordered panel styling
src/art.js         sprite definitions and the rasterizer
src/data.js        maps, towers, enemies, waves, difficulty knobs
src/feedback.js    sim events to particles, sound, banners, modals
src/upgrades.js    the three paths per tower + the restriction rule
src/sim.js         pure simulation — no DOM, no canvas, no timers
src/render.js      draws sim state, never writes it
src/fx.js          particles, screen shake, floating text
src/audio.js       synthesized WebAudio SFX, no files
src/main.js        input, menu, HUD wiring, loop, sim events to feedback
test/sim.test.js   sim, waves, freeplay
test/upgrades.test.js  paths, restriction rule, per-tower mechanics, targeting
test/feedback.test.js  every event kind, with stub fx/sfx
test/layout.test.js    which side the shop rail takes, at every window shape
test/knobs.mjs     binds PU_* env knobs; MUST be imported before data.js
test/playtest.mjs  headless balance harness
test/boards.mjs    board shape: lane, speed, coverage ratio
test/sensitivity.mjs  lever elasticity + income loop gain
```

The sim is pure so it runs headless. Render and audio react to the event list
`update()` returns rather than reading state, which is why balance can be
checked without a browser.

## The economy

Candy comes from two places, and the split matters more than the total:

- **Bounties** are performance-dependent, and therefore a feedback loop — candy
  buys defence, defence kills more, kills pay more candy.
- **The fixed wave bonus** has no such loop.

`BOUNTY_MUL` sets the split. At 1.0 the loop had a gain of **2.12x/1.56x**,
meaning a 10% income nudge produced ~20% more candy over a campaign and income
could not be tuned in small steps. At 0.8, with the wave bonus raised to make up
the difference, gain is **0.94x/1.18x** — near 1, so income is now the milder of
the two main levers:

|  | spread | focused |
|---|---|---|
| hp elasticity | −156% | −61% |
| income elasticity | +75% | +85% |
| income loop gain | 0.94x | 1.18x |

The split cannot be pushed much further, and not because of the loop: **bounty
candy rewards board coverage while fixed candy rewards concentration**, so the
mix quietly picks a favourite strategy. 0.8 is the only share measured where both
bots survive all three boards. The table is in `data.js` next to the constant.

Two things worth knowing before touching any of this:

- **A top tier is a 3x power spike, and it has to be.** `DEEP_POWER` scales the
  additive part of tier 4, because 2100 candy spent maxing one path otherwise
  buys about ten fresh piñatas and ten fresh piñatas win on raw damage. At 1x,
  saving for a top tier finished on 0/6/0 lives% against 44/68/42 for spending
  it broadly — depth was a trap. At 3x it is 42/58/18: viable, never dominant.
- **`focused` outperforms `spread` because of placement, not spending.** No
  economy lever closes that gap. Range falloff closes most of it — see below.

## Range, and why placement is priced

Piñata damage falls off linearly with distance: full at a piñata's feet, `EDGE_MUL`
(0.55) at the rim. It exists to price *placement*, and it is the only lever found
that discriminates between build styles.

**Scaling range does not work.** The coverage advantage of a converging corner is
scale-invariant — the best 7 spots beat a spread 7 by a flat ~1.4x from range 70
through 190 — so `RANGE_MUL` moves both styles together, and below 1.0 it simply
kills the wide build first while the narrow one holds.

**Falloff works because the two styles engage at different distances.** A
coverage-optimised build holds **88-91%** of its covered lane in the outer half of
its range; a wide build holds **70-72%**. So falloff charges the narrow build for
the reach it is exploiting. Measured effect on the gap (focused − spread, lives%):

| | Plaza del Sol | El Mercado | Cementerio |
|---|---|---|---|
| hard edge | +8 | +67 | +32 |
| falloff 0.55 | **+14** | **+56** | **+12** |

`EDGE_MUL` and `HP_MUL` are a pair: falloff costs ~28% effective DPS and
`HP_MUL` 0.72 repays it. Shipping one without the other makes every board
unwinnable — and note that a global nerf like that will *drown* the differential
you are trying to measure, so compensate first, then read the gap.

### El Caracol

The fourth board, and the only one whose base sits in the middle of it. The lane
spirals inward and wraps the same ground twice, so a piñata near the centre covers
passes that are far apart in *time* rather than in space — and the great piñata is
the thing you stand around rather than the thing at the far end.

It is the one board where clustering pays: the `band` probe, which loses every
cell everywhere else, holds 14% of its lives here on Fiesta and finishes Plaza.

**It also demonstrated the lane-length trap twice over.** At 4810px and `speedMul`
0.92 every profile finished Máscara on 70-98% lives — a long lane is a long time
under the guns. Normalising by traversal *time* (length ÷ speed) against
Cementerio's traversal time of 3193 units suggested 1.08, and that was still far too soft, because
time is not the only axis: a spiral gives each tower several passes to shoot at.
Measured up to 1.26 (too harsh — the wide build died at Plaza) and settled at
**1.17**, where the board's shape reads the way the other three do: everyone
comfortable on Fiesta, the wide build struggling on Plaza, nearly dead on Máscara.

**El Mercado is the board falloff cannot fix**, and the reason is not the one
this file used to give. Its parallel legs sit 130-150px apart against a range of
118, so one piñata covers two legs; widening them to ~190px was tried and made it
worse (gap +67, coverage ratio 1.48x → 1.62x, lane 3280 → 3990px), and the note
here said the metric to optimise was that coverage ratio.

Measured across all three boards, it is not. `node test/boards.mjs`:

| board | lane | speedMul | coverage ratio | narrow-build gap |
|---|---|---|---|---|
| Plaza del Sol | 2014px | 1.00 | 1.90x | −5 |
| El Mercado | 3130px | 1.16 | 1.94x | +30 |
| El Caracol | 3500px | 1.17 | 1.80x | +27 |
| Cementerio | 3550px | 1.16 | 1.39x | +19 |

When this table was first taken, El Mercado had the *lowest* ratio (1.46x) and
the *largest* advantage for a concentrated build — the relationship was already
inverted. Respacing its legs to clear the lane-overlap check then moved that
ratio to **1.94x**, a 33% swing, and the gap stayed at exactly **+30**. The
metric this file once said to optimise can be dragged across a third of its
range without touching the thing it was supposed to predict. What the gap does track is **lane speed**:
dropping El Mercado to `speedMul` 1.0 halved it, +30 → +15 at Plaza difficulty.
A fast lane rewards concentration, because a thinly spread piñata gets fewer
seconds on each enemy that passes while a knot puts several piñatas on the same
enemy at once. That is the lever if the gap ever needs closing — at the cost of
re-tuning the board's difficulty, since speed is also its main difficulty dial.

### El Coloso

Fifteen waves are the road; the sixteenth is the point. The boss is in the
title because a tower defence without a named thing to beat is a score screen
with extra steps — you are not surviving waves, you are working up to him.

He is 5200hp at speed 22 with `leak: 100`, which is every life you have: he does
not chip you, he ends the run. He resists sharp 60% and burn 45%, so the two
cheapest damage types you have been leaning on all game are the wrong answer,
and `stunResist: 0.95` means the maraca cannot simply park him.

Then he changes twice, on health rather than on a timer:

| at | he becomes | speed | sharp/burn resist | brings |
|---|---|---|---|---|
| 66% | the mask comes off | 30 | 30% / 20% | 3x tecnico |
| 30% | furious | 41 | 15% / 10% | 2x toro, 1x rudo |

Each phase strips armour and adds speed, so the fight opens with him nearly
immune and slow and ends with him nearly bare and fast — damage you could not
land at the start lands at the end, if you are still alive to land it. The
second phase also sets `noSlow`, so the gum piñata stops working exactly when
you most want it to.

**He arrives alone.** The first version walked him in behind four rudos, and
the harness showed the escort was doing the killing — runs ended before he was
in range and the boss was scenery attached to a wave. Phase adds do the same
job without stealing the kill: they spawn *behind* him, so they arrive while
you are committed to the thing in front.

The balance grid is his real test. `deep` clears every board for fifteen waves
and then breaks on sixteen at Plaza del Sol; `band` clears Cementerio's fifteen
and dies to him. A wave that beats builds which beat everything else is doing
what the title says it does.

### The bug that ate every upgrade click

Reported three times, and the first two diagnoses were both real defects that
were not *the* defect. The third look found it:

```
frame()  ->  syncHud()  ->  renderPaths()  ->  host.innerHTML = ""
```

`syncHud()` runs every frame from the rAF loop, and it rebuilt all three upgrade
rows unconditionally — sixty times a second. A browser fires `click` only when
mousedown and mouseup land on the **same element**; the button you pressed was
destroyed about 16ms later and replaced, so the two halves of your click landed
on two different buttons and the event resolved to their container. The row's own
handler never ran. A human click takes 60-150ms, which is four to nine rebuilds,
so it never once worked.

**Every automated click passed**, which is why three rounds of testing missed it:
a dispatched click completes inside a single frame. The test that catches it does
not click at all — it grabs the row, runs the frame loop's DOM pass fifteen times
via a new `window.__sync()` hook, and asserts the node is still the same node.

The rows now rebuild only when the thing they *show* changes: a key of
`towerId|type|tiers`. Affordability still tracks your candy every frame, but as a
class toggled on a row that already exists, never a new node. `sel-stats` had the
same pattern — nothing in it is clickable so it broke nothing, but it churned the
DOM at 60Hz for numbers that change when you buy something.

Two earlier fixes stand, and both were real: three refusals that were silent
`disabled` buttons, and a fully-upgraded path that rendered with the same padlock
as a forbidden one.

### An upgrade is a thing, not a number

The paths always had real mechanics — burn, stun, splash, chain, slow — but every
upgraded piñata looked identical, so the only evidence you had bought anything
was a figure in a panel. Three changes, all aimed at the same complaint.

**Every path declares what it IS.** `PATHS[type][i].art` names one of sixteen
themes, and a theme owns a tint and a glyph. A piñata that bought "Hotter" is
tinted toward flame and wearing fire; the same piñata on "Faster spout" is teal
with wings; on "Scattershot" it is gold with bursts. Only the **deepest** path
tints, because a 3-1-0 piñata that averaged two colours read as neither.

**Every path ends in an ability, not a bigger number.** Tier 4 grants one of
eight named abilities, and nothing before tier 4 grants any:

| ability | what it does | who gets it |
|---|---|---|
| `execute` | finishes anything under 12% health — never a boss | candy, chili, gum, ribbon, sparkler |
| `pierceAll` | the shot never stops | candy, ribbon, papel |
| `volley` | throws a real second projectile, fanned and at 60% | candy, firecracker, maraca, ribbon, sparkler |
| `wildfire` | the fire takes everything within 150 | chili |
| `shockwave` | the impact rattles everything within 70 | firecracker, maraca |
| `freeze` | the slow becomes a stop | gum, papel |
| `payday` | a cut of every defeat on the board | coin |
| `encore` | the aura stops being a radius and becomes the plaza | mariachi |

It is a deliberately small vocabulary — five to ten, not thirty one-offs, because
thirty abilities is a vocabulary nobody learns. A test holds that range.

**And the piñata throws a different object.** From tier 2 the projectile takes
the shape of its path: blades tumble long on their axis, fire streams, bursts
have arms, coins are flat and round, notes are notes. Sixteen looks, from the
same `art` field.

The ability gets the **first** chip in the panel, ahead of the numbers — an
ability the panel does not mention is an ability the player believes is a number.

**One of these was dead on arrival and the test that caught it now exists.** The
coin piñata has `damage: 0`, and the firing loop skips zero-damage towers
outright, so `payday` — "earns per hit", on both of the coin's top tiers — could
never once have fired. It pays out of *defeats* now, which is both what a
treasury is and something a piñata that never attacks can do. The general rule is
a test: an ability that rides on a shot must sit on a piñata that shoots.

### Sandbox

Thirty paths at 200-2100 candy apiece means a single run shows you almost none of
the game, which makes it very hard to judge whether an upgrade is *interesting*.
The fourth menu card is cool-coloured and dashed so it reads as sitting outside
the difficulty ladder rather than at the top of it: everything free, 999 lives.

`free` is read by exactly two functions — `placeTower` and `upgradeTower` — so it
cannot leak into the balance grid. The restriction rule still applies: a sandbox
that let you build 4-4-4 would not show you what this game's builds look like.

### Upgrades you can see

Ten piñatas x three paths x four tiers is 120 drawings, which is not something to
hand-author. Instead every body declares four **anchors** — `top`, `belt`,
`sideY`, `halfW` — and one vocabulary of marks is drawn at them:

| path | tier 1 | tier 2 | tier 3 | tier 4 |
|---|---|---|---|---|
| **Power** | a crepe belt | three spikes | gold spikes and trim | a crown with a stone |
| **Speed** | a second spout | wings | gold wings | a whirl of motion |
| **Reach** | a deeper hem | an antenna | a sombrero | a star on the hat |

The paths cannot fight over the same pixels, and the reason is structural: BTD's
restriction rule lets only **one** path past tier 2, so the tier 3-4 marks —
crown, whirl, sombrero, star — are mutually exclusive by construction. Only the
tier 1-2 marks can co-occur, and those sit on the belt, the sides and the hem.

Sprites are cached per `(type, tiers)` and built lazily, so a run only ever draws
the handful of combinations you actually buy.

Two things this got wrong first. An **ink patch** behind a face, to make it read
on a busy body, looked like a hole punched in the piñata. And the marks were
drawn into a grid sized to the *body*, so a crown lost its top and a sombrero
lost its ends — `put` clips silently, so nothing failed, it just looked wrong.
Every piñata is now built into a grid with 7px of headroom and 5px a side, with
the anchors shifted to match, and `test/towerart.test.js` checks the tallest and
widest marks against that padding rather than trusting it.

### Ten piñatas, ten characters

Every piñata shared one line of animation:

```js
const bob = Math.sin(t * 2 + tw.id) > 0.4 ? -1 : 0;
```

The same one-pixel hop at the same rate, and not one of them had a face. Ten
ornaments with stats attached. `src/faces.js` gives each one an idle, a face and
a reaction, and it is **art only** — nothing in `sim.js` reads it, so a
personality can never move a balance number.

| piñata | idle | face |
|---|---|---|
| Candy | eager hop | wide eyes, blush, big smile |
| Chili | furious shiver | angry brows, gritted grimace |
| Gum | slow squish | heavy lids, smirk |
| Maraca | rattle | grin, cannot hold still |
| Papel picado | flutter | serene lids, small smile |
| Firecracker | still, still, still, JOLT | alarmed eyes, tiny "o" |
| Ribbon dancer | graceful sway | lashes, coy smirk |
| Mariachi trio | 3/4 waltz | three faces, three moustaches |
| Sparkler | buzz | star eyes, open grin |
| Coin | smug rock | heavy lids, smirk |

**The eyes follow the gun.** That is the strongest single "alive" signal in the
set and it costs two pixels: the pupil takes whichever quadrant of the eye it is
looking into. With the board empty there is nothing to aim at, so they wander
instead — eyes frozen on a stale angle read as broken, not watchful. Firing
opens every mouth and widens every eye; blinks are derived from time and the
tower's id, so they need no per-tower state and no two piñatas blink together.

**Both exports are pure**, which is the whole reason any of this is testable:
`idleOffset` and `faceMarks` take a time and an id and return offsets and a list
of pixels. No canvas. `test/faces.test.js` holds the roster to one personality
each, at least eight distinct idle styles, whole-pixel motion, a face that never
vanishes mid-blink, pupils that track, and a mark envelope that keeps every
pixel on the body. Six deliberate mutations were run against it — eyes below the
ground line, every character hopping alike, pupils frozen, blink as a gap in the
face, no reaction to firing, sub-pixel drift — and all six were caught.

**The face positions are measured, not guessed.** Scanning each sprite's ink for
its top, its widest row and that row's centre: the chili is fattest at the *top*
because it hangs stalk-up, the sparkler's widest point is 15px up a 30px sprite
because the rest is star, and the ribbon dancer's mass sits 3.5px right of its
ground anchor — which is exactly how far off its own body its face was floating.

Three bodies swallow a face whatever you do with position: the papel picado is a
sheet of cut paper already full of dark holes, the firecracker is busy with fuse
and stripes, the sparkler's body is a flat mid-tone. An ink patch behind the
face was tried first and was worse than the problem — an 11x7 rectangle reads as
a hole punched in the piñata. What works is a one-pixel lower lid, applied only
to those three; a uniform rim flattens the faces that already read.

**The bodies were redrawn too, because faces on eight shaded discs is still
eight shaded discs.** What makes a shape read as a *piñata* at 24 pixels is not
colour, it is three things: crepe FRINGE in stacked bands, a hanging CORD at the
crown, and a silhouette that is not a circle. `art.js` grew a construction kit
for exactly those — `fringe`, `ruffle`, `cord`, `cone`, `starBody` — and the
candy piñata is now the iconic seven-point star, drawn as five points that read
plus the body, because seven at this size is mush.

A test asserts every body calls the kit rather than just filling a shape, and it
immediately caught the papel picado, which was hand-rolled from blocks and looked
like green brickwork. Its cut-outs are punched as small diamonds now — a lone
pixel hole reads as a speck of dirt — and its hem is cut, not ruled.

The same test caught nothing about the chili, but the eye did: with gold fringe on
a red taper it was the firecracker in a different hat. Its bands are green now.
Two of ten silhouettes reading as the same object is worse than either being
plain.

The same faces are on the shop cards. They were showing ten faceless ornaments
while the board showed ten characters, so the thing you chose from and the thing
you placed did not look like the same creature. A card does not animate, so it
passes `still: true` — a portrait caught mid-blink is a portrait with no eyes.

### The map was too small, and it was two wastes

Measured on a 1235x1271 window — the shape the published artifact's frame
actually is — before changing anything: stage 1235x852, board 892x557. The board
filled 72% of the stage's width and only **65% of its height**.

Both halves had the same root. The playfield is a fixed 8:5 and the shop takes
its width off the side, so the board is bound by **width** — and every pixel of
height past that binding point becomes street rather than plaza. 295px, a third
of the stage, was empty paving above and below the map.

**The stage is now exactly as tall as the game wants.** `fit()` asks the renderer
what scale the width supports, then takes only the height that scale needs. What
is left over leaves the stage entirely and becomes page surround, which reads as
a frame around a game rather than as a map that did not finish drawing. The board
went from 65% to 91-94% of the stage height, at every window shape.

**And the control rail moved inside the shop.** On the board's edge it reserved
58px of playfield width; inside the panel it costs nothing, because the panel's
width was already reserved. Six buttons at full size need 266px in a 234px
panel, so they are a deliberate 3x2 cluster rather than a row that wraps 5 + 1
and reads as a bug.

Together, on a 2514x1316 window: **1693x1058 -> 1986x1242, +37% area.**

`node test/shapes.mjs` walks twenty window shapes and checks the whole chain —
the stage fits the window, the plaza fits the stage, the plaza clears the shop,
the scale respects its floor, and the board actually fills the stage height it
asked for. The three parts feed each other (stage height comes from the board's
scale, the scale comes from the shop's reserve, the reserve comes from the
stage's width), and a change to any one of them has twice broken a shape nobody
was looking at. Driving a browser catches those one shape at a minute each; this
catches all twenty in a second.

### The shop packs when the stage is short

Tying the stage's height to the board's needs took away height the shop had been
quietly living on: at 900x1400 the stage came out 472px and the card list showed
1.8 of its 5 rows, so seven of the ten piñatas sat below the fold. Giving the
board's width back to fix a height problem would have undone the paragraph above,
so the shop packs instead — narrower columns, smaller icons, no strapline. Three
cards visible became six, and the overflow fell from 595px to 123px. On a wide
window it never engages and the icons stay at full size.

The switch is decided from the room available and the roster size, **never** from
whether the list is currently overflowing: overflow disappears the moment compact
turns on, so testing that directly makes the class flap on and off every frame.

Two attempts to get the grid right, both the same kind of miss. The first went to
ONE column, because a grid item's min-content width beats the track's minimum and
"Firecracker" at 10px is about 68px wide — `min-width: 0` on the card is the
load-bearing half. The second still gave one column: two 58px columns plus an 8px
gap need 124px in a 123px box. Missing it by a single pixel is the same trap the
note above the roomy grid already records, hit from the other side.

### It is a landscape game, and it says so

The game plays on a **stage**, not in the window. Everything is measured against
that element — canvas, shop width, control rail, board reserve, the upgrade
panel's width cap, the menu overlay — and the window's leftover is margin.

A portrait window was a bad deal twice over. The playfield is a fixed 8:5, so a
tall window turns almost all of its height into street; and the shop and the
control rail take their width out of the little that is left. Measured: at
520x900 the board came out **smaller** than the same game gets at 800x540.

The constraint is deliberately one-sided:

```css
width: 100vw;
height: min(100vh, calc(100vw / 1.45));
```

Full width always; the height is capped so the stage can never be taller than
1.45:1. **A landscape window loses nothing.** The first version got this
backwards — a hard 16:10 box letterboxed 484px of perfectly good width away on a
2514x1269 window and made the board smaller than it had been. Three tests hold
the rule now, including one whose whole job is "a landscape window is not
letterboxed at all".

The menu had to move onto the stage as well. As `position: fixed; inset: 0` it
covered the viewport, so on a portrait window the menu and the game disagreed
about where the game was.

The world/screen round trip is unaffected: `toWorld` and `__toScreen` both work
off `canvas.getBoundingClientRect()`, which already carries the stage's offset.
Verified at 60,60 -> 408,244 -> 60,60 with the stage inset 242px from the left.

### It has to fit the window it is given

Two rules conspired to draw the board OUTSIDE the window on anything small:

```js
const w = Math.max(ART_W * 2, window.innerWidth);   // fit()   — floor of 640
return Math.max(1, Math.min(...));                   // boardScale — never under 1:1
```

The canvas was floored at 640x400 and the scale refused to go below one screen
pixel per art pixel. Below about 700px of window the plaza plus the shop needs
more room than exists, so the board was drawn past the edge and the page's hidden
overflow cropped it. Nothing threw and nothing logged — the board simply had no
right-hand edge. Measured in the published artifact's frame at **389x146**, which
is where it was first seen.

The canvas is now exactly the window, and `MIN_SCALE` is **0.4**: a board drawn a
bit small beats a board you cannot see the edge of. `panelWidth` also clamps to a
share of the window, because a flat 136px minimum is sensible at 900px wide and
absurd at 400, where it and the control rail together left less room than the
board needs.

`test/layout.test.js` walks fifteen window shapes — including the 389x196 that
broke it — and asserts the whole plaza lands inside the canvas and clear of the
panel. Two mutations confirm the test has teeth: restoring either the 1:1 scale
floor or the 136px panel minimum fails it.

The control rail had the same problem in the other axis: six buttons in a column
is 229px tall, so on a 196px window the bottom two left the screen. It reads how
many fit in the height available and wraps into as many columns as that needs,
and the board's reserve is computed from the same numbers, so the rail can never
end up over the playfield or off the edge.

**And the street was being dressed under the shop.** The scatter bands ran to the
canvas edge, so props were placed behind an opaque panel and its left edge sliced
them vertically — half a fountain stuck to the panel, which reads as a rendering
fault rather than as scenery. Dressing now stops at the panel, and the reserve is
part of the board cache key so a window that changes the panel width redraws.

### The controls are furniture, not a decal

Anchored to the window's top-right, the round controls worked while the board was
small. But the board scales up to meet the shop: at 2514x1269 the playfield
reached x=2083 and the dock sat at 1776, so the play button was **300px inside
the playfield**. It was also a 474px-wide row of labelled buttons.

It is a 56px column of icons now, and — the actual fix — its width is added to
the board's reserve. The reserve is a *constraint on scale*, not a subtraction,
so on any window where the board is bound by height (most of them) it costs
nothing at all, and where it does bind, the board stops before the rail instead
of running under it. One constant, `DOCK_W`, feeds both the reserve and the CSS,
so they cannot disagree about where the playfield ends.

The narrow-window rule that used to move the dock to the LEFT is gone. It existed
because the wide row could not share the top edge with the counters; a 56px
column can, and moving it left put it back over the board *and* on top of the
upgrade window.

### Nothing scrolls but the shop

`max-height: 100%` with `overflow: hidden` on the menu card looked like it fitted
and did not: the box stopped at the viewport while its content carried on past
it, so at 520x900 the three difficulty buttons — the only controls that screen
exists for — laid out 250px below the fold and were clipped away. A scrollbar
would have been the same bug with a handle on it.

The card is sized to its content now and **measured**, then scaled to fit. The
media queries still do the coarse work — the map grid flattens to one row of
four, the trophy wall collapses, the two columns stay side by side on a short
window — but measuring is the only approach that cannot be wrong about a window
shape nobody tested. Two cases prove it: 800x540 needed no scaling at all once a
`max-width: 860px` rule stopped stacking the columns on a *short* window, and
520x900 needed 0.76.

`fitMenu()` is called directly rather than through `requestAnimationFrame` — a
hidden tab pauses the frame loop, and a menu that only fits once you look at it
is a bug that hides itself.

### Every board dresses itself

The four maps drew their scenery from one bag of six clusters, so a graveyard
at night was furnished with El Mercado's crates and the street told you nothing
about where you were standing. Each map now names its own bag:

| board | dressing |
|---|---|
| Plaza del Sol | fountain, garden, grove, pots, cargo |
| El Mercado | stalls x2, cargo x2, pots |
| El Caracol | cargo, pots, grove, stalls |
| Cementerio | graves x2, shrine, grove, pots |

A repeated name is a weight, not a mistake — El Mercado is mostly market stalls
and freight because that is what it is. Cementerio gets two sprites nothing else
gets, `grave` and `cross`. Measured on the live page by tallying blits during a
board build: 19 headstones and 11 crosses on Cementerio, zero on Plaza del Sol.

Thin street bands can only hold short props, so the scatter filters the bag to
its `low` clusters there — a map whose bag has no low cluster would have handed
that filter an empty pool, so `test/layout.test.js` asserts every bag has one.

### Lanes that do not touch themselves

`node test/lanes.mjs` measures the closest approach between non-adjacent legs of
a route against the road width (68px). Two boards were drawing legs 50px and
56px apart — closer than the road is wide, so the two legs merged into one grey
mass and a piñata placed "between" them was placed on the lane.

| board | closest legs |
|---|---|
| Plaza del Sol | 86px |
| El Mercado | 90px |
| El Caracol | 110px |
| Cementerio | 138px |

86-90px still reads as a thin strip — too narrow to build in, wide enough to see
— which is what a switchback board should look like. Nothing merges now.
Respacing changed both lanes' lengths, so both boards were re-normalised by
traversal time and the grid re-run before the numbers above were trusted.

## Working on it

```bash
node --test "test/*.test.js"
node test/playtest.mjs 5 --maps --all --trace
```

117 tests. The playtest plays four deliberately different bots, all on the same
map/difficulty grid:

- `spread` — 16 towers along the whole route, cheapest upgrade first
- `focused` — 7 towers on the highest-coverage positions, poured into carries
- `deep` — same placement as `focused`, but **saves**: holds candy for the next
  tier on one carry rather than settling for something cheap
- `band` — everything inside one mariachi trio's earshot: a knot, not a line

`deep` exists because the other two physically cannot buy a top tier — a greedy
buyer never accumulates 2100 candy. That limitation once got recorded as a game
fact ("tier 4 is never bought"), which it was not.

**Spots are scored for the piñata that is taking them.** They used to be scored
once at a reach of 118 and handed out in list order, so the 92-range papel picado
inherited a sparkler's spot and covered 228 units of lane where the spot was
picked for 516 — and the mariachi trio, which never touches the lane at all, was
scored on lane coverage. Each planned piñata now looks at the next three unused
spots and scores them by what it is actually for: route covered *at its own
reach*, or piñatas already in earshot for an aura, or nothing at all for pure
income.

The swap has to earn itself — 25% better for that piñata — and that threshold is
load-bearing. Taking the best of the window every time turned `focused` into a
different profile: it is *defined* as the seven highest-coverage positions, and
letting every tower shop around cost it 27 lives% on Plaza del Sol. With the
threshold, `deep` and `focused` come back bit-identical and only the towers the
change was written for actually move.

### The band probe

`band` is not a balance profile — it loses every cell — it is the only way to
price an aura. `spread` buys the mariachi trio twelfth (never at all below
Fiesta: measured, **seven of the nine grid cells were byte-identical with and
without it**) and `focused` stops at seven towers, so neither bot ever clusters
around the one piñata whose whole mechanic is standing close.

Run the same knot twice, swapping only the trio for a chili, and the answer shows
up in *waves reached* rather than lives — every one of those runs ends at zero
lives, so the headline metric cannot see it:

| | with the trio | with a chili instead |
|---|---|---|
| Plaza del Sol, Plaza | **14.4** | 13.0 |
| Plaza del Sol, Máscara | **13.6** | 12.4 |
| El Mercado, Plaza | **14.6** | 12.6 |
| El Mercado, Máscara | **14.0** | 13.0 |
| Cementerio, Plaza | 13.6 | 13.8 |
| Cementerio, Máscara | 13.0 | 12.8 |

So an aura is worth **one to two extra waves** where the build genuinely
clusters, and nothing on Cementerio, whose spread-out shape means even a knot is
not really a knot. That is the honest price of the trio, and no amount of running
the three main profiles would have produced it.

`PLAN` in `playtest.mjs` is the build order the bots follow, and **a piñata not
on that list is never bought by any of them** — a grid re-run after adding one
then measures nothing about it, which is exactly how the ribbon dancer first came
out looking perfectly balanced. It sits at slot 8, replacing a repeat candy buy,
so `spread` exercises it while `deep` and `focused` (six and seven towers) act as
untouched controls.

**They are not weak-vs-strong.** `spread` degrades gracefully as enemy hp rises;
`focused` falls off a cliff once its carries stop one-shotting. So the tuning
target is *both mostly finish, neither cruises* — not one beating the other.
Current grid (5 runs, % of starting lives remaining):

Lives% remaining, spread / deep / focused:

| | Fiesta | Plaza | Máscara |
|---|---|---|---|
| Plaza del Sol | **100** / 83 / 90 | 47 / 42 / 42 | 18 / **35** / 0 |
| El Mercado | 83 / 93 / 97 | 37 / 57 / 67 | 10 / 44 / 55 |
| El Caracol | 93 / 85 / 70 | 25 / 61 / 52 | 3 / 41 / 46 |
| Cementerio | 97 / 88 / 87 | 23 / 18 / 42 | 2 / 5 / 30 |

The `spread` column jumped when placement stopped ignoring what each piñata is
for (see below); `deep` and `focused` are unchanged to the decimal. Two things
that reads out of: a wide build is no longer the weak baseline it used to be, and
**Fiesta on Plaza del Sol is now a clean 100%** — cruising, on the difficulty
whose job is to teach, which is defensible but is the first cell to watch if the
early game ever needs sharpening.

**Every cell is clearable by at least one strategy**, and none of the three
dominates. Máscara on Plaza del Sol was unbeaten for five rounds of tuning until
top tiers became worth buying.



### Freeplay

Past wave 15 the run carries on, and until it was measured nobody knew what that
was worth. `node test/playtest.mjs 5 --maps --free=15` walks the bots into it.

At the original ramp — an extra **35% health per wave** on top of the campaign one
— every profile on every board died between waves **16 and 19**, whatever it had
built: enemy health tripled within five waves, so "endless" was four waves long
and how well you had played made no difference to where you stopped. At **0.18**
the tail separates builds instead of clamping them:

| | spread | deep | focused |
|---|---|---|---|
| Plaza del Sol | 19 | **29** | 19 |
| El Mercado | 19 | **34** | 23 |
| Cementerio | 17 | 20 | 19 |

Five waves of freeplay now multiply health by 2.36x rather than 3.4x. The
campaign grid is untouched — the term is zero until wave 15.

Knobs are `HP_RAMP`, `BONUS_BASE`, `BONUS_PER_WAVE` and the `DIFFICULTIES`
table in `data.js`, plus each map's `speedMul`. `globalThis.PU_HP_RAMP` etc.
override for sweeps:

```bash
node --eval "globalThis.PU_HP_RAMP=0.19;import('./test/playtest.mjs')" 5
```

### QA hooks

A hidden browser tab pauses `requestAnimationFrame`, so stepping and drawing
have to be drivable by hand or screenshots come back blank:

- `window.__game()` — live state
- `window.__step(secs)` — advance sim and fx without rAF
- `window.__draw()` — force one render frame, including the placement ghost
  the frame loop would have drawn. Pass one explicitly to override, but a
  hand-passed ghost is wiped by the next repaint while an armed-state one is not.
- `window.__sheet()` — the contact sheet: every sprite at 1x, at gameplay scale
  and in greyscale. It freezes the frame loop (which keeps repainting the sheet,
  so screenshots still commit a frame) and hides the HUD; `window.__draw()`
  returns to the game.
- `window.__sim` — the sim module, for scripted placement
- `window.__layout()` / `window.__toScreen(x, y)` — the live layout, and a sim
  position converted to a screen one. Use these rather than recomputing the
  formula in a probe: two copies of a rule drift the moment one is fixed
- `window.__menu` — `{ start, toMenu, best, masks, setBlind, isBlind }`

When the Browser pane is not displayed at all, `computer{screenshot}` times out
entirely. Workaround: run a throwaway Node collector and have the page POST
`canvas.toBlob()` to it — that only captures the canvas, not the DOM chrome.

### Traps hit so far

- **Prove the input tool works before blaming the page.** A tab can stop
  receiving clicks entirely while `javascript_exec` still answers, which looks
  exactly like dead event handlers. A control — make a div, attach a
  listener, click it — settles it in one call.
- **A halo goes under the mark, not around a one-pixel one.** The refusal
  cross was built like the range rings (ink block, bright core) and vanished
  into the sprite under it. Every pixel was drawn; none of them read.
- **Scaling a sprite scales its outline.** Small enemies came out wispy until
  `build()` divided the line width by the scale.
- **`update()` recomputes `e.x`/`e.y` from `e.dist` every frame.** A test that
  assigns x/y directly has it silently undone; walk the enemy down the lane
  instead. Bitten three times — `edgeFalloff` is exported as a pure function
  partly so its test does not need to place anything.
- **A global nerf drowns the differential you are measuring.** Falloff looked
  like it did nothing until the DPS loss was compensated.
- **A bot's policy limits look like game facts.** "Tier 4 is never bought" was
  really "a greedy buyer never saves". Check the bot *can* do otherwise first.
- **Two profiles differing in more than one variable prove nothing.** `deep`
  looked fatal until it shared `focused`'s placement.
- **Poking `hp` to 0 never runs the defeat path.** Use `sim.damage()`.
- **Lane length is a hidden difficulty dial** — a longer route means more time
  to shoot. Normalise with `speedMul`, do not assume more corners means harder.
- **Sorting build spots by proximity to the lane clusters them on one leg.**
  `suggestSpots()` buckets by lane progress; `bestSpots()` scores by how much
  route a position can actually cover.
- **Humanoid enemies overlap into an unreadable blob** at tight wave spacing in
  a way round enemies never did. Gaps are set so a group never packs tighter
  than its own sprite width.
- **A translucent aura disc** is invisible on a light board and a huge stain on
  a dark one. Use a dashed ring.
- Tower spots hardcoded in tests break when a lane is redrawn — they live in
  one constant at the top of `sim.test.js`.
- **A support tower with token damage gets misread as a carry.** The playtest
  bot classifies on the mechanic a tower owns, not on `damage > 0` — gum (3)
  and the maraca (7) both starved the real damage dealers before this.
- **A new event kind ships with no handler** unless the coverage test builds
  the tower that raises it. `feedback.test.js` builds one of every piñata.
- **A new enemy rule lands far harder than intended** because it excludes more
  towers than you pictured. The colgado's first numbers wiped all three maps:
  its dodge hit everything under 500 projectile speed, which is most of the
  support roster at once.

## Not built yet

**The roster of ten is complete.** What is left is polish and content beyond the
original plan — `LOOP_LOG.md` has the running build log and the next step.

Two supports are worth knowing about together, because they are the only piñatas
that do nothing on their own:

- The **mariachi trio** buffs everything in earshot and hits nothing itself. Its
  value is entirely a function of how many piñatas stand near it — measured, it
  reaches 1 neighbour in the wide bot's Cementerio build and 6 in the focused
  Plaza del Sol one, which is why it comes out break-even against a repeat maraca
  in a build that spreads and better in one that clusters.
- The **papel picado** has no projectile at all, so the cape and the swing have
  nothing to answer. It pays for that with the shortest reach in the game.
