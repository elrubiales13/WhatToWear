// ─── Home page – carousels, outfit generation, AI chat ────────────────────────
import { requireAuth, showToast, openModal, closeModal, bindModalClose } from './auth.js';
import {
  getClothes, saveOutfit, addOutfitToCollection,
  getCollections, createCollection,
} from './supabase.js';
import { generateOutfitFromDescription } from './gemini.js';

// ── State ─────────────────────────────────────────────────────────────────────
let user     = null;
let wardrobe = [];
let selection = { head: null, torso: null, legs: null, feet: null };

const CATS = [
  { id: 'head',  label: 'Cabeza',  icon: '🎩', hint: 'Añade gorras o sombreros a tu <a href="wardrobe.html">armario</a>' },
  { id: 'torso', label: 'Tronco',  icon: '👕', hint: 'Añade camisetas o camisas a tu <a href="wardrobe.html">armario</a>' },
  { id: 'legs',  label: 'Piernas', icon: '👖', hint: 'Añade pantalones a tu <a href="wardrobe.html">armario</a>' },
  { id: 'feet',  label: 'Pies',    icon: '👟', hint: 'Añade zapatos a tu <a href="wardrobe.html">armario</a>' },
];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  user = await requireAuth();
  wardrobe = await getClothes().catch(() => []);
  renderCarousels();
  setupEvents();
}

// ── Carousels ─────────────────────────────────────────────────────────────────
function renderCarousels() {
  CATS.forEach(cat => {
    const items = wardrobe.filter(w => w.category === cat.id);
    const track = document.getElementById(`track-${cat.id}`);
    const countEl = document.getElementById(`count-${cat.id}`);
    if (!track) return;

    if (countEl) countEl.textContent = items.length ? `${items.length} prenda${items.length > 1 ? 's' : ''}` : '';

    if (items.length === 0) {
      track.innerHTML = `<div class="carousel-empty">${cat.hint}</div>`;
      return;
    }

    track.innerHTML = items.map(item => clothingCardHTML(item)).join('');
    track.querySelectorAll('.clothing-card').forEach(card => {
      card.addEventListener('click', () => toggleCard(card, cat.id));
    });
  });
}

function clothingCardHTML(item) {
  const imgEl = item.image_url
    ? `<img src="${item.image_url}" alt="${item.name || ''}" loading="lazy">`
    : `<span>${catEmoji(item.category)}</span>`;
  return `
    <div class="clothing-card" data-id="${item.id}" data-formality="${item.formality || 3}">
      <div class="card-img">${imgEl}</div>
      <div class="card-label">${item.name || item.subcategory || '–'}</div>
    </div>`;
}

function catEmoji(cat) {
  return { head: '🎩', torso: '👕', legs: '👖', feet: '👟' }[cat] || '👔';
}

function toggleCard(card, catId) {
  const id = card.dataset.id;
  const track = document.getElementById(`track-${catId}`);

  if (selection[catId] === id) {
    // Deselect
    card.classList.remove('selected');
    selection[catId] = null;
  } else {
    // Select (deselect previous first)
    track.querySelectorAll('.clothing-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selection[catId] = id;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  updateFAB();
}

function updateFAB() {
  const fab = document.getElementById('fab-heart');
  const hasAny = Object.values(selection).some(Boolean);
  fab?.classList.toggle('hidden', !hasAny);
}

// ── Apply outfit (set selection by IDs + scroll to card) ─────────────────────
function applyOutfit(ids) {
  // Clear all selections
  document.querySelectorAll('.clothing-card.selected').forEach(c => c.classList.remove('selected'));
  selection = { head: null, torso: null, legs: null, feet: null };

  Object.entries(ids).forEach(([cat, id]) => {
    if (!id || !['head', 'torso', 'legs', 'feet'].includes(cat)) return;
    const card = document.querySelector(`#track-${cat} .clothing-card[data-id="${id}"]`);
    if (card) {
      card.classList.add('selected');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    selection[cat] = id;
  });
  updateFAB();
}

// ── Random outfit (formality-aware) ──────────────────────────────────────────
function generateRandom() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generando…';

  // Determine target formality from a random torso pick
  const torsoPool = wardrobe.filter(w => w.category === 'torso');
  const refItem = torsoPool[Math.floor(Math.random() * torsoPool.length)];
  const targetF = refItem ? (refItem.formality || 3) : 3;

  const ids = {};
  CATS.forEach(cat => {
    const pool = wardrobe.filter(w => w.category === cat.id);
    if (!pool.length) return;
    // Sort by closeness to target formality
    const sorted = [...pool].sort((a, b) =>
      Math.abs((a.formality || 3) - targetF) - Math.abs((b.formality || 3) - targetF)
    );
    // Pick randomly among the 3 closest
    const top = sorted.slice(0, Math.min(3, sorted.length));
    ids[cat.id] = top[Math.floor(Math.random() * top.length)].id;
  });

  applyOutfit(ids);

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = '✨ Generar outfit';
  }, 400);
}

