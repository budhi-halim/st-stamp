// Run with: node scripts/verify-exports.mjs
// Checks the actual vector export code; browser raster drawing is checked in UI QA.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as engine from '../export-engine.js';
import * as sizes from '../stamp-sizes.js';

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
// These independent chart transcriptions are the test oracle for availability.
// Store B's incomplete oval labels must never be turned into invented dimensions.
const storeARectangles = ['55x13', '43x13', '55x17', '43x17', '55x22', '43x22', '43x27'];
const storeBRectangles = ['43x22', '40x13', '55x13', '78x13', '43x27', '43x17', '55x17', '67x17', '55x22',
  '55x27', '67x27', '78x27', '55x32', '67x32', '78x32', '103x43', '55x43', '67x43', '78x43'];
const rectangleIds = [...new Set([...storeARectangles, ...storeBRectangles])].map(dimensions => `rect-${dimensions}`);
const expectedById = Object.fromEntries(rectangleIds.map(id => {
  const dimensions = id.slice(5);
  const [widthMm, heightMm] = dimensions.split('x').map(Number);
  return [id, { id, shape: 'rectangle', widthMm, heightMm, stores: [
    ...(storeARectangles.includes(dimensions) ? ['A'] : []),
    ...(storeBRectangles.includes(dimensions) ? ['B'] : []),
  ], unconfirmedStores: [] }];
}));
expectedById['oval-35x24'] = { id: 'oval-35x24', shape: 'oval', widthMm: 35, heightMm: 24, stores: ['A'], unconfirmedStores: ['B'] };
const expectedDefaultIds = {
  borderless: 'rect-43x17', rectangle: 'rect-55x22', rounded: 'rect-55x22', oval: 'oval-35x24', 'double-oval': 'oval-35x24',
};
const expectedIdsForVariant = variant => variant.includes('oval') ? ['oval-35x24'] : rectangleIds;
const sampleSizeIds = new Set(['rect-78x13', 'rect-55x43', 'rect-103x43']);
const hash = value => createHash('sha256').update(value).digest('hex');
const locations = [
  ['jakarta', 'JAKARTA'],
  ['hyphen', 'JAKARTA - INDONESIA'],
  ['enDash', 'JAKARTA \u2013 INDONESIA'],
  ['emDash', 'JAKARTA \u2014 INDONESIA'],
];
const expectedWeights = {
  standard: { label: 'Standard', captionWeight: 650, wordmarkOutlineMm: 0.06 },
  bold: { label: 'Bold', captionWeight: 700, wordmarkOutlineMm: 0.18 },
};
const pathOutputs = new Set();
const defaultPathOutputs = new Set();
const scalesByVariant = new Map();
let dividerDesigns = 0;
let defaultDesigns = 0;

