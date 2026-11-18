/** Self-contained vector and raster exports for the two-line Sweet Times stamp. */

import { DEFAULT_SIZE_IDS, getStampSize } from './stamp-sizes.js?v=store-sizes-1';

const MM_TO_PT = 72 / 25.4;
const SVG_NS = 'http://www.w3.org/2000/svg';
const encode = (value) => new TextEncoder().encode(value);
const number = (value) => Number(value.toFixed(6)).toString();
const escapeXml = (value) => String(value).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const pdfUnicodeString = (value) => '<FEFF' + Array.from(String(value), c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>';

// Supplier sizes are width × height. Keep the nominal size and its aspect
// ratio together so previews, labels, and every exported artboard agree.
export const STAMP_SPECS = Object.freeze(Object.fromEntries(Object.keys(DEFAULT_SIZE_IDS).map(variant => {
  const { widthMm, heightMm, ratio } = getStampSize(variant);
  return [variant, Object.freeze({ widthMm, heightMm, ratio })];
})));

// Playlist Script supplies one real weight. Its added outline is rendered as
// vector geometry in every export; Outfit uses genuine variable-font instances.
export const WEIGHT_PROFILES = Object.freeze({
  standard: Object.freeze({ label: 'Standard', captionWeight: 650, wordmarkOutlineMm: 0.06 }),
  bold: Object.freeze({ label: 'Bold', captionWeight: 700, wordmarkOutlineMm: 0.18 }),
});

function finite(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}.`);
  return value;
}

function validateInk(ink) {
  if (!/^#[0-9a-f]{6}$/i.test(ink)) throw new TypeError('Ink must be a six-digit hex color.');
  return ink.toLowerCase();
}

export async function loadGeometry(url = './stamp-geometry.json?v=weight-sets-1') {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The stamp lettering could not be loaded. Please reload the page.');
  const geometry = await response.json();
  const hasWeights = Object.values(WEIGHT_PROFILES).every(({ captionWeight }) =>
    ['jakarta', 'hyphen', 'enDash', 'emDash'].every(key => geometry.locationWeights?.[captionWeight]?.[key]?.commands));
  if (geometry.version !== 2 || !geometry.wordmark?.commands || !hasWeights) throw new Error('The stamp lettering file is invalid. Please reload the page.');
  return geometry;
}

function transformCommands(commands, scale, x, y) {
  return commands.map(([op, ...values]) => [op, ...values.map((v, index) => v * scale + (index % 2 ? y : x))]);
}

function pathData(commands) {
  return commands.map(([op, ...values]) => op + values.map(number).join(' ')).join('');
}

function makePath(id, commands, bounds, strokeWidth = 0) {
  const halfStroke = strokeWidth / 2;
  const inkBounds = {
    x: bounds.x - halfStroke, y: bounds.y - halfStroke,
    width: bounds.width + strokeWidth, height: bounds.height + strokeWidth,
  };
  return { id, commands, d: pathData(commands), bounds, inkBounds, strokeWidth };
}

function oval(x, y, width, height) {
  const a = width / 2, b = height / 2, cx = x + a, cy = y + b;
  const k = 0.5522847498307936;
  return [
    ['M', cx + a, cy],
    ['C', cx + a, cy + b * k, cx + a * k, cy + b, cx, cy + b],
    ['C', cx - a * k, cy + b, cx - a, cy + b * k, cx - a, cy],
    ['C', cx - a, cy - b * k, cx - a * k, cy - b, cx, cy - b],
    ['C', cx + a * k, cy - b, cx + a, cy - b * k, cx + a, cy], ['Z'],
  ];
}

function rectangle(x, y, width, height, radius = 0) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (!r) return [['M', x, y], ['L', x + width, y], ['L', x + width, y + height], ['L', x, y + height], ['Z']];
  const k = 0.5522847498307936;
  return [
    ['M', x + r, y], ['L', x + width - r, y],
    ['C', x + width - r + r * k, y, x + width, y + r - r * k, x + width, y + r],
    ['L', x + width, y + height - r],
    ['C', x + width, y + height - r + r * k, x + width - r + r * k, y + height, x + width - r, y + height],
    ['L', x + r, y + height],
    ['C', x + r - r * k, y + height, x, y + height - r + r * k, x, y + height - r],
    ['L', x, y + r],
    ['C', x, y + r - r * k, x + r - r * k, y, x + r, y], ['Z'],
  ];
}

function reverseClosed(commands) {
  const first = commands[0].slice(1);
  let previous = first;
  const segments = [];
  for (const [op, ...v] of commands.slice(1)) {
    if (op === 'Z') {
      if (previous[0] !== first[0] || previous[1] !== first[1]) segments.push({ op: 'L', start: previous, end: first });
    } else {
      const end = v.slice(-2);
      segments.push({ op, start: previous, end, controls: op === 'C' ? v.slice(0, 4) : [] });
      previous = end;
    }
  }
  return [['M', ...first], ...segments.reverse().map(({ op, start, controls }) => op === 'C'
    ? ['C', ...controls.slice(2), ...controls.slice(0, 2), ...start]
    : ['L', ...start]), ['Z']];
}

function outlineRing(kind, x, y, width, height, thickness, radius = 0) {
  const shape = kind === 'oval' ? oval : rectangle;
  const outside = shape(x, y, width, height, radius);
  const inside = shape(x + thickness, y + thickness, width - 2 * thickness, height - 2 * thickness, Math.max(0, radius - thickness));
  return [...outside, ...reverseClosed(inside)];
}

/**
 * The artboard is the fixed supplier size. A proportional inset keeps the
 * outer frame at the same aspect ratio; padding never enlarges the artboard.
 * Glyphs use one scale per line, without horizontal or vertical stretching.
 */
export function createLayout(geometry, {
  ink = '#171717', jakartaScale = 0.42, gapMm = 2,
  variant = 'borderless', borderMm = 0.35, locationKey = 'jakarta', divider = false,
  weightKey = 'standard', sizeId, wordmarkScale = 1, dividerWidthMode = 'original',
} = {}) {
  finite(jakartaScale, 'JAKARTA width', 0.1, 1);
  finite(wordmarkScale, 'Sweet Times relative size', 0.5, 2);
  finite(gapMm, 'Line gap', 0, 30);
  finite(borderMm, 'Border thickness', 0.1, 2);
  if (typeof divider !== 'boolean') throw new TypeError('Divider must be enabled or disabled.');
  if (!['original', 'shorter-text'].includes(dividerWidthMode)) throw new TypeError('Unsupported divider width mode.');
  const dividerMm = divider ? 0.25 : 0;
  if (divider && gapMm <= dividerMm) throw new RangeError('The line gap must be greater than 0.25 mm for a divider.');
  if (!Object.hasOwn(STAMP_SPECS, variant)) throw new TypeError('Unsupported stamp variant.');
  if (!Object.hasOwn(WEIGHT_PROFILES, weightKey)) throw new TypeError('Unsupported lettering weight.');
  const { label: weightLabel, captionWeight, wordmarkOutlineMm } = WEIGHT_PROFILES[weightKey];
  const size = getStampSize(variant, sizeId);
  const { widthMm, heightMm, ratio, stores, unconfirmedStores } = size;
  if (!['jakarta', 'hyphen', 'enDash', 'emDash'].includes(locationKey)) throw new TypeError('Unsupported caption.');
  const weightedLocations = geometry.locationWeights?.[captionWeight];
  const location = weightedLocations?.[locationKey];
  if (!location?.commands) throw new Error('The stamp caption could not be loaded. Please reload the page.');
  ink = validateInk(ink);
  const widthPx = 1000;
  const unitsPerMm = widthPx / widthMm;
  const heightPx = heightMm * unitsPerMm;
  const insetFraction = 0.03;
  const paddingX = widthPx * insetFraction;
  const paddingY = heightPx * insetFraction;
  const outerWidth = widthPx - paddingX * 2;
  const outerHeight = heightPx - paddingY * 2;
  const border = borderMm * unitsPerMm;
  const strokeWidth = wordmarkOutlineMm * unitsPerMm;
  const clearance = Math.max(1, widthMm * 0.03) * unitsPerMm;
  const secondRingInset = (borderMm + 0.65) * unitsPerMm;
  const isOval = variant === 'oval' || variant === 'double-oval';
  // All three country captions use identical glyph size and tracking. Their
  // visible widths differ only because of the chosen dash's actual width.
  // This factor changes the wordmark-to-caption relationship, then refits both
  // lines within the same artboard. The wider line determines the horizontal
  // fit, so smaller wordmarks cannot push the caption outside the canvas.
  // A factor of 1 preserves every original coordinate and physical stroke width.
  const locationFitWidth = locationKey === 'jakarta' ? location.width
    : Math.max(...['hyphen', 'enDash', 'emDash'].map(key => weightedLocations[key].width));
  const locationScalePerWidth = (locationKey === 'jakarta'
    ? jakartaScale / location.width
    : 0.82 / locationFitWidth) / wordmarkScale;
  // Keep country captions at the same type size across their dash variants by
  // reserving enough width for the widest one, even when it exceeds the script.
  const groupWidthPerScriptWidth = Math.max(1, locationFitWidth * locationScalePerWidth);
  const wordmarkAspect = geometry.wordmark.height / geometry.wordmark.width;
  const textHeightPerWidth = wordmarkAspect + location.height * locationScalePerWidth;
  const gap = gapMm * unitsPerMm;
  // scriptWidth is the visible ink width, including the centered outline.
  // The outline adds an affine height term while retaining uniform glyph scale.
  const heightOffset = gap + strokeWidth * (1 - wordmarkAspect);
  const contentInset = variant === 'borderless' ? 0
    : border + clearance + (variant === 'double-oval' ? secondRingInset : 0);
  const safeWidth = outerWidth - 2 * contentInset;
  const safeHeight = outerHeight - 2 * contentInset;
  if (safeWidth <= strokeWidth || safeHeight <= heightOffset) throw new RangeError('The line gap or border is too large for this stamp size.');
  let scriptWidth;
  if (isOval) {
    // Fit the whole two-line bounding rectangle inside an inset ellipse.
    // (groupWidthPerScriptWidth * w / safeWidth)^2
    //   + ((heightPerWidth * w + heightOffset) / safeHeight)^2 = 1.
    // This also keeps the text corners clear of the curved inner frame.
    const a = groupWidthPerScriptWidth ** 2 / safeWidth ** 2 + textHeightPerWidth ** 2 / safeHeight ** 2;
    const b = 2 * textHeightPerWidth * heightOffset / safeHeight ** 2;
    const c = heightOffset ** 2 / safeHeight ** 2 - 1;
    scriptWidth = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  } else {
    scriptWidth = Math.min(safeWidth / groupWidthPerScriptWidth, (safeHeight - heightOffset) / textHeightPerWidth);
  }
  if (scriptWidth <= strokeWidth) throw new RangeError('The lettering cannot fit within this stamp size.');
  const wordWidth = scriptWidth - strokeWidth;
  const wordScale = wordWidth / geometry.wordmark.width;
  const wordHeight = geometry.wordmark.height * wordScale;
  const wordInkHeight = wordHeight + strokeWidth;
  const locationScale = scriptWidth * locationScalePerWidth;
  const locationWidth = location.width * locationScale;
  const locationHeight = location.height * locationScale;
  const groupHeight = wordInkHeight + gap + locationHeight;
  const groupY = (heightPx - groupHeight) / 2;
  const locationY = groupY + wordInkHeight + gap;
  const rows = [
    { id: 'wordmark', data: geometry.wordmark, scale: wordScale, x: (widthPx - wordWidth) / 2, y: groupY + strokeWidth / 2, width: wordWidth, height: wordHeight, stroke: strokeWidth },
    { id: 'location', data: location, scale: locationScale, x: (widthPx - locationWidth) / 2, y: locationY, width: locationWidth, height: locationHeight, stroke: 0 },
  ];
  const paths = rows.map(({ id, data, scale, x, y, width, height, stroke }) => {
    const commands = transformCommands(data.commands, scale, x, y);
    return makePath(id, commands, { x, y, width, height }, stroke);
  });
  if (divider) {
    // The rule sits within the existing line gap, so neither the lettering
    // nor the frame moves. Filled geometry exports identically in all formats.
    // scriptWidth includes its outline; the caption has no added stroke.
    // Matching the shorter visible line changes only the divider endpoints.
    const width = dividerWidthMode === 'shorter-text'
      ? Math.min(scriptWidth, locationWidth) : scriptWidth * 0.76;
    const height = dividerMm * unitsPerMm;
    const x = (widthPx - width) / 2;
    const y = groupY + wordInkHeight + (gap - height) / 2;
    const commands = rectangle(x, y, width, height);
    paths.splice(1, 0, makePath('divider', commands, { x, y, width, height }));
  }
  if (variant !== 'borderless') {
    const radius = variant === 'rounded' ? Math.min(outerHeight * 0.2, 3.5 * unitsPerMm) : 0;
    const kind = isOval ? 'oval' : 'rectangle';
    const commands = outlineRing(kind, paddingX, paddingY, outerWidth, outerHeight, border, radius);
    paths.unshift(makePath('border', commands, { x: paddingX, y: paddingY, width: outerWidth, height: outerHeight }));
    if (variant === 'double-oval') {
      const inset = secondRingInset;
      const inner = outlineRing('oval', paddingX + inset, paddingY + inset, outerWidth - 2 * inset, outerHeight - 2 * inset, border);
      paths.splice(1, 0, makePath('inner-border', inner, { x: paddingX + inset, y: paddingY + inset, width: outerWidth - 2 * inset, height: outerHeight - 2 * inset }));
    }
  }
  return { widthMm, heightMm, ratio, sizeId: size.id, stores, unconfirmedStores, widthPx, heightPx, ink, paths, insetFraction,
    marginsMm: { x: paddingX / unitsPerMm, y: paddingY / unitsPerMm },
    gapMm, jakartaScale, variant, borderMm, locationKey, locationText: location.text, divider, dividerMm, dividerWidthMode,
    weightKey, weightLabel, captionWeight, wordmarkFontWeight: 400, wordmarkOutlineMm, wordmarkScale };
}

function proportionTitle(layout, separator) {
  return Number.isFinite(layout.wordmarkScale) && layout.wordmarkScale !== 1
    ? `${separator}Sweet Times relative size ${number(layout.wordmarkScale * 100)}%` : '';
}

function dividerTitle(layout, separator) {
  return layout.divider && layout.dividerWidthMode === 'shorter-text'
    ? `${separator}Divider matches shorter text` : '';
}

export function createSvg(layout, { background = 'transparent' } = {}) {
  if (!['transparent', 'white'].includes(background)) throw new TypeError('Unsupported background.');
  const { widthMm, heightMm, widthPx, heightPx, ink, paths } = layout;
  const rect = background === 'white' ? `<rect width="${number(widthPx)}" height="${number(heightPx)}" fill="#ffffff"/>` : '';
  const pathElements = paths.map(({ d, id, strokeWidth }) => {
    const stroke = strokeWidth > 0 ? ` stroke="${escapeXml(ink)}" stroke-width="${number(strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"` : '';
    return `<path id="${id}" d="${d}"${stroke}/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${SVG_NS}" width="${number(widthMm)}mm" height="${number(heightMm)}mm" viewBox="0 0 ${number(widthPx)} ${number(heightPx)}" role="img" aria-labelledby="stamp-title"><title id="stamp-title">Sweet Times — ${escapeXml(layout.locationText || 'JAKARTA')} — ${escapeXml(layout.weightLabel)}${layout.divider ? ' — With divider' : ''}${proportionTitle(layout, ' — ')}${dividerTitle(layout, ' — ')}</title>${rect}<g fill="${escapeXml(ink)}" fill-rule="nonzero">${pathElements}</g></svg>\n`;
}

