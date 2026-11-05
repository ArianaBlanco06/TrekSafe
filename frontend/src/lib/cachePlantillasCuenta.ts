import { readOfflineJson, writeOfflineJson } from '@/lib/offlineStorage';
import { getSessionScope } from '@/lib/sesion';
import {
  CLAVE_CACHE_PLANTILLAS,
  crearSobreCache,
  plantillasDesdeSobre,
  type PlantillaCuenta,
} from '@/lib/plantillasCuentaLogica';

/**
 * Caché local de plantillas de cuenta. El servidor (`/api/plantillas`) es la fuente de verdad.
 * El ámbito de sesión (usuarioId + nonce) aísla la caché por cuenta y la invalida al cerrar sesión;
 * además se valida el `usuarioId` del sobre al leer (defensa en profundidad).
 */
export async function leerCachePlantillas(
  usuarioId: string,
  scope = getSessionScope(),
): Promise<PlantillaCuenta[]> {
  const crudo = await readOfflineJson<unknown>(CLAVE_CACHE_PLANTILLAS, null, scope);
  return plantillasDesdeSobre(crudo, usuarioId) ?? [];
}

export async function reemplazarCachePlantillas(
  usuarioId: string,
  plantillas: PlantillaCuenta[],
  scope = getSessionScope(),
): Promise<void> {
  await writeOfflineJson(CLAVE_CACHE_PLANTILLAS, crearSobreCache(usuarioId, plantillas), scope);
}
