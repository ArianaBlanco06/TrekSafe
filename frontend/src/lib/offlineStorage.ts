import { getSessionScope } from './sesion';

export type ClaveOffline = 'route-templates' | 'expedition-drafts' | 'account-templates';
const clavesPermitidas = new Set<ClaveOffline>(['route-templates', 'expedition-drafts', 'account-templates']);
const cacheName = (scope: string) => `treksafe-offline-v2-${scope}`;
const lsKey = (scope: string, key: ClaveOffline) => `treksafe:offline-v2:${scope}:${key}`;
const dataUrl = (key: ClaveOffline) => new URL(`/__treksafe_offline__/${key}`, location.origin).href;

export async function readOfflineJson<T>(
  key: ClaveOffline, fallback: T, scope = getSessionScope(),
): Promise<T> {
  if (!scope || scope !== getSessionScope() || !clavesPermitidas.has(key)) return fallback;
  try {
    if (typeof caches !== 'undefined') {
      const hit = await caches.match(dataUrl(key), { cacheName: cacheName(scope) });
      if (hit) {
        const value = await hit.json() as T;
        return scope === getSessionScope() ? value : fallback;
      }
    }
  } catch { /* usar el fallback local de la misma sesion */ }
  try {
    const raw = localStorage.getItem(lsKey(scope, key));
    return scope === getSessionScope() && raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

export async function writeOfflineJson<T>(
  key: ClaveOffline, value: T, scope = getSessionScope(),
): Promise<void> {
  if (!scope || scope !== getSessionScope() || !clavesPermitidas.has(key)) return;
  try { localStorage.setItem(lsKey(scope, key), JSON.stringify(value)); } catch { /* cuota/storage */ }
  if (typeof caches === 'undefined') return;
  const name = cacheName(scope);
  try {
    const cache = await caches.open(name);
    if (scope !== getSessionScope()) {
      await caches.delete(name);
      return;
    }
    await cache.put(dataUrl(key), new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
    }));
    // Una escritura ya iniciada no puede repoblar datos despues del logout.
    if (scope !== getSessionScope()) {
      await caches.delete(name);
      localStorage.removeItem(lsKey(scope, key));
    }
  } catch { /* permanece solo el fallback local de esta sesion */ }
}