/** A real vector PDF: absolute Bézier curves, no bitmap and no font references. */
export function createPdf(layout) {
  const { widthMm, heightMm, widthPx, ink, paths } = layout;
  const pageWidth = widthMm * MM_TO_PT;
  const pageHeight = heightMm * MM_TO_PT;
  const scale = pageWidth / widthPx;
  const rgb = [1, 3, 5].map((index) => parseInt(ink.slice(index, index + 2), 16) / 255);
  const draw = paths.map(({ commands, strokeWidth }) => {
    const operators = commands.map(([op, ...v]) => {
      if (op === 'Z') return 'h';
      const pdfOp = { M: 'm', L: 'l', C: 'c' }[op];
      if (!pdfOp) throw new Error(`Unsupported vector command ${op}`);
      return `${v.map(number).join(' ')} ${pdfOp}`;
    }).join('\n');
    return strokeWidth > 0
      ? `q\n${number(strokeWidth)} w\n1 j\n1 J\n${operators}\nB\nQ`
      : `${operators}\nf`;
  }).join('\n');
  const stream = `q\n${number(scale)} 0 0 ${number(-scale)} 0 ${number(pageHeight)} cm\n${rgb.map(number).join(' ')} rg\n${rgb.map(number).join(' ')} RG\n${draw}\nQ\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(pageWidth)} ${number(pageHeight)}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${encode(stream).length} >>\nstream\n${stream}endstream`,
    `<< /Title ${pdfUnicodeString('Sweet Times - ' + (layout.locationText || 'JAKARTA') + ' - ' + layout.weightLabel + (layout.divider ? ' - With divider' : '') + proportionTitle(layout, ' - ') + dividerTitle(layout, ' - '))} /Creator (Sweet Times Stamp) /Subject (Outlined stamp artwork) >>`,
  ];
  let pdf = '%PDF-1.4\n% Vector stamp\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(encode(pdf).length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encode(pdf);
}

