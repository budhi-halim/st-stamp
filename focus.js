import { loadGeometry, createLayout, createSvg, createPdf, createRaster, rasterDimensions, downloadBlob } from './export-engine.js?v=focus-1';

const levels = [
  { id: 'original', label: 'Original', wordmarkScale: 1, note: 'Original proportions.' },
  { id: 'level-2', label: 'Level 2', wordmarkScale: 1.1, note: 'Sweet Times +10% relative to the lower line.' },
  { id: 'level-3', label: 'Level 3', wordmarkScale: 1.2, note: 'Sweet Times +20% relative to the lower line.' },
  { id: 'level-4', label: 'Level 4', wordmarkScale: 1.3, note: 'Sweet Times +30% relative to the lower line.' },
];
const weights = [{ key: 'standard', label: 'Standard' }, { key: 'bold', label: 'Bold' }];
const designs = levels.flatMap(level => weights.map(weight => ({ id: `${level.id}-${weight.key}`, level, weight })));
const designsById = new Map(designs.map(design => [design.id, design]));
const fixedOptions = Object.freeze({ variant: 'borderless', sizeId: 'rect-40x13', locationKey: 'hyphen', divider: true });
const fixedSize = Object.freeze({ widthMm: 40, heightMm: 13 });
const formats = [['svg', 'SVG · vector'], ['pdf', 'PDF · vector'], ['png-transparent', 'PNG · transparent'], ['png-white', 'PNG · white'], ['jpg', 'JPG · white']];
const downloadIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5v10m-3.5-3.5L10 12.5l3.5-3.5M3.5 13v3.5h13V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const gallery = document.querySelector('#gallery');
const form = document.querySelector('#settings');
const inkInput = document.querySelector('#ink');
const pixelInput = document.querySelector('#pixel-width');
const checkerboard = document.querySelector('#checkerboard');
const errorMessage = document.querySelector('#page-error');
const toast = document.querySelector('#toast');
const cache = new Map();
let geometry;
let toastTimeout;
let preparing;
let generation = 0;

function state() {
  return { ink: inkInput.value, pixelWidth: Number(pixelInput.value) };
}

function optionsFor(design, current) {
  return { ...current, ...fixedOptions, weightKey: design.weight.key, wordmarkScale: design.level.wordmarkScale };
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
  const ink = { '#171717': 'black', '#193f69': 'blue', '#9b3037': 'red' }[current.ink] || current.ink.slice(1);
  const proportion = `relative-${Math.round(design.level.wordmarkScale * 100)}`;
  const base = `sweet-times-jakarta-indonesia-hyphen-borderless-divider-${design.id}-${proportion}-40x13mm-${ink}`;
  if (format === 'svg' || format === 'pdf') return `${base}.${format}`;
  const pixels = rasterDimensions(fixedSize, current.pixelWidth);
  if (format === 'jpg') return `${base}-${pixels.width}x${pixels.height}px-white.jpg`;
  return `${base}-${pixels.width}x${pixels.height}px-${format === 'png-white' ? 'white' : 'transparent'}.png`;
}

function cacheKey(design, format, current) {
  return [design.id, design.level.wordmarkScale, design.weight.key, fixedOptions.sizeId, format, current.ink, current.pixelWidth].join('|');
}

async function fileFor(design, format, current) {
  const key = cacheKey(design, format, current);
  if (cache.has(key)) return cache.get(key);
  // Capture the selected settings before awaiting raster rendering.
  const layout = createLayout(geometry, optionsFor(design, current));
  const name = filename(design, format, current);
  let blob;
  if (format === 'svg') blob = new Blob([createSvg(layout)], { type: 'image/svg+xml' });
  else if (format === 'pdf') blob = new Blob([createPdf(layout)], { type: 'application/pdf' });
  else blob = await createRaster(layout, { type: format === 'jpg' ? 'jpeg' : 'png', background: format === 'png-transparent' ? 'transparent' : 'white', pixelWidth: current.pixelWidth });
  const file = { blob, filename: name };
  cache.set(key, file);
  return file;
}

// Preload each selected format so mobile downloads can keep the tap gesture.
async function prepareSelected(ticket) {
  if (!geometry) return;
  const current = state();
  for (const design of designs) {
    if (ticket !== generation) return;
    const card = document.querySelector(`[data-design="${design.id}"]`);
    const format = card.querySelector('.format-select').value;
    try { await fileFor(design, format, current); }
    catch { /* The download button displays an actionable error. */ }
  }
}

