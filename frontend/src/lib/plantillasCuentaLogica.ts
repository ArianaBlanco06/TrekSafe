// Lógica pura de la caché de plantillas de cuenta (HU-29): sin E/S ni imports con alias,
// para poder probarla con el ejecutor de pruebas del backend.

export const ESQUEMA_CACHE_PLANTILLAS = 1;

export type PlantillaCuenta = {
  id: string;
  nombre: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
  version: number;
  creadoEn: string;
  actualizadoEn: string;
};

export type SobreCachePlantillas = {
  esquema: typeof ESQUEMA_CACHE_PLANTILLAS;
  usuarioId: string;
  sincronizadoEn: string;
  plantillas: PlantillaCuenta[];
};

export type BorradorDesdePlantilla = {
  origen: 'plantilla' | 'historial';
  origenId: string;
  descripcionOrigen: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  cantidadContactosNoVigentes: number;
  nombresAcompanantes: string[];
  horaInicio: null;
  horaRetornoEstimada: null;
  requiereFechasNuevas: true;
};

export function claveCachePlantillas(usuarioId: string): string {
  return `plantillas-cuenta:v${ESQUEMA_CACHE_PLANTILLAS}:${usuarioId}`;
}

export function crearSobreCache(
  usuarioId: string,
  plantillas: PlantillaCuenta[],
  ahora: Date = new Date(),
): SobreCachePlantillas {
  return {
    esquema: ESQUEMA_CACHE_PLANTILLAS,
    usuarioId,
    sincronizadoEn: ahora.toISOString(),
    plantillas: [...plantillas],
  };
}

function esPlantilla(valor: unknown): valor is PlantillaCuenta {
  if (typeof valor !== 'object' || valor === null) return false;
  const p = valor as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.nombre === 'string' &&
    typeof p.lugarInicio === 'string' &&
    typeof p.lugarFin === 'string' &&
    typeof p.minutosTolerancia === 'number' &&
    typeof p.version === 'number' &&
    Array.isArray(p.idsContactos) &&
    Array.isArray(p.nombresAcompanantes)
  );
}

/** Devuelve las plantillas solo si el sobre es de este esquema y de este usuario; si no, null. */
export function plantillasDesdeSobre(valor: unknown, usuarioId: string): PlantillaCuenta[] | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const sobre = valor as Partial<SobreCachePlantillas>;
  if (sobre.esquema !== ESQUEMA_CACHE_PLANTILLAS) return null;
  if (sobre.usuarioId !== usuarioId) return null;
  if (!Array.isArray(sobre.plantillas)) return null;
  return sobre.plantillas.filter(esPlantilla);
}

/** Orden de la API: actualizadoEn descendente, luego id ascendente. */
export function ordenarPlantillas(plantillas: PlantillaCuenta[]): PlantillaCuenta[] {
  return [...plantillas].sort(
    (a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn) || a.id.localeCompare(b.id),
  );
}

/**
 * Borrador sin conexión: misma regla que el servidor (fechas vacías, solo contactos vigentes),
 * pero "vigente" significa presente en los contactos cacheados del dispositivo.
 */
export function construirBorradorDesdeCache(
  plantilla: PlantillaCuenta,
  idsContactosConocidos: readonly string[],
): BorradorDesdePlantilla {
  const conocidos = new Set(idsContactosConocidos);
  const sugeridos = [...new Set(plantilla.idsContactos)];
  const idsContactos = sugeridos.filter((id) => conocidos.has(id));
  return {
    origen: 'plantilla',
    origenId: plantilla.id,
    descripcionOrigen: `Plantilla «${plantilla.nombre}»`,
    lugarInicio: plantilla.lugarInicio,
    lugarFin: plantilla.lugarFin,
    coordenadasInicio: plantilla.coordenadasInicio,
    coordenadasFin: plantilla.coordenadasFin,
    minutosTolerancia: plantilla.minutosTolerancia,
    idsContactos,
    cantidadContactosNoVigentes: sugeridos.length - idsContactos.length,
    nombresAcompanantes: [...plantilla.nombresAcompanantes],
    horaInicio: null,
    horaRetornoEstimada: null,
    requiereFechasNuevas: true,
  };
}

export function mensajeAplicacionBorrador(borrador: BorradorDesdePlantilla): string {
  const base = `${borrador.descripcionOrigen} aplicada. Ingresa las nuevas fechas de salida y retorno.`;
  const n = borrador.cantidadContactosNoVigentes;
  if (n === 0) return base;
  const detalle =
    n === 1
      ? '1 contacto de la plantilla ya no está vigente y se omitió'
      : `${n} contactos de la plantilla ya no están vigentes y se omitieron`;
  return `${base} Aviso: ${detalle}. Revisa tus contactos de alerta.`;
}
