const CLAVES_LEGACY = new Set([
  'treksafe:contacts-cache', 'treksafe-route-templates', 'treksafe-expedition-drafts',
]);
let limpiezaPendiente: Promise<void> = Promise.resolve();

function limpiarAlmacenamientoLocal(completo: boolean): void {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (CLAVES_LEGACY.has(key) || key.startsWith('treksafe:sw-fallback:')
        || (completo && (key.startsWith('treksafe:offline-v2:')
          || key.startsWith('treksafe-reminder-dismissed-')))) {
        storage.removeItem(key);
      }
    }
  }
}

async function limpiar(completo: boolean): Promise<void> {
  try { limpiarAlmacenamientoLocal(completo); } catch { /* storage no accesible */ }
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) {
    if (name.startsWith('treksafe-api') || name === 'treksafe-offline-v1'
      || (completo && name.startsWith('treksafe-offline-v2-'))) {
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
}

function programarLimpieza(completo: boolean): Promise<void> {
  limpiezaPendiente = limpiezaPendiente.catch(() => undefined).then(() => limpiar(completo));
  return limpiezaPendiente;
}

export const retirarDatosLegacy = () => programarLimpieza(false);
export const eliminarDatosPrivados = () => programarLimpieza(true);
