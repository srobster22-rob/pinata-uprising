# Art loop prompt

Paste this to run an improvement loop on the pixel art. Read `PROMPT.md` first —
it has the seven pixel-art rules and the traps. This file is only the loop.

---

Improve the pixel art of Piñata Uprising, one sprite or effect per round.

**The standing criterion is silhouette-first distinctiveness.** At 17–20 art
pixels there is no room for detail, so:

- Any two enemies must be tellable apart **in greyscale**, by outline alone. If
  they only differ by palette, they are not done.
- Any two piñatas must be tellable apart at 32px, which they mostly already are.
- A state a player has to react to — stunned, slowed, burning, resisting — must
  be visible without hunting for it.

**Each round:**

1. Render the contact sheet (`window.__sheet()`) and look at it. It shows every
   sprite at 1x, at gameplay scale, and **in greyscale** — the greyscale row is
   the one that decides whether a silhouette works, because it removes the
   crutch you keep leaning on.
2. Pick the single worst-reading thing. Not a list — one.
3. Redraw it in `art.js`. Sprites are generated, not hand-typed: use `disc`,
   `block`, `plinth`, `zigOver`, `put`, and let `outline()` derive the edge.
4. Re-render the sheet **and** an in-game shot. Judge at gameplay scale, not at
   1x — something can look charming at 1x and be mud at 4x, and only the game
   shot tells you.
5. `node --test "test/*.test.js"` must stay green. The sprite-coverage test
   checks every name in `SPRITE_NAMES` builds and has a sane anchor.
6. Append one line to `LOOP_LOG.md`: what changed, and what looking at it taught
   you. If a change made things worse, say so and revert — a reverted attempt
   with a recorded reason is worth more than a silent retry.

**Do not**:

- Add gameplay features. This loop is art only. The systems are measured and
  balanced; touching them here means re-running the whole grid.
- Fix three things at once. When two changes land together and the result is
  worse, you have learned nothing.
- Trust a cluttered gameplay screenshot to judge a sprite. That is what the
  contact sheet is for.
- Adjust the palette to solve a silhouette problem. It is the most tempting and
  least effective move available.

Stop when the greyscale row reads cleanly for every enemy, or when you are out of
context — then write the next target into `LOOP_LOG.md`.
