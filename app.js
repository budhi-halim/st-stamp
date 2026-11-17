import { STAMP_SPECS, loadGeometry, createLayout, createSvg, createPdf, createRaster, rasterDimensions, downloadBlob } from './export-engine.js?v=supplier-sizes-1';

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
const designs = sets.flatMap(set => variants.map(variant => ({
  id: `${set.id}-${variant.id}`, variant: variant.id, name: variant.name, set,
})));
const designsById = new Map(designs.map(design => [design.id, design]));
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

function filename(design, format, current) {
  const size = STAMP_SPECS[design.variant];
  const ink = { '#171717': 'black', '#193f69': 'blue', '#9b3037': 'red' }[current.ink] || current.ink.slice(1);
  const caption = design.set.key === 'jakarta' ? '' : `jakarta-indonesia-${design.set.id}-`;
  const base = `sweet-times-${caption}${design.variant}-${size.widthMm}x${size.heightMm}mm-${ink}`;
  if (format === 'svg' || format === 'pdf') return `${base}.${format}`;
  const pixels = rasterDimensions(size, current.pixelWidth);
  if (format === 'jpg') return `${base}-${pixels.width}x${pixels.height}px-white.jpg`;
  return `${base}-${pixels.width}x${pixels.height}px-${format === 'png-white' ? 'white' : 'transparent'}.png`;
}

function cacheKey(design, format, current) {
  return [design.id, format, current.ink, current.borderMm, current.pixelWidth].join('|');
}

async function fileFor(design, format, current) {
  const key = cacheKey(design, format, current);
  if (cache.has(key)) return cache.get(key);
  const layout = createLayout(geometry, { ...current, variant: design.variant, locationKey: design.set.key });
  let blob;
  if (format === 'svg') blob = new Blob([createSvg(layout)], { type: 'image/svg+xml' });
  else if (format === 'pdf') blob = new Blob([createPdf(layout)], { type: 'application/pdf' });
  else blob = await createRaster(layout, { type: format === 'jpg' ? 'jpeg' : 'png', background: format === 'png-transparent' ? 'transparent' : 'white', pixelWidth: current.pixelWidth });
  const file = { blob, filename: filename(design, format, current) };
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
    const format = card.querySelector('select').value;
    try { await fileFor(design, format, current); }
    catch { /* A requested download displays the actionable error. */ }
  }
}

function schedulePreparation() {
  clearTimeout(preparing);
  preparing = setTimeout(prepareSelected, 180);
}

function renderPreviews() {
  if (!geometry) return;
  showError('');
  const current = state();
  document.querySelector('#ink-sample').style.backgroundColor = current.ink;
  updateSummary();
  try {
    for (const design of designs) {
      const layout = createLayout(geometry, { ...current, variant: design.variant, locationKey: design.set.key });
      layouts.set(design.id, layout);
      const card = document.querySelector(`[data-design="${design.id}"]`);
      // Preview and every export share the same paths and layout.
      card.querySelector('.stamp-preview').innerHTML = createSvg(layout)
        .replace(/<\?xml[^>]*>\s*/, '')
        .replace('id="stamp-title"', `id="stamp-title-${design.id}"`)
        .replace('aria-labelledby="stamp-title"', `aria-labelledby="stamp-title-${design.id}"`)
        .replace(/id="(wordmark|location|border|inner-border)"/g, (_, id) => `id="${id}-${design.id}"`);
      const size = STAMP_SPECS[design.variant];
      card.querySelector('.dimensions').innerHTML = `<strong>${size.widthMm / 10} × ${size.heightMm / 10} cm</strong><span>${size.widthMm} × ${size.heightMm} mm · Ratio ${size.ratio}</span>`;
      card.querySelector('.download-button').disabled = false;
    }
    cache.clear();
    schedulePreparation();
  } catch (error) { showError(error.message); }
}

function buildCards() {
  gallery.innerHTML = sets.map(set => `
    <header class="set-header" id="set-${set.id}"><h2>${set.caption}</h2>${set.key === 'jakarta' ? '' : `<span>${set.label}</span>`}</header>
    ${designs.filter(design => design.set === set).map(design => `
    <article class="stamp-card" data-design="${design.id}" data-variant="${design.variant}" data-location="${set.key}" aria-labelledby="title-${design.id}">
      <div class="card-header"><h3 id="title-${design.id}">${design.name}</h3><span class="card-number" aria-hidden="true">${String(designs.indexOf(design) + 1).padStart(2, '0')}</span></div>
      <div class="stamp-preview" role="img" aria-label="${design.name} Sweet Times stamp with ${set.caption} below"></div>
      <p class="dimensions"></p>
      <div class="download-area">
        <div class="select-field"><label class="visually-hidden" for="format-${design.id}">Download format for ${set.label} ${design.name}</label><select id="format-${design.id}" class="format-select">${formats.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
        <button type="button" class="download-button" aria-label="Download ${set.label} ${design.name} stamp">${downloadIcon}<span>Download</span></button>
      </div>
    </article>`).join('')}`).join('');
  gallery.setAttribute('aria-busy', 'false');
}

gallery.addEventListener('change', event => {
  if (event.target.matches('.format-select')) schedulePreparation();
});

gallery.addEventListener('click', async event => {
  const button = event.target.closest('.download-button');
  if (!button || button.disabled || !geometry) return;
  const card = button.closest('.stamp-card');
  const design = designsById.get(card.dataset.design);
  const format = card.querySelector('select').value;
  const current = state();
  const key = cacheKey(design, format, current);
  showError('');
  // A cached file downloads synchronously in the original tap event.
  if (cache.has(key)) {
    const file = cache.get(key);
    downloadBlob(file.blob, file.filename);
    flash(`${design.set.label} · ${design.name} · ${formats.find(([value]) => value === format)[1]}`);
    return;
  }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.querySelector('span').textContent = 'Preparing…';
  try {
    const file = await fileFor(design, format, current);
    downloadBlob(file.blob, file.filename);
    flash(`${design.set.label} · ${design.name} · ${formats.find(([value]) => value === format)[1]}`);
  } catch (error) {
    showError(`Could not download the file. ${error.message}`);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.querySelector('span').textContent = 'Download';
  }
});

form.addEventListener('submit', event => event.preventDefault());
for (const input of [inkInput, borderInput]) input.addEventListener('input', renderPreviews);
pixelInput.addEventListener('change', () => { updateSummary(); cache.clear(); schedulePreparation(); });
checkerboard.addEventListener('change', () => gallery.classList.toggle('checkerboard', checkerboard.checked));
document.querySelector('#reset').addEventListener('click', () => {
  form.reset();
  gallery.classList.remove('checkerboard');
  renderPreviews();
});

try {
  geometry = await loadGeometry();
  buildCards();
  renderPreviews();
} catch (error) {
  gallery.innerHTML = '';
  gallery.setAttribute('aria-busy', 'false');
  showError(error.message);
}
