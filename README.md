# Plan Sabiduría 📖

PWA (Progressive Web App) para seguir un plan de lectura bíblica de **49 días** que integra **Eclesiastés, Proverbios y Salmos**. Funciona offline, sincroniza qué días completaste entre el iPhone y la Mac (Supabase) y se instala desde Safari como una app nativa. Las reflexiones se escriben en el diario de Obsidian, no en la app.

---

## 📁 Archivos del proyecto

```
plan-sabiduria/
├── index.html        ← la app (HTML + CSS + JS)
├── sync.js           ← sincronización con Supabase: cola sin conexión, Realtime, migración de la v1
├── config.js         ← URL y anon key de Supabase (pública; los datos los protege RLS)
├── vendor/supabase.js← supabase-js 2.117.1 (UMD), local para que abra sin red
├── supabase/plan_progress.sql ← tabla, RLS, trigger de conflictos y Realtime (correr una vez)
├── manifest.json     ← metadatos de la PWA
├── sw.js             ← service worker (cache offline)
├── icons/
│   ├── icon.svg      ← ícono fuente (editable)
│   ├── icon-192.png  ← ícono 192×192
│   └── icon-512.png  ← ícono 512×512
└── README.md         ← este archivo
```

> Sin frameworks ni paso de build. El único backend es Supabase: el **mismo proyecto y el mismo usuario que Finanzas-Personales** (correo + contraseña, registro desactivado).

## ☁️ Sincronización (v2)

- Tabla `plan_progress` (`user_id`, `dia`, `done`, `completed_at`, `updated_at`), clave `(user_id, dia)`, RLS por usuario. Se crea corriendo `supabase/plan_progress.sql` en el SQL Editor.
- Marcar un día actualiza la pantalla al instante y se encola en `localStorage` (`ps_queue`); la cola se envía al reconectar. En conflicto gana el `updated_at` más reciente (en la app y en el trigger del servidor); si ambos lados dicen "completado" se conserva la `completed_at` más antigua.
- El otro dispositivo se entera por Realtime y, como iOS congela las PWA en segundo plano, también al volver a la app (`visibilitychange`/`focus`/`online`).
- Al primer inicio de sesión en cada dispositivo se sube el `ps_done` de la v1 (unión de días). Bernardo confirmó la sincronización el 2026-10-24: desde entonces `ps_done` y `ps_notes` se borran solos en cada dispositivo después de migrar, cuando ya no queda nada por enviar (respaldos en `backups/`).
- La hora del recordatorio sigue siendo local de cada dispositivo (`ps_cfg`).
- `backups/` está en `.gitignore`: ahí van los respaldos del `localStorage` (el repo es público).

---

## 🚀 Deploy en Cloudflare Pages (gratis, URL pública)

### Opción A — Subida directa por la web (la más sencilla, sin Git)

1. **Crea una cuenta gratis** en https://dash.cloudflare.com/sign-up
2. En el panel, ve a **Workers & Pages** → pestaña **Pages** → botón **Create application** → **Upload assets**.
3. Ponle un nombre al proyecto, por ejemplo `plan-sabiduria`.
4. **Arrastra la carpeta `plan-sabiduria` completa** (o selecciona todos los archivos: `index.html`, `manifest.json`, `sw.js` y la carpeta `icons/`) a la zona de carga.
   - ⚠️ Importante: el archivo `index.html` debe quedar en la **raíz** del proyecto, no dentro de una subcarpeta.
5. Haz clic en **Deploy site**.
6. En segundos tendrás una URL pública del tipo:
   ```
   https://plan-sabiduria.pages.dev
   ```
   Esa es la dirección que abres desde el iPhone.

> Para **actualizar** la app más adelante: vuelve al proyecto → **Create deployment** → sube los archivos nuevos. Recuerda subir el número de `CACHE_VERSION` en `sw.js` (de `v1` a `v2`, etc.) para que los dispositivos descarguen la nueva versión.

### Opción B — Con Git (despliegue automático en cada cambio)

1. Sube esta carpeta a un repositorio en GitHub.
2. En Cloudflare Pages: **Create application** → **Pages** → **Connect to Git** → elige el repo.
3. Configuración de build:
   - **Framework preset:** `None`
   - **Build command:** *(déjalo vacío)*
   - **Build output directory:** `/`  (la raíz, ya que no hay paso de compilación)
4. **Save and Deploy.** Cada `git push` redesplegará la app automáticamente.

---

## 📱 Cómo instalarla en el iPhone (Safari)

1. Abre **Safari** (debe ser Safari; Chrome en iOS no instala PWAs) y entra a tu URL `*.pages.dev`.
2. Toca el botón de **Compartir** (el cuadrito con la flecha hacia arriba ⬆️, abajo en el centro).
3. Desliza y elige **"Agregar a pantalla de inicio"** / *"Add to Home Screen"*.
4. Confirma el nombre (**Sabiduría**) y toca **Agregar**.
5. Aparecerá el ícono en tu pantalla de inicio. Ábrelo: se verá a pantalla completa, sin la barra de Safari.

### Notas para iPhone
- **Funciona offline:** tras la primera carga, el service worker guarda la app; puedes abrirla sin internet.
- **Progreso:** se guarda en Supabase y en una copia local para usarla sin red. La app de la pantalla de inicio tiene su propio almacenamiento, separado de Safari: hay que iniciar sesión dentro de la app instalada.
- **Recordatorios:** iOS solo permite notificaciones web a PWAs **instaladas en la pantalla de inicio** (iOS 16.4+). Tras instalar, entra a **Ajustes → Recordatorio diario**, actívalo y acepta el permiso. El recordatorio se programa mientras la app esté abierta o en segundo plano reciente; iOS puede limitar notificaciones de apps cerradas por mucho tiempo.

---

## 🛠️ Probar localmente antes de subir

Un service worker necesita servirse por HTTP (no abras `index.html` con doble clic). Desde la carpeta del proyecto:

```bash
# Con Python 3 (ya viene en macOS)
python3 -m http.server 8000
```

Luego abre http://localhost:8000 en tu navegador.

---

## 🎨 Personalización rápida

- **Colores por libro** y temas: variables CSS al inicio de `index.html` (`:root { --ec, --pr, --sa ... }`).
- **Contenido de los 49 días:** array `PLAN` dentro de `index.html` (tema, lecturas, reflexión, conexión).
- **Ícono:** edita `icons/icon.svg` y regenera los PNG en macOS con:
  ```bash
  cd icons
  sips -s format png -z 512 512 icon.svg --out icon-512.png
  sips -s format png -z 192 192 icon.svg --out icon-192.png
  ```

---

Hecho con HTML, CSS y JavaScript puro. Sin dependencias.
