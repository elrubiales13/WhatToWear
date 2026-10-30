// ─── Favorites page – collections & saved outfits ──────────────────────────────
import { requireAuth, showToast, openModal, closeModal, bindModalClose } from './auth.js';
import {
  getCollections, createCollection, deleteCollection,
  getCollectionOutfits, removeOutfitFromCollection, deleteOutfit,
} from './supabase.js';

// ── State ─────────────────────────────────────────────────────────────────────
let user        = null;
let collections = [];
let currentCollection = null; // { id, name, emoji }
let currentOutfits    = [];

const EMOJIS = ['👔','👗','🧥','👘','🩱','🥻','🩲','👙','🧣','🧤','🧢','👒','💼','🎭','🌟','🔥','💎','🌿','☀️','🌙'];
let selectedEmoji = '👔';

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  user = await requireAuth();
  collections = await getCollections().catch(() => []);
  renderCollectionsView();
  setupEvents();
}

// ── View management ───────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

// ── Collections list ──────────────────────────────────────────────────────────
function renderCollectionsView() {
  showView('view-collections');
  updateBreadcrumb(false);

  const grid  = document.getElementById('collections-grid');
  const empty = document.getElementById('empty-collections');
  if (!grid) return;

  if (collections.length === 0) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  grid.innerHTML = collections.map(col => collectionCardHTML(col)).join('');

  grid.querySelectorAll('.collection-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-col')) return;
      openCollection(card.dataset.id);
    });
  });
  grid.querySelectorAll('.btn-delete-col').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteCollection(btn.dataset.id, btn.dataset.name);
    });
  });
}

function collectionCardHTML(col) {
  return `
    <div class="collection-card" data-id="${col.id}">
      <div class="collection-cover">
        <div class="cover-placeholder">${col.emoji}</div>
      </div>
      <div class="collection-info">
        <div class="collection-name">${escHTML(col.name)}</div>
        <div class="collection-count">Ver outfits</div>
      </div>
      <button class="btn-delete-col" data-id="${col.id}" data-name="${escAttr(col.name)}" title="Eliminar colección">✕</button>
    </div>`;
}

async function openCollection(colId) {
  currentCollection = collections.find(c => c.id === colId);
  if (!currentCollection) return;

  currentOutfits = await getCollectionOutfits(colId).catch(() => []);
  renderOutfitsView();
}

// ── Outfits view ──────────────────────────────────────────────────────────────
function renderOutfitsView() {
  showView('view-outfits');
  updateBreadcrumb(true);

  const grid  = document.getElementById('outfits-grid');
  const empty = document.getElementById('empty-outfits');
  if (!grid) return;

  if (currentOutfits.length === 0) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  grid.innerHTML = currentOutfits.map(outfit => outfitCardHTML(outfit)).join('');

  grid.querySelectorAll('.btn-remove-outfit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmRemoveOutfit(btn.dataset.outfitId);
    });
  });
}

function outfitCardHTML(outfit) {
  const isDressTorso = Boolean(
    outfit.torso && (
      (outfit.torso.subcategory || '').toLowerCase().includes('vestido') ||
      (outfit.torso.name || '').toLowerCase().includes('vestido')
    )
  );

  const pieces = [
    { cat: 'head',  item: outfit.head,  icon: '🎩' },
    { cat: 'torso', item: outfit.torso, icon: isDressTorso ? '👗' : '👕' },
    { cat: 'legs',  item: outfit.legs,  icon: isDressTorso ? '👗' : '👖' },
    { cat: 'feet',  item: outfit.feet,  icon: '👟' },
  ];

  const cells = pieces.map(p => {
    if (p.item?.image_url) {
      return `<div class="outfit-cell"><img src="${p.item.image_url}" alt="${escHTML(p.item.name || '')}" loading="lazy"></div>`;
    }
    return `<div class="outfit-cell" title="${p.cat === 'legs' && isDressTorso ? 'Cubierto por vestido' : ''}">${p.icon}</div>`;
  }).join('');

  return `
    <div class="outfit-card" data-id="${outfit.id}">
      <div class="outfit-grid">${cells}</div>
      <div class="outfit-name">${escHTML(outfit.name || 'Outfit guardado')}</div>
      <button class="btn-remove-outfit" data-outfit-id="${outfit.id}" title="Quitar de favoritos">✕</button>
    </div>`;
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function updateBreadcrumb(inCollection) {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  if (!inCollection) {
    bc.innerHTML = `<span class="crumb-current">❤️ Favoritos</span>`;
  } else {
    bc.innerHTML = `
      <button class="crumb-link" id="btn-back-collections">❤️ Favoritos</button>
      <span class="crumb-sep">›</span>
      <span class="crumb-current">${currentCollection?.emoji || ''} ${escHTML(currentCollection?.name || '')}</span>`;
    document.getElementById('btn-back-collections')?.addEventListener('click', () => {
      currentCollection = null;
      renderCollectionsView();
    });
  }
}

// ── Delete / remove ───────────────────────────────────────────────────────────
function confirmDeleteCollection(id, name) {
  if (!confirm(`¿Eliminar la colección "${name}"? Los outfits no se borrarán.`)) return;
  doDeleteCollection(id);
}

async function doDeleteCollection(id) {
  try {
    await deleteCollection(id);
    collections = collections.filter(c => c.id !== id);
    renderCollectionsView();
    showToast('Colección eliminada', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmRemoveOutfit(outfitId) {
  if (!currentCollection) return;
  if (!confirm('¿Quitar este outfit de la colección?')) return;
  doRemoveOutfit(outfitId);
}

async function doRemoveOutfit(outfitId) {
  try {
    await removeOutfitFromCollection(currentCollection.id, outfitId);
    currentOutfits = currentOutfits.filter(o => o.id !== outfitId);
    renderOutfitsView();
    showToast('Outfit eliminado de la colección', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Create collection modal ───────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById('new-col-name')?.focus?.();
  document.getElementById('new-col-name') && (document.getElementById('new-col-name').value = '');
  selectedEmoji = '👔';
  renderEmojiPicker();
  openModal('modal-new-col');
}

function renderEmojiPicker() {
  const grid = document.getElementById('emoji-picker');
  if (!grid) return;
  grid.innerHTML = EMOJIS.map(e => `
    <button class="emoji-btn${e === selectedEmoji ? ' selected' : ''}" data-emoji="${e}">${e}</button>
  `).join('');
  grid.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedEmoji = btn.dataset.emoji;
      grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.toggle('selected', b === btn));
    });
  });
}

async function handleCreateCollection() {
  const name = document.getElementById('new-col-name')?.value.trim();
  if (!name) { showToast('Escribe un nombre', 'error'); return; }

  const saveBtn = document.getElementById('btn-create-col');
  saveBtn.disabled = true;
  saveBtn.textContent = '…';

  try {
    const col = await createCollection(name, selectedEmoji);
    collections.unshift(col);
    closeModal('modal-new-col');
    renderCollectionsView();
    showToast(`✅ Colección "${col.name}" creada`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Crear colección';
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('btn-new-collection')?.addEventListener('click', openCreateModal);

  bindModalClose('modal-new-col');
  document.getElementById('btn-close-new-col')?.addEventListener('click', () => closeModal('modal-new-col'));
  document.getElementById('btn-create-col')?.addEventListener('click', handleCreateCollection);

  document.getElementById('new-col-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleCreateCollection();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escAttr(str) { return escHTML(str); }

init();
