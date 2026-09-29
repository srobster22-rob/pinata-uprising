/**
 * Fold the whole game into one self-contained HTML file.
 *
 * The game is ten ES modules, a stylesheet and an index — fine over a dev
 * server, useless as a link you can send someone. A published page has to be a
 * single file with everything inlined, and no external host but Google Fonts.
 *
 * Modules are wrapped one-per-closure rather than concatenated. Concatenating
 * ten files that were written as separate scopes is how you get two `phase`
 * helpers silently overwriting each other; a closure per module also preserves
 * the one thing the game actually relies on, which is that `setPanelReserve`
 * mutates a variable private to `render.js` and every other module still sees
 * the change through the exported getter.
 *
 *   node tools/bundle.mjs        ->  dist/pinata-uprising.html
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

// Dependency order, derived rather than declared.
//
// This used to be a hand-written list with the comment "a topological sort
// would be more code than the list". It then went stale in exactly the way a
// hand-written list does: `art.js` grew an `import { PATHS } from
// "./upgrades.js"` when the upgrade themes landed, and since it sat FIRST in the
// list every bundle after that threw "Cannot destructure property 'PATHS' of
// undefined" before a single frame drew. Nobody noticed, because the game is
// developed against the dev server and the bundle is only built to publish.
//
// Fifteen lines that cannot go stale beat ten lines that can.
const ENTRY = "main.js";
const DEPS = /^import\s+(?:\*\s+as\s+\w+|\{[\s\S]*?\})\s+from\s+"\.\/([\w.-]+)";?[ \t]*$/gm;

function order(entry) {
  const out = [];
  const state = new Map(); // name -> "open" | "done"
  const visit = (name, trail) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "open") {
      throw new Error(`import cycle: ${[...trail, name].join(" -> ")}`);
    }
    state.set(name, "open");
    const src = read(`src/${name}`);
    for (const m of src.matchAll(DEPS)) visit(m[1], [...trail, name]);
    state.set(name, "done");
    out.push(name);
  };
  visit(entry, []);
  return out;
}

const ORDER = order(ENTRY);

// `import { a, b as c } from "./x.js"` and `import * as ns from "./x.js"`, either
// of which may run across several lines — sim.js has one that does.
const IMPORT = /^import\s+(?:\*\s+as\s+(\w+)|(\{[\s\S]*?\}))\s+from\s+"\.\/([\w.-]+)";?[ \t]*$/gm;
const EXPORT = /^export\s+(?=(?:const|let|var|function|class)\b)/gm;
const EXPORTED = /^export\s+(?:const|let|var|function|class)\s+(\w+)/gm;

function wrap(name, src) {
  const names = [...src.matchAll(EXPORTED)].map((m) => m[1]);
  const body = src
    .replace(IMPORT, (_all, ns, named, dep) =>
      ns ? `const ${ns} = __M[${JSON.stringify(dep)}];` : `const ${named.replace(/\bas\b/g, ":")} = __M[${JSON.stringify(dep)}];`,
    )
    .replace(EXPORT, "");
  // A module with no exports is the entry point: run it, return nothing.
  const ret = names.length ? `\n  return { ${names.join(", ")} };\n` : "\n";
  return `__M[${JSON.stringify(name)}] = (function () {\n${body}${ret}})();`;
}

const modules = ORDER.map((n) => wrap(n, read(`src/${n}`))).join("\n\n");

const html = read("index.html");
const body = html
  .slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"))
  .replace(/^\s*<script type="module"[^>]*><\/script>\s*$/m, "")
  .trim();

const fontHref = (html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)"/) ?? [])[1];
if (!fontHref) throw new Error("the font link moved — the page would silently fall back");

const title = (html.match(/<title>([^<]+)<\/title>/) ?? [])[1] ?? "Piñata Uprising";

const out = `<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontHref}">
<style>
${read("style.css")}
</style>

${body}

<script type="module">
// Bundled by tools/bundle.mjs. Each module keeps its own scope; \`__M\` is the
// registry an import used to be.
const __M = {};

${modules}
</script>
`;

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist/pinata-uprising.html"), out);
console.log(`dist/pinata-uprising.html  ${(out.length / 1024).toFixed(0)}KB  (${ORDER.length} modules)`);
console.log("  order: " + ORDER.join(" -> "));
