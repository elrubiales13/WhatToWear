// ─── Gemini API helpers ────────────────────────────────────────────────────────
import { getConfig } from './config.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Low-level Gemini call. Returns parsed JSON from the model's response.
 */
async function callGemini(parts, temperature = 0.3) {
  const { geminiKey } = getConfig();
  if (!geminiKey) throw new Error('Clave de Gemini no configurada. Ve a Configuración.');

  const res = await fetch(`${BASE_URL}?key=${geminiKey}`, {
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
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
      text: `Analiza esta imagen de una prenda de ropa y devuelve ÚNICAMENTE este JSON (sin texto extra):
{
  "category": "head" | "torso" | "legs" | "feet",
  "subcategory": string,
  "colors": string[],
  "formality": number,
  "name": string
}

Reglas de clasificación:
- "head"  → gorros, gorras, sombreros, bufandas de cabeza, pañuelos
- "torso" → camisetas, camisas, sudaderas, jerseys, chaquetas, abrigos, blazers, vestidos
- "legs"  → pantalones, vaqueros, shorts, bermudas, faldas, leggings, mallas
- "feet"  → zapatos, zapatillas, botas, sandalias, chanclas, mocasines, calcetines

Para "formality": 1=muy informal, 2=informal, 3=neutro, 4=semiformal, 5=muy formal
Para "colors": máximo 3 colores en español (ej: ["azul marino", "blanco"])
Para "name": nombre descriptivo corto en español, máximo 4 palabras (ej: "Camisa blanca Oxford")
Para "subcategory": una sola palabra en español (ej: "camisa", "vaquero", "zapatilla")

Si la imagen no muestra ropa reconocible, usa: category="torso", subcategory="prenda desconocida", formality=3`
    },
  ]);
}

/**
 * Generate an outfit from a natural-language description using the user's wardrobe.
 * @param {string} description – user's text
 * @param {Array}  wardrobe    – array of clothing items from Supabase
 * @returns {{ head, torso, legs, feet, explanation }} – IDs or null
 */
export async function generateOutfitFromDescription(description, wardrobe) {
  if (wardrobe.length === 0) throw new Error('Tu armario está vacío. Añade ropa primero.');

  const lines = wardrobe.map(i =>
    `  { "id":"${i.id}", "cat":"${i.category}", "sub":"${i.subcategory}", "name":"${i.name || i.subcategory}", "colors":${JSON.stringify(i.colors || [])}, "formality":${i.formality || 3} }`
  ).join(',\n');

  const byCategory = (cat) => wardrobe.filter(w => w.category === cat).map(w => w.id);

  return callGemini([{
    text: `Eres un asesor de moda personal. El armario del usuario es:
[
${lines}
]

El usuario dice: "${description}"

Selecciona el mejor outfit. Responde ÚNICAMENTE con este JSON:
{
  "head":  "<uuid o null>",
  "torso": "<uuid>",
  "legs":  "<uuid>",
  "feet":  "<uuid>",
  "explanation": "<máximo 2 frases en español explicando el look>"
}

IMPORTANTE:
- Solo puedes usar IDs del armario anterior.
- IDs válidos head:  ${JSON.stringify(byCategory('head'))}
- IDs válidos torso: ${JSON.stringify(byCategory('torso'))}
- IDs válidos legs:  ${JSON.stringify(byCategory('legs'))}
- IDs válidos feet:  ${JSON.stringify(byCategory('feet'))}
- Si una categoría está vacía usa null.
- Cuida la coherencia de formalidad entre prendas.`
  }], 0.5);
}
