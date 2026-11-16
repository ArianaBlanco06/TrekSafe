import type { TipoEntradaBitacora } from '../value-objects/entradaBitacora.js';
import type { EstadoIncidente } from './IIncidenteDAO.js';

export type { TipoEntradaBitacora };

/** Una entrada de la bitácora del incidente. Solo se anexa. Sin datos médicos. */
export type EntradaBitacora = Readonly<{
  id: string;
  incidenteId: string;
  tipo: TipoEntradaBitacora;
  texto: string;
  autorId: string;
  nombreAutor: string;
  /** Hora del servidor, ISO 8601 en UTC. */
  registradaEn: string;
  corrigeEntradaId: string | null;
}>;

/** Estado actual del incidente, separado de las entradas. */
export type ResumenIncidenteBitacora = Readonly<{
  id: string;
  expedicionId: string;
  estado: EstadoIncidente;
  version: number;
  responsableId: string;
  nombreResponsable: string;
}>;

export type BitacoraIncidente = Readonly<{
  incidente: ResumenIncidenteBitacora;
  entradas: readonly EntradaBitacora[];
}>;

/** El tipo se deduce: con `corrigeEntradaId` es 'correccion'; sin él, 'nota'. */
export type SolicitudEntradaBitacora = Readonly<{
  incidenteId: string;
  autorId: string;
  texto: string;
  corrigeEntradaId: string | null;
  operacionId: string;
}>;

export type ResultadoEntradaBitacora = Readonly<{
  entrada: EntradaBitacora;
  /** `true` si no se escribió nada nuevo: la misma operación ya estaba registrada. */
  repetido: boolean;
}>;

/** Lectura (ISP): quien solo consulta no depende de la escritura. */
export interface ILectorBitacoraIncidente {
  /**
   * `null` si el incidente no existe. Entradas en orden (registradaEn, secuencia)
   * ascendente. Disponible en cualquier estado del incidente, también cerrado.
   */
  listar(incidenteId: string): Promise<BitacoraIncidente | null>;
}

/** Escritura (ISP). Sin actualización ni eliminación: la bitácora solo se anexa. */
export interface IRegistroBitacoraIncidente {
  /**
   * Atómico: autoriza contra el responsable vigente con la fila del incidente bloqueada,
   * de modo que un relevo o un cierre concurrentes se serializan con la escritura.
   * Idempotente por `operacionId`.
   * @throws ErrorBitacoraIncidente si alguna regla de negocio la rechaza.
   */
  agregar(solicitud: SolicitudEntradaBitacora): Promise<ResultadoEntradaBitacora>;
}

export interface IBitacoraIncidenteDAO extends ILectorBitacoraIncidente, IRegistroBitacoraIncidente {}
