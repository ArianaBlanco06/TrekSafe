import { api } from './clienteApi';

/**
 * Bitácora cronológica compartida del incidente (HU-41). No es la bitácora personal de
 * HU-14 (`actualizarBitacoraRescate` en `rescate.ts`). Sin datos médicos.
 */
export type TipoEntradaBitacora = 'nota' | 'correccion' | 'cierre';

export type EntradaBitacoraIncidente = {
  id: string;
  tipo: TipoEntradaBitacora;
  texto: string;
  autor: { autorId: string; nombreAutor: string; esMia: boolean };
  /** Hora del servidor (ISO 8601 en UTC). El cliente no reordena la lista. */
  registradaEn: string;
  corrigeEntradaId: string | null;
};

export type BitacoraIncidente = {
  incidenteId: string;
  expedicionId: string;
  estado: 'abierto' | 'localizado' | 'cerrado';
  responsable: { responsableId: string; nombreResponsable: string };
  esResponsable: boolean;
  /** Solo una pista para la interfaz: el servidor vuelve a autorizar cada escritura. */
  puedeEscribir: boolean;
  entradas: EntradaBitacoraIncidente[];
};

export type NuevaEntradaBitacora = {
  /** Identifica el intento: el mismo valor en un reintento no duplica la entrada. */
  operacionId: string;
  texto: string;
  corrigeEntradaId?: string | null;
};

export function obtenerBitacoraIncidente(incidenteId: string) {
  return api.get<{ bitacora: BitacoraIncidente }>(
    `/rescate/incidentes/${encodeURIComponent(incidenteId)}/bitacora`,
    true,
  );
}

export function agregarEntradaBitacora(incidenteId: string, entrada: NuevaEntradaBitacora) {
  return api.post<{ entrada: EntradaBitacoraIncidente }>(
    `/rescate/incidentes/${encodeURIComponent(incidenteId)}/bitacora`,
    entrada,
    true,
  );
}
