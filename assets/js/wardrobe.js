// ─── Wardrobe page – add & manage clothing items ───────────────────────────────
import { requireAuth, showToast, openModal, closeModal, bindModalClose } from './auth.js';
import { getClothes, addClothing, deleteClothing, uploadClothingImage } from './supabase.js';
import { classifyClothing } from './gemini.js';

// ── State ─────────────────────────────────────────────────────────────────────
let user     = null;
let wardrobe = [];
let activeFilter = 'all';

// Upload modal state
let uploadFile    = null;
let uploadBase64  = null;
let uploadMime    = 'image/jpeg';
let classifyResult = null;

const CATS = [
  { id: 'all',   label: 'Todos',   icon: '👔' },
  { id: 'head',  label: 'Cabeza',  icon: '🎩' },
  { id: 'torso', label: 'Tronco',  icon: '👕' },
  { id: 'legs',  label: 'Piernas', icon: '👖' },
  { id: 'feet',  label: 'Pies',    icon: '👟' },
];

const CAT_LABELS = { head: 'Cabeza', torso: 'Tronco', legs: 'Piernas', feet: 'Pies' };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  user = await requireAuth();
  wardrobe = await getClothes().catch(() => []);
  renderFilterBar();
  renderGrid();
  setupEvents();
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  bar.innerHTML = CATS.map(c => `
    <button class="filter-chip${c.id === activeFilter ? ' active' : ''}" data-filter="${c.id}">
      ${c.icon} ${c.label}
    </button>`).join('');
  bar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      bar.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderGrid();
    });
  });
}

// ── Clothes grid ──────────────────────────────────────────────────────────────
function renderGrid() {
  const grid  = document.getElementById('clothes-grid');
  const empty = document.getElementById('empty-state');
  if (!grid) return;

  const items = activeFilter === 'all' ? wardrobe : wardrobe.filter(w => w.category === activeFilter);

  if (items.length === 0) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  grid.innerHTML = items.map(item => wardrobeCardHTML(item)).join('');

  grid.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(btn.dataset.id, btn.dataset.path);
    });
  });
}

function wardrobeCardHTML(item) {
  const imgEl = item.image_url
    ? `<img src="${item.image_url}" alt="${escHTML(item.name || '')}" loading="lazy">`
    : `<span>${catEmoji(item.category)}</span>`;

  const dots = Array.from({ length: 5 }, (_, i) =>
    `<span class="formality-dot${i < (item.formality || 3) ? ' filled' : ''}"></span>`
  ).join('');

  return `
    <div class="wardrobe-card">
      <div class="card-img">${imgEl}</div>
      <div class="card-info">
        <div class="card-name">${escHTML(item.name || item.subcategory || '–')}</div>
        <div class="card-sub">${escHTML(CAT_LABELS[item.category] || item.category)} · ${escHTML(item.subcategory || '')}</div>
        <div class="formality-dots">${dots}</div>
      </div>
      <button class="btn-delete" data-id="${item.id}" data-path="${item.storage_path || ''}" title="Eliminar">✕</button>
    </div>`;
}

function catEmoji(cat) {
  return { head: '🎩', torso: '👕', legs: '👖', feet: '👟' }[cat] || '👔';
}

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(id, storagePath) {
  const item = wardrobe.find(w => w.id === id);
  const name = item?.name || item?.subcategory || 'esta prenda';

  if (!confirm(`¿Eliminar "${name}" de tu armario?`)) return;
  doDelete(id, storagePath);
}

