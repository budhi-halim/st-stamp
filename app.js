import { loadGeometry, createLayout, createSvg, createPdf, createRaster, rasterDimensions, downloadBlob } from './export-engine.js?v=focus-smaller-1';
import { DEFAULT_SIZE_IDS, getStampSize, sizesForVariant, storeLabel } from './stamp-sizes.js?v=store-sizes-1';

const variants = [
  { id: 'borderless', name: 'Borderless' },
  { id: 'rectangle', name: 'Rectangle' },
  { id: 'rounded', name: 'Rounded rectangle' },
  { id: 'oval', name: 'Oval' },
  { id: 'double-oval', name: 'Double oval' },
];
const sets = [
  { id: 'jakarta', key: 'jakarta', label: 'JAKARTA', caption: 'JAKARTA' },
  { id: 'hyphen', key: 'hyphen', label: 'Hyphen', caption: 'JAKARTA - INDONESIA' },
  { id: 'en-dash', key: 'enDash', label: 'En dash', caption: 'JAKARTA – INDONESIA' },
  { id: 'em-dash', key: 'emDash', label: 'Em dash', caption: 'JAKARTA — INDONESIA' },
];
const baseCollections = [
  { id: 'without-divider', label: 'Standard · Without divider', weightKey: 'standard', weightLabel: 'Standard', divider: false },
  { id: 'with-divider', label: 'Standard · With divider', weightKey: 'standard', weightLabel: 'Standard', divider: true },
  { id: 'bold-without-divider', label: 'Bold · Without divider', weightKey: 'bold', weightLabel: 'Bold', divider: false },
  { id: 'bold-with-divider', label: 'Bold · With divider', weightKey: 'bold', weightLabel: 'Bold', divider: true },
];
const fixedSizeLabel = '40 × 13 mm';
const fixedCollections = baseCollections.map(collection => ({
  ...collection,
  id: `size-40x13-${collection.id}`,
  fixedSizeId: 'rect-40x13',
}));
const collections = [...baseCollections, ...fixedCollections];
function collectionPrefix(collection) {
  return `${collection.fixedSizeId ? 'size-40x13-' : ''}${collection.weightKey === 'bold' ? 'bold-' : ''}${collection.divider ? 'divider-' : ''}`;
}
function collectionVariants(collection) {
  return collection.fixedSizeId ? variants.filter(variant => ['borderless', 'rectangle', 'rounded'].includes(variant.id)) : variants;
}
function defaultSizeId(design) {
  return design.collection.fixedSizeId || DEFAULT_SIZE_IDS[design.variant];
}
function fixedSizeSuffix(design) {
  return design.collection.fixedSizeId ? ` ${fixedSizeLabel}` : '';
}
const designs = collections.flatMap(collection => sets.flatMap(set => collectionVariants(collection).map(variant => ({
  id: `${collectionPrefix(collection)}${set.id}-${variant.id}`,
  variant: variant.id, name: variant.name, set, collection,
}))));
const designsById = new Map(designs.map(design => [design.id, design]));
const selectedSizes = new Map(designs.map(design => [design.id, defaultSizeId(design)]));
const formats = [
  ['svg', 'SVG · vector'],
  ['pdf', 'PDF · vector'],
  ['png-transparent', 'PNG · transparent'],
  ['png-white', 'PNG · white'],
  ['jpg', 'JPG · white'],
];
const downloadIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5v10m-3.5-3.5L10 12.5l3.5-3.5M3.5 13v3.5h13V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const gallery = document.querySelector('#gallery');
const form = document.querySelector('#settings');
const inkInput = document.querySelector('#ink');
const pixelInput = document.querySelector('#pixel-width');
const borderInput = document.querySelector('#border');
const checkerboard = document.querySelector('#checkerboard');
const availabilityInput = document.querySelector('#size-availability');
const availabilityStatus = document.querySelector('#availability-status');
const availabilityValues = ['all', 'shared', 'a-only', 'b-only'];
const requestedAvailability = new URL(location.href).searchParams.get('store');
if (availabilityValues.includes(requestedAvailability)) availabilityInput.value = requestedAvailability;
const errorMessage = document.querySelector('#page-error');
const toast = document.querySelector('#toast');
const layouts = new Map();
const cache = new Map();
let geometry;
let toastTimeout;
let preparing;
let generation = 0;

