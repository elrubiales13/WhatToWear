// ─── Supabase client + data helpers ───────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getConfig, getGeminiKeys, setConfig, setGeminiKeys } from './config.js';

let _sb = null;
let _sbConfig = null;

export function getSupabase() {
  const { supabaseUrl, supabaseKey } = getConfig();
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase no configurado. Ve a Configuración.');
  if (!_sb || _sbConfig?.supabaseUrl !== supabaseUrl || _sbConfig?.supabaseKey !== supabaseKey) {
    _sb = createClient(supabaseUrl, supabaseKey);
    _sbConfig = { supabaseUrl, supabaseKey };
  }
  return _sb;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function getCurrentUser() {
  const { data: { user } } = await getSupabase().auth.getUser();
  return user;
}

export async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  const authenticatedClient = _sb;
  await syncAppConfigFromCloud(data.user);
  if (_sb !== authenticatedClient && data.session) {
    const { error: sessionError } = await getSupabase().auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionError) throw sessionError;
  }
  await syncAppConfigToCloud();
  // Prefer account keys, but migrate keys left on this device if the account has none.
  const cloudKeys = await syncConfigFromCloud(data.user);
  if (!cloudKeys) {
    const localKeys = getGeminiKeys();
    if (localKeys.length > 0) await syncConfigToCloud(localKeys);
  }
  return data.user;
}

export async function signUp(email, password, metadata = {}) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  });
  if (error) throw error;
  if (metadata.gemini_keys) {
    setGeminiKeys(metadata.gemini_keys);
  }
  return data.user;
}

export async function signOut() {
  _sb = null; // force re-init on next call
  await getSupabase().auth.signOut();
}

/** Saves the public Supabase connection details to account metadata once. */
export async function syncAppConfigToCloud() {
  try {
    const user = await getCurrentUser();
    if (!user || (user.user_metadata?.app_config?.supabase_url && user.user_metadata?.app_config?.supabase_key)) return;

    const { supabaseUrl, supabaseKey } = getConfig();
    if (!supabaseUrl || !supabaseKey) return;

    const { error } = await getSupabase().auth.updateUser({
      data: { app_config: { supabase_url: supabaseUrl, supabase_key: supabaseKey } }
    });
    if (error) console.warn('Cloud config sync error:', error.message);
  } catch (err) {
    console.warn('Cloud config sync failed:', err);
  }
}

/** Restores saved connection details after authentication has succeeded. */
export async function syncAppConfigFromCloud(currentUser = null) {
  try {
    const user = currentUser || await getCurrentUser();
    const appConfig = user?.user_metadata?.app_config;
    if (!appConfig?.supabase_url || !appConfig?.supabase_key) return false;

    const current = getConfig();
    if (current.supabaseUrl !== appConfig.supabase_url) return false;
    if (current.supabaseKey !== appConfig.supabase_key) {
      setConfig({ supabaseKey: appConfig.supabase_key });
    }
    return true;
  } catch (err) {
    console.warn('Cloud config restore failed:', err);
    return false;
  }
}

/**
 * Saves the user's Gemini keys to their Supabase account metadata
 * so they persist across any device.
 */
export async function syncConfigToCloud(geminiKeys) {
  try {
    const cleanKeys = Array.isArray(geminiKeys) ? geminiKeys : [geminiKeys].filter(Boolean);
    const { error } = await getSupabase().auth.updateUser({
      data: { gemini_keys: cleanKeys }
    });
    if (error) console.warn('Cloud sync error:', error.message);
  } catch (err) {
    console.warn('Sync failed:', err);
  }
}

/**
 * Downloads Gemini keys from the user's Supabase account metadata to localStorage.
 */
export async function syncConfigFromCloud(currentUser = null) {
  try {
    const user = currentUser || await getCurrentUser();
    const cloudKeys = user?.user_metadata?.gemini_keys;
    if (Array.isArray(cloudKeys) && cloudKeys.length > 0) {
      setGeminiKeys(cloudKeys);
      return cloudKeys;
    }
  } catch (err) {
    console.warn('Sync from cloud failed:', err);
  }
  return null;
}

export function onAuthChange(callback) {
  getSupabase().auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
}

// ── Clothes ───────────────────────────────────────────────────────────────────

export async function getClothes() {
  const { data, error } = await getSupabase()
    .from('clothes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addClothing(item) {
  const { data, error } = await getSupabase()
    .from('clothes')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClothing(id, storagePath) {
  if (storagePath) await deleteClothingImage(storagePath).catch(() => {});
  const { error } = await getSupabase().from('clothes').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadClothingImage(file, userId) {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await getSupabase().storage.from('clothes').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = getSupabase().storage.from('clothes').getPublicUrl(path);
  return { path, publicUrl };
}

export async function deleteClothingImage(storagePath) {
  const { error } = await getSupabase().storage.from('clothes').remove([storagePath]);
  if (error) throw error;
}

// ── Outfits ───────────────────────────────────────────────────────────────────

export async function saveOutfit(outfit) {
  const { data, error } = await getSupabase()
    .from('outfits')
    .insert(outfit)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOutfits() {
  const { data, error } = await getSupabase()
    .from('outfits')
    .select(`*, head:head_id(*), torso:torso_id(*), legs:legs_id(*), feet:feet_id(*)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteOutfit(id) {
  const { error } = await getSupabase().from('outfits').delete().eq('id', id);
  if (error) throw error;
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function getCollections() {
  const { data, error } = await getSupabase()
    .from('collections')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCollection(name, emoji = '👔', userId = null) {
  let uid = userId;
  if (!uid) {
    const { data: { user } } = await getSupabase().auth.getUser();
    uid = user?.id;
  }
  if (!uid) throw new Error('Debes iniciar sesión para crear colecciones.');

  const { data, error } = await getSupabase()
    .from('collections')
    .insert({ user_id: uid, name: name.trim(), emoji })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCollection(id) {
  const { error } = await getSupabase().from('collections').delete().eq('id', id);
  if (error) throw error;
}

export async function getCollectionOutfits(collectionId) {
  const { data, error } = await getSupabase()
    .from('collection_outfits')
    .select(`outfit:outfit_id(*, head:head_id(*), torso:torso_id(*), legs:legs_id(*), feet:feet_id(*))`)
    .eq('collection_id', collectionId);
  if (error) throw error;
  return (data ?? []).map(d => d.outfit).filter(Boolean);
}

export async function addOutfitToCollection(collectionId, outfitId) {
  const { error } = await getSupabase()
    .from('collection_outfits')
    .insert({ collection_id: collectionId, outfit_id: outfitId });
  if (error && error.code !== '23505') throw error; // ignore duplicate key
}

export async function removeOutfitFromCollection(collectionId, outfitId) {
  const { error } = await getSupabase()
    .from('collection_outfits')
    .delete()
    .eq('collection_id', collectionId)
    .eq('outfit_id', outfitId);
  if (error) throw error;
}
