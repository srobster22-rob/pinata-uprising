// Side-effect-only module: copies PU_* tuning knobs from the environment onto
// globalThis, where data.js reads them.
//
// It has to be imported *first* in any harness, because ES modules evaluate
// depth-first in import order and data.js snapshots the knobs at load. Getting
// this wrong is silent: every sweep case returns identical numbers and looks
// like the knob has no effect. That has now happened twice, in the sensitivity
// harness and in the playtest.
export const KNOBS = [
  "PU_HP_MUL",
  "PU_INCOME_MUL",
  "PU_BOUNTY_MUL",
  "PU_HP_RAMP",
  "PU_BONUS_BASE",
  "PU_BONUS_PER_WAVE",
  "PU_TOP_TIER_MUL",
  "PU_RANGE_MUL",
  "PU_EDGE_MUL",
  "PU_DEEP_POWER",
];

for (const k of KNOBS)
  if (process.env[k] !== undefined) globalThis[k] = Number(process.env[k]);

/** What was actually overridden, for a harness to print back. */
export const overrides = Object.fromEntries(
  KNOBS.filter((k) => process.env[k] !== undefined).map((k) => [k, Number(process.env[k])]),
);
