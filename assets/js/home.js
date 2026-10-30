// ─── Home page – carousels, torso layering, dress exception, AI chat ────────────
import { requireAuth, showToast, openModal, closeModal, bindModalClose } from './auth.js';
import {
  getClothes, saveOutfit, addOutfitToCollection,
  getCollections, createCollection,
} from './supabase.js';
import { generateOutfitFromDescription } from './gemini.js';

// ── State ─────────────────────────────────────────────────────────────────────
let user     = null;
let wardrobe = [];

// Multi-layer selection supporting torso stacking (base + jacket + coat + bag)
let selection = {
  head:         null,
  torso_base:   null, // Camiseta / camisa / vestido / top
  torso_jacket: null, // Chaqueta / cazadora / blazer / sudadera
  torso_coat:   null, // Abrigo / gabardina
  torso_bag:    null, // Bolso / mochila
  legs:         null, // Pantalón / falda / medias o 'dress_covered'
  feet:         null, // Calzado
};

let activeTorsoLayer = 'base'; // 'base' | 'jacket' | 'coat' | 'bag'

const TORSO_LAYERS = [
  { id: 'base',   label: '👕 Base',     name: 'prenda base',  optional: false },
  { id: 'jacket', label: '🧥 Chaqueta', name: 'chaqueta',     optional: true  },
  { id: 'coat',   label: '🧥 Abrigo',   name: 'abrigo',       optional: true  },
  { id: 'bag',    label: '👜 Bolso',    name: 'bolso',        optional: true  },
];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  user = await requireAuth();
  wardrobe = await getClothes().catch(() => []);
  renderAllCarousels();
  setupEvents();
}

// ── Torso Layer & Dress Helpers ───────────────────────────────────────────────

/**
 * Categorize a torso item into one of the 4 layers: base, jacket, coat, or bag.
 */
