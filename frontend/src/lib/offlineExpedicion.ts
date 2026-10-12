import { readOfflineJson, writeOfflineJson } from '@/lib/offlineStorage';

const CLAVE_PLANTILLAS = 'route-templates';
const CLAVE_BORRADORES = 'expedition-drafts';

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

export type BorradorExpedicion = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string;
  coordenadasFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
  guardadoEn: string;
};

export async function listarPlantillasRuta(): Promise<PlantillaRuta[]> {
  const plantillas = await readOfflineJson<PlantillaRuta[]>(CLAVE_PLANTILLAS, [], [
    'treksafe-route-templates',
  ]);
  return plantillas.sort(
    (a, b) => b.vecesUsada - a.vecesUsada || b.actualizadoEn.localeCompare(a.actualizadoEn),
  );
}

export async function guardarPlantillaRuta(
  input: Omit<PlantillaRuta, 'id' | 'vecesUsada' | 'actualizadoEn'>,
): Promise<void> {
  const plantillas = await listarPlantillasRuta();
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

  await writeOfflineJson(CLAVE_PLANTILLAS, plantillas.slice(0, 12));
}

export async function listarBorradoresExpedicion(): Promise<BorradorExpedicion[]> {
  const borradores = await readOfflineJson<BorradorExpedicion[]>(CLAVE_BORRADORES, [], [
    'treksafe-expedition-drafts',
  ]);
  return borradores.sort((a, b) => b.guardadoEn.localeCompare(a.guardadoEn));
}

export async function guardarBorradorExpedicion(
  borrador: Omit<BorradorExpedicion, 'id' | 'guardadoEn'>,
): Promise<BorradorExpedicion> {
  const borradores = await listarBorradoresExpedicion();
  const entrada: BorradorExpedicion = {
    id: crypto.randomUUID(),
    ...borrador,
    guardadoEn: new Date().toISOString(),
  };
  await writeOfflineJson(CLAVE_BORRADORES, [entrada, ...borradores].slice(0, 5));
  return entrada;
}

export async function eliminarBorradorExpedicion(id: string): Promise<void> {
  const borradores = await listarBorradoresExpedicion();
  await writeOfflineJson(
    CLAVE_BORRADORES,
    borradores.filter((b) => b.id !== id),
  );
}
