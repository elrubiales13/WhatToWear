// ─── Auth guard + login modal ──────────────────────────────────────────────────
import { getCurrentUser, signIn, signUp, signOut, syncConfigFromCloud } from './supabase.js';
import { guardConfig, getConfig, setConfig } from './config.js';

// ── Login modal HTML ──────────────────────────────────────────────────────────
function injectLoginModal() {
  if (document.getElementById('auth-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="auth-overlay" class="auth-overlay hidden">
      <div class="auth-card">
        <img src="assets/img/wtw-logo.svg" alt="WTW" class="auth-logo">
        <h1 class="auth-title">What To Wear</h1>
        <p class="auth-subtitle" id="auth-modal-subtitle">Tu armario digital inteligente</p>

        <div class="tab-group">
          <button class="tab-btn active" data-tab="login">Iniciar sesión</button>
          <button class="tab-btn" data-tab="register">Crear cuenta</button>
        </div>

        <form id="auth-form" novalidate>
          <div class="form-field">
            <label for="auth-email" style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Email</label>
            <input id="auth-email" type="email" placeholder="correo@ejemplo.com" autocomplete="email" required>
          </div>
          <div class="form-field">
            <label for="auth-password" style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Contraseña</label>
            <input id="auth-password" type="password" placeholder="Mínimo 6 caracteres" autocomplete="current-password" required>
          </div>

          <!-- Shown only when registering a new account -->
          <div id="auth-register-extra" class="form-field hidden" style="margin-top:2px;">
            <div style="background:var(--surface-2,#1e293b);border-radius:10px;padding:12px;margin-bottom:10px;">
              <p style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🔑 Configuración de la app</p>
              <div class="form-field" id="auth-supabase-key-field">
                <label for="auth-supabase-key" style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Supabase Anon Key</label>
                <input id="auth-supabase-key" type="password" placeholder="eyJhbGciOiJIUzI1NiIs…" autocomplete="off">
                <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;line-height:1.4;">Clave pública del proyecto Supabase. Solo se pide una vez.</p>
              </div>
              <div class="form-field">
                <label for="auth-gemini-key" style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">✨ Clave de API Gemini</label>
                <input id="auth-gemini-key" type="password" placeholder="AIzaSy… (opcional, o añadir después)" autocomplete="off">
                <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;line-height:1.4;">Se asociará a tu cuenta. No tendrás que configurarla de nuevo en otros dispositivos.</p>
              </div>
            </div>
          </div>

          <p id="auth-error" class="form-error hidden"></p>
          <button type="submit" id="auth-submit" class="btn btn-primary btn-block" style="margin-top:6px;">
            Entrar
          </button>
        </form>
      </div>
    </div>
  `);
}

function showLoginModal(onSuccess) {
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.remove('hidden');

  // Hide the bottom navigation while auth overlay is visible
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';

  let mode = 'login';
  const form        = document.getElementById('auth-form');
  const errEl       = document.getElementById('auth-error');
  const submitBtn   = document.getElementById('auth-submit');
  const regExtra    = document.getElementById('auth-register-extra');
  const subtitleEl  = document.getElementById('auth-modal-subtitle');

  // Hide supabase key field if already configured
  const currentCfg = getConfig();
  const supabaseKeyField = document.getElementById('auth-supabase-key-field');
  if (supabaseKeyField && currentCfg.supabaseKey) {
    supabaseKeyField.style.display = 'none';
  }

  // Tab switcher
  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.tab;

      if (mode === 'login') {
        submitBtn.textContent = 'Entrar';
        regExtra?.classList.add('hidden');
        if (subtitleEl) subtitleEl.textContent = 'Accede a tu armario desde cualquier dispositivo';
        document.getElementById('auth-password').autocomplete = 'current-password';
      } else {
        submitBtn.textContent = 'Crear cuenta y comenzar';
        regExtra?.classList.remove('hidden');
        if (subtitleEl) subtitleEl.textContent = 'Crea tu cuenta para guardar tu armario y claves';
        document.getElementById('auth-password').autocomplete = 'new-password';
      }
      errEl.classList.add('hidden');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
      errEl.textContent = 'Introduce tu email y contraseña.';
      errEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '…';

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        // Save supabase key if provided during registration
        const supabaseKeyInput = document.getElementById('auth-supabase-key')?.value.trim();
        if (supabaseKeyInput) {
          setConfig({ supabaseKey: supabaseKeyInput });
        }
        const geminiInput = document.getElementById('auth-gemini-key')?.value.trim();
        const metadata = geminiInput ? { gemini_keys: [geminiInput] } : {};
        await signUp(email, password, metadata);
      }
      overlay.classList.add('hidden');
      // Restore bottom navigation after successful login
      if (bottomNav) bottomNav.style.display = '';
      onSuccess();
    } catch (err) {
      errEl.textContent = translateAuthError(err.message);
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Crear cuenta y comenzar';
    }
  });
}

function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('Email not confirmed'))        return 'Confirma tu email antes de entrar.';
  if (msg.includes('already registered'))         return 'Este email ya está registrado.';
  if (msg.includes('Password should be'))         return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Ensures config exists AND user is logged in. Returns the user object. */
export async function requireAuth() {
  guardConfig();
  injectLoginModal();

  return new Promise(async (resolve) => {
    try {
      const user = await getCurrentUser();
      if (user) {
        // Automatically sync any Gemini keys saved in user's cloud account
        await syncConfigFromCloud(user);
        resolve(user);
        return;
      }
    } catch {}

    showLoginModal(async () => {
      const freshUser = await getCurrentUser();
      if (freshUser) {
        await syncConfigFromCloud(freshUser);
      }
      resolve(freshUser);
    });
  });
}

/** Returns current user or null */
export async function getUser() {
  return getCurrentUser();
}

/** Wire up a logout button if present */
export function wireLogout(selector = '#btn-logout') {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await signOut();
    window.location.href = 'index.html';
  });
}

// ── Toast utility (shared across pages) ──────────────────────────────────────
export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Generic modal helpers ─────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

/** Close modal when clicking the backdrop */
export function bindModalClose(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', (e) => { if (e.target === el) closeModal(id); });
}
