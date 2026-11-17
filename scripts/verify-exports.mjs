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
// Independent transcription of the supplier's clearly printed W × H sizes.
const expectedSizes = {
  borderless: { widthMm: 43, heightMm: 17, ratio: '43:17' },
  rectangle: { widthMm: 55, heightMm: 22, ratio: '5:2' },
  rounded: { widthMm: 55, heightMm: 22, ratio: '5:2' },
  oval: { widthMm: 35, heightMm: 24, ratio: '35:24' },
  'double-oval': { widthMm: 35, heightMm: 24, ratio: '35:24' },
};
const locations = [
  ['jakarta', 'JAKARTA'],
  ['hyphen', 'JAKARTA - INDONESIA'],
  ['enDash', 'JAKARTA \u2013 INDONESIA'],
  ['emDash', 'JAKARTA \u2014 INDONESIA'],
];
const pathOutputs = new Set();
const scalesByVariant = new Map();
let dividerDesigns = 0;

function near(actual, expected, message, tolerance = 1e-6) {
  assert(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≠ ${expected}`);
}

function checkLayout(layout, name) {
  const expected = expectedSizes[layout.variant];
  assert.equal(layout.widthMm, expected.widthMm, `${name}: supplier width`);
  assert.equal(layout.heightMm, expected.heightMm, `${name}: supplier height`);
  near(layout.widthPx / layout.heightPx, expected.widthMm / expected.heightMm, `${name}: artboard ratio`);
  const pointsByPath = new Map();
  for (const path of layout.paths) {
    const points = trace(path.commands);
    pointsByPath.set(path.id, points);
    for (const [x, y] of points) {
      assert(Number.isFinite(x) && Number.isFinite(y));
      assert(x >= -0.001 && x <= layout.widthPx + 0.001, `${name}: x clipping`);
      assert(y >= -0.001 && y <= layout.heightPx + 0.001, `${name}: y clipping`);
    }
  }
  for (const id of ['wordmark', 'location']) {
    const path = layout.paths.find((p) => p.id === id);
    const { bounds } = path;
    const original = id === 'wordmark' ? geometry.wordmark : geometry.locations[layout.locationKey];
    const scale = bounds.width / original.width;
    near(bounds.height / original.height, scale, `${name}: ${id} must not be stretched`);
    near(bounds.x + bounds.width / 2, layout.widthPx / 2, `${name}: ${id} must be centered`);
    // Check the paths themselves, rather than trusting their advertised bounds.
    assert.equal(path.commands.length, original.commands.length);
    original.commands.forEach(([op, ...values], i) => {
      assert.equal(path.commands[i][0], op);
      values.forEach((value, j) => near(path.commands[i][j + 1], value * scale + (j % 2 ? bounds.y : bounds.x), `${name}: ${id} uniform glyph transform`));
    });
  }
  const word = layout.paths.find((p) => p.id === 'wordmark').bounds;
  const location = layout.paths.find((p) => p.id === 'location').bounds;
  assert(location.y > word.y + word.height, `${name}: caption overlaps wordmark`);
  const dividerPaths = layout.paths.filter((p) => p.id === 'divider');
  assert.equal(dividerPaths.length, layout.divider ? 1 : 0, `${name}: incorrect divider count`);
  if (layout.divider) {
    const divider = dividerPaths[0];
    const line = divider.bounds;
    assert(line.width > line.height && line.width <= word.width, `${name}: divider must be horizontal and fit the lettering width`);
    near(line.height * layout.widthMm / layout.widthPx, 0.25, `${name}: divider thickness`);
    near(line.x + line.width / 2, layout.widthPx / 2, `${name}: divider must be centered`);
    near(line.y + line.height / 2, (word.y + word.height + location.y) / 2, `${name}: divider must be centered between the text lines`);
    assert(line.y > word.y + word.height && line.y + line.height < location.y, `${name}: divider touches lettering`);
    assert.deepEqual(divider.commands.map(([op]) => op), ['M', 'L', 'L', 'L', 'Z'], `${name}: divider must be a closed filled rectangle`);
    const points = pointsByPath.get('divider');
    const xs = [...new Set(points.map(([x]) => x))];
    const ys = [...new Set(points.map(([, y]) => y))];
    assert.equal(xs.length, 2, `${name}: divider edges are not vertical`);
    assert.equal(ys.length, 2, `${name}: divider edges are not horizontal`);
    near(Math.min(...xs), line.x, `${name}: divider left edge`);
    near(Math.max(...xs), line.x + line.width, `${name}: divider right edge`);
    near(Math.min(...ys), line.y, `${name}: divider top edge`);
    near(Math.max(...ys), line.y + line.height, `${name}: divider bottom edge`);
  }
  if (layout.locationKey !== 'jakarta') {
    const scale = location.height / geometry.locations[layout.locationKey].height;
    const key = `${layout.variant}|${layout.borderMm}`;
    const previous = scalesByVariant.get(key);
    if (previous !== undefined) near(scale, previous, `${name}: dash comparisons must retain the same type size`, 1e-9);
    scalesByVariant.set(key, scale);
  }
  if (layout.variant === 'borderless') return;
  const outer = layout.paths.find((p) => p.id === 'border').bounds;
  near(outer.width / outer.height, expected.widthMm / expected.heightMm, `${name}: outer frame ratio`);
  const innerFrame = layout.paths.find((p) => p.id === 'inner-border') || layout.paths.find((p) => p.id === 'border');
  const b = innerFrame.bounds;
  const border = layout.borderMm * layout.widthPx / layout.widthMm;
  const left = b.x + border, right = b.x + b.width - border;
  const top = b.y + border, bottom = b.y + b.height - border;
  for (const id of ['wordmark', 'location', ...(layout.divider ? ['divider'] : [])]) {
    for (const [x, y] of pointsByPath.get(id)) {
      assert(x > left && x < right && y > top && y < bottom, `${name}: ${id} touches the frame`);
      if (layout.variant === 'oval' || layout.variant === 'double-oval') {
        const nx = (x - (left + right) / 2) / ((right - left) / 2);
        const ny = (y - (top + bottom) / 2) / ((bottom - top) / 2);
        assert(nx * nx + ny * ny < 1, `${name}: ${id} crosses the inner ellipse`);
      }
    }
  }
}

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
for (const variant of variants) {
  for (const [key, value] of Object.entries(expectedSizes[variant])) {
    assert.equal(engine.STAMP_SPECS[variant][key], value, `${variant}: wrong catalogue ${key}`);
  }
}
for (const [locationKey, caption] of locations) {
  assert.equal(geometry.locations[locationKey].text, caption, 'Wrong caption or dash code point');
  for (const variant of variants) {
    const plain = engine.createLayout(geometry, { variant, locationKey });
    for (const divider of [false, true]) {
      const name = `${locationKey}-${variant}${divider ? '-divider' : ''}`;
      const layout = engine.createLayout(geometry, { variant, locationKey, divider });
      assert.equal(layout.locationText, caption);
      assert.equal(layout.divider, divider, `${name}: incorrect divider flag`);
      assert.deepEqual(layout.paths.filter((path) => path.id !== 'divider'), plain.paths, `${name}: adding a divider must not alter existing artwork`);
      if (divider) dividerDesigns++;
      checkLayout(layout, name);
      // These controls change the available text area, so verify both extremes.
      if (variant !== 'borderless') for (const borderMm of [0.25, 0.5]) {
        checkLayout(engine.createLayout(geometry, { variant, locationKey, borderMm, divider }), `${name}-${borderMm}mm`);
      }
      const svg = engine.createSvg(layout);
      assert(!/<(?:text|image)\b|@font-face|font-family|href=/i.test(svg), 'SVG must be independent path artwork');
      assert(!svg.includes('<rect'), 'Transparent SVG must not have a white background');
      assert(engine.createSvg(layout, { background: 'white' }).includes('<rect'));
      assert.equal(svg.includes('id="divider"'), divider, `${name}: SVG divider must match preview`);
      assert.equal((svg.match(/<path\b/g) || []).length, layout.paths.length, `${name}: SVG must export every path`);
      assert(svg.match(/<title\b[^>]*>(.*?)<\/title>/s)?.[1].includes(caption), `${name}: incorrect SVG title`);
      assert.equal(svg.includes('With divider'), divider, `${name}: SVG divider title`);
      const svgSize = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)mm"\s+height="([\d.]+)mm"/);
      assert(svgSize, `${name}: missing physical SVG dimensions`);
      assert.equal(Number(svgSize[1]), expectedSizes[variant].widthMm);
      assert.equal(Number(svgSize[2]), expectedSizes[variant].heightMm);
      const pdf = engine.createPdf(layout);
      const pdfText = new TextDecoder().decode(pdf);
      assert(pdfText.startsWith('%PDF-1.4'));
      assert(!/\/Subtype\s*\/Image|\/Font\b/.test(pdfText), 'PDF must contain outlines, not fonts or images');
      assert.equal(pdfTitle(pdfText), `Sweet Times - ${caption}${divider ? ' - With divider' : ''}`, `${name}: incorrect PDF title`);
      assert.equal((pdfText.match(/\nf\n/g) || []).length, layout.paths.length, `${name}: PDF must export every filled path`);
      const mediaBox = pdfText.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
      assert(mediaBox, `${name}: missing physical page dimensions`);
      assert(Math.abs(Number(mediaBox[1]) * 25.4 / 72 - layout.widthMm) < 1e-5);
      assert(Math.abs(Number(mediaBox[2]) * 25.4 / 72 - layout.heightMm) < 1e-5);
      pathOutputs.add(JSON.stringify(layout.paths.map((path) => path.commands)));
      await writeFile(join(directory, `${name}.svg`), svg);
      await writeFile(join(directory, `${name}.pdf`), pdf);
      console.log(`${name}: ${layout.widthMm} × ${layout.heightMm} mm (${expectedSizes[variant].ratio}); outlined SVG/PDF verified`);
    }
  }
}
assert.equal(pathOutputs.size, 40, 'All forty designs must have distinct artwork, not only distinct labels');
assert.equal(dividerDesigns, 20, 'Exactly twenty designs must include the horizontal divider');
// The three distinct catalogue ratios cover all five shapes.
for (const variant of ['borderless', 'rectangle', 'oval']) {
  const rasterLayout = engine.createLayout(geometry, { variant, locationKey: 'emDash' });
  const dividerRasterLayout = engine.createLayout(geometry, { variant, locationKey: 'emDash', divider: true });
  const [ratioWidth, ratioHeight] = expectedSizes[variant].ratio.split(':').map(Number);
  assert(engine.rasterDimensions(rasterLayout).width >= 4000, `${variant}: default export must stay high resolution`);
  for (const requestedWidth of [2000, 4000, 6000]) {
    const dimensions = engine.rasterDimensions(rasterLayout, requestedWidth);
    assert.deepEqual(engine.rasterDimensions(dividerRasterLayout, requestedWidth), dimensions, `${variant}: divider must not change export resolution or size`);
    assert(Number.isInteger(dimensions.width) && Number.isInteger(dimensions.height));
    assert(dimensions.width >= requestedWidth, `${variant}: physical dimensions must not reduce pixel width`);
    assert(dimensions.width < requestedWidth + ratioWidth, `${variant}: excessive raster enlargement`);
    assert.equal(dimensions.width * ratioHeight, dimensions.height * ratioWidth, `${variant}: raster aspect must be exact`);
    near(dimensions.dpi, dimensions.width * 25.4 / rasterLayout.widthMm, `${variant}: DPI metadata`);
    near(dimensions.height * 25.4 / dimensions.dpi, rasterLayout.heightMm, `${variant}: raster physical height`);
  }
}
console.log('40 distinct designs verified: 20 unchanged originals and 20 centered dividers, supplier dimensions and ratios, unstretched glyphs, exact dash captions, border clearance, and high-resolution raster sizes.');
console.log(`Export samples: ${directory}`);
