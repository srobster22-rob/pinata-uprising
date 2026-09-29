# Loop log

Each line: what was built, and what it turned up.

- **R1 — Upgrade paths.** Three paths x four tiers per piñata with BTD6's restriction rule (max two paths open, only one past tier 2), 48 upgrades, aura buffs, resistance penetration, burn spread, compounding interest. 16 new tests (36 total, green). Verified through real UI clicks: 4-2-0 candy reaches 380 DPS vs 36 base. Found: my first aura test was 170px apart with a 118px radius — it failed honestly, but the sibling "auras don't stack" test was passing *vacuously* for the same reason. Added an explicit in-range assertion so that test can't pass by accident again.
- **R2 — Rebuilt the balance harness around upgrades.** The old bot never bought one, so every difficulty number from R1 was stale on arrival. Two profiles now: `spread` (wide, cheapest-upgrade-first) and `focused` (7 towers, pours into carries). Found: upgrades made the game *much* easier — spread went 20 → 45 lives, focused finished on 78 with only 7 piñatas. Re-swept HP_RAMP 0.09 → 0.14, which gives a real band: spread scrapes home on 8 lives, focused wins on 28. Above 0.145 spread dies to the boss; above 0.21 both die on wave 14.
- **R3 — Gum piñata, the missing slow archetype.** The sim had `slow`/`slowT` fields and the toro had a `noSlow` immunity, but *nothing in the game applied slow* — dead code guarding a mechanic that did not exist. Added the gum piñata (sticky, splatters, toro charges through), 3 paths, gum-string visuals and a "no!" shrug on immune enemies. 5 new tests (41 green). Two findings: (1) my gum tests set `e.x/e.y` directly, which `update()` silently overwrites from `e.dist` every frame — tests must walk enemies down the lane, now documented with a named constant; (2) slow is a strong force multiplier for wide builds — adding gum *inverted* the skill profiles (spread 8→28, focused 28→14). Part bot bug (gum's 3 damage made `focused` treat a support tower as a carry), part real: gum needed weakening to 0.68/340c. Ordering restored: focused 19, spread 5.
- **R4 — Title screen and three difficulty modes.** The game dropped you straight onto a board with no menu — a regression from what pulse-defense had. Added a front screen, Fiesta/Plaza/Máscara built from the R2 sweep data, per-mode lives/money/reward/ramp, localStorage best-run, and a menu/retry flow off the end-of-run modal. Verified the whole flow through real clicks. Found: Máscara at 60 lives killed *both* skill profiles, and sweeping its HP ramp from 0.15→0.165 changed nothing at all — the mode was economy-bound, not HP-bound. The trace showed death by a thousand cuts from wave 6, not a wall. Fixed by keeping 100 lives and leaning on money (500) and reward (0.9) instead: spread now dies on wave 14, focused holds on 10%. Ladder: Fiesta 67/93%, Plaza 5/19%, Máscara dead/10%.
- **R5 — Freeplay.** Clearing wave 15 set `phase = 'won'` and `update()` returned early, so the game was a hard dead end after ~15 minutes. Added freeplay off the victory modal; waves past the campaign cycle the last third of it rather than looping wave 15 forever, with the scale multiplier carrying difficulty. 5 new tests (46 green). Verified live: a maxed 7-piñata build cleared the campaign at 100 lives then reached **wave 27** before dropping to 65, so the escalation actually bites.
- **R6 — Targeting modes.** Every tower always shot whatever was furthest down the lane; the player had no say. Added First/Last/Strong/Close, cycled by a panel button, shift-click to reverse, or `T`. 3 new tests (49 green). Found: my first version of the test asserted things about sorted arrays rather than what the tower actually chose — it would have passed even if targeting did nothing. Exported `pickTarget` and rewrote it to assert the real decision, plus a guard that no mode reaches outside range.
- **R7 — Three maps.** Made the board a parameter (`createGame(seed, difficulty, mapId)`) and added El Mercado (teal switchbacks) and Cementerio (night, long straights), with a thumbnail map picker on the menu drawn from the real route data. Four findings, each from measurement rather than guesswork: (1) **lane length is a hidden difficulty dial** — the new maps are 63% and 85% longer, which means *more* time to shoot, so they were far easier; added a per-map `speedMul` to normalise. (2) Replacing my hand-picked playtest spots with `suggestSpots()` made the bot look much worse — sorting purely by proximity to the lane piles every tower onto one leg. Fixed by bucketing along lane progress. (3) That still had `focused` losing to `spread`, because 7 evenly-spread towers cover thinly; added `bestSpots()`/`laneCoverage()`, which scores a position by how much *route* it can actually shoot — inside corners win, which is where a real player builds. (4) The two profiles are not weak-vs-strong but robust-vs-burst: `spread` degrades smoothly as hp rises while `focused` falls off a cliff, so the tuning target became "both mostly finish, neither cruises". Retuned to ramp 0.16 across a 3x3 map/difficulty grid. Also: a translucent aura *disc* is invisible on a light board and a huge stain on a dark one — it is a dashed ring now.
- **R8 — Docs.** README described a game that no longer existed (no upgrades, one map, no difficulties, freeplay or targeting). Rewrote it around the current state, added the measured 3x3 balance grid, and folded every trap found so far into a single list so they do not get relearned. Updated the project memory to match.
- **R9 — Plateado, and making resistance legible.** The counter matrix was a stated pillar with a hole in it: nothing punished a pure chili build, and when a rudo shrugged off candy the player got no feedback about why. Added the Plateado (foil mask, 85% burn resist) and a throttled "shrugged off" tell on resisted hits. 3 new tests (52 green), including one that proves a chili-only build leaks more plateados than a candy-only build — the counter has to *bite*, not just exist. Found: adding one tanky enemy to waves 9-13 swung the whole grid hard (Plaza 24/15% → 12%/dead, Cementerio to a wave-13 wipe). Softened it from 96hp to 72 and trimmed group sizes; grid back to Plaza 15/10, Mercado 18/25, Cementerio 3/dead.
- **R10 — Mask collection, and a crash the test suite could not see.** Added the trophy wall: every mask taken is banked to localStorage and shown on the menu, greyed out until you have taken one. Deliberately display-only — giving it stat perks would silently invalidate the whole balance grid. 3 new tests (55 green). Three findings: (1) the chili-vs-plateado test from R9 started failing after I softened the plateado to 72hp, correctly telling me the counter had stopped biting — a resistance only matters if burn is the dominant share of the damage, so the plateado is now tanky (130hp) but rare, and the ramp came down to 0.145 to pay for it. (2) Masks only banked at run end, so closing the tab mid-run threw away everything; they now bank at each wave end with delta tracking so repeated calls cannot double count. (3) **A real crash: `MAP is not defined` in main.js's leak handler** — a stale reference left by the R7 map refactor that would break the game the moment anything got through. Every test I have covers the pure sim, so nothing could see it. Found only by driving a losing run in the browser.

- **R11 — Made the untested layer testable.** Acting on R10's finding: extracted the sim-event-to-feedback mapping out of main.js into `feedback.js`, which takes everything it needs on a `ctx` object and touches no globals. 10 new tests drive every event kind through it with stub fx/sfx (65 green), including a regression test for the exact R10 crash — a leak handled on all three maps, asserting it reads the base off the live map rather than a module global. Found: the suite's "everything the sim emits is handled" invariant immediately caught that `sim` pushed a **`shot` event nobody consumed** — an object allocated on the hottest path in the game every time any tower fired, discarded unread. Removed it. Verified by playing a full campaign in the browser through the real feedback path: won on wave 15, 0 leaked, 190 unmasked, no console errors.

- **R12 — Maraca and sparkler.** Two towers from the original ten, chosen because each adds something the roster lacked: the maraca brings **stun** (nothing previously stopped an enemy outright) and the sparkler brings reach (250 base range vs 132 for the next-widest, which is what Cementerio's long straights were asking for). Stun gets a resistance ladder — a rudo shakes it off in half the time, the campeón at a fifth — and a hold too short to matter reports as a shrug rather than silently doing nothing. 7 new tests (72 green). Three findings: (1) the `stunned` event had **no handler and no test caught it**, because the feedback suite's full-run test only ever built candy piñatas; it now builds one of every piñata, which is what a coverage test should have done from the start. (2) **The R3 support-classification bug recurred verbatim** — the bot treats any tower with damage > 0 as a carry, so the maraca (7 damage) starved the real damage dealers exactly as gum (3 damage) did. Fixed by testing for the *mechanic* a tower owns rather than whether its damage is zero. (3) Two towers moved Plaza from 30/38% to 48/27%; re-swept the ramp to 0.16, and the cliff is sharp — 0.155 gives 47% and 0.16 gives 15%. Also normalised Máscara's economy back to a full purse: a starved opening only delays the build, it is not interesting difficulty, which is the same conclusion R4 reached about its life total.

- **R13 — The Colgado, and the last counter rule.** Slung from a rope like the piñatas it came to smash: it sways perpendicular to its travel, so a slow projectile arrives where it used to be. This is the rule that finally makes projectile *speed* matter — previously `speed` only fed the matador's cape check, and nothing else in the game cared about it. Chili (420), gum (400) and maraca (480) can now miss; candy (560), sparkler (900) and anything splash cannot. 3 new tests (75 green), including one that drives the dodge predicate directly rather than staging a projectile, and one asserting a colgado hanging *still* is an easy target. Findings: (1) the "every enemy has a mask colour" test caught the missing sprite entry within seconds of adding the enemy — exactly the invariant it was written for. (2) **First numbers wiped all three boards, 0/5 everywhere.** The dodge window was |cos| > 0.55 at 70%, which eats ~44% of every sub-500 shot — that is most of the support roster at once. Narrowed to 0.78 at 45% and cut group sizes. (3) Paying for it dropped the Plaza ramp 0.16 → 0.15, and pushed Máscara past both bots on every map until its own ramp came down to 0.16; it is now clearable on two boards of three.

- **R14 — Consolidation.** The colgado's dodge was reusing the matador's "olé!", which is the wrong flavour and, worse, hid *which* counter had fired — the whole point of the counter matrix is that the player learns the rule from the feedback. `deflects()` now returns which rule fired and the swing reads "swung clear!" in green. Refreshed the README, which had drifted two rounds behind (5 piñatas, 6 enemies, 49 tests, an old grid) and folded the three recurring traps into it. Verified by playing a full campaign on all three maps in the browser through the real feedback path plus five freeplay waves: 3/3 cleared, freeplay reached wave 20, all eight enemy types banked to the mask wall, no console errors.

- **R15 — The blindfold.** The deferred twist, built. The authentic mapping turned out to be that *you* are the one blindfolded — in the real game the person swinging cannot see, and here you are the one directing the piñatas, so the handicap belongs on the player's information rather than on the defence. Fog of war (only ground within a piñata's reach is drawn, as a soft-edged veil so your own layout stays faintly legible), hidden wave intel, and the life count replaced by `???`. 7 new tests (83 green), including one that plays identical builds with and without it and asserts the fight is bit-for-bit the same. Three findings: (1) **my own design was self-defeating** — I said "read the great piñata instead of the number", then veiled the great piñata too, leaving no health information at all. It is now always lit, and `canSee` agrees with the renderer so the leak that finishes you cannot happen off-screen. (2) **The 35% candy premium had to be cut entirely.** For a bot it turned `focused` from dead into 85% lives; sweeping down, even **10%** gave 71%. Extra candy compounds into tiers and tiers multiply DPS. (3) That is a finding about the whole game, not just this mode: **income is a sharper lever than `HP_RAMP`**, and every earlier round spent its time tuning the blunter one. The blindfold is now bragging rights only, which also means the harness cannot mis-price it — with the premium at 1 the blindfolded grid is identical to the normal grid, and that identity is the proof it touches nothing but presentation.

- **R16 — Fixed the income lever, and corrected myself twice doing it.** Built `test/sensitivity.mjs`, which applies the same ±10% swing to enemy health and to income and reports elasticity on a metric that keeps moving when `lives%` is pinned at 0. It immediately showed **R15's headline was wrong**: the elasticities were the same order of magnitude, and HP was actually the *sharper* lever for `spread` (−164% vs +112%). Then it showed my loop-gain number was **confounded** — measuring amplification via total candy earned conflates the loop with how far the run got, so a small income cut that kills a run reads as a negative loop. Measured on always-survive runs the real gain was 2.12x/1.56x, not the ~3x I reported.
  The actual defect was real though: bounty candy is performance-dependent, so candy buys defence, defence kills more, kills pay more candy. Shifting the mix to a larger fixed wave bonus (bounties to 0.8, bonus 75/9 → 98/11) drops loop gain to **0.94x/1.18x** and income elasticity to 75%/85%, i.e. income is now the *milder* lever of the two. Income can finally be tuned in small steps.
  Three further findings. (1) **The mix silently picks a favourite strategy**: bounty candy rewards board coverage, fixed candy rewards concentration. At a 0.45 share the wide bot went from 16% lives to 5% while the narrow one went 9% → 50%. 0.8 is the only share measured where both survive all three boards — the table is in `data.js`. (2) **Neither harness was reading its own knobs.** `playtest.mjs` bound from `globalThis` while I passed env, so three sweep results were identical and meaningless. Both now import `test/knobs.mjs` first, which is the only place the binding lives. (3) **Tier 4 is never bought in a 15-wave campaign** — a measured tier histogram came out 13/4/2/2/**0**, best tower 3-0-1. Every tier-4 upgrade in the game is freeplay-only content, which is why a top-tier price lever moved nothing.
  Not fixed, deliberately: `focused` still finishes more comfortably than `spread`. Deep-tier pricing barely touched it and saturated at once, because the two bots differ in *placement* — coverage-optimal spots — not in spending. No economy lever will close that gap; it needs shorter ranges or maps with fewer multi-leg corners, which is a different change.

- **R17 — Closed most of the placement gap with range falloff, after ruling out range scaling.** The ask was to fix the `focused`-beats-`spread` gap with tower ranges. Measuring first killed the obvious version: the coverage advantage of a converging corner is **scale-invariant** — best-7-spots over spread-7 sits flat at ~1.4x from range 70 through 190 — so scaling range moves both build styles together. Sweeping `RANGE_MUL` confirmed it: below 1.0 `spread` hits zero on every board while `focused` still holds 24-25%. Shrinking range *widens* the gap.
  What does discriminate is **falloff**: damage scaling linearly from 1.0 at a piñata's feet to `EDGE_MUL` at its rim. The reason it works is measurable — a coverage-optimised build holds **88-91%** of its covered lane in the outer half of its range, against **70-72%** for a wide build, so falloff charges it for exactly the reach it is exploiting. At 0.55, with the ~28% DPS loss repaid via `HP_MUL` 0.72, the gap goes from **+8/+67/+32** to **+14/+56/+12** across the three boards (average +36 → +27), and Fiesta now has the two profiles within 3-8 points of each other where they were 8 apart.
  Three corrections along the way. (1) The first `RANGE_MUL` sweep was unfair: `suggestSpots` bounded spots at a hardcoded 140px from the lane, so shrinking range stranded the wide bot's towers out of reach and made range look like it widened the skill gap when it was really breaking the weaker bot. It is range-aware now. (2) **Applying falloff without repaying the DPS made every board unwinnable** — the first sweep read 0% everywhere and I nearly concluded falloff did not discriminate, when the global nerf was simply drowning the differential. Compensating isolated the gap. (3) **I fell into my own documented trap again** writing the falloff test — assigning `e.x/e.y` to place an enemy at a chosen distance, which `update()` overwrites from `e.dist` every frame. `edgeFalloff` is exported as a pure function now, tested directly, with a separate integration test that moves the enemy by lane distance.
  El Mercado is the one board falloff cannot fix (+56). Its parallel legs sit 130-150px apart against a range of 118, so one piñata covers two legs and *both are close*, not near the rim. I tried widening the legs to ~190px and it made things **worse** — gap +67, coverage ratio 1.48x → 1.62x, and the lane grew 3280 → 3990px, which is more time to shoot. Reverted rather than ship a worse board; the note in `data.js` records the ratio as the thing to watch if anyone revisits it.

- **R18 — Made investment depth a real strategy, and corrected R16 in the process.** R16 reported "tier 4 is never bought in a 15-wave campaign" from a measured tier histogram. That was **a bot artefact, not a game fact**: both playtest profiles buy the first affordable thing, so a greedy buyer can never accumulate 2100 candy in one place. Given a policy that *saves*, tier 4 is reached comfortably. Added `deep` as a third bot profile to make that testable — it holds candy rather than settling for something cheap.
  With depth now measurable, the real defect showed up: **depth was a trap.** At the original numbers, `deep` finished on 0/6/0 lives% across the three boards against `focused` on 44/68/42, because 2100 candy spent maxing one path buys about ten fresh piñatas instead and ten fresh piñatas win on raw damage. Scaling the additive part of every top tier by `DEEP_POWER` fixes it; at 3x, `deep` lands 42/58/18 against `focused` 44/68/42 — viable everywhere, dominant nowhere. `focused` does not move at any value across the sweep, which is the clean proof it never reaches a top tier.
  **Side effect worth having: the grid is now fully clearable.** Máscara on Plaza del Sol had never been beaten by any profile across five rounds of tuning; `deep` takes it 4/4 at 34% lives. Every cell of the 3x3 map/difficulty grid now has at least one strategy that finishes.
  One harness bug found and fixed on the way: `deep` initially read 0% everywhere because only `focused` was given coverage-optimal spots, so it was saving *and* placing badly. Sharing `focused`'s placement isolates the spending policy, which is the only thing the profile is meant to vary. Verified in the browser that tier 4 now reads as a spike rather than an increment — damage 25 → 103, DPS 119 → 490 — with panel prices matching what is charged.

- **R19 — Scrapped the art layer and rebuilt it as pixel art.** The user said the graphics looked bad and wanted to start over. Before deleting anything I found the actual cause: **my own art rule.** Rule 5 in the README was "flat fills only, no gradients, no realistic lighting" — the exact opposite of the soft-shaded look I was supposedly copying, enforced for eighteen rounds and written down as a principle. So the graphics were never a symptom of the systems, and a full rebuild would have thrown away 88 tests and a nine-cell balance grid to fix ~600 lines of drawing code. Rebuilt the visual layer only, keeping the sim.
  First attempt was soft-shaded vector, and it over-corrected: I thinned the outlines in favour of value contrast and the whole board went mushy — the opposite failure to flat. BTD6 is shaded *and* crisply bounded. Then the user picked **pixel art**, which is where it landed.
  Pixel art is not a sprite style, it is a property of the whole scene, so this was an architecture change: everything now draws into a **240×150 buffer** (`PX = 4`) that is upscaled with smoothing off. Ground and lane are plotted pixel by pixel once per map and cached — crisper than stroking, since canvas strokes antialias and at 4x that reads as mud. Sprites are *generated* rather than hand-typed as string maps: a shaded disc is a distance function against a light vector, which is shorter and cannot be silently broken by miscounting a row. Outlines are derived by flood-adjacency, so every sprite gets a clean silhouette for free. Particles moved into the buffer; floating text stayed at screen resolution because 4px glyphs are unreadable.
  Three self-inflicted bugs caught by looking at it: the ground vignette normalised its edge distance by half the board width, so "edge" exceeded 1 in the middle and the darkening swallowed almost the entire board; the enemies came out *taller than the towers*; and the great piñata's star was stamped as rays off a disc, which produced a lumpy sun — replaced with a real point-in-polygon fill over ten vertices.
  Also wrote `PROMPT.md`: a cold-start brief encoding the settled premise, the seven pixel-art rules, the paired tuning constants, and all ten traps — so none of this gets re-derived.

- **R20 — Built the tool the art loop needed, then used it.** Wrote `ART_LOOP.md`: one sprite per round, and the pass criterion is *silhouette-first distinctiveness in greyscale*, because colour is the crutch a crowded screenshot lets you keep leaning on. Round one was the instrument: `window.__sheet()` renders every sprite at 1x, at gameplay scale, and **desaturated**. Plus a headless coverage test that fails if `data.js` references a sprite `art.js` cannot build.
  The greyscale row was immediately damning, and specific in a way no gameplay shot had been: **all seven humanoid enemies were the same silhouette.** Niño, matador, técnico, rudo, plateado, colgado and campeón differed only by palette — one blob repeated seven times. Only the toro (quadruped) stood apart. I had written "enemy distinctiveness" as a vague next-step three rounds running without being able to say what was wrong.
- **R21 — Gave every enemy its own outline.** `luchador()` now takes a *build* — torso width, torso height, leg length, head radius, stance — so shape varies, not just colour. Niño is the smallest thing on the board with a stick held high; the matador keeps his cape and gains a flat montera; the técnico is tall and lean with a crest; the rudo is a broad slab on a wide stance; the plateado gets angular shoulder pads so its outline is jagged where everyone else is smooth; the colgado hangs from a rope with its legs tucked; the campeón is tallest, crowned and belted. Feet always land at y=20 regardless of build, so no caller has to re-derive the anchor. Greyscale now reads as seven different shapes.
  Still open, and now precisely stated rather than vague: **candy and coin piñatas are identical spheres in greyscale** — the coin one needs a shape tell, not a green palette. The rudo's head is too small against its widened torso, and the campeón reads as a broad slab at gameplay scale.
- **R22 — Rebuilt the screen as BTD6's screen (user request: "one screen, no scrolling, button friendly").** The old layout was a *document*: a top bar row, then a board, then a rail holding four stacked blocks. The rail's content was ~750px tall in a 320px column, so on any laptop the page scrolled and the play button fell below the fold. Copied BTD6's anatomy instead: counters are pills **overlaid** on the board (top bar row deleted, ~90px of height reclaimed); the shop is a `grid-template-rows: auto 1fr auto` rail pinned to the right edge with the play button anchored to the bottom; the upgrade window is an **overlay on the board**, not a rail block. Verified by measurement: the play button sits at the same pixel with a tower selected and without — selecting no longer shoves the rail's contents down. The enemy cheat sheet, which was the single biggest scroll offender, moved behind a `?` pill. `document.scrollHeight` now equals the viewport exactly at 1920×1080 through 1280×720, and the rail never overflows at any of them, because the tower grid is four `minmax(0,1fr)` rows so cards shrink instead of pushing.
  Three things this taught:
  **A fixed-size canvas cannot just be stretched to fill a window when the art is pixel art.** 960→1600 is a 1.67x smoothed stretch (mud) or a 1.67x nearest stretch (some pixels 2px, some 1px — it shimmers the instant anything moves). `fit()` now picks the largest *integer* multiple of the 240×150 art grid that fits and hands the leftover width to the rail; `drawWorld` reads the canvas size rather than assuming `map.w`. The cost is a small letterbox on some window shapes, which is the right trade for square pixels.
  **The shop icons had been rendering at 1:1 art resolution all along** — `sprite(name, 1)` takes no scale argument in the pixel version, so a 20×20 sprite was being stamped into a 74px button and the second argument was silently ignored. It looked like a styling problem in every screenshot. Now `drawIcon()` scales by a whole number with smoothing off.
  **My own console probe produced a false alarm, and I nearly reported it as a game-breaking bug.** `bestSpots()` returns `[x, y]` pairs; I destructured `{x, y}`, so every tower was placed at `undefined`, every shot carried NaN damage, and no enemy ever died. The sim was fine. But it did expose a real hole: `canPlace` is built entirely from `<` and `>` comparisons, and **both are false against NaN**, so a non-numeric coordinate passed every bounds test and `placeTower` built a corrupt tower. Guarded with `Number.isFinite`. Also hardened `noise()` in `audio.js` — a context with no output device reports `sampleRate` 0, `createBuffer` throws on zero frames, and that throw propagates out of the event handler and kills the frame loop. Sound going missing is a nuisance; the game freezing is not.

- **R23 — Stopped working blind.** Screenshots had timed out all session because the in-app Browser pane never composites, so nineteen rounds of art and layout work were judged by measuring the DOM. The user's own Chrome is reachable through a different tool. First look at it told me more in one frame than the whole session's measurements: the window was **1350x1307**, nearly square, `fit()` had given the board only 960x600 and left **707px of empty purple**, and the seven tower cards had each been stretched to **177x243**. **Look at the thing. If the tool you are using cannot show it to you, find one that can — do not substitute measurement for looking.**
- **R24 — Cards are buttons, not billboards.** `grid-template-rows: repeat(4, minmax(0,1fr))` on the shop let cards absorb the rail's whole height. Replaced with `repeat(auto-fill, minmax(104px, 1fr))` columns and `grid-auto-rows: minmax(0, 132px)`, so the grid picks 2 or 3 columns from the rail's width and cards stay roughly square. Added board padding (the plaque and stage borders had been clipped flush against the viewport edge), a plaque above the stage and a round-pip rail below it to spend the vertical slack on chrome instead of void, and replaced the wave's text chips with sprite rows — a player recognises a shape faster than four words. Both the pips and the rows are rebuilt only on change; the chips had been resetting `innerHTML` sixty times a second.
- **R25 — Two overflow bugs the 16:9 case exposed.** Forced a synthetic 16:9 box to judge the target shape and immediately saw the play button drawn **on top of** the round preview: `flex: none` on the card grid meant the shop kept its ideal height and the rail's foot overlapped it. Everything in the shop now shrinks (`flex: 0 1 auto`, `min-height: 0`), so cards give up height — 132px down to 80px at 1280x720 — before anything is clipped. Verified no rail overflow and the play button inside the rail at 1920x1080 / 1600x900 / 1366x768 / 1280x720 / 1152x648.
  Also tied the drawn road to the rule that governs it: `LANE_R` was a hardcoded 6 art px while `LANE_CLEAR` is 34 sim px, so **the road was narrower than the no-build zone** and spots that looked like open plaza were rejected. Now `LANE_R = A(LANE_CLEAR) - 1`.
- **R26 — The actors were too big for the board, and PX was the whole fix.** Enemy groups merged into one mass and towers merged with the enemies passing them. Measured it instead of guessing: gaps between consecutive enemies run **7-38 sim px** (niños at speed 62 pile up behind matadors at 54) against a luchador ~40 sim px wide. Changing `PX` from 4 to 3 makes the board a 320x200 grid, so every sprite is 25% smaller *relative to the board* and every gap 33% larger in art pixels — **no sprite redrawn, no balance number touched**, because spacing and speeds are in sim pixels. `ART_W/ART_H` in the fitter are now derived from `PX` so they cannot disagree with the buffer.
  That change exposed a latent performance bug: `background()` plotted the lane with one `fillRect` per pixel, and a wider road on a finer grid pushed it to ~1.6M calls — **the page blocked for seconds on load and even script injection timed out**. Rewritten as direct `ImageData` writes: first draw went from seconds to **13ms**, steady state 0.31ms. Did the same to `drawVeil`, which was doing ~110k canvas calls *every frame* in Blindfold.
  Finally, the rail's spare height on a tall window: the who-is-who reference now lives in the shop with `flex: 1 1 0`, so it consumes only height the shop did not want and is hidden below 1000px viewport height. The `?` pill promotes **the same element** to a centred overlay, so the copy exists once.

- **R27 — Made the terrain reach every edge, which is the thing BTD6 never gets wrong.** The playfield is a fixed 8:5, so on any other window shape something has to give; up to now the difference was page background with the board floating in it, bounded by a title plaque and a round rail. Both bits of chrome are gone. The canvas now fills the whole box, `render.js` centres the playfield inside a buffer the size of the canvas, and the surplus is **paved as the street outside the plaza** — kerb, light spilling out of the plaza dithered over 14px, and clustered scenery. Counters and round pips moved onto the board as overlay rows. Actors are clipped to the playfield rect, so an enemy spawning at x=-40 walks out from behind the kerb through the gap the road cuts in it, instead of appearing in the middle of open paving.
  **The integer-scale rule had to go, and I had it backwards.** Snapping the zoom to a whole number keeps art pixels exactly square, and I had defended that twice. But the step is coarse: on a 1232px window the honest fit was 2.89 and flooring to 2 cost 31% of the playfield's width and **half its area** — the first screenshot showed a small plaza marooned in a huge paved yard, which was worse than the void it replaced. Fractional zoom makes some art pixels one screen pixel wider than their neighbours. That is a far smaller price than losing half the board, and I only knew which was worse by looking at both.
  Two more traps: **scenery has to clump.** An even sprinkle at the density that felt right read as a warehouse floor — clusters of 2-4 with open paving between, and a clear band around the plaza, reads as a market street. And **a hard value break between two terrains reads as two pictures**; the spill band is what makes the street look like the ground the plaza sits in.
  Verified by round-tripping clicks: for every placed tower, a synthetic pointerdown at its computed screen position selects that tower (4/4). Worth doing, because the offset made the old map-proportional `toWorld` wrong by the whole margin.
- **R28 — BTD6's signature control.** The wide rectangular play button became a big round green send button with a smaller round fast-forward beside it, pinned bottom-right and never moving; the state moved to a caption above it ("Send round 5" / "Round 5 running") since the button is now an icon. Added a dimmer range ring on hover — BTD6 tells you a tower's reach before you commit to clicking. Hover and selection share one `towerAt()` hit test so they can never disagree about which piñata you are pointing at.

- **R29 — The clumping was three separate faults, and the one I had blamed was the smallest.** I had written it up as "sprites too wide for the wave gaps" and queued an art pass. Measuring first found something better: the actor sort was `(a, b) => a.y - b.y`, and **on a lane leg that runs horizontally every enemy shares a y**, so the order fell to whatever the array happened to hold. A bunched group re-stacked itself every frame — the mass was partly a flicker, not a geometry problem. Tie-breaking on lane progress, leader last, made it a queue. Then a stable ±2 art-pixel stagger across the lane, keyed off the enemy id and applied in the render layer only, stops identical figures sitting on the exact centreline; sim position is untouched, and 2 art px is nothing against a 34px click radius. Last, health bars now appear below 70% (bosses always), because a crowd where every chipped enemy carried a bar became a thicket of rectangles and **a bar at 95% changes no decision** — BTD6 shows none at all.
  Width turned out to be nearly a non-issue once ordering was fixed: a niño is 10 art px (30 sim px) against a 28px same-type gap, so a same-type group is shoulder to shoulder, which is what a mob storming a piñata should look like. No art pass needed. **Measure the thing you are about to redraw.**
- **R30 — Upgrade window rebuilt as BTD6's tracks.** Each path is now a row of four slots — filled behind you, the next one lit, the rest grey — beside the upgrade's name and blurb, with the price in a coin badge. It replaces a list of names and pips that had to be read. A blocked path shows *its own* name rather than the upgrade behind the lock, because naming the upgrade made a row you cannot buy look like one you can.
  Cost of the measurement that got me here: a script that simulated all fifteen waves synchronously in the page **froze the renderer process**, taking both open tabs with it, because same-origin tabs share one. Sim sweeps belong in `node --test`, not in the page.

- **R31 — Range rings that carry their own contrast.** Every ring was a single pale pixel per dash, which is invisible on the orange plaza — and the placement ghost's red "no" ring was the worst of them, on the one interaction where you most need to read it. Each dash is now a 3x3 ink block with a bright pixel on top, and dash count scales with radius so a long-range piñata does not draw a sparse dotted line. One `dashRing()` serves the ghost, the hover preview and the selection, so the three cannot drift apart. **A marker that has to read over arbitrary terrain must carry its own contrast rather than borrow it from the ground.**
- **R32 — The street got landmarks, and the placement rule was wrong twice.** Added a market stall (scalloped striped awning), a fountain and potted trees to the crates and barrels, and gave clusters a *kind* — cargo, stall-and-crates, a fountain alone, trees-and-bench — because drawing from one bag gave every group the same read.
  Then the first version put nothing on screen at all. Clusters were placed by **rejection sampling against the whole canvas**, needing 34-48px of clearance from the plaza to exist somewhere; on a 1965px window the street band is 20 art pixels tall, so every candidate was rejected and the street came out bare. Now the bands are computed explicitly (top, bottom, left, right of the kerb), a band is chosen with probability proportional to its area, and the cluster is placed *inside* it. A band under 30px only gets props short enough to stand in it — a stall in a 20px band leans over the kerb.
  **Rejection sampling silently produces nothing when the target region is smaller than the constraint.** It does not error; it just returns an empty street, and you will read that as "the props did not build".

- **R33 — The upgrade window picks its side.** It was pinned left, and on Plaza del Sol the lane's left leg runs straight down behind it: the panel sat on top of live gameplay. BTD6 draws its maps around where its panel goes; ours are already balanced by measurement and are not moving, so the panel moves instead. It scores both sides and opens on the cheaper one: **less lane under it, never over the piñata you just clicked** (that one is absolute — hiding the tower and its range ring defeats the window), plus a penalty for covering the great piñata that becomes overwhelming when blindfolded, because there its condition *is* the health display. Lane coverage is computed once per map and cached.
  Plaza del Sol turns out to be lopsided by 19:1 — 473 units of route in the left band against 25 in the right — so the fix is not marginal, it is the difference between a panel over the fight and a panel over empty plaza. Cementerio is 0.143 vs 0.158, near enough that either side is fine, and its base sits on the *left*, so the same rule sends the panel the other way there. Worth having as a rule rather than a hardcoded side.
  **The first version compared a scale-dependent quantity against a constant.** Costs were raw lane lengths with a flat 250 penalty for the base — but the band is narrower in sim pixels on a bigger window, so the lane sums shrink with window size while the constant does not, and the panel changed sides for reasons that had nothing to do with what it covered. Both terms are now fractions of the whole route: lane coverage is 0..1 and the base is worth 0.06 of it. Swept 3 window shapes x 3 maps x blindfold to check; Plaza is now stable across all of them.
  Also: **the dev server had died**, and the page I was testing against was a stale render — `document.title` was "localhost", not the game. `curl` to the port returned nothing. When the QA hooks are missing from `window`, check the server is actually serving before suspecting your own syntax.

- **R34 — Bunting across the street, and the fountain finally placed on purpose.** Papel picado now hangs between wooden posts across the street bands, drawn with the same flag shape as the plaza's own banners, so the paving outside reads as part of the same fiesta rather than as a service road behind it. Hung after the props so it passes in front of whatever it is strung between.
  **The fountain had been in the prop pool for eight rounds and had never once appeared on screen.** Not a bug — a one-in-six roll, restricted to bands thick enough to hold it, on windows that mostly have thin bands. I had logged it as "built but unverified" and moved on twice. It is now placed deliberately in the roomiest band before anything else competes for the space, which is what a landmark deserves: **something that only shows up on a dice roll is something you will never see, and "unverified" in a log is a defect waiting to be found by someone else.**
  Also worth recording: the screenshot tool froze twice mid-round and both times the game was fine — 0.26ms a frame when measured. A busy renderer and a flaky extension look identical from here; measure before you go looking for the loop you supposedly wrote.

- **R35 — The playfield is inset, so a street always exists.** Previously the map filled whichever dimension bound first, and on a 16:9 window that meant `oy` came out 0 — every prop, the bunting and the fountain were invisible, and eight rounds of surround work only showed on a squarer window. `layout()` now reserves an inset before choosing the scale. **In art pixels, not a percentage**: the bands are measured in art pixels, so a percentage inset would shrink to nothing exactly when the scale is large, which is the case that was broken. The inset grows with the window (16 to 30) so a big monitor gets a street wide enough to hang bunting in and a small one only gives up a verge.
  The cost is real and worth stating: at 2206x1269 the playfield goes from 2106x1269 to 1562x976, about 23% off each dimension. It was rendering at 6.6 screen pixels per art pixel, which was oversized for the art; 4.9 reads better. Checked across five window shapes — every one now has props, and all but the smallest have bunting.
- **R36 — The plaza floor stopped being graph paper.** Two-tone check only, at one tile size, reads as a grid rather than as paving. Added a scatter of lighter and darker accent tiles — hashed from the tile coordinate, not drawn from the sequential RNG, so the choice is stable per tile regardless of what order pixels are visited in — and a dithered worn margin either side of the road, stamped as a wider pass before the rim. Feet wear a verge; roads do not have hard edges. First draw 1.3ms, steady 0.23ms.

- **R37 — A floor mosaic in the plaza's emptiest corner.** BTD6 dresses the terrain itself, not only its edges, but anything placed *inside* our kerb risks being read as a piñata you could click. A mosaic is the safe version: inlaid, flat, no outline, no shadow, and drawn before the lane passes so the road paints straight over it. Sited by sampling the path once into art space and picking the coarse-grid point with the greatest clearance — so it lands in genuine open plaza on any map, rather than wherever a constant said.
  **The first version was a stain.** I filled the star with a two-tone check at 12% contrast, on the assumption that dithering is always the pixel-art answer for shading. At this size it only blurred an already small shape, and the only thing that read was the ring — so it looked like a spill, not a design. Redrawn with solid fills and clean boundaries, the same rule the sprites already follow. **Dithering is for falloff across a large area; a small shape needs contrast and a hard edge.**

- **R38 — Two mosaics, and my own next-step note was wrong.** I had written "one mosaic per map is a start, not a floor" and acted on it: rank every candidate, take the top three. The result was **three identical stars in a row along the top strip**, because the highest-clearance points all live in the same open region — wallpaper, and worse than the single motif it replaced. Cut to two, with a separation of `r1 + r2 + 52` so they must land in genuinely different pockets, and the second capped small enough to draw as a rosette instead of a star. A companion, not a repeat.
  Two defects that only showed once it was on screen: the search guarantees the *centre* is 26px from the plaza edge but the radius can reach 28, so a motif could paint inlay over the kerb it is meant to sit inside. Clipping fixed the bleed but left a mosaic sliced flat, which reads as an accident — so the radius is now bounded by the distance to the edge as well as by the lane, and the shape is whole by construction. **Clipping hides a sizing bug; it does not fix one.**
  Worth keeping in mind: **a next-step note written while looking at one screenshot is a hypothesis, not a plan.** "The other pockets are bare" was true and acting on it literally still made the screen worse.

- **R39 - The shop rail moved to the bottom, because the board is bound by width.**
  Looked at the game in the user's own window for the first time since R23 and the
  layout was mostly paving: 893x1307, the plaza drawing **568x355 inside a
  625x1307 canvas**, so a quarter of the board box was the game and three quarters
  was street. Nothing was broken - an 8:5 playfield beside a full-height rail is
  bound by its WIDTH, so every pixel of window height past the binding point can
  only become more street. Laying the rail across the bottom spends that height on
  the rail instead: playfield **777x485, 1.87x the area**, and nothing inside the
  shop moves - same cards, same next-round panel, same send button in the same
  corner. The choice is measured, not a media query: `chooseRail()` computes both
  arrangements and takes the bigger one, with 12% of hysteresis (the band is
  ~1450-1550px wide at 1000px tall) so dragging a window edge across the crossover
  does not flip the whole UI on every frame. 16:9 windows are unchanged - they
  come out `right` by 1.5x, which is why this had never shown up.
  Extracted `streetInset`/`boardScale`/`chooseRail` as pure functions in
  `render.js` and pointed the fitter at them, so the two cannot drift; ten new
  tests sweep every window shape from 700x600 to 2400x2000 (98 green). Click
  round-trip re-verified in the new arrangement: 10/10 towers select from their
  computed screen position.
  **Two things looking at it taught.** First: **a generic class name is a
  component boundary you did not draw.** One new rule, `body.tall .next`, was
  written about the rail's next-round panel and silently applied to `<i class=
  "next">` - the upgrade track's lit slot - stretching it into a 196px bar and the
  upgrade window to 274x967, three times its right height. The slot is `.lit` now
  and the panel rule is `.shop > .next`. Second: **free space is not useful
  space.** Under a width-bound window bar height costs no playfield at all, so I
  grew the bar to 417px to carry the who-is-who reference - and the card rows are
  capped (they are buttons, not billboards) and the reference panel wants *width*,
  so the whole gain came out as empty panel. Reverted. The reference is a column
  of the bar above 1180px of window width instead, where the width exists without
  starving the card grid to a single column of 155x49 strips.

- **R40 - Played it, rather than measured it, for the first time.** Drove the whole
  loop through real mouse and keyboard input in the bottom-bar layout: menu ->
  map -> difficulty -> arm a card -> place -> send the round -> fast forward ->
  select -> buy an upgrade -> retarget -> sell -> pause -> the `?` overlay ->
  quit. Every path works, including the refusals: a click on the lane builds
  nothing, costs nothing, and leaves the card armed so the next click can try
  again. Round bonus, pips, next-round intel and the send button's caption all
  track correctly across a round boundary.
  **Two real defects came out of playing rather than measuring.**
  *The refusal was almost invisible.* "You may build here" and "you may not"
  differed by the hue of one pixel per ring dash - measured, 225 art pixels on the
  whole screen, out at the rim of a circle, on the interaction a player reads more
  often than any other. The ghost now carries the answer: a salmon cross stamped
  on it, and the refusal ring is drawn bold (block in colour, core in ink) so it
  reads as a red ring instead of an ink ring with a pink dot in it. First attempt
  built the cross the same way the rings are built - ink block, one-pixel core -
  and it vanished into the sprite underneath: **the halo has to go under the mark,
  not around a mark that is one pixel wide.** All the pixels were there; measuring
  salmon coverage said "drawing fine" while the screen said nothing at all.
  *Screenshots taken by hand were lying about the armed state.* `window.__draw()`
  defaulted `ghost` to null, so every shot I have ever taken while a piñata was
  armed showed no placement preview. The frame loop's ghost is now a shared
  `currentGhost()` that the hook defaults to, so a hand-taken shot is what a
  player sees. Note the matching trap: a ghost passed to `__draw()` by hand is
  wiped by the next repaint, while an armed-state one survives.
  **And one tooling trap that cost the most time.** Halfway through, the tab
  stopped receiving input: real clicks landed on nothing, `.click()` fired no
  listeners, and screenshots timed out - while `javascript_exec` kept working, so
  everything looked alive. I had already written "the difficulty buttons are dead"
  as a game bug. A page-world probe (`window.addEventListener('pointerdown')`
  injected via a `<script>` tag) proved no event reached the page at all, and a
  control - create a div, attach a listener, click it - fired zero times, which
  means the probe world itself could not dispatch. **Prove the tool works before
  you blame the page; a control that must pass is the cheapest way.** A fresh tab
  fixed it instantly.

- **R41 - Fixed the tool before trusting it, then redrew the coin piñata.** The
  contact sheet had been drawing the two big columns at **PX/2** - not gameplay
  scale, and exactly the size at which a silhouette problem hides - underneath the
  HUD, so the first row sat behind the life and candy pills. It also could not
  survive a screenshot: **taking a shot of a background tab wakes the tab, which
  resumes rAF, which repaints the game over anything drawn into the canvas by
  hand.** That is the same mechanism that wipes a ghost passed to `__draw()`.
  The sheet now sets a `frozen` flag that the frame loop honours by *redrawing the
  sheet* rather than skipping the frame - a page that never commits a frame makes
  `Page.captureScreenshot` hang, which cost a 30-second timeout to learn - hides
  the HUD via `body.sheeting`, draws at full `PX`, aligns all three stamps on one
  baseline, and caches the greyscale copies since it now redraws sixty times a
  second.
  With a sheet worth reading, the queued complaint was confirmed in one look:
  **candy and coin were the same sprite in greyscale**, because `coin` was
  `ballPinata` in a different palette. Redrawn as a **stack of three squashed
  discs with a dark seam under each** and a coin standing on edge on top. The
  seams are what stop it melting into one lumpy column - which would have been the
  ball silhouette again.
- **R42 - The matador's cape was behind him, so it only made him look wider.**
  Greyscale showed matador, técnico and plateado as three interchangeable
  humanoids, and the cape is the whole reason the matador's counter is guessable
  on sight. It was drawn as a `pre` layer *behind* the body, where the torso
  overpaints it: in silhouette it added nothing but width. Now it hangs at arm's
  length with a one-column gap, so `outline()` lays ink between man and cloth, one
  pixel bridges the gap at hand height so it reads as held, and the hem is a zig
  because a flat bottom edge reads as a board.
  **The first version was still wrong, and in an instructive way.** Separated by
  outline but painted in the suit's two darkest tones, it read as a *stick*. A
  shape that has been given its own outline still needs its own **value**: recut
  in gold against the red suit, it is the lightest thing on the sprite and
  unmistakable in greyscale. That is not the forbidden "fix a silhouette with
  palette" move - the silhouette was already fixed - it is shading the shape the
  silhouette created.
  Checked the crowding trap rather than assuming it: the matador is now the widest
  humanoid at **16 art px (48 sim px)** against a measured minimum same-type gap
  of **75 sim px** in its own wave, so the wider sprite cannot pack into a blob.

- **R43/R44 - The boss's head was clipped off, which is why he read as a slab.**
  `luchador()` builds on a 22x24 grid with the feet at y=20, and El Campeón is
  tall enough that his head disc ran off the top: **10 painted pixels sat on row
  0**, so the head came out with a flat lid and no outline (`outline()` cannot
  draw ink outside the grid). Measured, not guessed - a per-sprite bounding box
  showed campeón `y0: 0` against rudo's 2 and niño's 7. Added a `lift` option that
  grows the grid upward and moves the feet line with it, so the crown gets its
  outline too, and gave the rudo the same treatment plus a head scaled to his
  torso (4 -> 4.8) with a gold jaw guard: the widest body in the roster needs the
  heaviest head or the proportion says "wearing armour" rather than "heavyweight".
- **R45 - The ribbon dancer, and a measurement that measured nothing.** First of
  the three unbuilt piñatas: a chain tower. On hit the shot re-aims at the nearest
  luchador it has not already hit, up to `chain` times, losing `chainFalloff` of
  its damage each hop. Distinct from pierce, which only carries a shot along the
  line it was already on - a chain *turns*, so it pays where they bunch sideways
  and does nothing to a lone runner. Speed 470 is deliberate: it is the one crowd
  tool a cape waves off, so its area damage is bought with a counter that beats
  it outright. Sprite is a spinning top with two streamers, because a curve
  leaving the body was the one silhouette nothing else in the roster owned.
  **Then the balance check: the grid came back nearly unchanged, and that was the
  bug.** The playtest bots build from a hardcoded `PLAN` list, and the ribbon was
  not on it - **a tower missing from that list is never bought, so the grid says
  nothing about it while looking like a clean bill of health.** Putting it in
  slot 6 in place of the maraca then made every profile worse, which also proved
  nothing: that swap removes a stun support, so it changes two things at once.
  The honest form is slot 8 against a *repeat* candy buy, which leaves `deep` and
  `focused` as untouched controls - and their numbers came back bit-identical to
  the pre-ribbon grid, which is what makes the `spread` column readable.
  At 9 damage / 0.85s it measured **8 lives% worse than the 200-candy piñata it
  replaced** on every board: candy-tier crowd damage for two and a half times the
  price. At 13 / 0.8 / 500 it lands where a specialist should - **+12 on El
  Mercado**, the board whose parallel legs make crowds bunch, and slightly down on
  the two open boards. Every cell is still clearable and none of the three
  profiles dominates.
  Also closed two coverage holes the addition exposed: the feedback test built a
  **hand-written roster of seven towers**, so a new piñata's event kind would have
  shipped unhandled (the trap this project has hit twice) - it reads `TOWER_ORDER`
  now; and the upgrade-path test walked `PATHS`, so a tower with no paths at all
  passed silently. 104 tests.

- **R46 - Shadows multiply the ground now instead of washing over it.** They were
  one translucent black ellipse, `rgba(30,18,6,0.34)`, which lands as the *same
  grey everywhere*: over the cream lane - the surface a player watches most - it
  read as a smudge of dirt rather than as shade. Drawn with `multiply` and an
  opaque sprite, every surface keeps its own hue and only loses light. Measured
  by probing the actual code path over three known surfaces: cream `#fdf0d8` ->
  `#af8d75`, plaza `#b3711f` -> `#7c4211`, street `#5c3a10` -> `#3f2209`, all at a
  constant ratio of 0.69/0.59/0.55. The old wash on cream came out `#b1a591` - a
  desaturated grey-tan, saturation 0.18 against the new 0.33. Costs one composite
  instead of a per-pixel pass; frame time 0.26ms, unchanged.
  Also re-learned R33's lesson the hard way: the page had `document.title` of
  "localhost" and no QA hooks, and `curl` to the port returned nothing. **The dev
  server had died again.** When the hooks are missing from `window`, check the
  server is serving before suspecting your own code.

- **R47 - Papel picado: the piñata with no projectile.** Second of the three
  unbuilt ones, and the first tower in the game that never fires anything. Strung
  paper covers a circle of ground and takes a cut off everything standing under
  it on a beat; `damage` is one snip and `rate` the gap between snips, so every
  damage and rate upgrade works on it unchanged. **The cape and the swing are
  rules about projectiles**, so this is the one piñata neither can answer - and it
  pays for that with the shortest reach in the game (92) and no burst at all.
  Ticked rather than applied per frame, which is a feedback decision as much as a
  cost one: continuous damage raises a `hit` event every frame for every enemy in
  range, several hundred particles a second. The field shares one `cut` event so
  the effect is drawn once instead of per victim.
  **The two coverage tests added in R45 both fired on the first run** - no upgrade
  paths, and an unhandled `cut` event - which is exactly what they were for.
  Balance, against a repeat gum buy at slot 10: 5 damage was clearly worse than
  the gum everywhere, 9 was mixed, 11 lands at **+6 / +5 lives% on Plaza del Sol
  and Cementerio and -7 on El Mercado**, the fast board where a slow is worth more
  than any amount of damage.
  **A wrong hypothesis, chased and dropped.** Three different damage values gave
  *byte-identical* results on El Mercado, which reads as "the tower is not
  reaching the lane" - so I taught the harness to hand each piñata a spot its own
  range can cover. It never fired once: a probe showed every planned tower covers
  lane at its own range. Reverted, and the real finding kept instead: spots are
  scored at 118 and handed out in order, so the 92-range papel gets **228 units of
  lane where its spot was chosen for 516**. That is a fidelity ceiling on the
  harness, now written down rather than silently absorbed.
  Two defects the tests caught before they shipped: **a multiplicative mod cannot
  lift a value off zero** - the Tangled path multiplies `slow`, the tower had no
  base `slow`, so the whole path bought nothing - and the sprite's fringe was
  painted over by the sheet below it, so the one detail that says "cut paper"
  existed in the code and never reached the screen. 108 tests.

- **R48 - The mariachi trio, and the roster of ten is done.** A pure support: no
  damage, no shot, an aura that makes every piñata in earshot swing faster. Paths
  are BTD6's village shape - tempo, brass, radius.
  **The aura machinery existed and silently deleted itself.** `computeStats`
  spread the base stats and then set `auraRate`, `auraDamage` and `auraRange` to
  0, because until now only the coin's Sugar rush *bought* an aura and nothing
  shipped with one. The trio's entire mechanic vanished on placement; the test
  that asserts a neighbour is in earshot is what caught it. Same shape as the
  papel's `slow` bug an hour earlier: **a defaults block that assumes a field is
  upgrade-only is a trap for the first tower that comes with it.** Fixed for the
  aura trio and for `interest`, `sharpPierce` and `burnSpread` at the same time.
  **Auras were also never drawn.** A coin with Sugar rush bought looked exactly
  like one without it. They now show as notes drifting round the edge of the
  buffed area - deliberately not a dashed ring, because dashed rings are UI here
  (hover and selection) and a permanent one reads as a stuck selection.
  Balance: break-even against a repeat maraca in the wide build (+4 / -4 / -3
  across the boards), which is the honest result for an aura in a build that
  *spreads*: probed, the trio reaches 4 neighbours on Plaza del Sol but only **1
  on Cementerio's spread build against 3 in the focused one**. The profile that
  would benefit most never buys one - it places seven towers and the trio is the
  twelfth - so the harness understates it by construction.
  Two sprite lessons: the three hats' brims touched at 7px wide, so they merged
  into a rim and the whole piñata read as a **basket**; and ten cards in the shop
  turned the two-word names into two lines, which ate the icon down to 16px and
  `drawIcon` rounded that to a 1x stamp. Cards show one word now, and the bottom
  bar sizes itself to the shop it holds rather than to a fixed fraction of the
  window - height it takes there is free anyway, because a tall window's board is
  bound by width. The rail's card grid also packs three columns instead of two at
  the same width, which took the 1280x720 icons from 28px to 47px. 112 tests.

- **R49 - The plateado got shoulders, and the first attempt grew wings.** Beside
  the técnico in greyscale the two were the same rectangle-with-a-bump: they
  differed by *value* (near-white against mid-grey) and by nothing in the outline,
  and the plateado is the one carrying a counter rule you have to read on sight.
  Its "angular shoulder pads" were three 2x2 blocks stepping down the arm, which
  at gameplay scale merge into the arm.
  Redrawn as plates that flare past the arms and taper over three rows. **At four
  pixels of flare plus a helmet crest it stopped being a man in armour and became
  a white bird** — at 20 pixels tall a silhouette change that large swaps the
  species rather than the costume. Two pixels and no crest reads as pauldrons and
  still breaks the outline, which is all it had to do.

- **R50 - Taught the harness what each piñata is for, and built a bot that can
  price an aura.** Two measurement problems, fixed one at a time.
  *Spots were scored for the wrong tower.* They came out of one list scored at a
  reach of 118 and were handed out in order, so the 92-range papel picado
  inherited a sparkler's position and the mariachi trio - which never touches the
  lane - was scored on lane coverage. Each planned piñata now looks at the next
  three unused spots and scores them by its own job: route covered at its own
  reach, piñatas already in earshot for an aura, nothing at all for pure income.
  **The first version took the best of the window every time and quietly replaced
  a profile**: `focused` is *defined* as the seven highest-coverage positions, and
  letting each tower shop around pushed it down the list and cost it 27 lives% on
  Plaza del Sol. A swap now has to be 25% better for that piñata - with which
  `deep` and `focused` come back bit-identical and only the intended towers move.
  `spread` gains a lot (Plaza del Sol Máscara 0 -> 18, Plaza 27 -> 47), which is
  the honest reading: the wide bot was being punished for the roster's short-range
  supports rather than for spreading.
  *The trio could not be priced at all.* `spread` buys it twelfth and `focused`
  never buys one, so **seven of the nine grid cells were byte-identical with and
  without it**. Added a fourth profile, `band`, for the same reason `deep` exists:
  everything inside one trio's earshot, a knot rather than a line. It loses every
  cell - clustering gives up too much lane - but run twice with only the trio
  swapped for a chili it answers the actual question. And it only answers it
  because the harness now prints **avg wave reached**: every one of those runs
  ends at zero lives, so lives% cannot see the difference. An aura is worth
  **+1.4 / +1.2 waves on Plaza del Sol, +2.0 / +1.0 on El Mercado**, and nothing on
  Cementerio, whose sprawl means even a knot is not a knot.
  Two lessons worth keeping: **a saturated metric hides real differences** - when
  every run reads 0%, measure how far they got instead - and **an early mariachi
  is a trap**: swapped into the maraca's slot 6 it cost the wide build 23 lives%
  on Plaza del Sol, because 12% of two towers is nothing and a stun is a stun.

- **R51 - The coverage ratio does not explain El Mercado, and R17's note was
  wrong about the lever.** R17 left "optimise the coverage ratio, not leg spacing"
  as the instruction for revisiting that board. Measured across all three boards
  for the first time (`test/boards.mjs`, kept as a tool): Plaza del Sol **1.90x**,
  El Mercado **1.46x**, Cementerio 1.73x — against narrow-build advantages of -5,
  **+30** and +19 lives%. El Mercado has the lowest ratio and the largest
  advantage; the relationship is inverted, so the ratio cannot be the lever.
  The number the gap does track is **lane speed**: `speedMul` 1.00 / 1.22 / 1.16
  against gaps of -5 / +30 / +19. Tested rather than left as a correlation -
  dropping El Mercado to 1.0 halved its gap, **+30 to +15**. A fast lane rewards
  concentration because a thinly spread piñata gets fewer seconds on each enemy
  passing it, while a knot puts several piñatas on the same enemy at once.
  Left the balance alone: each board now favours a different build (Plaza del Sol
  the wide one, El Mercado and Cementerio the narrow one), which is what three
  boards are for. The lever is written down for the day the gap actually needs
  closing, along with its cost - speed is also the board's main difficulty dial.

- **R52 - Stopped two bunting systems stacking.** The plaza hangs its own two rows
  of papel picado across its top edge and the street band directly above it was
  also getting bunting runs, so the top of the board carried up to four rows of
  flags. Not wrong, but it read as an accident of two systems meeting rather than
  as dressing. The band above the plaza now gets props and no bunting when the map
  draws its own banners; the other three bands are untouched, so the street below
  and beside still reads as strung for a fiesta.

- **R53 - The blindfold, first look since the layout changed, and the trio was
  standing in the dark.** Veil cost on the new canvas is 0.95ms a frame against
  0.71 unveiled, so the per-pixel pass is still fine. But the mariachi trio had no
  lit ground under it at all: sight was keyed on `def.range`, and a support that
  never fires has a range of **zero**. The piñata that could pay for itself in
  sight lines was the only one giving none.
  Sight is now what a piñata *works over* — its aura for the trio, its field for
  the papel picado — which makes the trio the widest lantern on the board (158
  against the candy piñata's 144) and a real blindfold pick: no damage, most
  information.
  **Fixing it in `canSee` changed nothing on screen, because `drawVeil` had its
  own copy of the expression.** The test went green while the screenshot stayed
  wrong. `sightRadius()` is exported from `sim.js` now and both call it, with a
  test that walks four piñatas and asserts each one lights its own radius. Third
  time this shape has come up (the fitter's scale rule in R39, the papel's
  defaults in R47): **two copies of a rule drift the moment one of them is
  right.**

- **R54 - Rebuilt the screen as BTD's anatomy, asked for directly: "towers on the
  left, one page, no scrolling, copy btd".** The shop is now a panel laid *over*
  the board on the left, and the board is the whole window. The rail that took a
  column is gone and so is the bottom-bar arrangement built to dodge it - both
  existed to manage a column that no longer exists.
  **The panel is a constraint, not a subtraction.** Reserving its width before
  scaling cost 17% of the board at 1920x1080, a window where the plaza is bound by
  height and leaves 285px of surplus width the panel fits inside. Scaling to the
  window and shrinking only when the plaza would not clear the shop makes it free
  there, 4-8% on smaller 16:9, and 17% on a tall window - which has no surplus
  width at all and is the shape the bottom bar served for free. That trade is
  deliberate now: one anatomy that never moves beats two that swap under you.
  Three defects found by looking, each fixed and re-shot:
  **The plaza ran flush off the right edge** and its kerb was cut, because the
  panel cap set the scale exactly. Both axes keep a small band now.
  **The street inset was being charged twice.** It was reserved on both axes, but
  a fixed-aspect board in a differently-shaped window has surplus on one axis and
  none on the other: on 785x1260 the horizontal inset cost 13% of the plaza's
  width while 900px of vertical street sat unused. Reserved on the non-binding
  axis, the plaza grew 574x359 -> 635x397 with the street unchanged in practice.
  **The panel's spare height measured as zero** because the card list was
  stretched to fill it - `scrollHeight` equalled `clientHeight`, so "is there room
  under the cards" always answered no and the who-is-who reference never appeared.
  Sized to its rows instead, the reference fills the bottom of the panel on any
  screen with room, and the height media query that used to guess at this is gone.
  Also added `window.__layout()` and `window.__toScreen()` as QA hooks, because
  every screenshot probe was recomputing the sim-to-screen formula by hand - which
  is precisely how the veil and the fitter ended up disagreeing in R53.
  111 tests; the layout suite was rewritten for the rule that actually holds now.

- **R55 - Overlays that still assumed a centred board.** With the shop owning the
  left edge, anything centred on the *window* sits off-centre over the *board*:
  the wave banner and the end-of-run modal both did. Centred on the plaza now. And
  the `?` pill is hidden whenever the who-is-who is already showing in the panel,
  because a button that opens something already on screen is noise.
- **R56 - Freeplay measured for the first time, and it was four waves long.** The
  mode has existed for dozens of rounds and had never been run: the harness stopped
  at the authored campaign. `--free=N` carries it past, and the first result was
  that **every profile on every board died between waves 16 and 19** — the ramp
  added 35% enemy health per wave on top of the campaign's, tripling health within
  five waves, so how well you had played made no difference to where you stopped.
  That is a wall, not an endless mode, and it made the best-run record meaningless.
  At 0.18 the tail separates builds: the saving bot reaches **29 on Plaza del Sol
  and 34 on El Mercado** where the greedy ones still stop at 19. Five waves of
  freeplay now multiply health 2.36x rather than 3.4x, and the campaign grid is
  bit-identical because the term is zero until wave 15.

- **R57 - Swept the new anatomy across window shapes and found the card floor.**
  At 900x600 the ten cards compressed to **47px tall with a zero-height icon** — a
  shop of captioned blanks — because the row track was `minmax(0, 132px)` and grid
  shrank it to fit. A floor of 84px makes the list scroll instead, which is the
  one scroll this screen is allowed. Checked 900x600, 1024x1280, 1280x720,
  1600x900 and 2514x1269: no page scroll anywhere, panel clear of the plaza,
  counters clear of the panel, dock inside the window.
- **R58 - Freeplay's defeat message still counted against the campaign.** "They
  got through on wave 22 of 15" — harmless when freeplay was four waves long and
  wrong now that it runs to 34. It reads "22 — 7 past the campaign" in freeplay,
  with a test for both branches.
- **R59 - Played the whole loop through real input again**, because every control
  moved in the rewrite: menu, card, placement, send, fast-forward, select,
  upgrade, target button, T key, sell, space. All correct, and the upgrade window
  opens opposite the shop.
- **R60 - Measured what the overlays cover, and two of them covered things that
  matter.** Walked every map's route in screen space against each overlay's
  rectangle. At 1600x900: the **lane's entry stub was under the shop on all three
  boards** — every path starts at x = -40, off-board, so the place where a wave
  first appears was behind the panel — and **El Mercado's great piñata was under
  the send button**, which is the health display this game deliberately made an
  object rather than a number.
  The stub is now part of what the layout keeps clear: `leftBleed()` measures how
  far a map's path pokes out to the left and the plaza is placed past it. The dock
  moved to the bottom LEFT — BTD's shop and send button share a side, so mirroring
  the shop mirrors the corner, and every one of our maps ends its lane on the
  right. That still left 6% of Plaza del Sol's lane under the dock at 1280x720, so
  the pause/sound/menu buttons moved into the shop panel and the dock shrank to
  the send cluster alone. Re-measured at 900x600, 1280x720 and 1600x900: **zero
  lane covered, no base covered, on every board.**
  Worth keeping: an overlay's cost is measurable. Walk the route in screen space
  and count the points inside each panel — it takes one probe and it turns "does
  that look like it is in the way" into a number.

- **R61 - The menu did not fit a short window.** At 900x600 the card overflowed by
  61px, which put the difficulty buttons — the only thing on that screen you have
  to press — below the fold. A compact variant under 760px of height tightens
  proportions rather than hiding anything: zero overflow at 900x600, and all three
  difficulties visible even at 1000x520.
- **R62 - The great piñata's damage was a darkening, not a breaking.** It is the
  health display, and the *only* one when blindfolded, and its three states
  differed by palette plus a few dark pixels drawn inside the body — which at
  gameplay scale read as texture. Damage now takes bites out of the SHAPE: one
  star point gone at a third damaged, three chunks and a chewed edge past two
  thirds, with `outline()` giving each bite its own ink edge. **Silhouette is the
  channel that survives every scale**; the cracks were all there and none of them
  reached the screen. Also had to redraw the rope *after* the bites, because the
  top chunk was eating the thing it hangs from.
- **R63 - Checked the speed control before "fixing" it.** Freeplay running to wave
  34 makes 2x a grind, so I went to add a 3x — and it was already 1/2/3. Reading
  the code cost a minute; adding a duplicate cycle would have cost more.
- **R64 - The shop said what a piñata costs and nothing about what it does.** A
  hover detail now shows its blurb and its real numbers — damage, range, rate,
  chains, splash, slow, income, aura — pulled from `TOWERS` so it cannot drift
  from the sim. It shares the who-is-who's slot instead of opening its own box:
  two panels appearing and disappearing under the cursor make the shop jump, and
  the shop is where a player's hand lives.
  First version was gated on the same spare room as the reference, and at
  **1280x720 there is none** — so hovering did nothing at all, silently, on one of
  the most common window sizes. It floats beside the shop in that case, pinned to
  the hovered card's row and clamped to stay on screen.

- **R65 - Ten piñatas, seven hotkeys.** The roster grew past the keyboard and
  nobody noticed: keys bound 1..`TOWER_ORDER.length` so 1-9 worked, the tenth had
  no key at all, and the menu still said "1-7 picks one". Now 1-9 then 0, the
  usual hotbar convention, and the hint says so. The piñata with no key was the
  coin — the one you want first and often.
- **R66 - Two coherence gaps.** Arming a piñata *by keyboard* left the shop panel
  saying nothing about the thing now on the cursor, because the detail card was
  hover-driven only; it falls back to whatever is armed now. And **pause had no
  state on the board** — the button lives in the shop panel, so a paused game
  looked exactly like a game between rounds. It says "Paused" over the plaza.
- **R67 - Autoplay, and a QA hook that would have lied about it.** Freeplay runs
  past wave 30, so BTD6's auto-send toggle earns its place: `A` or the button, a
  1.4-second beat between rounds so the wave-held banner and the candy shower can
  be read. The countdown lives in the frame loop — which **a hidden tab pauses**,
  so the first verification showed autoplay doing nothing at all. Rather than
  conclude anything from that, the tick became its own function that
  `window.__step()` also runs: measured, waves advance 0 -> 4 -> 8 with the toggle
  on and stop dead with it off. A hook that skips what the loop does reports
  failures on features that work.

- **R68 - Measured deep freeplay instead of assuming it holds.** Fourteen upgraded
  piñatas at wave 22, then a deliberately weakened board so a wave would actually
  pile up: peak 15 enemies, **0.4ms a frame** to draw and 0.003ms a sim step
  against a 16.7ms budget. Nothing to fix — which is worth recording, because "it
  is probably fine" and "it is fine, here is the number" are different claims.
- **R69 - The next round says who is coming; now it says what beats them.** The
  counter matrix is this game's one real rule and it lived in a reference panel a
  player has to go and read. The next-round card already knows exactly who is on
  the way, so it now names the rule that applies — read off the same enemy flags
  the sim fights with, so a rule change cannot leave the advice behind, with a
  test that each flag is still on the enemy it describes.
  **Ordering mattered more than expected.** First cut listed rules in enum order,
  so a wave of plateados and colgados advised "speed or splash" for the swing and
  never mentioned that chili does nothing against foil. Ranked by how much each
  rule actually removes — foil sheds 85% of burn, a cape 60% of slow shots, a
  swing ~45%, the rudo's hide 35% of sharp — the important one leads. Two at most,
  because a card read between rounds is not a manual.
  Blindfolded it shows nothing, which falls out of the existing early return: the
  mode withholds intel, and advice is intel.

- **R70 - The screen, as asked for: shop right, controls top-left, no manual.**
  Five changes in one pass, all requested directly.
  **Shop to the right edge**, which moves the reserved strip with it: the plaza is
  centred in what is left of the window and the lane's entry stub — every map's
  path starts off-board at x = -40 — is now kept clear of the *near* edge instead
  of the panel.
  **All controls in one cluster top-left**, under the counters: send, speed, auto,
  pause, sound, menu. The corner an eye already goes to for lives and candy is the
  corner a hand goes to for the round. The next-round card moved to bottom-left,
  out of the shop's corner.
  **The manual is gone.** No who-is-who panel, no `?` pill, no instruction line in
  the menu. What replaced it was already built: the counter rules arrive on the
  next-round card when the wave that needs them is coming, and what a piñata does
  shows on the card you are pointing at.
  **The panel wears the game's colours.** Near-white against warm plaza and deep
  street read as a browser dialog parked on a game; it is the page's own dark plum
  now, with cream cards so the sprites still pop and gold cost badges. The
  translucent HUD chrome took the same plum, because two greys in one picture is
  one grey too many.
  **Two defects found in what I had just built.** The control cluster inherited
  `.controls` from the shop panel, where it was an auto-fit grid — in a flex row
  with no width that collapsed into a column of stacked buttons. And the hover
  detail was rebuilt from `armed` inside `syncCards()`, which `syncHud()` calls
  **every frame**, so the panel wiped the hover sixty times a second: the hovered
  id is a variable now, and the detail survives a draw.

- **R71 - The upgrade window had not moved with the shop, and the floor was a
  chessboard.**
  **The window was opening underneath the panel.** Its default anchor was
  `right: 14px` from when the shop lived on the left; the shop moved and the
  window did not. Re-anchored to the free side with the tucked-in variant on the
  right, and verified the way R60 did rather than by eye: for every piñata on
  every board, the window is never under the shop, never over the piñata you
  clicked, and always fully on screen.
  **The plaza floor got grout.** Two tones on a coarse check with no seam between
  the squares reads as a chessboard, which is exactly what it looked like once the
  board filled the window. One darker pixel along the top and left edge of each
  tile turns the alternation into laid paving — the same trick that makes tiles
  read as tiles anywhere else. Costs nothing per frame: it is baked into the
  cached background, first draw 1.6ms.
  **And the shop missed two columns by two pixels.** A 17%-of-window panel lands
  on a ~182px content box; two 88px columns plus their gap need 184, so ten cards
  stacked into one scrolling column. At an 82px minimum they fit two across, five
  rows, no scroll.
  Also worth writing down: the first attempt to verify the upgrade window measured
  a tab reporting `innerWidth: 0` — a tab that never composited — and every number
  it gave was fiction. **`getBoundingClientRect` on an uncomposited tab is not a
  measurement.** Check the window size is real before trusting anything else.

- **R72 - Three overlays were still centring on the old panel side.** The wave
  banner, the paused label and the end-of-run modal all offset themselves by half
  a shop width to find the board's middle; the shop moved to the right and they
  kept offsetting the same way, which pushed them *toward* the panel. Fixed, and
  then fixed properly: `fit()` publishes the plaza's actual centre as `--boardmid`
  rather than having CSS approximate it from the panel width. Measured, the banner
  now lands on 553px against a plaza centre of 553.
- **R73 - A fourth board: El Caracol, a spiral with the base in the middle.** Every
  other map runs the lane past you and ends at an edge; this one wraps the same
  ground twice, so a piñata near the centre covers passes far apart in *time*. It
  is the one board where clustering pays — the `band` probe, which loses every
  cell everywhere else, holds 14% on Fiesta and finishes Plaza here.
  **The lane-length trap bit twice.** At 4810px and 0.92 every profile finished
  Máscara on 70-98% lives, because a long lane is a long time under the guns.
  Normalising by traversal *time* against Cementerio (3193 units) suggested 1.08 —
  and that was still far too soft, because a spiral hands each tower several
  passes, which time-in-range does not capture. 1.26 overshot (the wide build died
  at Plaza). **1.17** puts it in the same shape as the other three: comfortable on
  Fiesta, wide build struggling on Plaza, nearly dead on Máscara.
  Two bits of UI the fourth map broke: the picker's `repeat(3, 1fr)` wrapped them
  3 + 1 with an orphan (two across now), and `boards.mjs` had a hardcoded gap
  table with no entry for it.

- **R74 - The upgrade window: numbers instead of prose, and a refusal that
  answers.** Reported as "I try to upgrade and it doesn't work when I click
  upgrade". Reproduced and the mechanics were fine — what was broken is that
  **both refusals were silent**: a row you cannot afford and a row blocked by the
  path rule were both `disabled`, so the click did not even fire an event. A dead
  button is exactly what "nothing happens" feels like.
  Unaffordable rows are live buttons now: clicking shakes the row, floats the
  price over the piñata and plays the refusal sound. Blocked rows keep the lock.
  **And the rows lost their sentences.** Each one now carries a four-slot track,
  the tier name, the effect as chips — `+6 dmg`, `-18% cool`, `+1 chain` — and the
  price. The chips come from `describeMod()`, generated off the same `mod` the sim
  applies, so a row cannot advertise something the tower does not do; the 36
  hand-written blurbs it replaced could go stale without anyone noticing. Two
  sign traps in there: a *cut* to cooldown or to enemy speed is a gain (`slow`
  mul 0.72 reads "+28% slow", not "-28%"), and percent-scaled adds are capped at
  100 because `DEEP_POWER` triples a top tier and "+105% pierce" is a promise the
  sim cannot keep. Three tests hold all of that.
  Also moved the round controls to the **top right, against the shop panel** as
  asked — and on a narrow window (the one this was reported from is 523px wide)
  they overlapped the counters, so below 780px they stack under them instead. The
  offset is measured, not hardcoded: the counters change height when the round
  pips fill in, and a fixed offset put the dock 17px inside them.

- **R75 - The game got a thing to beat.** El Coloso is wave 16 and he is in the
  title. 5200hp, `leak: 100` (reaching the plaza ends the run, there is no
  chipping him past you), 60%/45% resistance to the two damage types you have
  been winning with, and two health-gated phases that trade armour for speed —
  he opens nearly immune and slow, he ends nearly bare and fast, and the second
  phase turns off slows so the gum piñata quits at the worst moment.
  The first version escorted him with four rudos and **the harness showed the
  escort was doing the killing**: runs ended before he was in range, so the boss
  was decoration bolted to a wave. He walks in alone now and his phases spawn the
  adds *behind* him, once you are already committed. He is a real filter on the
  grid — `deep` clears fifteen waves on every board and breaks on sixteen at
  Plaza del Sol; `band` clears Cementerio's fifteen and dies to him.

- **R76 - Two boards had legs closer together than the road is wide.** New probe,
  `test/lanes.mjs`, measures closest approach between non-adjacent legs against
  the 68px road: El Mercado 50px and Cementerio 56px, which is not "a narrow
  strip", it is two legs merged into one grey mass with buildable-looking ground
  that is actually lane. Respaced both (90px and 138px now). Because that changed
  lane *lengths*, both were re-normalised by traversal time and the whole grid
  re-run before anything was believed.
  It also handed over a free experiment: El Mercado's coverage ratio moved
  **1.46x → 1.94x** and its narrow-build gap stayed at exactly **+30**. R17's
  metric can be dragged a third of its range without moving the thing it was
  supposed to predict. That is a stronger refutation than the one R73 recorded.

- **R77 - Every board was dressed from the same bag.** A graveyard at night was
  furnished with El Mercado's crates. Each map now names its own clusters, with
  a repeated name meaning weight (El Mercado is mostly stalls and freight), and
  Cementerio gets two sprites nothing else has: `grave` and `cross`.
  Verified by tallying `drawImage` blits during a board build on the live page —
  19 headstones and 11 crosses on Cementerio, zero on Plaza del Sol. Tests hold
  the bags to real cluster names, to no two boards dressing alike, and to every
  bag having a `low` cluster, because thin street bands filter to those and an
  empty pool would have drawn a bare street rather than thrown.

- **R78 - "It doesn't upgrade when I click upgrade" was real, and it was the
  second report.** Reproduced on the live page rather than reasoned about, after
  a control experiment showed the first browser tab had stopped delivering
  synthetic events at all — a listener added and an event dispatched in the same
  breath did not fire, so every measurement taken there was fiction.
  In a working tab the mechanics were fine: a fresh tower upgraded 0-0-0 to
  2-0-1 and the candy came off correctly. The defect was that **two of the three
  refusals were `disabled` buttons**, which fire no click event: a path locked by
  the 2-paths rule was an inert control with its reason hidden in a tooltip. R74
  had fixed exactly this for the no-money case and left the other two.
  Every row now answers — shake, refusal note, reason floated over the piñata —
  and a locked row wears the rule as a badge before you click. Also found on the
  way: a **fully upgraded** path took the blocked branch, so it drew the same
  padlock and grey as a forbidden one and finishing a path looked like a
  telling-off. MAX is gold now, and one table carries badge and sentence so the
  row and the refusal cannot disagree.

- **R79 - Ten piñatas, one animation, no faces.** They shared
  `sin(t * 2 + tw.id) > 0.4 ? -1 : 0` — the same 1px hop at the same rate — and
  nothing was looking at you. `src/faces.js` gives each one an idle, a face and a
  reaction, art-only so it can never move a balance number, and pure so it can be
  tested without a canvas: `idleOffset` and `faceMarks` take a time and an id and
  return offsets and pixels.
  The eyes follow the gun (the pupil takes the quadrant it looks into) and wander
  when the board is empty. Positions are **measured**, not guessed — scanning
  each sprite's ink for its top, widest row and that row's centre showed the
  chili is fattest at the top, the sparkler's widest point is halfway up because
  the rest is star, and the ribbon dancer's mass sits 3.5px right of its anchor,
  which is exactly how far off its body its face had been floating.
  An ink patch behind the face was tried for the three bodies that swallow one
  and **was worse than the problem** — an 11x7 rectangle reads as a hole punched
  in the piñata. A one-pixel lower lid does the job, on those three only; a
  uniform rim flattens the faces that already work.
  Thirteen tests, and six deliberate mutations run against them — eyes below the
  ground line, everyone hopping alike, frozen pupils, blink as a hole in the
  face, no firing reaction, sub-pixel drift — all six caught. The first run of
  that check reported no failures and was itself the bug: Windows console
  encoding mangled the character the matcher was looking for.

- **R80 - The upgrade click, third report, and this time the actual cause.**
  R74 fixed a dead `disabled` button and R78 fixed two more; both were real and
  neither was it. The cause: `syncHud()` runs every frame and called
  `renderPaths()`, which starts `host.innerHTML = ""`. The three rows were
  destroyed and rebuilt sixty times a second, so a human mousedown and mouseup
  landed on two different buttons and the browser resolved the click to their
  container. **Every automated click passed**, because a dispatched click
  completes inside one frame — which is exactly why three rounds of testing
  missed it, and a reminder that "I tested it" and "a person can do it" are
  different claims.
  Rows now rebuild only when `towerId|type|tiers` changes; affordability is a
  class toggled on the existing node. Verified two ways: a `window.__sync()`
  hook that runs the frame loop's DOM pass fifteen times and asserts the node
  survives, and a real slow press-and-release through the browser.

- **R81 - The play buttons were 300px inside the playfield.** Anchoring them to
  the window's top-right was fine while the board was small, but the board scales
  up to meet the shop: measured at 2514x1269 the playfield reached x=2083 and the
  dock sat at 1776. Now a 56px icon column whose width is ADDED TO THE BOARD'S
  RESERVE, so the playfield stops before it. Because the reserve constrains scale
  rather than subtracting width, it costs nothing on any window bound by height.
  Also deleted the narrow-window rule that moved the dock left — with a column
  instead of a 474px row it is unnecessary, and it was putting the dock back over
  the board and on top of the upgrade window.

- **R82 - "No scrolling" was hiding the difficulty buttons.** `max-height: 100%`
  plus `overflow: hidden` on the menu card looked like a fit and was a clip: at
  520x900 the card's box stopped at the viewport while its content ran 299px
  past, so all three difficulty buttons laid out below the fold and were simply
  cut off. The card is sized to content and scaled to fit by measurement now.
  Found on the way: a `max-width: 860px` rule stacked the menu columns, which
  helps a NARROW window and doubles the height of a SHORT one — at 800x540 that
  one rule was the whole 157px overflow. Now gated on `min-height: 700px`.
  And `fitMenu()` is called directly, not via rAF: a hidden tab pauses the frame
  loop, so the first version never ran at all in the pane I was measuring in.

- **R83 - The piñatas were redrawn, and upgrades now change how they look.**
  Faces on eight shaded discs is still eight shaded discs. `art.js` grew a
  construction kit — fringe, ruffle, cord, cone, starBody — and all ten bodies
  were rebuilt around silhouette: the candy piñata is the iconic seven-point
  star (five points that read, because seven at 24px is mush), the papel picado
  is a cut-paper banner, the mariachi trio wears three sombreros.
  Upgrades are visible, BTD-style, without hand-drawing 120 sprites: each body
  declares anchors and one vocabulary of marks is drawn at them — belt, spikes,
  crown for power; spout, wings, whirl for speed; hem, antenna, sombrero, star
  for reach. They can never collide, and structurally so: the restriction rule
  allows only one path past tier 2, so every tier 3-4 mark is mutually exclusive.
  Two misses worth keeping: an ink patch behind a face reads as a hole punched in
  the piñata, and marks drawn into a body-sized grid get silently clipped —
  `put` does not complain, so a crown just loses its top. Every piñata is built
  with 7px of headroom now and a test checks the tallest and widest marks against
  it. Another test asserts every body actually uses the kit, and caught the papel
  picado still being hand-rolled from blocks.

- **R84 - "It doesn't fit the screen" was the board being drawn outside it.**
  `fit()` floored the canvas at `ART_W*2 x ART_H*2` (640x400) and `boardScale`
  clamped to `Math.max(1, ...)`. On any viewport smaller than that the canvas was
  bigger than the window and the page's hidden overflow cropped the board — no
  error, no log, just no right-hand edge. Found by opening the published artifact,
  whose frame was **389x146**.
  Canvas is the window exactly now, `MIN_SCALE` is 0.4, and `panelWidth` clamps to
  a share of the window as well as a pixel range. Fifteen window shapes are in
  `test/layout.test.js` asserting the plaza lands inside the canvas and clear of
  the panel; restoring either old constant fails it.
  The rail had the same bug vertically — six buttons is 229px, taller than a 196px
  window — so it now measures how many fit and wraps into columns, with the
  board's reserve computed from the same numbers.

- **R85 - The street was being dressed underneath the shop.** The scatter bands
  ran to the canvas edge, so props landed behind an opaque panel whose left edge
  sliced them in half. Visible at 2514x1269 as two half-fountains stuck to the
  panel — the kind of thing that reads as "the game doesn't fit right" even
  though nothing was mis-sized. Bands stop at the reserve now, and the reserve
  joined the board cache key so changing the panel width redraws the dressing.

- **R86 - Upgrades stopped being numbers.** Three changes, one complaint: the
  paths already had real mechanics (burn, stun, splash, chain, slow) but every
  upgrade looked identical, so buying one felt like buying a stat.
  (1) All 30 paths now declare an `art` THEME and 16 themes own a tint and a
  glyph, so a piñata that bought "Hotter" is deep red wearing flames and the same
  piñata on the speed path is teal with wings. Only the deepest path tints, so a
  piñata has one identity rather than a muddy average.
  (2) Every tier-4 grants a NAMED ABILITY instead of a bigger number — execute,
  pierceAll, volley, wildfire, shockwave, freeze, payday, encore — implemented in
  the sim and shown as the FIRST chip in the panel, because an ability the panel
  does not mention is an ability the player thinks is a number.
  (3) From tier 2 the piñata throws a different OBJECT: blades tumble, fire
  streams, bursts have arms, coins are flat. Sixteen projectile looks.
  Balance grid re-run and effectively unchanged — the bots rarely reach tier 4,
  so only one cell moved (Mercado/Máscara deep 55% -> 60%).
  NEXT: republish the artifact, then document the theme/ability system.

- **R87 - Sandbox mode.** Thirty paths at 200-2100 candy each means you cannot
  see most of the game in a run, which makes it very hard to judge whether an
  upgrade is interesting. A fourth menu card, cool-coloured and dashed so it
  reads as outside the difficulty ladder: everything free, 999 lives. `free` is
  read by exactly two functions (`placeTower`, `upgradeTower`) so it cannot leak
  into the balance grid, and the restriction rule still applies — a sandbox that
  allowed 4-4-4 would not show you what the game's builds actually look like.
  NEXT: art polish on the tier-4 glyph crowns, which read noisy at small scale.

- **R88 - Two of the thirty abilities were dead on arrival.** The coin piñata has
  `damage: 0` and the firing loop skips zero-damage towers outright
  (`if (t.def.damage <= 0 ...) continue`), so "earns per hit" — on BOTH of the
  coin's top tiers — could never once have fired. Moved to what a piñata that
  never attacks can actually do: a treasury takes a cut (25% of bounty) of every
  defeat on the board, paid once no matter how many treasuries you own.
  The general lesson is now a test: any ability that rides on a shot must be on a
  piñata that shoots. It would have caught this before it shipped.
  Also thinned the tier-4 crown — drawing the ring AND the arc glyphs put nine
  marks on a 26px sprite and they merged into a spiky mess. Verified by ink count
  rather than by eye (screenshots were wedging): 266/280/285/299/334 across tiers
  0-4, a smooth climb instead of a jump.
  NEXT: document the theme/ability system in the README, then put the piñata's
  live portrait in the upgrade panel so you can see what you are buying.

- **R89 - Documented the theme/ability system** in README (what the sixteen
  themes are, the eight abilities and who gets them, why the vocabulary is
  deliberately small) and in project memory. Republished the artifact.
  NEXT: the upgrade panel should show the piñata's LIVE portrait, so you can see
  the thing you are buying change as you buy it.

- **R90 - The piñata's live portrait in the upgrade panel.** All the theme art
  lives on the board at gameplay scale, which is small — but the panel is where
  you actually look while deciding what to buy, so that is where it has to pay
  off. 80x80, redrawn only when the tiers change (same guard as the rows: it runs
  inside `syncHud`, which fires 60x/sec, for a picture that changes maybe four
  times a run).
  Shipped two bugs and fixed both. The portrait came out at 1x — `drawIcon`'s
  0.86 fill margin floors a 36px sprite to scale 1 in a 64px box — so the canvas
  is 80px with no margin and CSS scales it down; ink went 256 -> 924. And the new
  ability chip made three chips on a tier-4 row, which ran 13px past the panel
  and put a horizontal scrollbar on it: a grid child with `minmax(0, 1fr)` can
  still be widened by a nowrap chip inside it, so `.path-copy` needed
  `overflow: hidden` as well as `min-width: 0`. The ability chip now takes the
  full row in gold with the numbers wrapped under it.
  Verified by walking all 30 path/tier-3 combinations and asserting zero
  horizontal overflow in the panel.
  NEXT: the abilities have no sound of their own — execute, shockwave and freeze
  all fire the generic hit note, so the loudest upgrades in the game are silent.

- **R91 - The most expensive purchases in the game were silent.** `execute`,
  `shockwave` and `freeze` all fired the generic hit note, so a tier-4 ability
  triggering was indistinguishable from an ordinary shot — the piñata just
  happened to kill something sooner and you had no idea why. Two new voices:
  `execute` is a short bright snap that finishes before the mask sound it causes,
  so the two read as cause and effect; `quake` is almost all low noise, because a
  bright tone there would fight the hit it arrives on top of.
  Two test improvements fell out of it, both about staleness. The feedback
  fixture stubbed `sfx` from a HAND-WRITTEN list of names, so adding a sound made
  the suite fail in a way that looked like a bug in the feedback layer rather
  than in the fixture — it derives from the real table's keys now. And a new test
  asserts no sound is defined but never played, which immediately classified
  `waveStart` correctly as UI-fired rather than event-fired.
  NEXT: run a long sandbox soak to see whether any of the eight abilities throws
  or misbehaves over a full campaign, since only four have been exercised in play.

- **R92 - An ability soak, and it found the bug it was built to find.**
  `test/abilities.mjs` runs all 30 (piñata, path) cases through a full sixteen-
  wave campaign with the path maxed. The abilities reach into the parts of the
  sim most likely to break on an edge case — removing enemies mid-iteration
  (execute), pushing shots from inside the shot loop (volley), touching every
  enemy on the board (wildfire, shockwave), paying out from `defeat` (payday) —
  and none of that is covered by a unit test that fires one shot.
  0 threw, 0 ungranted, all 30 reached wave 16. The finding was in the LIVES
  column: every `freeze` build finished on 999 (nothing leaked at all) while
  everything else finished on ~899, and El Coloso leaks exactly 100. Freeze was
  setting `stunT` FLAT, so it walked straight past the `stunResist: 0.95` the
  boss carries for precisely that reason — the one path in the game that ignored
  it. `shockwave` had the mirror defect: it skipped anything with any resistance
  at all rather than scaling, so it read as "does nothing to half the roster".
  Both go through the same `(1 - stunResist)` the ordinary stun uses now.
  Left alone deliberately: a maxed gum still holds the boss, but through SLOW
  (0.185x speed), and he is designed to break out of that at 30% health. That is
  counterplay working, not an ability bypassing a rule.
  NEXT: `payday` and `encore` are the two abilities with no feedback at all — you
  cannot tell either is on.

- **R93 - The two invisible abilities.** Six of the eight show themselves — you
  can see two projectiles leave a volley, a shot carry on through a queue, fire
  jump, stars over a frozen luchador. `payday` and `encore` showed nothing at
  all. Payday now says `+N` in gold at the kill with a coin note, because "a
  number that goes up slightly faster than you remember" is indistinguishable
  from not having bought it. Encore was worse than invisible: it turns the aura's
  radius into the whole plaza, and the ring was still being drawn at the OLD
  radius — the one ability whose entire point is "range no longer matters" was
  drawn as a range. It draws at the board's reach now, so the picture matches the
  sim.
  NEXT: republish (four rounds stale) and close the seven scratch tabs I have
  open in the user's Chrome.

- **R94 - Hovering an upgrade previews what it turns the piñata into.** The whole
  theme system exists to make an upgrade a visible object, and the one moment you
  are actually comparing two of them is while the cursor is over the row — so the
  portrait shows the result, framed in gold to say "not bought yet". Measured
  rather than eyeballed: hovering the candy's speed path moves the portrait from
  556 warm / 0 cold pixels to 288 warm / 24 cold, and leaving restores it exactly.
  Buying and re-selecting both clear the preview, or the portrait would sit a tier
  ahead of the piñata.

- **R95 - A cascade collision had been quietly cancelling the chip layout.**
  `.path-copy span` (0,1,1) was beating `.chips` (0,1,0), so `display: flex`
  never applied and the chips were `display: block` — which is why the wrapping I
  had written did nothing and why the first-child `flex-basis: 100%` was inert.
  Nothing errored; the layout was simply not the one in the file. Scoped the rule
  to `.path-copy .chips` so it wins: 85 chips across all 30 path/tier-3 rows now
  clip zero, down from 35.
  Widening the panel to 310px for the ability chips then reintroduced the bug I
  spent three rounds killing — a fixed width tucked against the shop hung 53px
  off the left edge at 420x300. It is `min(310px, room-actually-left)` now, which
  measures 237px there and fits.
  NEXT: check the widened panel against the tall-narrow shape (520x900) too, then
  look at whether the 16 themes read distinctly at gameplay scale rather than in
  a 5x contact sheet.

- **R96 - The game plays on a landscape STAGE now, not in whatever shape the
  window is.** A portrait window was a bad deal twice: the playfield is a fixed
  8:5 so most of the height became street, AND the shop and rail took their width
  out of the little left — measured, the board at 520x900 came out smaller than
  the same game gets at 800x540. Everything is now measured against a stage
  element rather than the viewport: canvas, shop width, control rail, board
  reserve, the upgrade panel's cap and the menu overlay.
  Got the constraint backwards first. A hard 16:10 box letterboxed 484px of
  perfectly good width away on a 2514x1269 window and made the board SMALLER than
  before. The rule is one-sided: full width always, height capped so the stage can
  never be taller than 1.45:1. Landscape windows lose nothing; only tall ones
  letterbox, which is the entire point.
  The menu had to move onto the stage too — as `position: fixed; inset: 0` it
  covered the viewport, so on a portrait window the menu and the game disagreed
  about where the game was.
  Verified: stage 1235x852 at 1.45 on a 1235x1307 window, canvas matches the
  stage exactly, and the world/screen round-trip is still exact with the stage's
  offset (60,60 -> 408,244 -> 60,60).
  NEXT: check the stage against a very wide window (ultrawide should keep full
  height), and re-run the fifteen-size fit test now that sizes come from the
  stage rather than the window.

- **R97 - Pinned the stage's shape in tests and republished.** Three tests over
  the same fifteen window shapes: the stage never gives up width, is never taller
  than 1.45:1, and — the one that guards the mistake I actually made — a
  landscape window is not letterboxed at all. Plus the board-fits-inside envelope
  re-run against STAGE dimensions rather than window ones, since that is what
  `layout` is handed now.
  NEXT: play a full campaign end to end in the browser at the new stage size and
  watch for anything the automated checks cannot see.

- **R98 - A full campaign, drawn for real.** The Node harness runs the sim but
  never the renderer, so a whole class of bug — a sprite that throws, an event
  with no handler, a theme tint on a body that does not exist — can only be
  caught in a browser. Ten piñatas, each maxed on a different path so all three
  paths and all eight abilities are live, sixteen waves, **2292 real render
  frames, zero throws, zero console errors**. The run WON: "El Coloso is down",
  899 of 999 lives, 193 masks.
  One thing that looked like a bad regression in the screenshot — the whole board
  rendered grey-olive instead of warm orange — was the win modal's scrim over the
  stage. Sampled the canvas rather than trusting the picture: the plaza pixel is
  [194, 132, 52], a warm tan, and no element in the tree carries a filter.
  NEXT: document the landscape stage in the README and memory.

- **R99 - Documented the landscape stage** in README and memory, including the
  one-sided constraint and why the symmetric version was wrong.
  NEXT: nothing is broken and the last four user requests are all done and
  verified. Next best value is a fresh look at the shop panel, which has a lot of
  dead space below the cards on a tall stage.

- **R100 - Chased a phantom, then verified the real play surface.** The shop
  panel's 104px of "dead space" below the cards is not dead — it is the slot the
  hover detail drops into, and `syncPanelRoom` measures for it. Measuring first
  saved a redesign of something that was already right.
  Then checked the thing the user actually plays: the published artifact's frame
  is **1235x1271, aspect 0.97 — portrait**. That is precisely the shape the
  landscape stage was built for, and it confirms the complaint was about the
  artifact rather than about localhost. The published bundle carries the stage
  rules (`min(100vh, calc(100vw / 1.45))`, `--stagew`), so inside that frame the
  game lays out as 1235x852 at 1.45 with 210px of margin above and below.
  claude.ai will not accept script injection, so this is verified from the parent
  page and from the bundle rather than by screenshot.
  NEXT: the loop has covered every request; next best value is run persistence
  (a browser refresh currently loses a fifteen-minute campaign).

- **R101 - A run survives a refresh.** A campaign is fifteen minutes and it lives
  in a browser tab; a stray reload threw all of it away, which matters most in
  the artifact where the game IS a tab. `sim.snapshot` / `sim.restore` are pure
  and live in the sim, and the save is only ever taken BETWEEN rounds — in the
  build phase there are no enemies, no shots, no candy in the air and no
  half-finished RNG sequence, so the only things that cannot be recomputed are
  the board, the piñatas and the HUD numbers. 429 bytes for a four-piñata run.
  `restore` is the judge of its own file: a piñata that no longer exists, a map
  that was renamed, a version it does not know, all come back null and the
  Resume button simply does not appear. Tiers are clamped rather than trusted,
  because the file is user-editable, and towers are rebuilt THROUGH `placeTower`
  so a save that would now sit on a lane drops that piñata rather than producing
  a board the game could not have made.
  One bug on the way: the first version spread `g` into a throwaway object to
  fake free placement, which shares the same `towers` ARRAY — so `placeTower`
  pushed and then so did I, and every piñata was restored twice.
  Verified end to end in the browser: play three rounds, reload the page, and the
  menu offers "Resume — Cementerio · Plaza · wave 1", which restores the board,
  all four piñatas at 2-0-0 and 2800 candy. Four unit tests cover the refusals.
  NEXT: the save is only written when you send a round; it should also be written
  when you build or upgrade, so quitting mid-build does not lose the shopping.

- **R102 - The save follows the shopping, not just the rounds.** Writing it only
  on "send round" meant a long build phase — the part of a TD where all the
  decisions happen — was lost if you quit. It now writes on placing, upgrading
  and selling too. Verified through the real click paths rather than by calling
  the sim: click the shop card, click the board, and the save has the piñata;
  click an upgrade row, and the save has the tier and the debited candy.
  Also: starting a new run clears the old save, or quitting mid-campaign and
  starting something else left the menu offering a run you had walked away from.
  NEXT: nothing outstanding from the user. Candidates in rough order of value —
  (a) the shop cards do not dim when you cannot afford them mid-wave, (b) the
  boss bar could show which phase is next, (c) an options pass on sound volume.

- **R103 - "The map is too small" was two separate wastes, and both are gone.**
  Measured on a 1235x1271 window first rather than guessing: stage 1235x852,
  board 892x557 — the board filled 72% of the stage's width and only **65% of
  its height**, because the board is bound by WIDTH (the shop and rail take their
  width off the side) and every pixel of height past that binding point becomes
  street. 295px, a third of the stage, was empty paving.
  (1) The stage is now exactly as tall as the game wants: `fit()` asks the
  renderer what scale this width supports and takes only the height that scale
  needs. The leftover leaves the stage entirely and becomes page surround, which
  reads as a frame rather than as a map that did not finish drawing. Board went
  from 65% to **92%** of the stage height.
  (2) The control rail moved INSIDE the shop panel. On the board's edge it
  reserved 58px of playfield width; inside the panel it costs nothing, because
  the panel's width was already reserved. On the user's 2514x1316 window the
  board went 1693x1058 -> **1986x1242, +37% area**.
  Two mistakes on the way. The markup insert landed in the MIDDLE of the rail
  header and split the brand mark from its title — caught by looking, not by a
  test, because nothing about it is invalid HTML. And six buttons at full size
  need 266px in a 234px panel, so a flex row broke 5 + 1 and read as a bug; it
  is a deliberate 3x2 grid now.
  NEXT: the shop has vertical room spare now — bigger cards would show off the
  piñata art at the size the player actually browses it.

- **R104 - The stage fix crushed the shop, so the shop learned to pack.** Tying
  the stage height to what the BOARD needs (R103) took away height the shop had
  been quietly living on: at 900x1400 the stage came out 472px and the card list
  showed 1.8 of its 5 rows — seven of the ten piñatas below the fold. Giving the
  board's width back to fix a height problem would have undone R103, so instead
  the shop goes COMPACT when the room runs out: narrower columns, smaller icons,
  no strapline. 3 cards visible -> 6, overflow 595px -> 123px, and it stays off
  entirely on a wide window (icons still 97x80 there).
  Decided from room and roster size, never from "is it overflowing right now" —
  overflow vanishes the moment compact turns on, so testing that directly makes
  the class flap every frame. Checked for stability over ten syncs.
  Two swings to get it right, both the same kind of miss. First pass went to ONE
  column because a grid item's min-content width beats the track minimum and
  "Firecracker" at 10px is ~68px wide — `min-width: 0` on the card is the
  load-bearing half. Second pass still gave one column: two 58px columns plus an
  8px gap need 124px in a 123px box. Missed by a single pixel, which is the exact
  trap the note above the roomy grid already records. Sized with headroom now.
  Checked before changing anything else: the shop cards DO already dim when you
  cannot afford them (0.45, still clickable), so the note I left last round was
  wrong.
  NEXT: three doc comments in render.js still describe a bottom-bar shop whose
  code was deleted — stale documentation of a design that no longer exists.

- **R105 - A shape sweep, and the removal of docs for code that no longer
  exists.** Three careful comments in render.js described a bottom-bar shop —
  which side the rail takes, how tall the bar should be, the hysteresis near the
  crossover — for machinery deleted when the shop became a reserved right-hand
  panel. A precise description of something that is not there is worse than no
  comment, because the next person goes looking for it. Replaced with a short
  note on why the idea was sound and what the numbers were, so it can be picked
  up again deliberately.
  Then `test/shapes.mjs`: twenty window shapes, the whole layout chain checked
  without a browser. The three parts feed each other — stage height from the
  board's scale, scale from the shop's reserve, reserve from the stage's width —
  and a change to any one has now twice broken a shape nobody was looking at.
  All 20 clean; board fills 91-94% of the stage height everywhere; the artifact's
  own shape (1235x1271) went from 892x557 to 959x599.
  NEXT: the game is in good shape and every user request is done. Highest-value
  remaining is content — 16 waves and 4 maps is a short campaign for a roster
  this size.

- **R106 - Ten maxed piñatas looked washed out, and the tint was why.** With the
  map now big enough to see them all at once, the theme tint's flaw showed:
  mixing EVERY pixel toward one flat colour pulls the light and dark ends of a
  body together, so a fully upgraded piñata lost its shading and read muted
  rather than festive — the opposite of what a piñata should look like.
  Each pixel now mixes toward the ramp entry that matches its OWN luminance, so
  the hue shifts and the shading stays. Measured rather than eyeballed: the candy
  piñata's lightness spread (p90 - p10) goes 0.761 at 0-0-0 to 0.815 at 4-0-0,
  where a flat tint compresses it. Tint strength could go UP as a result (0.62 ->
  0.68) and still read brighter than before.
  NEXT: nothing outstanding. The campaign is the thinnest part now — 16 waves and
  4 maps for a roster of ten piñatas with thirty paths.

- **R107 - "Just smiley faces on piñatas" was a fair hit, and the cause was
  structural.** Every actor was authored as a ~24x24 grid of art pixels, blitted
  into a 320x200 buffer and upscaled with nearest-neighbour. Inside 24 pixels the
  only things that FIT are two eyes and a band, so three rounds of "give them
  personality" could only ever produce faces and glyphs stuck on coloured shapes.
  The grid was the ceiling.
  `src/figures.js` draws the actors at SCREEN resolution with real curves — at a
  board scale of 3 that is nine times the pixels to describe a piñata with. The
  terrain stays in the low-res buffer, where chunkiness reads as texture.
  The missing half was ARMS and WEAPONS. A Bloons monkey is legible because you
  can see the dart in its hand; a Peashooter because it has a barrel for a mouth.
  Every piñata now has two arms, and the front one holds the thing it actually
  does — a paper horn, a jet of flame, a maraca mid-shake, a ribbon wand, a
  trumpet, a sparkler, a fistful of coins — pointed along its aim, winding back
  and kicking on `recoil`. Enemies moved to the same layer, because the two are
  depth-sorted together and splitting them would put every luchador behind every
  piñata.
  Verified what could be verified without eyes: silhouette overlap between every
  pair (which caught maraca/coin at 0.81 IoU — the same shape in two colours, now
  a bulb-on-a-stick against a pinched-neck pot), ink fraction (0.47-0.58 meant the
  OUTLINE was the figure; 0.13r -> 0.07r fixed it), no exceptions over 80 drawn
  frames, and feet landing on their tiles within +/-9px.
  Two dead ends worth recording: IoU is a poor proxy for "recognisable" because
  any two tall shapes overlap in the middle, and matching the ink colour to
  measure a figure's height picks up the plaza's kerb instead.
  `tools/artsheet.mjs` renders the cast to a standalone page from the REAL
  module, because both browser surfaces were down and art cannot be judged by
  statistics.
  NEXT: the user has the art sheet. Work from their notes, not from more guesses.
  Then the HUD and the upgrade panel, which they called ugly and plain.

## Where it stands

166 tests green. Pixel-art render layer on the untouched sim, so the balance grid
still holds. `ART_LOOP.md` is the art loop prompt; `PROMPT.md` is the cold start.

New tool: `window.__sheet()` — every sprite at 1x, gameplay scale, and greyscale.
**Judge sprites there, not in a gameplay screenshot.** Three rounds of vague
"enemy distinctiveness" notes became one precise finding the moment colour was
removed.

## Next step

**No human has played this.** Everything below is mine to guess at; these are
not:

- Whether health bars vanishing above 70% reads right in play.
- Whether the bottom bar feels right under a hand rather than under a script.
- Whether the papel picado's answer to a cape and the mariachi trio's reward for
  clustering are *fun*. Both are design claims backed by unit tests and bot runs,
  which is not the same thing.

Open, in order of how much each would show:

1. **Fiesta on Plaza del Sol is a clean 100% for the wide bot** since placement
   stopped ignoring what each piñata is for. Defensible on the difficulty whose
   job is to teach, and the first cell to look at if the early game ever needs
   sharpening.
2. **Contact shadows are palette-matched now but everything else still is not.**
   The next art pass with real value in it is the lane rim and the worn margin,
   which are the only places two flat tones meet without a dither.
4. **A very tall window is still ~40% street.** Leave it decorative, or author a
   map at a second aspect ratio — a balance change, not a layout one.
5. **Freeplay past wave 15 has never been measured.** The grid stops at the
   authored campaign; nobody knows what wave 30 looks like.
6. **El Mercado's narrow-build gap is +30**, and the lever is `speedMul`, not the
   coverage ratio (R51). Only worth pulling if the board should stop favouring
   concentration — which is arguably its whole identity.

Traps added:
- **A vague art complaint stays vague until you remove colour.** "Enemies look
  samey" survived three rounds of notes; the greyscale sheet named it in seconds.
- **Judging sprites in a gameplay screenshot** hides silhouette problems behind
  clutter and palette. Build the contact sheet first.
- **A layout that fits *your* window is not a layout that fits.** The rail needed
  ~750px of content in a column that gets whatever height the window has. Measure
  `scrollHeight` against `clientHeight` at 1920×1080 / 1600×900 / 1536×864 /
  1366×768 / 1280×720 before claiming "one screen".
- **`getComputedStyle` and `getBoundingClientRect` lie in the preview pane**, which
  reports `innerWidth`/`innerHeight` of 0 because it never composites. Every
  `max-width` media query matches, so the menu collapsed to one column and its
  measured height was 992px instead of 621px. To test layout there, force a
  synthetic viewport by setting explicit px sizes on `.app`/`.menu` **and**
  overriding the media-query rules, or the numbers are fiction.
- **Never trust your own console probe over the test suite.** 89 green tests said
  damage worked; my probe said every hit dealt NaN. The probe was wrong (wrong
  return shape from `bestSpots`). Reconcile the disagreement before reporting.
- **Measurement is not looking.** Nineteen rounds were judged by `getBoundingClientRect`
  because the preview pane would not screenshot. The DOM said the layout fit;
  the first real screenshot showed 707px of empty purple and 177x243 cards. When
  the tool cannot show you the page, get one that can.
- **`PX` is the actor-scale knob, not just the pixel size.** Sprites are authored
  in art pixels and the map is measured in sim pixels, so `PX` sets how big every
  actor is *relative to the board*. Crowding, tower/enemy overlap and lane
  proportion are all one constant — and changing it touches no balance number.
- **Per-pixel `fillRect` does not scale.** Plotting a 320x200 buffer pixel by
  pixel is fine; stamping a lane disc by disc along the route is 1.6M calls and
  blocks the main thread for seconds. Write `ImageData` for anything per-pixel.
- **Pixel-perfect scaling is not worth half the board.** Integer zoom keeps art
  pixels square but steps coarsely: at 2.89 the floor to 2 costs 31% of width and
  50% of area. Fractional zoom with smoothing off costs a one-pixel width wobble.
  I argued for integer twice before seeing both on screen.
- **Aspect mismatch is not a layout problem, it is an art problem.** A fixed-ratio
  playfield in an arbitrary window always leaves surplus. Chrome around the board
  and a letterbox both look like a mistake; terrain that runs off every edge
  looks like a game. Draw the outside, do not frame the inside.
- Enemies designed as OBJECTS, not cats: the Health Food Raid (10 raiders, blender boss) in src/raiders.js + tools/raidsheet.mjs; bear contours bolded and paws added.
- Cast rebuilt on the raid's principle: ten different CANDIES (worm/ring/cane/bottle/mallow/belt/twist), not ten recoloured bears; gear enlarged; two globalCompositeOperation bugs and a 40M-px gradient flood fixed.

- R17 | foundations | target=C:\Users\srobs\pinata-uprising. The game still rendered the piñata art that was rejected three times, while the new screen-res rosters sat in two concept pages nobody plays. Added `src/skins.js` — the one place the sim's vocabulary meets the art's — mapping 10 towers and 9 enemies onto gummies/raiders BY MECHANIC (gum→frost because both slow; maraca→saurus because both stun; toro→gum because both ignore slow). render.js swapped two calls and its import. | Played Fiesta on Plaza del Sol: placed a candy piñata, it drew as the Cherry Bear with its blaster at screen resolution; started wave 1 and the Celery Stick marched in. No console errors. | next: the tower rail is still 24px pixel art with the old names — board says Cherry Bear, rail says Candy
- R18 | texture and art | The rail was still ten 24px pixel piñatas while the board showed gummies — you picked one thing and placed another. Shop cards and the selected-tower portrait now draw the real gummy through `skinTower`, on an oversized canvas scaled by CSS instead of an integer-floored blit. Card labels come from a new `shopLabel()`: the KIND, not the flavour (Bear, Belt, Mallow, Saurus, Twist, Grenadier, Wizard, Maestro, Worm, Ring — all ten unique), with the full name and mechanic on the hover. | Screenshot of the rail before/after: ten pixel ornaments became ten characters holding their actual weapons. First framing at h=124 clipped the blaster and the freezer hose against the card edge — measured the gear reach at ~2.2r, moved the figure left of centre and dropped to h=106, re-shot, all ten now inside the frame. No console errors. | next: the title screen is still Piñata Uprising / El Coloso and the mask wall is still pixel luchadores — the first five seconds advertise a game that no longer exists
- R19 | first impression | Rethemed the menu to the gummy cast (Shelf Life), then REVERTED it — you asked for the piñata game back, with the upgrade-driven sprite changes. The two games are now genuinely separate: `pinata-uprising` is the piñata game and knows nothing about gummies (skins.js, gummies.js, raiders.js, their tests and concept pages all removed, render.js and main.js restored to `figures.js`/`towerSprite`); the gummy version lives on at `C:\Users\srobs\shelf-life` on port 8150. | Piñata game: 166 tests green, no gummy references left anywhere in src/ or index.html. Played Sandbox on Plaza del Sol — placed a Candy piñata, bought Harder candy to 4-0-0, and the sprite visibly changed (gold star points, eyepatch, fiercer face) alongside damage 5→103, DPS 24→490. Also verified headlessly that every tier renders a DIFFERENT sprite, gaining pixels and colours as it climbs: candy/chili/gum/sparkler all 8/8 distinct. | next: the maraca is the one exception — 4-0-0 and 0-4-0 rasterise identically, so two different builds look the same on the board
- R20 | texture and art | Fixed the upgrade system's core promise where it was quietly broken. A sweep of all 490 legal builds found **48 that rasterised to pixels identical to another build of the same piñata** — every one in three piñatas. The maraca and the coin each handed two of their OWN paths the same theme (`sound`/`sound`, `gold`/`gold`), and `spread` shared both its ramp and its glyph with `blast`, which is the pair the firecracker owns; their different tints never reach the mark, so they drew the same pixels. Added three glyphs (G_DRUM squat and wide, G_FAN three diverging strokes, G_STACK a stepped rise), two themes (`drum`, `vault`), and gave `spread` its own glyph and ramp. | Re-ran the sweep: 48 → 0 collisions. Rendered the three formerly-identical pairs side by side at 7x in the live game — maraca purple rings vs red drums, coin gold coins vs green stacks, firecracker orange bursts vs green fans. 168 tests green, including two new ones: no piñata may give two paths the same theme, and no two themes may draw the same mark (that second one is what would have caught blast/spread, since they differed only in a tint the mark never uses). | next: audit round — play it cold and write down ten things that feel wrong
- R21 | audit | Played Plaza/Plaza cold: placed one candy piñata, started wave 1, watched it. Ten things that feel wrong, as the backlog for the rounds after. (1) **The ▶ start button and the 2× speed toggle sit side by side, same size, same weight — I hit speed instead of start on my first click and the wave silently did not begin.** Nothing told me. (2) Unaffordable shop cards are dimmed so hard the art and the name are barely legible; you cannot window-shop the piñata you are saving for. (3) The Coin card keeps a white highlight ring with no explanation — a hover/focus state that never clears. (4) "NEXT ROUND · Niño ×10" is pinned bottom-left while the button that starts that round is top-right: the two most closely related things on screen are in opposite corners. (5) The "Wave 1" banner parks over the board's centre-top for several seconds, covering the fountain and part of the lane. (6) Three textures compete on the ground — checkerboard tiles, the lane's dashed centre line, and the dotted buildable markers. Nothing is quiet, so nothing reads. (7) Lives is a number plus a thin green sliver; at full health the sliver looks like decoration and gives no sense of what "a lot" is. (8) Enemies walk in across the dark surround OUTSIDE the board frame, which reads as a rendering slip before you work out it is deliberate. (9) Wave 1 dribbles one enemy at a time with long gaps — the opening minute is mostly waiting, which is the worst place in the game to put dead time. (10) The selected piñata's range ring draws as scattered dark squares rather than a continuous ring; it reads as debris on the tiles, not as "this is my reach". | Observed live over two runs, screenshots at menu, placement, and mid-wave. | next: (1) — a first-time player can fail to start the game at all
- R22 | feedback | Acted on audit item 1. The dock was a 3x2 grid of six identical 56x38 pills, one of which happened to be lime — every button in it looked equally like "begin", which is how a cold first press landed on the speed toggle and the wave silently did not start. The primary action now takes the whole top row, carries a word, and says which state it is in: **Send** while a round is waiting, **Fighting** while one is out. It also breathes while waiting — the only moving thing on the panel, so it is the only thing the eye goes to — with the animation swapped for a static outline under `prefers-reduced-motion`. Separately, audit item 2: `.card.broke` was 0.45 opacity, which took the art and the name down along with the price; now 0.82 with desaturation, and the dimming moved onto the **price pill**, which is the part that is actually unavailable. | Measured in the live page: Send is 230x46 against five 41x34 secondaries — 4.6x the area, where before it was 1.0x. Clicking it flipped text Send→Fighting, ready→false, disabled→true. Unaffordable card computes opacity 0.82 / saturate(0.45) with the cost pill at 0.6. Screenshot of the rail confirms one obvious green button over a row of small settings. 168 tests green. | **Correction to the audit:** item 3 (the Coin card's "unexplained white ring") was a misread — Coin was simply the cheapest affordable card sitting next to dimmed ones, so its normal border read as brighter. No bug. That is what the audit is for. | next: audit item 10 — the range ring draws as scattered dark squares and reads as debris on the tiles rather than as reach
- R23 | hierarchy | Audit item 10. The range ring was plotted into the 320x200 art buffer, so each dash was a 3x3 art pixel that upscaled to a ~9px block — a circle made of blocks, which read as litter scattered over the tiles rather than as reach. Moved hover and selected rings out of the buffer and into the screen pass as a real `rangeRing()`: a barely-there radial fill so the area reads as an area, a dark liner so the edge holds on both the pale plaza and the dark cemetery without per-map tuning, and a slowly rotating dash on top so it reads as an overlay instead of competing with the art. Drawn UNDER the actors, so a piñata is never veiled by its own ring. | Placed and selected a candy piñata in Sandbox and zoomed in: a crisp dashed circle with a soft interior lift, where before it was scattered dark squares. 168 tests green. Note `toR()` scales a range by L.s/PX WITHOUT the origin offset — using `toX` on a length would have put the ring in the wrong place, which is the kind of thing that looks right at the board centre and wrong at the edges. | next: audit item 4 — "NEXT ROUND · Niño ×10" is bottom-left and the button that starts that round is top-right
- R24 | discoverability | Audit item 4. "NEXT ROUND · Niño ×10" was absolutely positioned at the board's bottom-left while the button that sends that round is in the rail — the two most closely related things on screen, in opposite corners. (The comment above it claimed "top-right", so the code and its own documentation had disagreed for a while.) Moved it into the rail directly above Send, restyled from a paper card to a panel-toned block, and it now costs zero playfield width because the rail's width was already reserved. Reading order down the rail is: what you are about to fight → the button that starts it → what you can buy. Compact mode drops the counter tips and shrinks the sprites but keeps the roster. | Two real defects found by measuring instead of eyeballing, both invisible in a screenshot until you know what to look for. (1) **The rail is a GRID with `grid-template-rows: auto auto minmax(0,1fr) auto`, so adding a child shifted every element down one row and handed the flexible row to the DOCK** — it stretched to 468px and put a 230px void between Send and the settings buttons. Row count now matches child count. (2) The dock's own grid then stretched its two rows to fill; `align-content: start` + `flex: 0 0 auto` pins them. Measured after: dock 468px → 97px, shop takes the slack. Screenshot at 1600x900 confirms no voids. 168 tests green. | next: audit item 9 — wave 1 dribbles one enemy at a time with long gaps, so the opening minute is mostly waiting
- R25 | motion | Audit item 5. The wave banner was a slab parked at `top: 15%` of the board — directly over the fountain and the lane, the two things you most need to see the moment a round starts. It now hangs off the top edge as a slim strip (30px title → 23px, square top corners, no top border) so the only thing it covers is bunting. Proper easing in both directions, which the taste rules ask for and a single `transition` on the base rule cannot give you: ease-OUT on `.show` so it arrives fast and settles, ease-IN on the base rule so it accelerates away. Reduced motion gets a plain fade with no travel. | Sent wave 1 and pinned `.show` on to hold the banner for a still: it renders as a strip at the board's top edge, where the same screenshot earlier in this session showed a yellow slab across the middle of the plaza. 168 tests green. | **Correction to audit item 9**, which I had wrong: wave 1 does NOT dribble with long gaps. Measured on all four maps — 6 enemies, 0.85s apart, all spawned within 5.5s. The dead time is the LANE, not the drip: with nothing shooting, a 6-enemy wave takes 38s on Plaza del Sol and 55s on Cementerio to walk out. The real fix is BTD6's: let the player send the next round while the current one is still walking, which turns waiting into agency. Not done here — it moves the wave-end payout off the "board is clear" transition and would need the balance grid re-swept, which is a round of its own, not something to smuggle into a motion round. | next: audit item 6 — three textures compete on the ground (checkerboard tiles, the lane's dashed centre line, the dotted buildable markers)
- R26 | texture and art | Audit item 6. The plaza carried four values at once: a hard checker between `ground` #f0b055 and `groundAlt` #d8933a, plus 11% of tiles randomly lifted or dropped by 7%. The result read as speckle, and on a tower defense board the paving has to be the quietest thing on screen — the lane and the piñatas are what you actually read. Introduced `checkerAlt = shade(ground, 0.945)` so the checker can be gentle WITHOUT softening the vignette, which still wants `groundAlt`'s full contrast to hold the board's edge; and cut the random tiles from ~1 in 9 at ±7% to ~1 in 16 at ±3.5%. | Before/after screenshots of the same board: the chessboard became a quiet warm paving, and the lane is now unambiguously the brightest thing on the board with the great piñata second. Nothing else moved. 168 tests green. | next: accessibility — the keyboard path and focus states have never been looked at
- R27 | accessibility | The stylesheet had **zero `:focus` rules for sixteen focusable controls** — a keyboard player got whatever the browser could draw on top of a 3-4px custom border, which is nearly nothing. Added a `:focus-visible` ring (3px sun outline plus a dark halo, so the same style reads on the cream shop cards AND on the dark rail) with an inset variant for the board, which cannot sensibly be ringed. `:focus-visible` not `:focus`, so a mouse click never leaves a ring behind. Also fixed two real contrast failures found by compositing every translucent layer properly: the wave-count pill `.foe b` at **1.96:1** — cream on teal, a regression I introduced in R24 when `.next` set a pale colour the pill inherited — and `.hud-row.sub`, the map/difficulty line, at **1.25:1**, dark ink on a dark strip, which predates this session. | Measured in the page: `.foe b` 1.96 → 5.74:1, `.hud-row.sub` 1.25 → 13.29:1. Armed a `focusin` probe and pressed Tab three times for real: `outline=3px solid rgb(242,197,61)`, `:focus-visible` matches, and a zoomed screenshot shows the gold ring on El Caracol. 168 tests green. | **Trap worth keeping:** the first version used `:where(button, [href], …):focus-visible`, which has ZERO specificity — any existing rule touching `outline` beats it and the ring silently never appears. Also, `.focus({focusVisible:true})` does not put Chrome into `:focus-visible`, so a programmatic focus test reports `outline-style: none` and looks like a failure when the rule is fine. Only a real Tab press proves it. | next: performance — frame time has never been measured, and jank is a graphics bug
- R28 | performance | Measured frame cost for the first time, on a deliberately heavy board: 24 piñatas, most upgraded on two paths, wave 26. **Draw is 0.89ms and the sim step is under 0.01ms — 5% of a 60fps budget.** There is no performance problem to fix, so this round spends nothing. Worth recording so a later round does not go looking. | Timed `__draw()` and `sim.update()` directly over 40-200 iterations rather than off rAF, because a BACKGROUNDED tab throttles rAF to ~1fps — which is also, I now think, behind a good share of this session's "script injection timed out" failures. `document.hidden` was true the whole time. | next: the idle animation — every piñata animates identically and the idle aim sweeps the full ±pi, which mirrors the sprite as it crosses and reads as a stutter
- R29 | motion | Your report: "the animations look the same, they stutter in places and rotate left to right". Three separate defects, all real. (1) **The rotation.** The idle aim was `sin(time * 0.6 + id) * PI` — a sweep of the FULL ±pi, which walked the weapon all the way around the body and, because the sprite mirrors on the sign of `cos(aim)`, flipped the whole piñata every time it crossed. Replaced with `idleAim()`: a stable resting facing per piñata plus two sines at unrelated rates, held inside a half-cone so the sign can never change. (2) **The stutter.** `idleOffset` returned WHOLE PIXELS — correct when piñatas were 24px sprites blitted into a 320x200 buffer, where a fractional offset is a lie, but they are drawn at screen resolution now, so that rounding lands as a visible step. Every mood is continuous now, and the two-state pops (`sin > 0.35` for the hop, on/off for the twitch jolt and the waltz lift) became real curves with attack and decay. (3) **The sameness.** Ten moods existed but several were the same `round(sin * 1.4)` with a different rate; each now has its own shape. | Counted sprite flips directly over 2 minutes across 24 piñatas: **1100 → 0**, with both facings still present so they do not all stare the same way. 170 tests green. Rewrote `faces.test.js`'s "whole pixels only" test, which was asserting exactly the bug — it now asserts motion is CONTINUOUS (no tick may move a resting piñata more than 1.5px, under 2% of ticks may even come close), that `smooth:false` still yields integers for the buffer path, and that no two piñatas share an idle signature. | **Trap:** the first pass added a `smooth` flag and rounded in each of ten branches; two forgot, so `smooth:false` silently returned fractions. Rounding once at the exit cannot forget.
- **The Fight Card.** Wrote the cast's story as a sixteen-round fight card — the numbering is the game's real wave count, so the structure encodes something true rather than decorating the page. Every character is written as their MECHANIC: the Matador's cape answers a shot and has nothing to say to a splash; the Gum piñata's best work does not slow the Toro; the Mariachi trio hits nothing all night and wins round thirteen; the Coin piñata argues for buying the boring thing early. Published at https://claude.ai/code/artifact/83b7670e-d2da-466e-9489-05e636f602fd
- R30 | foundations | **Rounds can now be sent early**, on top of one still walking — the fix the R25 measurement asked for. Each round carries its identity: every queued spawn and every enemy is tagged with its wave, `g.live` holds the rounds on the road, and a round pays out when nothing of ITS is left, not when the board happens to be empty. The bonus is priced off the round that ENDED, not off `g.wave`, so sending early cannot farm a later round's rate. Button reads Send → Send early → "2 rounds out", and only breathes between rounds — a pulsing button mid-fight reads as "you are behind". | Measured the same 8-piñata build across all four maps, sequential vs sending the moment it is allowed: **190s→130s, 156s→86s, 301s→187s, 162s→92s — 32% to 45% shorter, with zero extra leaks.** Verified live: the button cycles correctly and `liveWaves()` returns [1,2]. 172 tests green. | **A real bug the tests caught:** boss phase-splits and the campeón's tag-in partners are spawned OUTSIDE the queue, so they had no wave tag — their round reported itself finished and closed while they were still walking. Tagging moved into `spawn()` itself, and the phase transition was ungated from `live.length` so one bad tag can never strand the game in "wave" with an empty board. | **Not demonstrated, stated honestly:** I could not show that early-sending costs anything. A strong build loses no lives; a stretched build dies either way, so the harness cannot separate them. The reward (bonuses arrive sooner) is real; the risk (congestion on one lane) is currently theoretical. Worth revisiting.
- R31 | foundations | **Upgrade ladder folded from four tiers to three.** The justification was a measured histogram: 13/4/2/2/**0** — tier 4 was never bought in a 15-wave campaign, so every one of the eight special abilities was freeplay-only content, and that is why tuning tier-4 prices never moved a number in the grid. The fix was NOT deletion: `tools/fold-tiers.mjs` merges each path's last two rungs, and the capstone keeps tier 4's NAME, its ability and its art while carrying both rungs' stats. Topping a path went from 133,740 candy to 90,720 — **32% cheaper** — and all 30 paths still end in an ability. | Two measurements. (1) **The capstone is now reached**: a saving profile tops a path on 2 of 4 maps, where the histogram said 0 everywhere. (2) The full balance sweep across four maps is *healthier than before*: the `deep` profile — which exists precisely to answer "does investment depth ever pay?" and which the code comments said "never moves, which is the proof it never reaches a top tier" — now wins El Mercado (37%) and El Caracol (34%), loses Cementerio outright, and trails badly on Plaza del Sol (5%). Depth vs breadth is a real, board-dependent choice instead of dead content. 172 tests green. | **`DEEP_POWER` dropped 3 → 1.** It tripled the top tier's additive stats to make an unreachable rung feel worth saving for. Applied to a capstone that already sums two rungs it produced a **9x to 15x cliff** over the tier below (measured on candy/chili/sparkler). At 1 the fold's own sum is the spike, a 4.7x median jump, which is plenty. | **Seven tests failed and every one was a stale invariant, not a regression** — `tiers[3]` hardcoded, `[4,0,0]` literals, "three upgrades then one more", a clamp test written for the 3x that no longer happens, and "the path already past the cap may continue", which with three rungs and a cap of 2 is now the same state as maxed. All rewritten to read the capstone by position so the next change to the ladder does not break them.
- R32 | content | **The mask wall became a bestiary.** The counter matrix has been a stated pillar since R9 and the only way to learn it was to lose — the wall recorded WHAT you had beaten and said nothing about why it was hard. Each cell is now a button; clicking an unmasked luchador shows the rule that makes it difficult and the thing that answers it, and the header counts how much of the matrix you have actually met. Locked cells stay locked on purpose: reading the whole matrix off a menu before wave 1 removes the reason waves 1-8 exist. | **The design decision that matters is that the rules are DERIVED from `ENEMIES`, not written beside it.** A hand-written card drifts the first time somebody retunes a resistance, and a card that teaches something false is worse than no card. `src/bestiary.js` reads the definitions and reports what is in them — "Capes away 60% of aimed shots", "Foil mask — shrugs off 85% of burn", "Shakes off a rattle 5.0x faster" are all computed. 8 new tests (180 green) check the rules AGAINST the sim's own numbers, including one that re-derives every quoted percentage, so a retune that outdates a card fails the suite. | Verified live: 9/9 cells render, the header reads "Masks taken · 9/9 known", and El Coloso's card returns "5200 health · speed 22 · Breaks 2 times before it stops → Sustained damage, not one big hit / Foil mask — shrugs off 45% of burn → Anything that is not chili".
- R33 | foundations | **Heroes.** One piñata per run that grows on its own — the one thing you place once and then watch get better, which turns "what can I afford this round" into "what am I building around". Three, and they pull in three different directions on purpose: **La Reina** an aura that widens all run (you cluster), **El Chamaco** a carry that ends as the hardest hitter on the board (you defend one corner), **Doña Suerte** an economy that compounds (you bet on reaching round sixteen). Modelled as an ordinary tower with `hero: true` whose `def` comes from a LEVEL rather than from upgrade tiers, so the firing loop, the aura pass, targeting, selling and the renderer all handle it without knowing heroes exist. Growth tables are sparse — level 7 inherits level 6's rate — so a hero reads as a list of moments rather than ten near-identical rows. | Measured the curve against a real campaign rather than against arithmetic: sixteen rounds pay **1057 XP → level 8 at the boss**, and only freeplay reaches 10, which is what `heroes.js` claims. Verified end to end in the browser: picker → hero on the run → shop card "Chamaco 650" → placed at level 1 / 6 damage → 900 XP → level 8, 62 damage, `execute` unlocked. 10 new tests (190 green). | **A real design bug the measurement caught:** XP accrued from the moment a hero was CHOSEN, not placed — so placing on round 1 and on round 9 landed at exactly the same level and the placement decision was worth nothing. Gated on `heroPlaced`, and now round 1 → level 8, round 6 → 7, round 12 → 5. | **A test that earns its keep:** sparse inheritance means a level-up that forgot to restate an inherited value would make a hero WORSE. One test walks every hero from 1 to 10 asserting no stat ever goes backwards and the cooldown never rises.