async function doDelete(id, storagePath) {
  try {
    await deleteClothing(id, storagePath);
    wardrobe = wardrobe.filter(w => w.id !== id);
    renderGrid();
    showToast('Prenda eliminada', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function openUploadModal() {
  resetUploadModal();
  openModal('modal-upload');
}

function resetUploadModal() {
  uploadFile    = null;
  uploadBase64  = null;
  classifyResult = null;

  const preview = document.getElementById('img-preview');
  const placeholder = document.getElementById('upload-placeholder');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  if (placeholder) placeholder.classList.remove('hidden');

  document.getElementById('classify-result')?.classList.add('hidden');
  document.getElementById('ai-loading')?.classList.add('hidden');
  document.getElementById('btn-save-clothing')?.setAttribute('disabled', '');

  // Reset form fields
  setField('field-name', '');
  setField('field-subcategory', '');
  setField('field-formality', 3);
  setField('field-colors', '');
  document.querySelectorAll('input[name="cat-radio"]').forEach(r => { r.checked = r.value === 'torso'; });
  updateFormalityLabel(3);
}

// ── File selection ────────────────────────────────────────────────────────────
async function handleFileSelected(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Por favor selecciona una imagen', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('La imagen es demasiado grande (máx. 10 MB)', 'error');
    return;
  }

  uploadFile = file;
  uploadMime = file.type;

  // Show preview
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    uploadBase64  = dataUrl.split(',')[1];

    const preview = document.getElementById('img-preview');
    const placeholder = document.getElementById('upload-placeholder');
    if (preview) { preview.src = dataUrl; preview.classList.remove('hidden'); }
    if (placeholder) placeholder.classList.add('hidden');

    // Auto-classify
    await classifyImage();
  };
  reader.readAsDataURL(file);
}

async function classifyImage() {
  if (!uploadBase64) return;
  const loadingEl = document.getElementById('ai-loading');
  const resultEl  = document.getElementById('classify-result');
  const saveBtn   = document.getElementById('btn-save-clothing');

  loadingEl?.classList.remove('hidden');
  resultEl?.classList.add('hidden');

  try {
    classifyResult = await classifyClothing(uploadBase64, uploadMime);
    fillClassifyForm(classifyResult);
    resultEl?.classList.remove('hidden');
    saveBtn?.removeAttribute('disabled');
  } catch (err) {
    showToast(`IA: ${err.message}`, 'error');
    // Let user fill manually
    resultEl?.classList.remove('hidden');
    saveBtn?.removeAttribute('disabled');
  } finally {
    loadingEl?.classList.add('hidden');
  }
}

function fillClassifyForm(result) {
  setField('field-name', result.name || '');
  setField('field-subcategory', result.subcategory || '');
  setField('field-formality', result.formality ?? 3);
  setField('field-colors', (result.colors || []).join(', '));
  updateFormalityLabel(result.formality ?? 3);

  const cat = result.category || 'torso';
  const radio = document.querySelector(`input[name="cat-radio"][value="${cat}"]`);
  if (radio) radio.checked = true;
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function updateFormalityLabel(val) {
  const labels = ['', 'Muy casual', 'Casual', 'Neutro', 'Semiformal', 'Formal'];
  const badge = document.getElementById('formality-label');
  if (badge) badge.textContent = `${val} – ${labels[val] || val}`;
}

// ── Save clothing ─────────────────────────────────────────────────────────────
async function saveClothing() {
  if (!uploadFile) { showToast('Selecciona una imagen', 'error'); return; }

  const name     = document.getElementById('field-name')?.value.trim() || '';
  const subcat   = document.getElementById('field-subcategory')?.value.trim() || 'prenda';
  const formality = parseInt(document.getElementById('field-formality')?.value || '3');
  const colorsRaw = document.getElementById('field-colors')?.value || '';
  const colors   = colorsRaw.split(',').map(c => c.trim()).filter(Boolean);
  const category = document.querySelector('input[name="cat-radio"]:checked')?.value || 'torso';

  const saveBtn = document.getElementById('btn-save-clothing');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Guardando…';

  try {
    const { path, publicUrl } = await uploadClothingImage(uploadFile, user.id);
    const newItem = await addClothing({
      user_id:      user.id,
      image_url:    publicUrl,
      storage_path: path,
      category,
      subcategory:  subcat,
      name:         name || subcat,
      formality,
      colors,
    });
    wardrobe.unshift(newItem);
    renderGrid();
    closeModal('modal-upload');
    showToast(`✅ "${newItem.name}" añadida al armario`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Guardar prenda';
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
function setupEvents() {
  // FAB add button
  document.getElementById('fab-add')?.addEventListener('click', openUploadModal);

  // Close modal
  bindModalClose('modal-upload');
  document.getElementById('btn-close-upload')?.addEventListener('click', () => closeModal('modal-upload'));

  // File input via click on preview area
  const fileInput = document.getElementById('file-input');
  document.getElementById('img-preview-wrap')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', e => handleFileSelected(e.target.files?.[0]));

  // Drag & drop
  const previewWrap = document.getElementById('img-preview-wrap');
  previewWrap?.addEventListener('dragover', e => { e.preventDefault(); previewWrap.style.borderColor = 'var(--primary)'; });
  previewWrap?.addEventListener('dragleave', () => { previewWrap.style.borderColor = ''; });
  previewWrap?.addEventListener('drop', e => {
    e.preventDefault();
    previewWrap.style.borderColor = '';
    handleFileSelected(e.dataTransfer.files?.[0]);
  });

  // Re-classify button
  document.getElementById('btn-reclassify')?.addEventListener('click', classifyImage);

  // Formality slider
  document.getElementById('field-formality')?.addEventListener('input', e => updateFormalityLabel(e.target.value));

  // Save button
  document.getElementById('btn-save-clothing')?.addEventListener('click', saveClothing);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

init();
