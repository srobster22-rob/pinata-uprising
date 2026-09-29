/**
 * Render the cast to a standalone page, for looking at.
 *
 * Judging art needs eyes, and the two browser surfaces this session has are not
 * always available — one will not composite, the other drops its connection. A
 * self-contained page can be opened by anyone, any time, and it draws with the
 * REAL `figures.js` rather than a copy that can drift from it.
 *
 *   node tools/artsheet.mjs   ->  dist/art-sheet.html
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "src/figures.js"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/^export /gm, "");

const page = `<!doctype html>
<meta charset="utf-8">
<title>Piñata Uprising — art sheet</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 28px;
    background: #2f2140;
    color: #f6efe4;
    font: 15px/1.5 "Baloo 2", system-ui, sans-serif;
  }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  p.sub { margin: 0 0 22px; opacity: 0.72; font-size: 13.5px; }
  h2 { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;
       opacity: 0.55; margin: 26px 0 10px; }
  .sheet { border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.45); }
  canvas { display: block; width: 100%; height: auto; }
</style>
<h1>Piñata Uprising — the cast, redrawn</h1>
<p class="sub">Drawn at screen resolution with real curves, from <code>src/figures.js</code>.
Same code the game runs.</p>

<h2>Piñatas — on the plaza, at the size you see them in play</h2>
<div class="sheet"><canvas id="towers"></canvas></div>

<h2>Piñatas — large, for judging shape and face</h2>
<div class="sheet"><canvas id="big"></canvas></div>

<h2>Luchadores</h2>
<div class="sheet"><canvas id="foes"></canvas></div>

<script>
${src}

const PLAZA = "#c4863a";
const LANE = "#f5ecd8";

function board(g, w, h) {
  g.fillStyle = PLAZA;
  g.fillRect(0, 0, w, h);
  // A hint of the paving check, so figures are judged against real terrain
  // rather than against a flat swatch.
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let y = 0; y < h; y += 26)
    for (let x = ((y / 26) % 2) * 26; x < w; x += 52) g.fillRect(x, y, 26, 26);
  g.fillStyle = LANE;
  g.fillRect(0, h * 0.62, w, h * 0.2);
}

function label(g, text, x, y) {
  g.font = "600 13px 'Baloo 2', system-ui, sans-serif";
  g.textAlign = "center";
  g.lineWidth = 3;
  g.strokeStyle = "rgba(20,12,30,0.75)";
  g.strokeText(text, x, y);
  g.fillStyle = "#fff6e2";
  g.fillText(text, x, y);
}

function sheet(id, names, draw, { cell, rows = 1, h }) {
  const c = document.getElementById(id);
  const cols = Math.ceil(names.length / rows);
  c.width = cols * cell;
  c.height = rows * (h + 34);
  const g = c.getContext("2d");
  board(g, c.width, c.height);
  names.forEach((n, i) => {
    const col = i % cols, row = (i / cols) | 0;
    const x = col * cell + cell / 2;
    const base = row * (h + 34) + h + 4;
    draw(g, n, x, base, h);
    label(g, n, x, base + 22);
  });
}

sheet("towers", FIGURE_NAMES,
  (g, n, x, y, h) => drawFigure(g, n, { x, y, h: h * 0.62, t: 1.2, aim: 0.5 }),
  { cell: 108, rows: 1, h: 120 });

sheet("big", FIGURE_NAMES,
  (g, n, x, y, h) => drawFigure(g, n, { x, y, h: h * 0.82, t: 1.2, aim: 0.4 }),
  { cell: 230, rows: 2, h: 250 });

sheet("foes", FOE_NAMES,
  (g, n, x, y, h) => drawFoe(g, n, { x, y, h: h * 0.66, t: 1.1, facing: 1 }),
  { cell: 130, rows: 1, h: 150 });
</script>
`;

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist/art-sheet.html"), page);
console.log(`dist/art-sheet.html  ${(page.length / 1024).toFixed(0)}KB`);