export function rasterDimensions(layout, pixelWidth = 4000) {
  finite(pixelWidth, 'Image width', 100, 10000);
  if (!Number.isInteger(pixelWidth)) throw new RangeError('Image width must be a whole number of pixels.');
  // An integer multiple of the reduced ratio preserves the exact proportion.
  // Round upward: a smaller physical stamp never reduces the requested pixels.
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const divisor = gcd(layout.widthMm, layout.heightMm);
  const ratioWidth = layout.widthMm / divisor;
  const ratioHeight = layout.heightMm / divisor;
  const multiple = Math.ceil(pixelWidth / ratioWidth);
  const width = multiple * ratioWidth;
  const height = multiple * ratioHeight;
  if (width * height > 40000000) throw new RangeError('This image exceeds the browser export limit. Choose a smaller pixel width or download SVG or PDF.');
  const dpi = width / layout.widthMm * 25.4;
  return { width, height, dpi, requestedWidth: pixelWidth };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let j = 0; j < 8; j++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const joined = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  return joined;
}

/** Replace the browser's default 96 DPI PNG metadata with physical print DPI. */
export function setPngDpi(bytes, dpi) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 33 || data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71) throw new Error('Invalid PNG image.');
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set(encode('pHYs'), 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts = [data.subarray(0, 8)];
  const input = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  let inserted = false;
  while (offset + 12 <= data.length) {
    const length = input.getUint32(offset);
    const end = offset + length + 12;
    if (end > data.length) throw new Error('Invalid PNG chunk.');
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(data.subarray(offset, end));
    if (type === 'IHDR') { parts.push(chunk); inserted = true; }
    offset = end;
  }
  if (!inserted || offset !== data.length) throw new Error('Incomplete PNG image.');
  return concatBytes(parts);
}

