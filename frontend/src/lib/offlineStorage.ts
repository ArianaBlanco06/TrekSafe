import { getSessionScope, getSessionUser } from './sesion';
import { plantillasDesdeSobre } from './plantillasCuentaLogica';

const clavesPermitidas = new Set<string>(['route-templates', 'expedition-drafts']);
const prefijoPlantillasCuenta = 'plantillas-cuenta:v1:';
function clavePermitida(key: string): boolean {
  if (clavesPermitidas.has(key)) return true;
  const usuarioId = getSessionUser()?.id;
  return Boolean(usuarioId) && key === `${prefijoPlantillasCuenta}${usuarioId}`;
}
function contenidoPermitido(key: string, value: unknown): boolean {
  if (!key.startsWith(prefijoPlantillasCuenta)) return true;
  const usuarioId = getSessionUser()?.id;
  return !!usuarioId && plantillasDesdeSobre(value, usuarioId) !== null;
}
const cacheName = (scope: string) => `treksafe-offline-v2-${scope}`;
const lsKey = (scope: string, key: string) => `treksafe:offline-v2:${scope}:${key}`;
const dataUrl = (key: string) => new URL(`/__treksafe_offline__/${encodeURIComponent(key)}`, location.origin).href;

export async function readOfflineJson<T>(
  key: string, fallback: T, scope = getSessionScope(),
): Promise<T> {
  if (!scope || scope !== getSessionScope() || !clavePermitida(key)) return fallback;
  const vigente = () => scope === getSessionScope() && clavePermitida(key);
  try {
    if (typeof caches !== 'undefined') {
      const hit = await (await caches.open(cacheName(scope))).match(dataUrl(key));
      if (hit) {
        const value = await hit.json() as T;
        return vigente() && contenidoPermitido(key, value) ? value : fallback;
      }
    }
  } catch { /* usar el fallback local de la misma sesion */ }
  try {
    const raw = localStorage.getItem(lsKey(scope, key));
    const value = raw ? JSON.parse(raw) as T : fallback;
    return vigente() && contenidoPermitido(key, value) ? value : fallback;
  } catch { return fallback; }
}

export async function writeOfflineJson<T>(
  key: string, value: T, scope = getSessionScope(),
): Promise<void> {
  const vigente = () => scope === getSessionScope() && clavePermitida(key) && contenidoPermitido(key, value);
  if (!scope || !vigente()) return;
  try { localStorage.setItem(lsKey(scope, key), JSON.stringify(value)); } catch { /* cuota/storage */ }
  if (typeof caches === 'undefined') return;
  const name = cacheName(scope);
  try {
    const cache = await caches.open(name);
    if (!vigente()) {
      await caches.delete(name);
      return;
    }
    await cache.put(dataUrl(key), new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
    }));
    // Una escritura ya iniciada no puede repoblar datos despues del logout.
    if (!vigente()) {
      await caches.delete(name);
      localStorage.removeItem(lsKey(scope, key));
    }
  } catch { /* permanece solo el fallback local de esta sesion */ }
}
