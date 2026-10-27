import { readOfflineJson, writeOfflineJson } from '@/lib/offlineStorage';
import {
  claveCachePlantillas,
  crearSobreCache,
  plantillasDesdeSobre,
  type PlantillaCuenta,
} from '@/lib/plantillasCuentaLogica';

/** Caché local de plantillas de cuenta, aislada por usuario. El servidor es la fuente de verdad. */
export async function leerCachePlantillas(usuarioId: string): Promise<PlantillaCuenta[]> {
  const crudo = await readOfflineJson<unknown>(claveCachePlantillas(usuarioId), null);
  return plantillasDesdeSobre(crudo, usuarioId) ?? [];
}

export async function reemplazarCachePlantillas(
  usuarioId: string,
  plantillas: PlantillaCuenta[],
): Promise<void> {
  await writeOfflineJson(claveCachePlantillas(usuarioId), crearSobreCache(usuarioId, plantillas));
}
