// Run with: node scripts/verify-exports.mjs
// Checks the actual vector export code; browser raster drawing is checked in UI QA.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = await readFile(new URL('../export-engine.js', import.meta.url), 'utf8');
const engine = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const geometry = JSON.parse(await readFile(new URL('../stamp-geometry.json', import.meta.url), 'utf8'));
const directory = join(tmpdir(), 'sweet-times-stamp-export-verification');
await mkdir(directory, { recursive: true });

function trace(commands) {
  const points = [];
  let current = [0, 0], start = [0, 0];
  for (const [op, ...v] of commands) {
    if (op === 'M') { current = v; start = v; points.push(v); }
    else if (op === 'L') { current = v; points.push(v); }
    else if (op === 'Z') { current = start; points.push(start); }
    else if (op === 'C') {
      const [x0, y0] = current;
      for (let i = 1; i <= 32; i++) {
        const t = i / 32, u = 1 - t;
        points.push([
          u ** 3 * x0 + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t ** 3 * v[4],
          u ** 3 * y0 + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t ** 3 * v[5],
        ]);
      }
      current = v.slice(-2);
    } else throw new Error(`Unexpected path operation ${op}`);
  }
  return points;
}

const variants = ['borderless', 'rectangle', 'rounded', 'oval', 'double-oval'];
for (const variant of variants) {
  const layout = engine.createLayout(geometry, { variant });
  for (const path of layout.paths) {
    for (const [x, y] of trace(path.commands)) {
      assert(Number.isFinite(x) && Number.isFinite(y));
      assert(x >= -0.001 && x <= layout.widthPx + 0.001, `${variant}: x clipping`);
      assert(y >= -0.001 && y <= layout.heightPx + 0.001, `${variant}: y clipping`);
    }
  }
  for (const id of ['wordmark', 'location']) {
    const { bounds } = layout.paths.find((p) => p.id === id);
    assert(Math.abs(bounds.x + bounds.width / 2 - layout.widthPx / 2) < 1e-6, 'Text must be geometrically centered');
  }
  const svg = engine.createSvg(layout);
  assert(!/<(?:text|image)\b|@font-face|font-family|href=/i.test(svg), 'SVG must be independent path artwork');
  assert(!svg.includes('<rect'), 'Transparent SVG must not have a white background');
  assert(engine.createSvg(layout, { background: 'white' }).includes('<rect'));
  const pdf = engine.createPdf(layout);
  const pdfText = new TextDecoder().decode(pdf);
  assert(pdfText.startsWith('%PDF-1.4'));
  assert(!/\/Subtype\s*\/Image|\/Font\b/.test(pdfText), 'PDF must contain outlines, not fonts or images');
  for (const dpi of [300, 600, 1200]) {
    const dimensions = engine.rasterDimensions(layout, dpi);
    assert.equal(dimensions.width, Math.round(45 / 25.4 * dpi));
    assert.equal(dimensions.height, Math.round(layout.heightMm / 25.4 * dpi));
  }
  await writeFile(join(directory, `${variant}.svg`), svg);
  await writeFile(join(directory, `${variant}.pdf`), pdf);
  console.log(`${variant}: ${layout.widthMm} × ${layout.heightMm.toFixed(2)} mm; outlined SVG/PDF verified`);
}
console.log(`Export samples: ${directory}`);