export function resolveTorsoLayer(item) {
  if (!item || item.category !== 'torso') return 'base';
  const text = `${item.subcategory || ''} ${item.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  if (/bolso|mochila|bandolera|rinonera|riñonera|cartera|tote|bolsa/.test(text)) return 'bag';
  if (/abrigo|gabardina|anorak|parka|plumas|trenca|sobretodo/.test(text)) return 'coat';
  if (/chaqueta|cazadora|blazer|cardigan|cárdigan|sudadera|polar|chaleco/.test(text)) return 'jacket';
  return 'base';
}

/** Check if an item is a dress (vestido / vestido largo) */
function isDress(item) {
  if (!item) return false;
  const text = `${item.subcategory || ''} ${item.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  return text.includes('vestido');
}

/** Check if legwear is compatible with a dress (medias, leotardos, calcetines, pantys) */
function isDressCompatibleLegwear(item) {
  if (!item || item.category !== 'legs') return false;
  const text = `${item.subcategory || ''} ${item.name || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  return /media|medias|leotardo|leotardos|calcetin|calcetines|calcetín|panty|pantys|pantimedias|tights|socks/.test(text);
}

function getSelectedTorsoBaseItem() {
  if (!selection.torso_base) return null;
  return wardrobe.find(w => w.id === selection.torso_base) || null;
}

// ── Render All Carousels ──────────────────────────────────────────────────────
function renderAllCarousels() {
  renderHeadCarousel();
  renderTorsoCarousel();
  renderLegsCarousel();
  renderFeetCarousel();
  updateTorsoSummary();
  updateFAB();
}

// ── Head Carousel ─────────────────────────────────────────────────────────────
function renderHeadCarousel() {
  const items = wardrobe.filter(w => w.category === 'head');
  const track = document.getElementById('track-head');
  const countEl = document.getElementById('count-head');
  if (!track) return;

  if (countEl) countEl.textContent = items.length ? `${items.length} prenda${items.length > 1 ? 's' : ''}` : '';

  if (items.length === 0) {
    track.innerHTML = `<div class="carousel-empty">Añade gorras o sombreros a tu <a href="wardrobe.html">armario</a></div>`;
    return;
  }

  // Prepend an optional "Sin sombrero" option
  const noneCard = `
    <div class="clothing-card card-none ${selection.head === null ? 'selected' : ''}" data-id="none" data-cat="head">
      <div class="card-img"><span>🚫</span></div>
      <div class="card-label">Sin sombrero</div>
    </div>`;

  track.innerHTML = noneCard + items.map(item => clothingCardHTML(item, 'head', selection.head === item.id)).join('');
  bindTrackCards(track, 'head');
}

// ── Torso Carousel (with layer switching) ─────────────────────────────────────
function renderTorsoCarousel() {
  const track = document.getElementById('track-torso');
  const countEl = document.getElementById('count-torso');
  if (!track) return;

  // Filter items matching the active sub-layer
  const allTorso = wardrobe.filter(w => w.category === 'torso');
  const items = allTorso.filter(w => resolveTorsoLayer(w) === activeTorsoLayer);

  if (countEl) countEl.textContent = `${items.length} en esta capa`;

  const layerCfg = TORSO_LAYERS.find(l => l.id === activeTorsoLayer);
  const currentSelectedId = selection[`torso_${activeTorsoLayer}`];

  let html = '';

  // For optional layers (jacket, coat, bag) add a "Sin ..." card
  if (layerCfg?.optional) {
    const isNoneSelected = !currentSelectedId;
    html += `
      <div class="clothing-card card-none ${isNoneSelected ? 'selected' : ''}" data-id="none" data-layer="${activeTorsoLayer}">
        <div class="card-img"><span>🚫</span></div>
        <div class="card-label">Sin ${layerCfg.name}</div>
      </div>`;
  }

  if (items.length === 0 && !layerCfg?.optional) {
    html = `<div class="carousel-empty">No tienes prendas en "${layerCfg?.label}". Añade en tu <a href="wardrobe.html">armario</a></div>`;
  } else {
    html += items.map(item => clothingCardHTML(item, `torso_${activeTorsoLayer}`, currentSelectedId === item.id)).join('');
  }

  track.innerHTML = html;
  bindTrackCards(track, `torso_${activeTorsoLayer}`);
  updateTorsoLayerTabs();
}

// ── Legs Carousel (with dress exception) ──────────────────────────────────────
function renderLegsCarousel() {
  const track = document.getElementById('track-legs');
  const countEl = document.getElementById('count-legs');
  const badgeSlot = document.getElementById('legs-badge-slot');
  if (!track) return;

  const baseTorsoItem = getSelectedTorsoBaseItem();
  const dressActive = isDress(baseTorsoItem);

  if (dressActive) {
    // ── EXCEPCIÓN VESTIDO LARGO ─────────────────────────────────────────────
    const dressLegwear = wardrobe.filter(isDressCompatibleLegwear);

    if (dressLegwear.length === 0) {
      // Caso 1: NO existen medias ni leotardos
      // Se muestra la imagen/tarjeta oculta informativa que no genera error
      if (badgeSlot) badgeSlot.innerHTML = `<span class="legs-dress-note">👗 Cubierto por vestido</span>`;
      if (countEl) countEl.textContent = '';

      selection.legs = 'dress_covered';

      track.innerHTML = `
        <div class="clothing-card selected card-dress-covered" data-id="dress_covered" data-cat="legs">
          <div class="card-img" style="background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);">
            <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
              <path d="M22 14 L42 14 L48 50 L16 50 Z" fill="#F472B6" opacity="0.45" stroke="#DB2777" stroke-width="2" stroke-linejoin="round"/>
              <path d="M27 50 L27 56 M37 50 L37 56" stroke="#9CA3AF" stroke-width="2.5" stroke-linecap="round"/>
              <path d="M22 28 Q32 34 42 28" stroke="#DB2777" stroke-width="1.5" fill="none"/>
            </svg>
          </div>
          <div class="card-label">👗 Cubierto por vestido</div>
        </div>`;
      bindTrackCards(track, 'legs');
      return;
    }

    // Caso 2: SÍ existen medias o leotardos
    // Se habilita para medias/leotardos y se ofrece la opción "Cubierto (sin medias)"
    if (badgeSlot) badgeSlot.innerHTML = `<span class="legs-dress-note">👗 Medias / Leotardos</span>`;
    if (countEl) countEl.textContent = `${dressLegwear.length} disponible${dressLegwear.length > 1 ? 's' : ''}`;

    const isCoveredSelected = !selection.legs || selection.legs === 'dress_covered';
    const coveredCard = `
      <div class="clothing-card ${isCoveredSelected ? 'selected' : ''} card-dress-covered" data-id="dress_covered" data-cat="legs">
        <div class="card-img" style="background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);">
          <svg width="50" height="50" viewBox="0 0 64 64" fill="none">
            <path d="M22 14 L42 14 L48 50 L16 50 Z" fill="#F472B6" opacity="0.45" stroke="#DB2777" stroke-width="2"/>
            <path d="M27 50 L27 56 M37 50 L37 56" stroke="#9CA3AF" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="card-label">Sin medias</div>
      </div>`;

    track.innerHTML = coveredCard + dressLegwear.map(item =>
      clothingCardHTML(item, 'legs', selection.legs === item.id)
    ).join('');

    bindTrackCards(track, 'legs');
    return;
  }

  // ── MODO NORMAL (sin vestido) ──────────────────────────────────────────────
  if (badgeSlot) badgeSlot.innerHTML = '';
  if (selection.legs === 'dress_covered') selection.legs = null;

  const normalLegs = wardrobe.filter(w => w.category === 'legs' && !isDressCompatibleLegwear(w));
  const allLegs = normalLegs.length > 0 ? normalLegs : wardrobe.filter(w => w.category === 'legs');

  if (countEl) countEl.textContent = allLegs.length ? `${allLegs.length} prenda${allLegs.length > 1 ? 's' : ''}` : '';

  if (allLegs.length === 0) {
    track.innerHTML = `<div class="carousel-empty">Añade pantalones o faldas a tu <a href="wardrobe.html">armario</a></div>`;
    return;
  }

  track.innerHTML = allLegs.map(item =>
    clothingCardHTML(item, 'legs', selection.legs === item.id)
  ).join('');

  bindTrackCards(track, 'legs');
}

// ── Feet Carousel ─────────────────────────────────────────────────────────────
function renderFeetCarousel() {
  const items = wardrobe.filter(w => w.category === 'feet');
  const track = document.getElementById('track-feet');
  const countEl = document.getElementById('count-feet');
  if (!track) return;

  if (countEl) countEl.textContent = items.length ? `${items.length} prenda${items.length > 1 ? 's' : ''}` : '';

  if (items.length === 0) {
    track.innerHTML = `<div class="carousel-empty">Añade calzado a tu <a href="wardrobe.html">armario</a></div>`;
    return;
  }

  track.innerHTML = items.map(item => clothingCardHTML(item, 'feet', selection.feet === item.id)).join('');
  bindTrackCards(track, 'feet');
}

// ── HTML generator for clothing card ──────────────────────────────────────────
function clothingCardHTML(item, catKey, isSelected) {
  const imgEl = item.image_url
    ? `<img src="${item.image_url}" alt="${escapeAttr(item.name || '')}" loading="lazy">`
    : `<span>${catEmoji(item.category)}</span>`;

  return `
    <div class="clothing-card ${isSelected ? 'selected' : ''}"
         data-id="${item.id}"
         data-catkey="${catKey}"
         data-formality="${item.formality || 3}">
      <div class="card-img">${imgEl}</div>
      <div class="card-label">${escapeHTML(item.name || item.subcategory || '–')}</div>
    </div>`;
}

function catEmoji(cat) {
  return { head: '🎩', torso: '👕', legs: '👖', feet: '👟' }[cat] || '👔';
}

// ── Track Bindings (Click, Center, Scroll Snap Detection) ──────────────────────
function bindTrackCards(track, catKey) {
  // Click on card: center & select
  track.querySelectorAll('.clothing-card').forEach(card => {
    card.addEventListener('click', () => {
      selectCard(card, catKey, true);
    });
  });

  // Center selected card if already selected
  const activeCard = track.querySelector('.clothing-card.selected');
  if (activeCard) {
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // Scroll snap detection: spotlight the card closest to center
  let scrollTimeout = null;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      detectCenteredCard(track, catKey);
    }, 120);
  }, { passive: true });
}

function selectCard(card, catKey, doScroll = true) {
  const track = card.closest('.carousel-track');
  if (!track) return;

  const id = card.dataset.id;
  const isNone = id === 'none';

  // Toggle or select
  track.querySelectorAll('.clothing-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  if (isNone) {
    selection[catKey] = null;
  } else {
    selection[catKey] = id;
  }

  if (doScroll) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // If a dress in torso_base changed, re-render legs carousel exception
  if (catKey === 'torso_base') {
    renderLegsCarousel();
  }

  updateTorsoLayerTabs();
  updateTorsoSummary();
  updateFAB();
}

/** Detect card closest to center of track on manual scroll */
function detectCenteredCard(track, catKey) {
  const trackRect = track.getBoundingClientRect();
  const trackCenter = trackRect.left + trackRect.width / 2;
  let closestCard = null;
  let minDiff = Infinity;

  track.querySelectorAll('.clothing-card').forEach(card => {
    const cardRect = card.getBoundingClientRect();
    const cardCenter = cardRect.left + cardRect.width / 2;
    const diff = Math.abs(trackCenter - cardCenter);
    if (diff < minDiff) {
      minDiff = diff;
      closestCard = card;
    }
  });

  if (closestCard && !closestCard.classList.contains('selected')) {
    selectCard(closestCard, catKey, false);
  }
}

// ── Torso Layer Tabs & Summary Chips ──────────────────────────────────────────
function updateTorsoLayerTabs() {
  document.querySelectorAll('.torso-layer-tab').forEach(tab => {
    const layer = tab.dataset.layer;
    const isActive = layer === activeTorsoLayer;
    const hasItem = Boolean(selection[`torso_${layer}`]);

    tab.classList.toggle('active', isActive);
    tab.classList.toggle('has-item', hasItem);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function updateTorsoSummary() {
  const summaryEl = document.getElementById('torso-summary-bar');
  if (!summaryEl) return;

  const activeChips = [];

  TORSO_LAYERS.forEach(layer => {
    const id = selection[`torso_${layer.id}`];
    if (id) {
      const item = wardrobe.find(w => w.id === id);
      const name = item?.name || item?.subcategory || layer.name;
      activeChips.push({
        layer: layer.id,
        label: `${layer.label.split(' ')[0]} ${name}`,
      });
    }
  });

  if (activeChips.length === 0) {
    summaryEl.innerHTML = '';
    return;
  }

  summaryEl.innerHTML = activeChips.map(c => `
    <span class="torso-layer-chip" data-layer="${c.layer}">
      <span>${escapeHTML(c.label)}</span>
      <span class="chip-remove" title="Quitar capa">×</span>
    </span>`).join('');

  summaryEl.querySelectorAll('.torso-layer-chip').forEach(chip => {
    const layer = chip.dataset.layer;
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-remove')) {
        // Deselect layer
        selection[`torso_${layer}`] = null;
        if (layer === 'base') renderLegsCarousel();
        renderTorsoCarousel();
        updateTorsoSummary();
        updateFAB();
      } else {
        // Switch to that layer tab
        activeTorsoLayer = layer;
        renderTorsoCarousel();
      }
    });
  });
}

// ── Floating Action Button (Heart) ────────────────────────────────────────────
function updateFAB() {
  const fab = document.getElementById('fab-heart');
  const hasAny = Object.entries(selection).some(([k, v]) => {
    if (v === 'dress_covered') return false; // dummy
    return Boolean(v);
  });
  fab?.classList.toggle('hidden', !hasAny);
}

// ── Apply outfit (smooth centering for all selected cards) ────────────────────
function applyOutfit(outfit) {
  // Reset
  selection = {
    head:         outfit.head || null,
    torso_base:   outfit.torso_base || outfit.torso || null,
    torso_jacket: outfit.torso_jacket || null,
    torso_coat:   outfit.torso_coat || null,
    torso_bag:    outfit.torso_bag || null,
    legs:         outfit.legs || null,
    feet:         outfit.feet || null,
  };

  // Re-render
  activeTorsoLayer = 'base';
  renderAllCarousels();

  // Smoothly center selected items
  setTimeout(() => {
    document.querySelectorAll('.clothing-card.selected').forEach(card => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }, 100);
}

// ── Random outfit (Formality & Layer-aware) ────────────────────────────────────
function generateRandom() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generando…';

  // 1. Pick a torso base
  const basePool = wardrobe.filter(w => w.category === 'torso' && resolveTorsoLayer(w) === 'base');
  const allTorso = wardrobe.filter(w => w.category === 'torso');
  const poolToUse = basePool.length > 0 ? basePool : allTorso;

  const pickedBase = poolToUse[Math.floor(Math.random() * poolToUse.length)] || null;
  const targetF = pickedBase ? (pickedBase.formality || 3) : 3;

  const result = {
    head: null,
    torso_base: pickedBase?.id || null,
    torso_jacket: null,
    torso_coat: null,
    torso_bag: null,
    legs: null,
    feet: null,
  };

  // 2. Dress exception for legs
  const isDressPicked = isDress(pickedBase);
  if (isDressPicked) {
    const dressLegs = wardrobe.filter(isDressCompatibleLegwear);
    if (dressLegs.length > 0 && Math.random() > 0.4) {
      result.legs = dressLegs[Math.floor(Math.random() * dressLegs.length)].id;
    } else {
      result.legs = 'dress_covered';
    }
  } else {
    // Normal pants / skirts
    const legPool = wardrobe.filter(w => w.category === 'legs' && !isDressCompatibleLegwear(w));
    if (legPool.length > 0) {
      const sortedLegs = [...legPool].sort((a, b) =>
        Math.abs((a.formality || 3) - targetF) - Math.abs((b.formality || 3) - targetF)
      );
      const top = sortedLegs.slice(0, Math.min(3, sortedLegs.length));
      result.legs = top[Math.floor(Math.random() * top.length)].id;
    }
  }

  // 3. Torso Jacket (50% chance or if formal)
  const jackets = wardrobe.filter(w => w.category === 'torso' && resolveTorsoLayer(w) === 'jacket');
  if (jackets.length > 0 && (targetF >= 3 || Math.random() > 0.4)) {
    const match = jackets.filter(j => Math.abs((j.formality || 3) - targetF) <= 1);
    const pool = match.length ? match : jackets;
    result.torso_jacket = pool[Math.floor(Math.random() * pool.length)].id;
  }

  // 4. Torso Coat (30% chance if formal)
  const coats = wardrobe.filter(w => w.category === 'torso' && resolveTorsoLayer(w) === 'coat');
  if (coats.length > 0 && (targetF >= 4 || Math.random() > 0.65)) {
    result.torso_coat = coats[Math.floor(Math.random() * coats.length)].id;
  }

  // 5. Torso Bag (40% chance)
  const bags = wardrobe.filter(w => w.category === 'torso' && resolveTorsoLayer(w) === 'bag');
  if (bags.length > 0 && Math.random() > 0.5) {
    result.torso_bag = bags[Math.floor(Math.random() * bags.length)].id;
  }

  // 6. Head (optional)
  const headPool = wardrobe.filter(w => w.category === 'head');
  if (headPool.length > 0 && Math.random() > 0.6) {
    result.head = headPool[Math.floor(Math.random() * headPool.length)].id;
  }

  // 7. Feet (shoes matching formality)
  const feetPool = wardrobe.filter(w => w.category === 'feet');
  if (feetPool.length > 0) {
    const sortedFeet = [...feetPool].sort((a, b) =>
      Math.abs((a.formality || 3) - targetF) - Math.abs((b.formality || 3) - targetF)
    );
    const topFeet = sortedFeet.slice(0, Math.min(3, sortedFeet.length));
    result.feet = topFeet[Math.floor(Math.random() * topFeet.length)].id;
  }

  applyOutfit(result);

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = '✨ Generar outfit';
  }, 400);
}

// ── AI Outfit Chat ────────────────────────────────────────────────────────────
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

// ── Save to Favorites ─────────────────────────────────────────────────────────
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
  const hasAny = Object.entries(selection).some(([k, v]) => v && v !== 'dress_covered');
  if (!hasAny) { showToast('Selecciona al menos una prenda', 'error'); return; }

  // Legs ID is null if dress_covered
  const legsId = (selection.legs === 'dress_covered' ? null : selection.legs) || null;
  const torsoId = selection.torso_base || selection.torso_jacket || selection.torso_coat || null;

  try {
    const outfit = await saveOutfit({
      user_id: user.id,
      head_id:  selection.head  || null,
      torso_id: torsoId,
      legs_id:  legsId,
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
    const col = await createCollection(name, selectedEmoji, user?.id);
    _collections.unshift(col);
    renderCollectionList();
    nameInput.value = '';
    await saveCurrentOutfit(col.id, col.name);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

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

// ── Carousel Prev/Next Buttons (Card-by-card centering) ───────────────────────
function setupCarouselNav() {
  document.querySelectorAll('.carousel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const trackId = btn.dataset.track;
      const track = document.getElementById(trackId);
      if (!track) return;

      const current = track.querySelector('.clothing-card.selected');
      const cards = Array.from(track.querySelectorAll('.clothing-card'));
      if (cards.length === 0) return;

      let targetCard = null;
      if (!current) {
        targetCard = cards[0];
      } else {
        const idx = cards.indexOf(current);
        if (btn.classList.contains('prev')) {
          targetCard = cards[Math.max(0, idx - 1)];
        } else {
          targetCard = cards[Math.min(cards.length - 1, idx + 1)];
        }
      }

      if (targetCard) {
        targetCard.click();
      }
    });
  });
}

// ── Events ────────────────────────────────────────────────────────────────────
function setupEvents() {
  setupCarouselNav();

  // Torso layer tab switcher
  document.querySelectorAll('.torso-layer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTorsoLayer = tab.dataset.layer;
      renderTorsoCarousel();
    });
  });

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
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(str) { return escapeHTML(str); }

init();
