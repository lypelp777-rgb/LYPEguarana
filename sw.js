/* ============================================================
   GUARANÁ DO LYPE — SERVICE WORKER
   Cache-first para assets estáticos, network-first para a página
   (com fallback offline), e limpeza automática de versões antigas.
============================================================ */

const SW_VERSION   = "v1.0.0";
const STATIC_CACHE = `guarana-lype-static-${SW_VERSION}`;
const PAGES_CACHE   = `guarana-lype-pages-${SW_VERSION}`;

/* Arquivos essenciais para o app abrir offline */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-48.png",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-192.png",
  "./icons/icon-256.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.ico"
];

/* ------------------------------------------------------------
   INSTALL — pré-carrega o essencial e ativa a nova versão logo
------------------------------------------------------------ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ------------------------------------------------------------
   ACTIVATE — limpa caches de versões antigas e assume controle
------------------------------------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------
   FETCH — estratégias por tipo de requisição
------------------------------------------------------------ */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  /* Navegação (abrir o app / recarregar página): network-first,
     cai para o cache e depois para a página offline salva. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() =>
          caches.match("./index.html", { cacheName: PAGES_CACHE })
            .then((cached) => cached || caches.match("./index.html", { cacheName: STATIC_CACHE }))
        )
    );
    return;
  }

  /* Assets do próprio app (ícones, manifest): cache-first */
  if (isSameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  /* Fontes do Google e outros recursos externos: stale-while-revalidate */
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

/* ------------------------------------------------------------
   MESSAGE — permite que a página force a ativação imediata
   de uma nova versão do Service Worker (fluxo de atualização)
------------------------------------------------------------ */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
