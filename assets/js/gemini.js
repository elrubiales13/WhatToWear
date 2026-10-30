// ─── Gemini API helpers ────────────────────────────────────────────────────────
import { getGeminiKeys, getActiveGeminiIndex, getActiveGeminiKey, rotateGeminiKey } from './config.js';
import { showToast } from './auth.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

/**
 * Checks if an HTTP response code or error object indicates rate limit or token exhaustion.
 */
function isQuotaExhausted(status, errData) {
  if (status === 429) return true;
  const msg = (errData?.error?.message || errData?.message || '').toLowerCase();
  const st  = (errData?.error?.status || errData?.status || '').toLowerCase();
  return (
    st.includes('resource_exhausted') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  );
}

/**
 * Low-level Gemini call with automatic multi-key rotation on quota exhaustion.
 */
async function callGemini(parts, temperature = 0.3) {
  const allKeys = getGeminiKeys();
  if (allKeys.length === 0) {
    throw new Error('No hay claves de Gemini configuradas. Ve a Configuración.');
  }

  const maxAttempts = allKeys.length;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentKey = getActiveGeminiKey();
    const currentIdx = getActiveGeminiIndex();

    try {
      const res = await fetch(`${BASE_URL}?key=${currentKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));

        // Detect quota / token limit
        if (isQuotaExhausted(res.status, errJson)) {
          if (allKeys.length > 1 && attempt < maxAttempts - 1) {
            const rotation = rotateGeminiKey();
            showToast(`⚠️ Cuota agotada en clave ${currentIdx + 1}. Cambiando a clave ${rotation.index + 1}/${rotation.total}…`, 'info', 4500);
            continue; // Retry with next key
          } else {
            throw new Error(`Cuota agotada en todas las claves Gemini configuradas (${allKeys.length}). Añade otra clave en Configuración.`);
          }
        }

        throw new Error(errJson?.error?.message || `Gemini API error ${res.status}`);
      }

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Respuesta vacía de Gemini.');

      try {
        return JSON.parse(text);
      } catch {
        // Sometimes Gemini wraps JSON in markdown fences
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) return JSON.parse(match[1]);
        throw new Error('La respuesta de Gemini no es JSON válido.');
      }

    } catch (err) {
      lastError = err;
      // If error message indicates quota exhaustion, try rotating
      if (isQuotaExhausted(0, err) && allKeys.length > 1 && attempt < maxAttempts - 1) {
        const rotation = rotateGeminiKey();
        showToast(`⚠️ Cuota agotada. Cambiando a clave ${rotation.index + 1}/${rotation.total}…`, 'info', 4500);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Error al conectar con la API de Gemini.');
}

/**
 * Classify a clothing image.
 * @param {string} base64  – raw base64 (no prefix)
 * @param {string} mime    – e.g. "image/jpeg"
 * @returns {{ category, subcategory, colors, formality, name }}
 */
export async function classifyClothing(base64, mime = 'image/jpeg') {
  return callGemini([
    { inlineData: { mimeType: mime, data: base64 } },
    {
      text: `Analiza esta imagen de una prenda de ropa o accesorio y devuelve ÚNICAMENTE este JSON (sin texto extra):
{
  "category": "head" | "torso" | "legs" | "feet",
  "subcategory": string,
  "colors": string[],
  "formality": number,
  "name": string
}

Reglas de clasificación:
- "head"  → gorros, gorras, sombreros, boinas, pañuelos de cabeza
- "torso" → camisetas, camisas, blusas, tops, jerseys, sudaderas, chaquetas, blazers, cazadoras, abrigos, gabardinas, parkas, vestidos, vestidos largos, bolsos, mochilas, bandoleras
- "legs"  → pantalones, vaqueros, shorts, bermudas, faldas, leggings, medias, leotardos, pantys
- "feet"  → zapatos, zapatillas, botas, botines, sandalias, mocasines, calcetines

Para "formality": 1=muy informal, 2=informal, 3=neutro, 4=semiformal, 5=muy formal
Para "colors": máximo 3 colores en español (ej: ["azul marino", "blanco"])
Para "name": nombre descriptivo corto en español, máximo 4 palabras (ej: "Vestido largo floral", "Chaqueta vaquera")
Para "subcategory": término exacto en español (ej: "vestido largo", "vestido", "camiseta", "camisa", "chaqueta", "abrigo", "bolso", "vaquero", "medias", "zapatilla")

Si la imagen no muestra ropa reconocible, usa: category="torso", subcategory="prenda", formality=3`
    },
  ]);
}

/**
 * Generate an outfit from a natural-language description using the user's wardrobe.
 * Supports multi-layer torso (base, jacket, coat, bag) and dress exceptions.
 * @param {string} description – user's text
 * @param {Array}  wardrobe    – array of clothing items from Supabase
 * @returns {{ head, torso_base, torso_jacket, torso_coat, torso_bag, legs, feet, explanation }}
 */
export async function generateOutfitFromDescription(description, wardrobe) {
  if (wardrobe.length === 0) throw new Error('Tu armario está vacío. Añade ropa primero.');

  const lines = wardrobe.map(i =>
    `  { "id":"${i.id}", "cat":"${i.category}", "sub":"${i.subcategory}", "name":"${i.name || i.subcategory}", "colors":${JSON.stringify(i.colors || [])}, "formality":${i.formality || 3} }`
  ).join(',\n');

  const byCategory = (cat) => wardrobe.filter(w => w.category === cat).map(w => w.id);

  return callGemini([{
    text: `Eres un asesor de moda personal experto. El armario del usuario es:
[
${lines}
]

El usuario dice: "${description}"

Selecciona el mejor outfit. Responde ÚNICAMENTE con este JSON:
{
  "head":         "<uuid o null>",
  "torso_base":   "<uuid>",
  "torso_jacket": "<uuid o null>",
  "torso_coat":   "<uuid o null>",
  "torso_bag":    "<uuid o null>",
  "legs":         "<uuid o null>",
  "feet":         "<uuid>",
  "explanation":  "<máximo 2 frases en español explicando el look y la combinación de capas>"
}

REGLAS DE MODA Y CAPAS:
1. "torso_base": Prenda interior o principal (camiseta, camisa, blusa, top, vestido).
2. "torso_jacket": Capa media opcional (chaqueta, cazadora, blazer, jersey, sudadera).
3. "torso_coat": Capa exterior opcional (abrigo, gabardina, anorak) si el clima o contexto lo pide.
4. "torso_bag": Bolso, mochila o accesorio si es conveniente.
5. EXCEPCIÓN VESTIDOS: Si eliges un vestido largo o vestido completo en torso_base, "legs" DEBE ser null, EXCEPTO si el usuario tiene y es adecuado llevar medias o leotardos (¡nunca pongas pantalones o vaqueros con un vestido largo!).
6. Solo puedes usar IDs válidos del inventario. Si no hay prenda apropiada para una capa opcional, usa null.
7. Cuida la coherencia de formalidad y combinación de colores entre todas las prendas seleccionadas.`
  }], 0.5);
}
