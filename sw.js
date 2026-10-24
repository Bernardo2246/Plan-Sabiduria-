/* Plan Sabiduría — Service Worker
   Cachea el app shell para uso offline. Sube CACHE_VERSION para forzar
   actualización cuando cambies index.html u otros archivos. */

const CACHE_VERSION = "plan-sabiduria-v3";
// Sin "./index.html": Cloudflare Pages lo redirige a "./" y Safari no abre
// una navegación servida desde caché si la respuesta guardada es una redirección.
const APP_SHELL = [
  "./",
  "./manifest.json",
  "./config.js",
  "./sync.js",
  "./vendor/supabase.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Instala: precachea el app shell.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activa: limpia versiones de caché viejas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: sólo manejamos GET del mismo origen.
// Navegaciones (HTML) → network-first con fallback a caché (offline).
// Estáticos → cache-first con relleno de red.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Solo se guarda la página real ("./"), nunca una redirección.
          if (res.ok && res.type === "basic" && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put("./", copy));
          }
          return res;
        })
        // Sin red: siempre la app desde "./", también si se abrió como /index.html.
        .catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