function state() {
  return { ink: inkInput.value, borderMm: Number(borderInput.value), pixelWidth: Number(pixelInput.value) };
}

function flash(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 4200);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function updateSummary() {
  document.querySelector('#settings-summary').textContent = `${inkInput.selectedOptions[0].textContent} · ${Number(pixelInput.value).toLocaleString('en-US')} px+`;
}

function availableSizes(design) {
  const choices = design.collection.fixedSizeId ? [getStampSize(design.variant, design.collection.fixedSizeId)] : sizesForVariant(design.variant);
  return choices.filter(size => {
    if (availabilityInput.value === 'shared') return size.stores.length === 2;
    if (availabilityInput.value === 'a-only') return size.stores.length === 1 && size.stores[0] === 'A';
    if (availabilityInput.value === 'b-only') return size.stores.length === 1 && size.stores[0] === 'B';
    return true;
  });
}

function preferredSize(design, choices) {
  const original = getStampSize(design.variant, defaultSizeId(design));
  const ratio = original.widthMm / original.heightMm;
  const area = original.widthMm * original.heightMm;
  return [...choices].sort((a, b) =>
    Math.abs(a.widthMm / a.heightMm - ratio) - Math.abs(b.widthMm / b.heightMm - ratio)
    || Math.abs(a.widthMm * a.heightMm - area) - Math.abs(b.widthMm * b.heightMm - area)
    || a.id.localeCompare(b.id))[0];
}

function applyAvailability() {
  if (!geometry) return;
  // Stop a previous prefetch pass before changing its visible set and sizes.
  generation++;
  const counts = new Map(collections.map(collection => [collection.id, 0]));
  let visible = 0;
  for (const design of designs) {
    const card = document.querySelector(`[data-design="${design.id}"]`);
    const choices = availableSizes(design);
    card.hidden = choices.length === 0;
    if (card.hidden) continue;
    if (!choices.some(size => size.id === selectedSizes.get(design.id))) {
      selectedSizes.set(design.id, preferredSize(design, choices).id);
    }
    const select = card.querySelector('.size-select');
    if (select) select.innerHTML = sizeOptions(design, choices);
    visible++;
    counts.set(design.collection.id, counts.get(design.collection.id) + 1);
  }
  for (const collection of collections) {
    document.querySelector(`#${collection.id} > span`).textContent = `${counts.get(collection.id)} designs`;
  }
  document.querySelector('#size-40x13').hidden = !fixedCollections.some(collection => counts.get(collection.id) > 0);
  const descriptions = {
    all: '20 rectangle sizes and 1 confirmed oval size.',
    shared: '6 rectangle sizes listed by both stores.',
    'a-only': '1 rectangle size and 1 confirmed oval size listed only in Store A’s chart. Store B oval printing dimensions are unconfirmed.',
    'b-only': '13 rectangle sizes. Store B also lists Oval 1/45 and Oval 1/50; their printing dimensions are unconfirmed.',
  };
  availabilityStatus.textContent = `${visible} designs · ${descriptions[availabilityInput.value]}`;
  const url = new URL(location.href);
  if (availabilityInput.value === 'all') url.searchParams.delete('store');
  else url.searchParams.set('store', availabilityInput.value);
  history.replaceState(history.state, '', url);
  renderPreviews();
}

