import { loadGeometry, createLayout, createSvg, createPdf, createRaster, downloadBlob } from './export-engine.js';

const variants = [
  { id: 'borderless', name: 'Borderless' },
  { id: 'rectangle', name: 'Rectangle' },
  { id: 'rounded', name: 'Rounded rectangle' },
  { id: 'oval', name: 'Oval' },
  { id: 'double-oval', name: 'Double oval' },
];
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
const widthInput = document.querySelector('#width');
const inkInput = document.querySelector('#ink');
const dpiInput = document.querySelector('#dpi');
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
  return { widthMm: Number(widthInput.value), ink: inkInput.value, borderMm: Number(borderInput.value), dpi: Number(dpiInput.value) };
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
  document.querySelector('#settings-summary').textContent = `${widthInput.value} mm · ${inkInput.selectedOptions[0].textContent} · ${dpiInput.value} DPI`;
}

function filename(variant, format, current, layout) {
  const width = String(current.widthMm).replace('.', '-');
  const ink = { '#171717': 'black', '#193f69': 'blue', '#9b3037': 'red' }[current.ink] || current.ink.slice(1);
  const base = `sweet-times-${variant}-${width}mm-${ink}`;
  if (format === 'svg' || format === 'pdf') return `${base}.${format}`;
  if (format === 'jpg') return `${base}-${current.dpi}dpi-white.jpg`;
  return `${base}-${current.dpi}dpi-${format === 'png-white' ? 'white' : 'transparent'}.png`;
}

function cacheKey(variant, format, current) {
  return [variant, format, current.widthMm, current.ink, current.borderMm, current.dpi].join('|');
}

async function fileFor(variant, format, current) {
  const key = cacheKey(variant, format, current);
  if (cache.has(key)) return cache.get(key);
  const layout = createLayout(geometry, { ...current, variant });
  let blob;
  if (format === 'svg') blob = new Blob([createSvg(layout)], { type: 'image/svg+xml' });
  else if (format === 'pdf') blob = new Blob([createPdf(layout)], { type: 'application/pdf' });
  else blob = await createRaster(layout, { type: format === 'jpg' ? 'jpeg' : 'png', background: format === 'png-transparent' ? 'transparent' : 'white', dpi: current.dpi });
  const file = { blob, filename: filename(variant, format, current, layout) };
  cache.set(key, file);
  return file;
}

// Preparing the selected files before a tap preserves the user gesture for iOS downloads.
async function prepareSelected() {
  const ticket = ++generation;
  if (!geometry || !widthInput.checkValidity()) return;
  const current = state();
  for (const variant of variants) {
    if (ticket !== generation) return;
    const card = document.querySelector(`[data-variant="${variant.id}"]`);
    const format = card.querySelector('select').value;
    try { await fileFor(variant.id, format, current); }
    catch { /* A requested download displays the actionable error. */ }
  }
}

function schedulePreparation() {
  clearTimeout(preparing);
  preparing = setTimeout(prepareSelected, 180);
}

function renderPreviews() {
  if (!geometry) return;
  if (!widthInput.checkValidity()) {
    showError('Choose a width from 20 to 100 mm, in 0.5 mm steps.');
    document.querySelectorAll('.download-button').forEach(button => { button.disabled = true; });
    return;
  }
  showError('');
  const current = state();
  document.querySelector('#ink-sample').style.backgroundColor = current.ink;
  updateSummary();
  try {
    for (const variant of variants) {
      const layout = createLayout(geometry, { ...current, variant: variant.id });
      layouts.set(variant.id, layout);
      const card = document.querySelector(`[data-variant="${variant.id}"]`);
      // Preview and every export share the same paths and layout.
      card.querySelector('.stamp-preview').innerHTML = createSvg(layout)
        .replace(/<\?xml[^>]*>\s*/, '')
        .replace('id="stamp-title"', `id="stamp-title-${variant.id}"`)
        .replace('aria-labelledby="stamp-title"', `aria-labelledby="stamp-title-${variant.id}"`)
        .replace(/id="(wordmark|location|border|inner-border)"/g, (_, id) => `id="${id}-${variant.id}"`);
      card.querySelector('.dimensions').textContent = `${current.widthMm} × ${layout.heightMm.toFixed(1)} mm`;
      card.querySelector('.download-button').disabled = false;
    }
    cache.clear();
    schedulePreparation();
  } catch (error) { showError(error.message); }
}

function buildCards() {
  gallery.innerHTML = variants.map((variant, index) => `
    <article class="stamp-card" data-variant="${variant.id}" aria-labelledby="title-${variant.id}">
      <div class="card-header"><h2 id="title-${variant.id}">${variant.name}</h2><span class="card-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div>
      <div class="stamp-preview" role="img" aria-label="${variant.name} Sweet Times stamp with JAKARTA below"></div>
      <p class="dimensions"></p>
      <div class="download-area">
        <div class="select-field"><label class="visually-hidden" for="format-${variant.id}">Download format for ${variant.name}</label><select id="format-${variant.id}" class="format-select">${formats.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
        <button type="button" class="download-button" aria-label="Download ${variant.name} stamp">${downloadIcon}<span>Download</span></button>
      </div>
    </article>`).join('');
  gallery.setAttribute('aria-busy', 'false');
}

gallery.addEventListener('change', event => {
  if (event.target.matches('.format-select')) schedulePreparation();
});

gallery.addEventListener('click', async event => {
  const button = event.target.closest('.download-button');
  if (!button || button.disabled || !geometry) return;
  const card = button.closest('.stamp-card');
  const variant = card.dataset.variant;
  const format = card.querySelector('select').value;
  const current = state();
  const key = cacheKey(variant, format, current);
  showError('');
  // A cached file downloads synchronously in the original tap event.
  if (cache.has(key)) {
    const file = cache.get(key);
    downloadBlob(file.blob, file.filename);
    flash(`${card.querySelector('h2').textContent} · ${formats.find(([value]) => value === format)[1]}`);
    return;
  }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.querySelector('span').textContent = 'Preparing…';
  try {
    const file = await fileFor(variant, format, current);
    downloadBlob(file.blob, file.filename);
    flash(`${card.querySelector('h2').textContent} · ${formats.find(([value]) => value === format)[1]}`);
  } catch (error) {
    showError(`Could not download the file. ${error.message}`);
  } finally {
    button.disabled = !widthInput.checkValidity();
    button.removeAttribute('aria-busy');
    button.querySelector('span').textContent = 'Download';
  }
});

form.addEventListener('submit', event => event.preventDefault());
for (const input of [widthInput, inkInput, borderInput]) input.addEventListener('input', renderPreviews);
dpiInput.addEventListener('change', () => { updateSummary(); cache.clear(); schedulePreparation(); });
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
