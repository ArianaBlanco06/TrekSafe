// Retira respuestas privadas de workers anteriores sin borrar el shell offline
// ni los borradores v2 de una sesion abierta. Logout elimina tambien estos.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('treksafe-api') || name === 'treksafe-offline-v1') {
        await caches.delete(name);
        continue;
      }
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (request.headers.has('authorization')
          || /^\/(?:api|rest\/v1)(?:\/|$)/.test(new URL(request.url).pathname)) {
          await cache.delete(request);
        }
      }
    }
  })());
});