function filename(design, format, current, size) {
  const ink = { '#171717': 'black', '#193f69': 'blue', '#9b3037': 'red' }[current.ink] || current.ink.slice(1);
  const caption = design.set.key === 'jakarta' ? '' : `jakarta-indonesia-${design.set.id}-`;
  const base = `sweet-times-${caption}${design.variant}${design.collection.divider ? '-divider' : ''}-${design.collection.weightKey}-${size.widthMm}x${size.heightMm}mm-${ink}`;
  if (format === 'svg' || format === 'pdf') return `${base}.${format}`;
  const pixels = rasterDimensions(size, current.pixelWidth);
  if (format === 'jpg') return `${base}-${pixels.width}x${pixels.height}px-white.jpg`;
  return `${base}-${pixels.width}x${pixels.height}px-${format === 'png-white' ? 'white' : 'transparent'}.png`;
}

function cacheKey(design, format, current, sizeId = selectedSizes.get(design.id)) {
  return [design.id, sizeId, format, current.ink, current.borderMm, current.pixelWidth].join('|');
}

async function fileFor(design, format, current) {
  const size = getStampSize(design.variant, selectedSizes.get(design.id));
  const key = cacheKey(design, format, current, size.id);
  if (cache.has(key)) return cache.get(key);
  const layout = createLayout(geometry, { ...current, variant: design.variant, sizeId: size.id, locationKey: design.set.key, divider: design.collection.divider, weightKey: design.collection.weightKey });
  let blob;
  if (format === 'svg') blob = new Blob([createSvg(layout)], { type: 'image/svg+xml' });
  else if (format === 'pdf') blob = new Blob([createPdf(layout)], { type: 'application/pdf' });
  else blob = await createRaster(layout, { type: format === 'jpg' ? 'jpeg' : 'png', background: format === 'png-transparent' ? 'transparent' : 'white', pixelWidth: current.pixelWidth });
  const file = { blob, filename: filename(design, format, current, size) };
  cache.set(key, file);
  return file;
}

// Preparing the selected files before a tap preserves the user gesture for iOS downloads.
async function prepareSelected() {
  const ticket = ++generation;
  if (!geometry) return;
  const current = state();
  for (const design of designs) {
    if (ticket !== generation) return;
    const card = document.querySelector(`[data-design="${design.id}"]`);
    if (card.hidden) continue;
    const format = card.querySelector('.format-select').value;
    try { await fileFor(design, format, current); }
    catch { /* A requested download displays the actionable error. */ }
  }
}

function schedulePreparation() {
  clearTimeout(preparing);
  preparing = setTimeout(prepareSelected, 180);
}

function renderPreviews(onlyDesign = null) {
  if (!geometry) return;
  showError('');
  const current = state();
  document.querySelector('#ink-sample').style.backgroundColor = current.ink;
  updateSummary();
  try {
    for (const design of onlyDesign ? [onlyDesign] : designs) {
      const card = document.querySelector(`[data-design="${design.id}"]`);
      if (card.hidden) continue;
      const size = getStampSize(design.variant, selectedSizes.get(design.id));
      const layout = createLayout(geometry, { ...current, variant: design.variant, sizeId: size.id, locationKey: design.set.key, divider: design.collection.divider, weightKey: design.collection.weightKey });
      layouts.set(design.id, layout);
      card.dataset.size = size.id;
      card.dataset.stores = size.stores.join(' ');
      // Preview and every export share the same paths and layout.
      card.querySelector('.stamp-preview').innerHTML = createSvg(layout)
        .replace(/<\?xml[^>]*>\s*/, '')
        .replace('id="stamp-title"', `id="stamp-title-${design.id}"`)
        .replace('aria-labelledby="stamp-title"', `aria-labelledby="stamp-title-${design.id}"`)
        .replace(/id="(wordmark|location|border|inner-border|divider)"/g, (_, id) => `id="${id}-${design.id}"`);
      card.querySelector('.dimensions').innerHTML = `<strong>${size.widthMm / 10} × ${size.heightMm / 10} cm</strong><span>${size.widthMm} × ${size.heightMm} mm · Ratio ${size.ratio}</span><span class="store-badge${size.stores.length === 2 ? ' shared' : ''}">${storeLabel(size)}</span>${size.unconfirmedStores?.includes('B') ? '<span class="store-note">Store B dimensions unconfirmed</span>' : ''}`;
      card.querySelector('.stamp-preview').setAttribute('aria-label', `${design.collection.weightLabel} ${design.name} Sweet Times stamp with ${design.set.caption} below${design.collection.divider ? ', with a horizontal divider' : ''}, ${size.widthMm} by ${size.heightMm} millimetres, ${storeLabel(size)}`);
      const button = card.querySelector('.download-button');
      if (button.getAttribute('aria-busy') !== 'true') button.disabled = false;
    }
    cache.clear();
    schedulePreparation();
  } catch (error) { showError(error.message); }
}