function near(actual, expected, message, tolerance = 1e-6) {
  assert(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≠ ${expected}`);
}

function checkLayout(layout, name) {
  const expected = expectedById[layout.sizeId];
  assert(expected, `${name}: unknown supplier size`);
  assert.equal(layout.widthMm, expected.widthMm, `${name}: supplier width`);
  assert.equal(layout.heightMm, expected.heightMm, `${name}: supplier height`);
  assert.deepEqual(layout.stores, expected.stores, `${name}: incorrect store availability`);
  assert.deepEqual(layout.unconfirmedStores, expected.unconfirmedStores, `${name}: uncertain availability must remain explicit`);
  near(layout.widthPx / layout.heightPx, expected.widthMm / expected.heightMm, `${name}: artboard ratio`);
  const pointsByPath = new Map();
  const weight = expectedWeights[layout.weightKey];
  assert(weight, `${name}: unsupported weight profile`);
  assert.equal(layout.captionWeight, weight.captionWeight, `${name}: native caption weight`);
  near(layout.wordmarkOutlineMm, weight.wordmarkOutlineMm, `${name}: script outline amount`);
  const captionGeometry = geometry.locationWeights[String(weight.captionWeight)][layout.locationKey];
  for (const path of layout.paths) {
    const points = trace(path.commands);
    const stroke = path.strokeWidth;
    const expectedStroke = path.id === 'wordmark' ? weight.wordmarkOutlineMm * layout.widthPx / layout.widthMm : 0;
    near(stroke, expectedStroke, `${name}: ${path.id} stroke width`);
    const ink = path.inkBounds;
    assert(ink, `${name}: ${path.id} visible bounds are required`);
    near(ink.x, path.bounds.x - stroke / 2, `${name}: ${path.id} ink left`);
    near(ink.y, path.bounds.y - stroke / 2, `${name}: ${path.id} ink top`);
    near(ink.width, path.bounds.width + stroke, `${name}: ${path.id} ink width`);
    near(ink.height, path.bounds.height + stroke, `${name}: ${path.id} ink height`);
    assert(ink.x >= -0.001 && ink.y >= -0.001 && ink.x + ink.width <= layout.widthPx + 0.001 && ink.y + ink.height <= layout.heightPx + 0.001, `${name}: ${path.id} stroke clips the artboard`);
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
    const original = id === 'wordmark' ? geometry.wordmark : captionGeometry;
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
  const word = layout.paths.find((p) => p.id === 'wordmark').inkBounds;
  const location = layout.paths.find((p) => p.id === 'location').inkBounds;
  near((location.y - word.y - word.height) * layout.widthMm / layout.widthPx, 2, `${name}: visible line gap`);
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
    const scale = location.height / captionGeometry.height;
    const key = `${layout.weightKey}|${layout.variant}|${layout.sizeId}|${layout.borderMm}`;
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
    const ink = layout.paths.find((path) => path.id === id).inkBounds;
    // A convex frame containing all four visible bounding-box corners also
    // contains every glyph and its round outline, including curve extrema.
    const visibleCorners = [[ink.x, ink.y], [ink.x + ink.width, ink.y], [ink.x + ink.width, ink.y + ink.height], [ink.x, ink.y + ink.height]];
    for (const [x, y] of visibleCorners) {
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

assert.equal(geometry.version, 2, 'Weighted geometry must use the current schema');
assert.deepEqual(geometry.locations.jakarta, geometry.location, 'Original caption geometry must remain available');
assert.deepEqual(sizes.DEFAULT_SIZE_IDS, expectedDefaultIds, 'Existing designs must keep their default sizes');
assert.deepEqual(Object.keys(sizes.SIZE_CATALOGUE).sort(), Object.keys(expectedById).sort(), 'Catalogue must contain only confirmed rectangle and oval dimensions');
assert.equal(rectangleIds.length, 20, 'The two charts contain twenty distinct rectangle sizes');
const rectangleSizes = rectangleIds.map(id => sizes.SIZE_CATALOGUE[id]);
assert.equal(rectangleSizes.filter(size => size.stores.length === 2).length, 6, 'Six rectangle sizes are shared');
assert.equal(rectangleSizes.filter(size => size.stores.join() === 'A').length, 1, 'One rectangle size is listed only by A');
assert.equal(rectangleSizes.filter(size => size.stores.join() === 'B').length, 13, 'Thirteen rectangle sizes are listed only by B');
const reducedGcd = (a, b) => b ? reducedGcd(b, a % b) : a;
for (const [id, expected] of Object.entries(expectedById)) {
  const size = sizes.SIZE_CATALOGUE[id];
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(size[key], value, `${id}: incorrect ${key}`);
  const [ratioWidth, ratioHeight] = size.ratio.split(':').map(Number);
  assert.equal(ratioWidth * size.heightMm, ratioHeight * size.widthMm, `${id}: catalogue ratio must be exact`);
  assert.equal(reducedGcd(ratioWidth, ratioHeight), 1, `${id}: ratio must be reduced`);
  assert.equal(sizes.storeLabel(size), expected.stores.map(store => `Store ${store}`).join(' + '), `${id}: store label`);
}
for (const variant of variants) {
  for (const [key, value] of Object.entries(expectedSizes[variant])) {
    assert.equal(engine.STAMP_SPECS[variant][key], value, `${variant}: wrong catalogue ${key}`);
  }
  assert.deepEqual(sizes.sizesForVariant(variant).map(size => size.id).sort(), expectedIdsForVariant(variant).sort(), `${variant}: incorrect size choices`);
  assert.equal(sizes.getStampSize(variant).id, expectedDefaultIds[variant], `${variant}: wrong default selection`);
  assert.throws(() => engine.createLayout(geometry, { variant, sizeId: 'rect-99x99' }), /size/i, `${variant}: an unlisted size must be rejected`);
  const wrongShapeSize = variant.includes('oval') ? 'rect-55x22' : 'oval-35x24';
  assert.throws(() => engine.createLayout(geometry, { variant, sizeId: wrongShapeSize }), /size/i, `${variant}: incompatible shape must be rejected`);
}
assert.throws(() => sizes.sizesForVariant('triangle'), /variant/i);
for (const [weightKey, weight] of Object.entries(expectedWeights)) {
  for (const [key, value] of Object.entries(weight)) {
    assert.equal(engine.WEIGHT_PROFILES[weightKey][key], value, `${weightKey}: incorrect ${key}`);
  }
  const nativeCaptions = geometry.locationWeights[String(weight.captionWeight)];
  assert(nativeCaptions, `${weightKey}: native caption outlines are required`);
  for (const [locationKey, caption] of locations) {
    assert.equal(nativeCaptions[locationKey].text, caption, 'Wrong caption or dash code point');
    assert.equal(nativeCaptions[locationKey].weight, weight.captionWeight, 'Caption geometry must identify its native weight');
    for (const variant of variants) {
      for (const sizeId of expectedIdsForVariant(variant)) {
        const expected = expectedById[sizeId];
        const isDefault = sizeId === expectedDefaultIds[variant];
        const plain = engine.createLayout(geometry, { variant, locationKey, weightKey, sizeId });
        for (const divider of [false, true]) {
          const name = `${weightKey}-${locationKey}-${variant}-${sizeId}${divider ? '-divider' : ''}`;
          const layout = engine.createLayout(geometry, { variant, locationKey, weightKey, divider, sizeId });
          assert.equal(layout.sizeId, sizeId, `${name}: requested size must be used`);
          assert.equal(layout.locationText, caption);
          assert.equal(layout.weightKey, weightKey);
          assert.equal(layout.divider, divider, `${name}: incorrect divider flag`);
          assert.deepEqual(layout.paths.filter((path) => path.id !== 'divider'), plain.paths, `${name}: adding a divider must not alter lettering, outline, or borders`);
          if (divider) dividerDesigns++;
          checkLayout(layout, name);
          // These controls change the available text area, so verify both extremes.
          if (variant !== 'borderless') for (const borderMm of [0.25, 0.5]) {
            checkLayout(engine.createLayout(geometry, { variant, locationKey, weightKey, borderMm, divider, sizeId }), `${name}-${borderMm}mm`);
          }
          const svg = engine.createSvg(layout);
          assert(!/<(?:text|image)\b|@font-face|font-family|href=/i.test(svg), 'SVG must be independent path artwork');
          assert(!svg.includes('<rect'), 'Transparent SVG must not have a white background');
          assert(engine.createSvg(layout, { background: 'white' }).includes('<rect'));
          assert.equal(svg.includes('id="divider"'), divider, `${name}: SVG divider must match preview`);
          assert.equal((svg.match(/<path\b/g) || []).length, layout.paths.length, `${name}: SVG must export every path`);
          const title = svg.match(/<title\b[^>]*>(.*?)<\/title>/s)?.[1];
          assert(title.includes(caption) && title.includes(weight.label), `${name}: incorrect SVG title`);
          assert.equal(title.includes('With divider'), divider, `${name}: SVG divider title`);
          const svgWord = svg.match(/<path\b[^>]*\bid="wordmark"[^>]*>/)?.[0];
          assert(svgWord, `${name}: SVG wordmark is required`);
          const strokeWidth = layout.paths.find((path) => path.id === 'wordmark').strokeWidth;
          near(Number(svgWord.match(/\bstroke-width="([\d.]+)"/)?.[1]), strokeWidth, `${name}: SVG outline width`);
          assert(svgWord.includes(`stroke="${layout.ink}"`) && svgWord.includes('stroke-linejoin="round"') && svgWord.includes('stroke-linecap="round"'), `${name}: SVG must use the matching ink and rounded outline`);
          assert.equal((svg.match(/\bstroke-width=/g) || []).length, 1, `${name}: only the script needs an outline`);
          const svgSize = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)mm"\s+height="([\d.]+)mm"/);
          assert(svgSize, `${name}: missing physical SVG dimensions`);
          assert.equal(Number(svgSize[1]), expected.widthMm);
          assert.equal(Number(svgSize[2]), expected.heightMm);
          const pdf = engine.createPdf(layout);
          const pdfText = new TextDecoder().decode(pdf);
          assert(pdfText.startsWith('%PDF-1.4'));
          assert(!/\/Subtype\s*\/Image|\/Font\b/.test(pdfText), 'PDF must contain outlines, not fonts or images');
          const pdfCaption = pdfTitle(pdfText);
          assert(pdfCaption.includes(caption) && pdfCaption.includes(weight.label), `${name}: incorrect PDF title`);
          assert.equal(pdfCaption.includes('With divider'), divider, `${name}: PDF divider title`);
          assert.equal((pdfText.match(/\n(?:f|B)\n/g) || []).length, layout.paths.length, `${name}: PDF must paint every path`);
          assert.equal((pdfText.match(/\nB\n/g) || []).length, 1, `${name}: PDF must fill and stroke the script exactly once`);
          const pdfStrokes = [...pdfText.matchAll(/([\d.]+)\s+w\b/g)].map(match => Number(match[1]));
          assert.equal(pdfStrokes.length, 1, `${name}: PDF must use exactly one outline width`);
          near(pdfStrokes[0], strokeWidth, `${name}: PDF outline matches SVG`);
          assert(/\b1\s+j\b/.test(pdfText) && /\b1\s+J\b/.test(pdfText), `${name}: PDF outline joins and caps must be rounded`);
          const mediaBox = pdfText.match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
          assert(mediaBox, `${name}: missing physical page dimensions`);
          assert(Math.abs(Number(mediaBox[1]) * 25.4 / 72 - layout.widthMm) < 1e-5);
          assert(Math.abs(Number(mediaBox[2]) * 25.4 / 72 - layout.heightMm) < 1e-5);
          const artworkHash = hash(JSON.stringify(layout.paths.map((path) => ({ commands: path.commands, strokeWidth: path.strokeWidth }))));
          pathOutputs.add(artworkHash);
          if (isDefault) {
            defaultDesigns++;
            defaultPathOutputs.add(artworkHash);
            const implicitDefault = engine.createLayout(geometry, { variant, locationKey, weightKey, divider });
            assert.deepEqual(implicitDefault, layout, `${name}: an omitted size must preserve the existing design`);
          }
          // Save the 80 defaults plus a few extremes; all other exports are checked in memory.
          if (isDefault || (weightKey === 'bold' && locationKey === 'emDash' && divider && sampleSizeIds.has(sizeId))) {
            await writeFile(join(directory, `${name}.svg`), svg);
            await writeFile(join(directory, `${name}.pdf`), pdf);
          }
        }
      }
    }
  }
  console.log(`${weight.label}: 496 size variations verified; native Outfit ${weight.captionWeight}, Playlist outline ${weight.wordmarkOutlineMm} mm.`);
}
for (const [locationKey] of locations) {
  assert.notDeepEqual(geometry.locationWeights['650'][locationKey].commands, geometry.locationWeights['700'][locationKey].commands, `${locationKey}: caption weights must have distinct real outlines`);
}
assert.equal(pathOutputs.size, 992, 'All 992 size variations must have distinct artwork, not only distinct labels');
assert.equal(defaultDesigns, 80, 'The gallery must retain eighty default designs');
assert.equal(defaultPathOutputs.size, 80, 'All eighty defaults must have distinct artwork');
assert.equal(dividerDesigns, 496, 'Half of the size variations must include the horizontal divider');
// A non-black ink catches an outline accidentally painted in the default color.
const blue = engine.createLayout(geometry, { variant: 'oval', locationKey: 'enDash', weightKey: 'bold', divider: true, ink: '#193f69' });
assert(engine.createSvg(blue).includes('stroke="#193f69"'), 'SVG outline must follow the selected ink');
const bluePdf = new TextDecoder().decode(engine.createPdf(blue));
for (const operator of ['rg', 'RG']) {
  const color = bluePdf.match(new RegExp(`([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+${operator}\\b`));
  assert(color, `PDF ${operator} color is required`);
  [25, 63, 105].forEach((component, index) => near(Number(color[index + 1]), component / 255, `PDF ${operator} must follow the selected ink`));
}
// Every supported shape/size must preserve the exact ratio at each export setting.
for (const variant of variants) for (const sizeId of expectedIdsForVariant(variant)) {
  const name = `${variant}-${sizeId}`;
  const expected = expectedById[sizeId];
  const divisor = reducedGcd(expected.widthMm, expected.heightMm);
  const ratioWidth = expected.widthMm / divisor, ratioHeight = expected.heightMm / divisor;
  const reference = engine.createLayout(geometry, { variant, sizeId, locationKey: 'emDash', weightKey: 'standard' });
  assert(engine.rasterDimensions(reference).width >= 4000, `${name}: default export must stay high resolution`);
  for (const requestedWidth of [2000, 4000, 6000]) {
    const dimensions = engine.rasterDimensions(reference, requestedWidth);
    for (const weightKey of Object.keys(expectedWeights)) for (const divider of [false, true]) {
      const layout = engine.createLayout(geometry, { variant, sizeId, locationKey: 'emDash', weightKey, divider });
      assert.deepEqual(engine.rasterDimensions(layout, requestedWidth), dimensions, `${name}: lettering weight and divider must not change export resolution or size`);
    }
    assert(Number.isInteger(dimensions.width) && Number.isInteger(dimensions.height));
    assert(dimensions.width >= requestedWidth, `${name}: physical dimensions must not reduce pixel width`);
    assert(dimensions.width < requestedWidth + ratioWidth, `${name}: excessive raster enlargement`);
    assert.equal(dimensions.width * ratioHeight, dimensions.height * ratioWidth, `${name}: raster aspect must be exact`);
    near(dimensions.dpi, dimensions.width * 25.4 / reference.widthMm, `${name}: DPI metadata`);
    near(dimensions.height * 25.4 / dimensions.dpi, reference.heightMm, `${name}: raster physical height`);
  }
}
console.log('992 distinct size variations verified across the 80 gallery designs: store availability, native weights, matching vector outlines, visible ink clearance, physical dimensions, exact aspect ratios, dash captions, and high-resolution raster sizes.');
console.log(`Export samples: ${directory}`);