// ── AI outfit ────────────────────────────────────────────────────────────────
async function handleAiOutfit() {
  const textarea = document.getElementById('outfit-prompt');
  const prompt = textarea.value.trim();
  if (!prompt) { textarea.focus(); return; }

  const sendBtn = document.getElementById('btn-send');
  const explEl  = document.getElementById('ai-explanation');
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span>';
  explEl.classList.add('hidden');

  try {
    const result = await generateOutfitFromDescription(prompt, wardrobe);
    applyOutfit(result);
    if (result.explanation) {
      explEl.textContent = `💬 ${result.explanation}`;
      explEl.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = sendIconSVG();
  }
}

function sendIconSVG() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
}

// ── Save to favorites ─────────────────────────────────────────────────────────
let _collections = [];

async function openSaveModal() {
  _collections = await getCollections().catch(() => []);
  renderCollectionList();
  openModal('modal-save');
}

function renderCollectionList() {
  const listEl = document.getElementById('modal-collection-list');
  if (!listEl) return;

  if (_collections.length === 0) {
    listEl.innerHTML = `<p class="text-muted text-sm" style="padding:8px 0">No tienes colecciones aún. Crea una abajo.</p>`;
    return;
  }
  listEl.innerHTML = _collections.map(c => `
    <button class="collection-item-btn" data-id="${c.id}" data-name="${escapeAttr(c.name)}">
      <span class="col-emoji">${c.emoji}</span>
      <span>${escapeHTML(c.name)}</span>
    </button>`).join('');

  listEl.querySelectorAll('.collection-item-btn').forEach(btn => {
    btn.addEventListener('click', () => saveCurrentOutfit(btn.dataset.id, btn.dataset.name));
  });
}

async function saveCurrentOutfit(collectionId, collectionName) {
  const hasAny = Object.values(selection).some(Boolean);
  if (!hasAny) { showToast('Selecciona al menos una prenda', 'error'); return; }

  try {
    const outfit = await saveOutfit({
      user_id: user.id,
      head_id:  selection.head  || null,
      torso_id: selection.torso || null,
      legs_id:  selection.legs  || null,
      feet_id:  selection.feet  || null,
      name:     `Outfit ${new Date().toLocaleDateString('es-ES')}`,
    });
    await addOutfitToCollection(collectionId, outfit.id);
    closeModal('modal-save');
    showToast(`❤️ Guardado en "${collectionName}"`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function createAndSave() {
  const nameInput = document.getElementById('new-col-name');
  const name = nameInput?.value.trim();
  if (!name) { showToast('Escribe un nombre para la colección', 'error'); return; }

  try {
    const col = await createCollection(name, selectedEmoji);
    _collections.unshift(col);
    renderCollectionList();
    nameInput.value = '';
    await saveCurrentOutfit(col.id, col.name);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Emoji selection for new collection
const EMOJIS = ['👔','👗','🧥','👘','🩱','🥻','🩲','👙','🧣','🧤','🧢','👒','💼','🎭','🌟','🔥','💎','🌿','☀️','🌙'];
let selectedEmoji = '👔';

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

// ── Carousel nav buttons ──────────────────────────────────────────────────────
function setupCarouselNav() {
  document.querySelectorAll('.carousel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const trackId = btn.dataset.track;
      const track = document.getElementById(trackId);
      if (!track) return;
      const scroll = track.clientWidth * 0.75;
      track.scrollBy({ left: btn.classList.contains('prev') ? -scroll : scroll, behavior: 'smooth' });
    });
  });
}

// ── Events ────────────────────────────────────────────────────────────────────
function setupEvents() {
  setupCarouselNav();

  document.getElementById('btn-generate')?.addEventListener('click', generateRandom);

  const sendBtn = document.getElementById('btn-send');
  sendBtn && (sendBtn.innerHTML = sendIconSVG());
  sendBtn?.addEventListener('click', handleAiOutfit);

  document.getElementById('outfit-prompt')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiOutfit(); }
  });

  document.getElementById('fab-heart')?.addEventListener('click', openSaveModal);

  // Save modal
  bindModalClose('modal-save');
  document.getElementById('btn-save-new-col')?.addEventListener('click', createAndSave);
  document.getElementById('btn-close-save-modal')?.addEventListener('click', () => closeModal('modal-save'));
  renderEmojiPicker();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(str) { return escapeHTML(str); }

init();