/** Set JFIF density in pixels/inch; no resampling or recompression. */
export function setJpegDpi(bytes, dpi) {
  const data = new Uint8Array(bytes);
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error('Invalid JPEG image.');
  const density = Math.max(1, Math.min(65535, Math.round(dpi)));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  while (offset + 4 <= data.length && data[offset] === 0xff) {
    const marker = data[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) break;
    if (marker === 0xe0 && length >= 16 && String.fromCharCode(...data.subarray(offset + 4, offset + 9)) === 'JFIF\0') {
      data[offset + 11] = 1;
      view.setUint16(offset + 12, density);
      view.setUint16(offset + 14, density);
      return data;
    }
    offset += length + 2;
  }
  const jfif = new Uint8Array([0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, density >>> 8, density & 255, density >>> 8, density & 255, 0, 0]);
  return concatBytes([data.subarray(0, 2), jfif, data.subarray(2)]);
}

export async function createRaster(layout, { type = 'png', background = 'transparent', pixelWidth = 4000 } = {}) {
  if (!['png', 'jpeg'].includes(type)) throw new TypeError('Unsupported image format.');
  if (!['transparent', 'white'].includes(background)) throw new TypeError('Unsupported background.');
  const { width, height, dpi } = rasterDimensions(layout, pixelWidth);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: type === 'png' && background === 'transparent' });
  if (!context) throw new Error('Image export is not available in this browser.');
  if (type === 'jpeg' || background === 'white') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.scale(width / layout.widthPx, height / layout.heightPx);
  context.fillStyle = layout.ink;
  context.strokeStyle = layout.ink;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const { commands, strokeWidth } of layout.paths) {
    context.beginPath();
    for (const [op, ...v] of commands) {
      if (op === 'M') context.moveTo(...v);
      else if (op === 'L') context.lineTo(...v);
      else if (op === 'C') context.bezierCurveTo(...v);
      else if (op === 'Z') context.closePath();
    }
    context.fill('nonzero');
    if (strokeWidth > 0) {
      context.lineWidth = strokeWidth;
      context.stroke();
    }
  }
  const mime = type === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image export failed. Try a lower resolution.')), mime, 0.98));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  canvas.width = canvas.height = 0;
  return new Blob([type === 'png' ? setPngDpi(bytes, dpi) : setJpegDpi(bytes, dpi)], { type: mime });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Leave enough time for slower mobile browsers to acquire the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
