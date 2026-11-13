import { readOfflineJson, writeOfflineJson } from '@/lib/offlineStorage';
import { getSessionScope } from '@/lib/sesion';
import { ColaLocalCache } from '@/infrastructure/ColaLocalCache';
import type { BorradorExpedicion, DatosBorrador } from '@/application/ports/IColaLocal';
export type { BorradorExpedicion } from '@/application/ports/IColaLocal';

const CLAVE_PLANTILLAS = 'route-templates';

export type PlantillaRuta = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio?: string;
  coordenadasFin?: string;
  minutosTolerancia: number;
  vecesUsada: number;
  actualizadoEn: string;
};


export async function listarPlantillasRuta(scope = getSessionScope()): Promise<PlantillaRuta[]> {
  const plantillas = await readOfflineJson<PlantillaRuta[]>(CLAVE_PLANTILLAS, [], scope);
  return plantillas.sort(
    (a, b) => b.vecesUsada - a.vecesUsada || b.actualizadoEn.localeCompare(a.actualizadoEn),
  );
}

export async function guardarPlantillaRuta(
  input: Omit<PlantillaRuta, 'id' | 'vecesUsada' | 'actualizadoEn'>,
  scope = getSessionScope(),
): Promise<void> {
  const plantillas = await listarPlantillasRuta(scope);
  const existente = plantillas.find(
    (p) =>
      p.lugarInicio === input.lugarInicio &&
      p.lugarFin === input.lugarFin &&
      p.coordenadasInicio === input.coordenadasInicio &&
      p.coordenadasFin === input.coordenadasFin,
  );

  if (existente) {
    existente.vecesUsada += 1;
    existente.minutosTolerancia = input.minutosTolerancia;
    existente.actualizadoEn = new Date().toISOString();
  } else {
    plantillas.unshift({
      id: crypto.randomUUID(),
      ...input,
      vecesUsada: 1,
      actualizadoEn: new Date().toISOString(),
    });
  }

  await writeOfflineJson(CLAVE_PLANTILLAS, plantillas.slice(0, 12), scope);
}

export async function listarBorradoresExpedicion(scope = getSessionScope()): Promise<BorradorExpedicion[]> {
  return new ColaLocalCache(scope).listar();
}

export async function guardarBorradorExpedicion(
  borrador: DatosBorrador,
  scope = getSessionScope(),
): Promise<BorradorExpedicion> {
  return new ColaLocalCache(scope).insertar(borrador);
}

export async function eliminarBorradorExpedicion(id: string, scope = getSessionScope()): Promise<void> {
  await new ColaLocalCache(scope).eliminar(id);
}
