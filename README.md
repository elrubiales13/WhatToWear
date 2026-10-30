# 👔 What To Wear (WTW)

> Tu armario digital inteligente. Sube fotos de tu ropa, déjate clasificar por IA y recibe sugerencias de outfit cada día.

![Logo WTW](assets/img/wtw-logo.svg)

---

## ✨ Características

| Feature | Descripción |
|---------|-------------|
| 🤖 Clasificación IA | Gemini 1.5 Flash analiza tus fotos y las categoriza automáticamente |
| 🎠 4 Carruseles | Cabeza, Tronco, Piernas y Pies — toda tu ropa a golpe de dedo |
| ✨ Outfit aleatorio | Genera combinaciones coherentes (por nivel de formalidad) en un clic |
| 💬 Chat de moda | Describe cómo quieres vestir y la IA selecciona prendas de tu armario |
| ❤️ Favoritos | Guarda outfits en colecciones personalizadas con nombre y emoji |
| 📱 Mobile-first | Diseño responsive con bottom nav, dark mode y gestos táctiles |

---

## 🚀 Puesta en marcha

### 1. Requisitos previos

- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Clave de API de [Google Gemini](https://aistudio.google.com/app/apikey) (gratuita con límites generosos)
- Repositorio en GitHub con GitHub Pages activado

### 2. Configurar Supabase

#### 2a. Crear el proyecto

1. Ve a [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Anota la **Project URL** y la **anon public key** (Settings → API)

#### 2b. Ejecutar el SQL de esquema

Abre el **SQL Editor** de tu proyecto Supabase y ejecuta:

```sql
-- ── Extensiones ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tabla: clothes ────────────────────────────────────────────────────────────
CREATE TABLE clothes (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_url     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('head','torso','legs','feet')),
  subcategory   TEXT,
  name          TEXT,
  colors        TEXT[]  DEFAULT '{}',
  formality     INTEGER DEFAULT 3 CHECK (formality BETWEEN 1 AND 5),
  tags          TEXT[]  DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabla: outfits ────────────────────────────────────────────────────────────
CREATE TABLE outfits (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  head_id    UUID REFERENCES clothes(id) ON DELETE SET NULL,
  torso_id   UUID REFERENCES clothes(id) ON DELETE SET NULL,
  legs_id    UUID REFERENCES clothes(id) ON DELETE SET NULL,
  feet_id    UUID REFERENCES clothes(id) ON DELETE SET NULL,
  name       TEXT DEFAULT 'Outfit',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabla: collections ────────────────────────────────────────────────────────
CREATE TABLE collections (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  emoji      TEXT DEFAULT '👔',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabla pivot: collection_outfits ───────────────────────────────────────────
CREATE TABLE collection_outfits (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  outfit_id     UUID REFERENCES outfits(id)     ON DELETE CASCADE,
  PRIMARY KEY (collection_id, outfit_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE clothes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_outfits ENABLE ROW LEVEL SECURITY;

-- Policies: clothes
CREATE POLICY "Clothes: owner full access" ON clothes
  FOR ALL USING (auth.uid() = user_id);

-- Policies: outfits
CREATE POLICY "Outfits: owner full access" ON outfits
  FOR ALL USING (auth.uid() = user_id);

-- Policies: collections
CREATE POLICY "Collections: owner full access" ON collections
  FOR ALL USING (auth.uid() = user_id);

-- Policies: collection_outfits
CREATE POLICY "Collection outfits: owner full access" ON collection_outfits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );
```

#### 2c. Crear el bucket de Storage

En **Storage → New bucket**:
- **Name**: `clothes`
- **Public**: ✅ activado

Luego en **Storage → Policies** añade estas políticas para el bucket `clothes`:

```sql
-- Subida: solo el propio usuario en su carpeta
CREATE POLICY "Clothes upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'clothes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Lectura pública (para mostrar imágenes)
CREATE POLICY "Clothes public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'clothes');

-- Borrado: solo el propio usuario
CREATE POLICY "Clothes delete own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'clothes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

### 3. Configurar GitHub Pages

1. Sube la carpeta `WTW/` a un repositorio GitHub
2. Ve a **Settings → Pages → Branch: main / root**
3. Tu app estará en `https://<tu-usuario>.github.io/<repo>/`

### 4. Primera ejecución

1. Abre la app → te redirigirá a **Configuración**
2. Rellena:
   - **Supabase URL** → `https://xxxxxx.supabase.co`
   - **Supabase Anon Key** → `eyJhbG...`
   - **Gemini API Key** → `AIzaSy...`
3. Guarda y crea tu cuenta (o inicia sesión)
4. Ve a **Armario** → **+** → sube tu primera prenda 🎉

---

## 🗂️ Estructura del proyecto

```
WTW/
├── index.html          ← Inicio (carruseles + generador de outfits + chat IA)
├── wardrobe.html       ← Armario digital (subir / eliminar ropa)
├── favorites.html      ← Favoritos y colecciones
├── config.html         ← Configuración de API keys y cuenta
├── assets/
│   ├── css/
│   │   └── style.css   ← Estilos completos (custom CSS + dark mode)
│   ├── js/
│   │   ├── config.js   ← Gestión de claves en localStorage
│   │   ├── supabase.js ← Cliente Supabase + todos los helpers de datos
│   │   ├── gemini.js   ← Llamadas a Gemini API (clasificar + generar outfit)
│   │   ├── auth.js     ← Guard de autenticación + modal de login + toasts
│   │   ├── home.js     ← Lógica de la página de inicio
│   │   ├── wardrobe.js ← Lógica del armario
│   │   └── favorites.js← Lógica de favoritos
│   └── img/
│       └── wtw-logo.svg← Logo WTW (armario con letras)
└── README.md
```

---

## 🧠 Flujos de IA

### Clasificación de ropa

```
Foto del usuario
  ↓ FileReader → base64
  ↓ Gemini Vision (gemini-1.5-flash)
  ↓ Devuelve JSON: { category, subcategory, colors, formality, name }
  ↓ Usuario revisa / edita
  ↓ Guardar en Supabase Storage + tabla clothes
```

### Generación de outfit por descripción

```
Texto del usuario: "Tengo una entrevista de trabajo, algo semiformal"
  ↓ Lista del armario del usuario (IDs + metadatos)
  ↓ Gemini Text (gemini-1.5-flash)
  ↓ Devuelve: { head, torso, legs, feet (IDs), explanation }
  ↓ Se seleccionan las prendas en los carruseles
  ↓ Se muestra la explicación debajo del chat
```

### Outfit aleatorio (sin IA)

```
Selecciona aleatoriamente un tronco → usa su nivel de formalidad como referencia
Para cada categoría: ordena prendas por cercanía de formalidad → elige al azar entre top-3
Resalta las prendas seleccionadas en los carruseles
```

---

## 🎨 Design system

| Token | Valor |
|-------|-------|
| Color primario | `#22C55E` (green-500) |
| Fondo | `#F5F4F0` (light) / `#0C0C0E` (dark) |
| Tipografía | Inter (Google Fonts) |
| Radio bordes | 14px (cards), 20px (modales) |
| Nav height | 66px (bottom nav) |

El diseño es **mobile-first** con soporte completo de **dark mode** vía `prefers-color-scheme`.

---

## 🔒 Seguridad

- Las claves de API se guardan **únicamente en `localStorage`** del navegador, nunca en el servidor.
- Supabase tiene **Row Level Security (RLS)** activada: cada usuario solo accede a su propia ropa.
- Las imágenes se almacenan en un bucket **público** (para cargarlas sin autenticación), pero el path incluye el `user_id` para evitar colisiones.

---

## 📝 Licencia

MIT — Úsalo, modifícalo y compártelo libremente.
