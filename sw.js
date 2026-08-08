/* Service worker de l'application d'entraînement PSY1 / PPL.
 *
 * Objectifs :
 *  - rendre l'application installable sur Android (icône, plein écran) ;
 *  - permettre son usage complet sans réseau après une première visite,
 *    y compris les polices Google et la bibliothèque three.js du module 3D.
 *
 * Stratégies retenues :
 *  - navigation : réseau d'abord, repli sur le cache (l'utilisateur voit la
 *    dernière version en ligne, mais l'application s'ouvre quand même hors ligne) ;
 *  - ressources même origine et CDN : cache d'abord puis mise à jour en arrière-plan
 *    (affichage immédiat, contenu rafraîchi silencieusement pour la prochaine fois).
 *
 * Pour publier une mise à jour, il suffit d'incrémenter CACHE_VERSION.
 */

const CACHE_VERSION = 'psy1-v12';
const CACHE_NAME = 'psy1-cache-' + CACHE_VERSION;

// Ressources du socle applicatif, mises en cache dès l'installation.
const PRECACHE = [
  './',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icon.svg'
];

// Domaines externes dont les réponses peuvent être mises en cache.
const CACHEABLE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll échoue en bloc si une seule ressource manque : on ajoute donc
      // chaque entrée séparément pour rester tolérant.
      Promise.all(PRECACHE.map(url =>
        cache.add(new Request(url, {cache: 'reload'})).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('psy1-cache-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isCacheable(url) {
  if (url.origin === self.location.origin) return true;
  return CACHEABLE_HOSTS.includes(url.hostname);
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // On ne touche qu'aux lectures : les autres méthodes passent directement.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!isCacheable(url)) return;

  // Navigation : réseau d'abord, cache en secours.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match('./'))
        )
    );
    return;
  }

  // Autres ressources : cache d'abord, puis rafraîchissement en arrière-plan.
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req)
        .then(res => {
          // On mémorise aussi les réponses opaques (status 0) des polices.
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      // Si la ressource est en cache, on la sert tout de suite.
      return hit || network.then(res => res || Response.error());
    })
  );
});

// Permet à la page de déclencher l'activation immédiate d'une nouvelle version.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
