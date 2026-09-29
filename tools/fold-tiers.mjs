/**
 * Fold each path's fourth tier into its third.
 *
 * A measured tier histogram from the balance harness came out **13/4/2/2/0**:
 * across a whole 15-wave campaign, tier 4 is never bought. A quarter of the
 * upgrade content — including every one of the eight special abilities, which
 * all live on tier 4 — was freeplay-only, which is also why tuning tier-4 prices
 * never moved a single number in the grid.
 *
 * The fix is NOT to delete tier 4. The specials are the most characterful thing
 * in the file. It is to make the top of a path reachable by merging the last two
 * rungs into one: the capstone keeps tier 4's name, its special and its art, and
 * carries the summed stats of both, at a price between them.
 *
 *   node tools/fold-tiers.mjs          # report only
 *   node tools/fold-tiers.mjs --write  # rewrite src/upgrades.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS } from "../src/upgrades.js";
import { TOWER_ORDER } from "../src/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Merge two `mod` blocks: adds sum, multipliers multiply, flags take the last. */
function mergeMod(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key], y = b[key];
    if (x === undefined) { out[key] = y; continue; }
    if (y === undefined) { out[key] = x; continue; }
    if (typeof x === "object" && typeof y === "object") {
      const m = {};
      if ("add" in x || "add" in y) m.add = (x.add ?? 0) + (y.add ?? 0);
      if ("mul" in x || "mul" in y) m.mul = (x.mul ?? 1) * (y.mul ?? 1);
      if ("set" in x || "set" in y) m.set = y.set ?? x.set;
      out[key] = m;
    } else {
      out[key] = y;
    }
  }
  return out;
}

const folded = {};
const rows = [];
for (const id of TOWER_ORDER) {
  folded[id] = PATHS[id].map((path) => {
    const [t1, t2, t3, t4] = path.tiers;
    if (!t4) return path;
    const cap = {
      // The capstone's NAME is tier 4's: "Earthquake" is what a player
      // remembers, not "Thunder rattle".
      name: t4.name,
      // Priced between the two rungs it replaces rather than at their sum —
      // the whole point is that this is now reachable inside a campaign.
      cost: Math.round(t3.cost + t4.cost * 0.55),
      blurb: t4.blurb,
      mod: mergeMod(t3.mod, t4.mod),
      ...(t4.special ? { special: t4.special } : {}),
    };
    rows.push([`${id}/${path.name}`, t3.cost, t4.cost, t3.cost + t4.cost, cap.cost]);
    return { ...path, tiers: [t1, t2, cap] };
  });
}

console.log("path".padEnd(34), "t3".padStart(6), "t4".padStart(6), "was".padStart(7), "now".padStart(7), "saving".padStart(8));
let was = 0, now = 0;
for (const [name, c3, c4, sum, cap] of rows) {
  was += sum; now += c3 === cap ? cap : cap;
  console.log(name.padEnd(34), String(c3).padStart(6), String(c4).padStart(6), String(sum).padStart(7), String(cap).padStart(7),
    `${(100 - (cap / sum) * 100).toFixed(0)}%`.padStart(8));
}
console.log(`\ntotal to top a path: ${was} -> ${now}  (${(100 - (now / was) * 100).toFixed(0)}% cheaper)`);

if (process.argv.includes("--write")) {
  const src = join(ROOT, "src/upgrades.js");
  let s = readFileSync(src, "utf8").replace(/\r\n/g, "\n");
  const body = JSON.stringify(folded, null, 2).replace(/^/gm, "");
  const start = s.indexOf("export const PATHS = ");
  const end = s.indexOf("\n};\n", start) + 4;
  s = s.slice(0, start) +
    "// Three tiers, not four. See tools/fold-tiers.mjs for why: tier 4 was never\n" +
    "// bought in a campaign, so every special ability in the game was freeplay-only\n" +
    "// content. The old third and fourth rungs are merged — the capstone keeps the\n" +
    "// fourth's name, ability and art, and carries both their stats.\n" +
    "export const PATHS = " + body + ";\n" +
    s.slice(end);
  writeFileSync(src, s);
  console.log("\nwrote src/upgrades.js");
}
