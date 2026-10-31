// ─── App Configuration (stored in localStorage & synced with Supabase) ─────────

export const APP_DEFAULTS = {
  // Pre-configured Supabase project URL so new devices don't need to re-enter it
  supabaseUrl: 'https://kordaebgefnhvcuhdjff.supabase.co',
  // Put your public Supabase Anon Key here to enable zero-config logins on any device
  supabaseKey: '',
};

export const KEYS = {
  SUPABASE_URL:        'wtw_supabase_url',
  SUPABASE_KEY:        'wtw_supabase_key',
  GEMINI_KEY:          'wtw_gemini_key',       // Legacy/single key
  GEMINI_KEYS_LIST:    'wtw_gemini_keys_list', // JSON array of Gemini API keys
  GEMINI_ACTIVE_INDEX: 'wtw_gemini_active_idx',
};

/** Returns array of all configured Gemini API keys */
export function getGeminiKeys() {
  try {
    const raw = localStorage.getItem(KEYS.GEMINI_KEYS_LIST);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(k => String(k).trim()).filter(Boolean);
      }
    }
  } catch {}

  // Fallback to legacy single key
  const legacy = (localStorage.getItem(KEYS.GEMINI_KEY) || '').trim();
  return legacy ? [legacy] : [];
}

/** Saves the list of Gemini API keys and maintains legacy single key in sync */
export function setGeminiKeys(keys) {
  const clean = Array.from(new Set(
    (keys || []).map(k => String(k).trim()).filter(Boolean)
  ));
  localStorage.setItem(KEYS.GEMINI_KEYS_LIST, JSON.stringify(clean));

  // Sync legacy single key with first key
  localStorage.setItem(KEYS.GEMINI_KEY, clean[0] || '');

  // Reset active index if out of bounds
  const currentIdx = getActiveGeminiIndex();
  if (currentIdx >= clean.length) {
    setActiveGeminiIndex(0);
  }
  return clean;
}

/** Returns the 0-based index of the currently active Gemini API key */
export function getActiveGeminiIndex() {
  const keys = getGeminiKeys();
  if (keys.length === 0) return 0;
  const idx = parseInt(localStorage.getItem(KEYS.GEMINI_ACTIVE_INDEX) || '0', 10);
  return (isNaN(idx) || idx < 0 || idx >= keys.length) ? 0 : idx;
}

/** Set which key index is currently active */
export function setActiveGeminiIndex(index) {
  const keys = getGeminiKeys();
  const safeIdx = Math.max(0, Math.min(index, Math.max(0, keys.length - 1)));
  localStorage.setItem(KEYS.GEMINI_ACTIVE_INDEX, String(safeIdx));
  return safeIdx;
}

/** Returns the currently active Gemini API key */
export function getActiveGeminiKey() {
  const keys = getGeminiKeys();
  if (keys.length === 0) return '';
  const idx = getActiveGeminiIndex();
  return keys[idx] || keys[0] || '';
}

/**
 * Rotates to the next available Gemini API key in the pool.
 * Returns { key, index, total } or null if only 1 key is available.
 */
export function rotateGeminiKey() {
  const keys = getGeminiKeys();
  if (keys.length <= 1) return null;

  const currentIdx = getActiveGeminiIndex();
  const nextIdx = (currentIdx + 1) % keys.length;
  setActiveGeminiIndex(nextIdx);

  return {
    key:   keys[nextIdx],
    index: nextIdx,
    total: keys.length,
  };
}

/** Returns current config from localStorage or defaults */
export function getConfig() {
  const localUrl = localStorage.getItem(KEYS.SUPABASE_URL);
  const localKey = localStorage.getItem(KEYS.SUPABASE_KEY);

  return {
    supabaseUrl: localUrl || APP_DEFAULTS.supabaseUrl,
    supabaseKey: localKey || APP_DEFAULTS.supabaseKey,
    geminiKey:   getActiveGeminiKey(),
    geminiKeys:  getGeminiKeys(),
  };
}

/** Persist config values to localStorage */
export function setConfig({ supabaseUrl, supabaseKey, geminiKey, geminiKeys } = {}) {
  if (supabaseUrl !== undefined) localStorage.setItem(KEYS.SUPABASE_URL, supabaseUrl.trim());
  if (supabaseKey !== undefined) localStorage.setItem(KEYS.SUPABASE_KEY, supabaseKey.trim());
  if (geminiKeys  !== undefined) {
    setGeminiKeys(geminiKeys);
  } else if (geminiKey !== undefined) {
    setGeminiKeys([geminiKey]);
  }
}

/** True when Supabase endpoint is available (from defaults or localStorage) */
export function isConfigured() {
  const c = getConfig();
  return Boolean(c.supabaseUrl && c.supabaseKey);
}

/** Redirect to config page ONLY if Supabase connection details are missing */
export function guardConfig() {
  const onConfigPage = window.location.pathname.endsWith('config.html');
  if (!isConfigured() && !onConfigPage) {
    window.location.href = 'config.html';
  }
}
