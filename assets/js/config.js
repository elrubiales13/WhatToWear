// ─── App Configuration (stored in localStorage) ───────────────────────────────

export const KEYS = {
  SUPABASE_URL: 'wtw_supabase_url',
  SUPABASE_KEY: 'wtw_supabase_key',
  GEMINI_KEY:   'wtw_gemini_key',
};

/** Returns current config from localStorage */
export function getConfig() {
  return {
    supabaseUrl: localStorage.getItem(KEYS.SUPABASE_URL) || '',
    supabaseKey: localStorage.getItem(KEYS.SUPABASE_KEY) || '',
    geminiKey:   localStorage.getItem(KEYS.GEMINI_KEY)   || '',
  };
}

/** Persist config values to localStorage */
export function setConfig({ supabaseUrl, supabaseKey, geminiKey } = {}) {
  if (supabaseUrl !== undefined) localStorage.setItem(KEYS.SUPABASE_URL, supabaseUrl.trim());
  if (supabaseKey !== undefined) localStorage.setItem(KEYS.SUPABASE_KEY, supabaseKey.trim());
  if (geminiKey   !== undefined) localStorage.setItem(KEYS.GEMINI_KEY,   geminiKey.trim());
}

/** True only when all three keys are present */
export function isConfigured() {
  const c = getConfig();
  return Boolean(c.supabaseUrl && c.supabaseKey && c.geminiKey);
}

/** Redirect to config page if app is not configured */
export function guardConfig() {
  const onConfigPage = window.location.pathname.endsWith('config.html');
  if (!isConfigured() && !onConfigPage) {
    window.location.href = 'config.html';
  }
}
