// ─── Auth guard + login modal ──────────────────────────────────────────────────
import { getCurrentUser, signIn, signUp, signOut } from './supabase.js';
import { guardConfig } from './config.js';

// ── Login modal HTML ──────────────────────────────────────────────────────────
function injectLoginModal() {
  if (document.getElementById('auth-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="auth-overlay" class="auth-overlay hidden">
      <div class="auth-card">
        <img src="assets/img/wtw-logo.svg" alt="WTW" class="auth-logo">
        <h1 class="auth-title">What To Wear</h1>
        <p class="auth-subtitle">Tu armario digital inteligente</p>

        <div class="tab-group">
          <button class="tab-btn active" data-tab="login">Iniciar sesión</button>
          <button class="tab-btn" data-tab="register">Crear cuenta</button>
        </div>

        <form id="auth-form" novalidate>
          <div class="form-field">
            <input id="auth-email" type="email" placeholder="correo@ejemplo.com" autocomplete="email" required>
          </div>
          <div class="form-field">
            <input id="auth-password" type="password" placeholder="Contraseña" autocomplete="current-password" required>
          </div>
          <p id="auth-error" class="form-error hidden"></p>
          <button type="submit" id="auth-submit" class="btn btn-primary btn-block">
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

  let mode = 'login';
  const form    = document.getElementById('auth-form');
  const errEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');

  // Tab switcher
  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.tab;
      submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Registrarse';
      errEl.classList.add('hidden');
      document.getElementById('auth-password').autocomplete =
        mode === 'login' ? 'current-password' : 'new-password';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    submitBtn.disabled = true;
    submitBtn.textContent = '…';

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      overlay.classList.add('hidden');
      onSuccess();
    } catch (err) {
      errEl.textContent = translateAuthError(err.message);
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Registrarse';
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
    const user = await getCurrentUser();
    if (user) {
      resolve(user);
    } else {
      showLoginModal(async () => {
        const freshUser = await getCurrentUser();
        resolve(freshUser);
      });
    }
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
