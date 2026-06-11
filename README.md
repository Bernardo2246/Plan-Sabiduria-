# Plan Sabiduría 📖

PWA (Progressive Web App) para seguir un plan de lectura bíblica de **49 días** que integra **Eclesiastés, Proverbios y Salmos**. Funciona offline, guarda tu progreso y notas en el dispositivo, y se instala en el iPhone desde Safari como una app nativa.

---

## 📁 Archivos del proyecto

```
plan-sabiduria/
├── index.html        ← la app completa (HTML + CSS + JS)
├── manifest.json     ← metadatos de la PWA
├── sw.js             ← service worker (cache offline)
├── icons/
│   ├── icon.svg      ← ícono fuente (editable)
│   ├── icon-192.png  ← ícono 192×192
│   └── icon-512.png  ← ícono 512×512
└── README.md         ← este archivo
```

> Sin backend, sin base de datos, sin frameworks. Todo vive en estos archivos.

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
- **Progreso y notas** se guardan en `localStorage`, es decir, **solo en ese dispositivo y navegador**. Si borras los datos de Safari o desinstalas la app, se pierden.
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