function sizeOptions(design, choices) {
  const groups = [['A B', 'Store A + Store B'], ['A', 'Store A'], ['B', 'Store B']];
  return groups.map(([stores, label]) => {
    const sizes = choices.filter(size => size.stores.join(' ') === stores);
    return sizes.length ? `<optgroup label="${label}">${sizes.map(size => `<option value="${size.id}"${selectedSizes.get(design.id) === size.id ? ' selected' : ''}>${size.widthMm} × ${size.heightMm} mm</option>`).join('')}</optgroup>` : '';
  }).join('');
}

function sizeControl(design) {
  if (design.collection.fixedSizeId || sizesForVariant(design.variant).length === 1) return '';
  return `<div class="size-field"><label for="size-${design.id}">Stamp size</label><div class="select-field"><select id="size-${design.id}" class="size-select" aria-label="Stamp size for ${design.collection.weightLabel} ${design.set.label} ${design.name}${design.collection.divider ? ' with divider' : ''}">${sizeOptions(design, availableSizes(design))}</select></div></div>`;
}

function collectionMarkup(collection) {
  const heading = collection.fixedSizeId ? 3 : 2;
  return `
    <header class="collection-header" id="${collection.id}"><h${heading}>${collection.label}</h${heading}><span>${sets.length * collectionVariants(collection).length} designs</span></header>
    <nav class="set-navigation" aria-label="${collection.fixedSizeId ? `${fixedSizeLabel} · ` : ''}${collection.label} text sets">${sets.map(set => `<a href="#set-${collectionPrefix(collection)}${set.id}">${set.key === 'jakarta' ? 'JAKARTA' : `${set.label} (${set.caption.split(' ')[1]})`}</a>`).join('')}</nav>
    ${sets.map(set => `
    <header class="set-header" id="set-${collectionPrefix(collection)}${set.id}"><h${heading + 1}>${set.caption}</h${heading + 1}>${set.key === 'jakarta' ? '' : `<span>${set.label}</span>`}</header>
    ${designs.filter(design => design.set === set && design.collection === collection).map(design => `
    <article class="stamp-card" data-design="${design.id}" data-variant="${design.variant}" data-location="${set.key}" data-divider="${collection.divider}" data-weight="${collection.weightKey}" aria-labelledby="title-${design.id}">
      <div class="card-header"><h${heading + 2} id="title-${design.id}">${design.name}</h${heading + 2}><span class="card-number" aria-hidden="true">${String(designs.indexOf(design) + 1).padStart(2, '0')}</span></div>
      ${sizeControl(design)}
      <div class="stamp-preview" role="img" aria-label="${collection.weightLabel} ${design.name} Sweet Times stamp with ${set.caption} below${collection.divider ? ', with a horizontal divider' : ''}"></div>
      <p class="dimensions"></p>
      <div class="download-area">
        <div class="select-field"><label class="visually-hidden" for="format-${design.id}">Download format for ${collection.weightLabel} ${set.label} ${design.name}${collection.divider ? ' with divider' : ''}${fixedSizeSuffix(design)}</label><select id="format-${design.id}" class="format-select">${formats.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
        <button type="button" class="download-button" aria-label="Download ${collection.weightLabel} ${set.label} ${design.name}${collection.divider ? ' with divider' : ''}${fixedSizeSuffix(design)} stamp">${downloadIcon}<span>Download</span></button>
      </div>
    </article>`).join('')}`).join('')}`;
}