function schedulePreparation() {
  clearTimeout(preparing);
  const ticket = ++generation;
  preparing = setTimeout(() => prepareSelected(ticket), 180);
}

function renderPreviews() {
  if (!geometry) return;
  showError('');
  const current = state();
  document.querySelector('#ink-sample').style.backgroundColor = current.ink;
  updateSummary();
  try {
    for (const design of designs) {
      const card = document.querySelector(`[data-design="${design.id}"]`);
      const layout = createLayout(geometry, optionsFor(design, current));
      // Previews and all five exports use this same vector layout.
      card.querySelector('.stamp-preview').innerHTML = createSvg(layout)
        .replace(/<\?xml[^>]*>\s*/, '')
        .replace('id="stamp-title"', `id="stamp-title-${design.id}"`)
        .replace('aria-labelledby="stamp-title"', `aria-labelledby="stamp-title-${design.id}"`)
        .replace(/id="(wordmark|location|border|inner-border|divider)"/g, (_, id) => `id="${id}-${design.id}"`);
      const button = card.querySelector('.download-button');
      if (button.getAttribute('aria-busy') !== 'true') button.disabled = false;
    }
    cache.clear();
    schedulePreparation();
  } catch (error) { showError(error.message); }
}

function buildCards() {
  gallery.innerHTML = levels.map(level => `
    <section class="focus-level" id="${level.id}" aria-labelledby="heading-${level.id}">
      <header class="focus-level-header"><h2 id="heading-${level.id}">${level.label}</h2><p>${level.note}</p></header>
      <div class="focus-pair">${designs.filter(design => design.level === level).map(design => `
        <article class="stamp-card" data-design="${design.id}" data-variant="borderless" data-location="hyphen" data-divider="true" data-size="rect-40x13" data-weight="${design.weight.key}" data-wordmark-scale="${level.wordmarkScale}" aria-labelledby="title-${design.id}">
          <div class="card-header"><h3 id="title-${design.id}">${design.weight.label}</h3><span class="card-number" aria-hidden="true">${String(designs.indexOf(design) + 1).padStart(2, '0')}</span></div>
          <div class="stamp-preview" role="img" aria-label="${level.label}, ${design.weight.label} Sweet Times stamp, JAKARTA - INDONESIA, borderless with divider, 40 by 13 millimetres"></div>
          <p class="dimensions"><strong>40 × 13 mm</strong><span>4 × 1.3 cm · Ratio 40:13</span></p>
          <div class="download-area">
            <div class="select-field"><label class="visually-hidden" for="format-${design.id}">Download format for ${level.label} ${design.weight.label} 40 × 13 mm</label><select id="format-${design.id}" class="format-select">${formats.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
            <button type="button" class="download-button" disabled aria-label="Download ${level.label} ${design.weight.label} 40 × 13 mm stamp">${downloadIcon}<span>Download</span></button>
          </div>
        </article>`).join('')}
      </div>
    </section>`).join('');
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
  const format = card.querySelector('.format-select').value;
  const current = state();
  const key = cacheKey(design, format, current);
  const message = `${design.level.label} · ${design.weight.label} · ${formats.find(([value]) => value === format)[1]}`;
  showError('');
  // Cached files download synchronously in the original tap event.
  if (cache.has(key)) {
    try {
      const file = cache.get(key);
      downloadBlob(file.blob, file.filename);
      flash(message);
    } catch (error) { showError(`Could not download the file. ${error.message}`); }
    return;
  }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.querySelector('span').textContent = 'Preparing…';
  try {
    const file = await fileFor(design, format, current);
    downloadBlob(file.blob, file.filename);
    flash(message);
  } catch (error) {
    showError(`Could not download the file. ${error.message}`);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.querySelector('span').textContent = 'Download';
  }
});

form.addEventListener('submit', event => event.preventDefault());
inkInput.addEventListener('input', renderPreviews);
pixelInput.addEventListener('change', () => { updateSummary(); cache.clear(); schedulePreparation(); });
checkerboard.addEventListener('change', () => gallery.classList.toggle('checkerboard', checkerboard.checked));
document.querySelector('#reset-settings').addEventListener('click', () => {
  form.reset();
  gallery.classList.remove('checkerboard');
  renderPreviews();
});

try {
  geometry = await loadGeometry();
  buildCards();
  renderPreviews();
  if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }));
} catch (error) {
  gallery.innerHTML = '';
  gallery.setAttribute('aria-busy', 'false');
  showError(error.message);
}
