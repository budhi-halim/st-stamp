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
const locations = [
  ['jakarta', 'JAKARTA'],
  ['hyphen', 'JAKARTA - INDONESIA'],
  ['enDash', 'JAKARTA \u2013 INDONESIA'],
  ['emDash', 'JAKARTA \u2014 INDONESIA'],
];
const pathOutputs = new Set();
const scalesByVariant = new Map();

function pdfTitle(pdfText) {
  const hex = pdfText.match(/\/Title\s*<([0-9a-f]+)>/i);
  if (hex) {
    const bytes = Uint8Array.from(Buffer.from(hex[1], 'hex'));
    assert(bytes[0] === 0xfe && bytes[1] === 0xff, 'Unicode PDF title must identify UTF-16BE');
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  const literal = pdfText.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/s);
  assert(literal, 'PDF title is required');
  assert(!/[^\x00-\x7f]/.test(literal[1]), 'Non-ASCII PDF titles must use a Unicode text string');
  return literal[1].replace(/\\([()\\])/g, '$1');
}

assert.deepEqual(geometry.locations.jakarta, geometry.location, 'Original caption geometry must remain available');
for (const [locationKey, caption] of locations) {
  assert.equal(geometry.locations[locationKey].text, caption, 'Wrong caption or dash code point');
  for (const variant of variants) {
    const name = `${locationKey}-${variant}`;
    const layout = engine.createLayout(geometry, { variant, locationKey });
    assert.equal(layout.locationText, caption);
    assert(Number.isFinite(layout.widthMm) && layout.widthMm > 0);
    assert(Number.isFinite(layout.heightMm) && layout.heightMm > 0);
    for (const path of layout.paths) {
      for (const [x, y] of trace(path.commands)) {
        assert(Number.isFinite(x) && Number.isFinite(y));
        assert(x >= -0.001 && x <= layout.widthPx + 0.001, `${name}: x clipping`);
        assert(y >= -0.001 && y <= layout.heightPx + 0.001, `${name}: y clipping`);
      }
    }
    for (const id of ['wordmark', 'location']) {
      const { bounds } = layout.paths.find((p) => p.id === id);
      assert(Math.abs(bounds.x + bounds.width / 2 - layout.widthPx / 2) < 1e-6, `${name}: text must be centered`);
    }
    const word = layout.paths.find((p) => p.id === 'wordmark').bounds;
    const location = layout.paths.find((p) => p.id === 'location').bounds;
    assert(location.y > word.y + word.height, `${name}: caption overlaps wordmark`);
    if (locationKey !== 'jakarta') {
      const scale = location.height / geometry.locations[locationKey].height;
      const previous = scalesByVariant.get(variant);
      if (previous !== undefined) assert(Math.abs(scale - previous) < 1e-9, `${name}: dash comparisons must retain the same type size`);
      scalesByVariant.set(variant, scale);
    }
    const svg = engine.createSvg(layout);
    assert(!/<(?:text|image)\b|@font-face|font-family|href=/i.test(svg), 'SVG must be independent path artwork');
    assert(!svg.includes('<rect'), 'Transparent SVG must not have a white background');
    assert(engine.createSvg(layout, { background: 'white' }).includes('<rect'));
    assert(svg.match(/<title\b[^>]*>(.*?)<\/title>/s)?.[1].includes(caption), `${name}: incorrect SVG title`);
    const pdf = engine.createPdf(layout);
    const pdfText = new TextDecoder().decode(pdf);
    assert(pdfText.startsWith('%PDF-1.4'));
    assert(!/\/Subtype\s*\/Image|\/Font\b/.test(pdfText), 'PDF must contain outlines, not fonts or images');
    assert(pdfTitle(pdfText).endsWith(caption), `${name}: incorrect PDF title`);
    const mediaBox = pdfText.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
    assert(mediaBox, `${name}: missing physical page dimensions`);
    assert(Math.abs(Number(mediaBox[1]) * 25.4 / 72 - layout.widthMm) < 1e-5);
    assert(Math.abs(Number(mediaBox[2]) * 25.4 / 72 - layout.heightMm) < 1e-5);
    pathOutputs.add(JSON.stringify(layout.paths.map((path) => path.commands)));
    await writeFile(join(directory, `${name}.svg`), svg);
    await writeFile(join(directory, `${name}.pdf`), pdf);
    console.log(`${name}: ${layout.widthMm} × ${layout.heightMm.toFixed(2)} mm; outlined SVG/PDF verified`);
  }
}
assert.equal(pathOutputs.size, 20, 'All twenty designs must have distinct artwork, not only distinct labels');
const rasterLayout = engine.createLayout(geometry, { variant: 'double-oval', locationKey: 'emDash' });
for (const dpi of [300, 600, 1200]) {
  const dimensions = engine.rasterDimensions(rasterLayout, dpi);
  assert.equal(dimensions.width, Math.round(rasterLayout.widthMm / 25.4 * dpi));
  assert.equal(dimensions.height, Math.round(rasterLayout.heightMm / 25.4 * dpi));
}
console.log('20 distinct designs verified, including exact hyphen/en-dash/em-dash captions and consistent comparison type sizes.');
console.log(`Export samples: ${directory}`);