function buildCards() {
  gallery.innerHTML = `${baseCollections.map(collectionMarkup).join('')}
    <section class="fixed-size-group" id="size-40x13" aria-labelledby="size-40x13-title">
      <header class="size-group-header"><div><h2 id="size-40x13-title">${fixedSizeLabel}</h2><p>Width × height · Ratio 40:13</p></div><div class="size-group-meta"><span class="store-badge">Store B</span><span>48 designs</span></div></header>
      <nav class="collection-navigation" aria-label="${fixedSizeLabel} collections">${fixedCollections.map(collection => `<a href="#${collection.id}"><strong>${collection.weightLabel}</strong><span>${collection.divider ? 'With divider' : 'Without divider'}</span></a>`).join('')}</nav>
      ${fixedCollections.map(collectionMarkup).join('')}
    </section>`;
  gallery.setAttribute('aria-busy', 'false');
}

gallery.addEventListener('change', event => {
  if (event.target.matches('.format-select')) schedulePreparation();
  if (event.target.matches('.size-select')) {
    const design = designsById.get(event.target.closest('.stamp-card').dataset.design);
    selectedSizes.set(design.id, event.target.value);
    renderPreviews(design);
  }
});

gallery.addEventListener('click', async event => {
  const button = event.target.closest('.download-button');
  if (!button || button.disabled || !geometry) return;
  const card = button.closest('.stamp-card');
  const design = designsById.get(card.dataset.design);
  const format = card.querySelector('.format-select').value;
  const current = state();
  const key = cacheKey(design, format, current);
  showError('');
  // A cached file downloads synchronously in the original tap event.
  if (cache.has(key)) {
    const file = cache.get(key);
    downloadBlob(file.blob, file.filename);
    flash(`${design.collection.weightLabel} · ${design.set.label} · ${design.name}${design.collection.divider ? ' · With divider' : ''} · ${formats.find(([value]) => value === format)[1]}`);
    return;
  }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.querySelector('span').textContent = 'Preparing…';
  try {
    const file = await fileFor(design, format, current);
    downloadBlob(file.blob, file.filename);
    flash(`${design.collection.weightLabel} · ${design.set.label} · ${design.name}${design.collection.divider ? ' · With divider' : ''} · ${formats.find(([value]) => value === format)[1]}`);
  } catch (error) {
    showError(`Could not download the file. ${error.message}`);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.querySelector('span').textContent = 'Download';
  }
});

form.addEventListener('submit', event => event.preventDefault());
availabilityInput.addEventListener('change', applyAvailability);
for (const input of [inkInput, borderInput]) input.addEventListener('input', () => renderPreviews());
pixelInput.addEventListener('change', () => { updateSummary(); cache.clear(); schedulePreparation(); });
checkerboard.addEventListener('change', () => gallery.classList.toggle('checkerboard', checkerboard.checked));
document.querySelector('#reset').addEventListener('click', () => {
  form.reset();
  availabilityInput.value = 'all';
  for (const design of designs) selectedSizes.set(design.id, defaultSizeId(design));
  gallery.classList.remove('checkerboard');
  applyAvailability();
});

try {
  geometry = await loadGeometry();
  buildCards();
  availabilityInput.disabled = false;
  applyAvailability();
  // Section links also work when the page opens before the lettering is loaded.
  if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }));
} catch (error) {
  gallery.innerHTML = '';
  gallery.setAttribute('aria-busy', 'false');
  showError(error.message);
}
