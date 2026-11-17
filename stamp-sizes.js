/** Sizes transcribed from the two supplied charts, normalized to width × height in mm. */

const rectanglesByStore = {
  A: [[55, 13], [43, 13], [55, 17], [43, 17], [55, 22], [43, 22], [43, 27]],
  B: [[43, 22], [40, 13], [55, 13], [78, 13], [43, 27], [43, 17], [55, 17], [67, 17], [55, 22],
    [55, 27], [67, 27], [78, 27], [55, 32], [67, 32], [78, 32], [103, 43], [55, 43], [67, 43], [78, 43]],
};

const gcd = (a, b) => b ? gcd(b, a % b) : a;
const rectangles = new Map();
for (const [store, sizes] of Object.entries(rectanglesByStore)) {
  for (const [widthMm, heightMm] of sizes) {
    const id = `rect-${widthMm}x${heightMm}`;
    if (!rectangles.has(id)) rectangles.set(id, { id, shape: 'rectangle', widthMm, heightMm, stores: [] });
    rectangles.get(id).stores.push(store);
  }
}

function freezeSize(size) {
  const divisor = gcd(size.widthMm, size.heightMm);
  return Object.freeze({
    ...size,
    ratio: `${size.widthMm / divisor}:${size.heightMm / divisor}`,
    stores: Object.freeze([...size.stores]),
    unconfirmedStores: Object.freeze([...(size.unconfirmedStores || [])]),
  });
}

const sizes = [
  ...[...rectangles.values()].sort((a, b) => a.heightMm - b.heightMm || a.widthMm - b.widthMm),
  // Store B's "Oval 1/45" and "Oval 1/50" labels omit a second dimension.
  // They cannot establish an oval ratio or compatibility with Store A's size.
  { id: 'oval-35x24', shape: 'oval', widthMm: 35, heightMm: 24, stores: ['A'], unconfirmedStores: ['B'] },
].map(freezeSize);

export const SIZE_CATALOGUE = Object.freeze(Object.fromEntries(sizes.map(size => [size.id, size])));

export const DEFAULT_SIZE_IDS = Object.freeze({
  borderless: 'rect-43x17',
  rectangle: 'rect-55x22',
  rounded: 'rect-55x22',
  oval: 'oval-35x24',
  'double-oval': 'oval-35x24',
});

const rectangleSizes = Object.freeze(sizes.filter(size => size.shape === 'rectangle'));
const ovalSizes = Object.freeze(sizes.filter(size => size.shape === 'oval'));

export function sizesForVariant(variant) {
  if (!Object.hasOwn(DEFAULT_SIZE_IDS, variant)) throw new TypeError('Unsupported stamp variant.');
  return variant === 'oval' || variant === 'double-oval' ? ovalSizes : rectangleSizes;
}

export function getStampSize(variant, sizeId = DEFAULT_SIZE_IDS[variant]) {
  const compatible = sizesForVariant(variant);
  const size = SIZE_CATALOGUE[sizeId];
  if (!size || !compatible.includes(size)) throw new TypeError('This size is not available for the selected stamp shape.');
  return size;
}

export function storeLabel(size) {
  return size.stores.map(store => `Store ${store}`).join(' + ');
}
