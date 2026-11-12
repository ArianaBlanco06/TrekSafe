import type { EstadoExpedicion } from '../value-objects/enums.js';
import type { ResultadoRescate } from '../value-objects/cierreIncidente.js';
import type { EstadoIncidente } from './IIncidenteDAO.js';

/** Informe del cierre operativo del rescate (HU-42). Uno por incidente; solo se anexa. Sin datos médicos. */
export type InformeCierre = Readonly<{
  id: string;
  incidenteId: string;
  expedicionId: string;
  resultado: ResultadoRescate;
  resumen: string;
  cerradoPorId: string;
  nombreCerradoPor: string;
  /** Hora del servidor, ISO 8601 en UTC (igual a `incidentes.cerrado_en`). */
  cerradoEn: string;
  /** La entrada de tipo 'cierre' de la bitácora. */
  entradaBitacoraId: string;
  /** Leído, nunca modificado por el cierre (CA-3). */
  estadoExpedicion: EstadoExpedicion;
}>;

/** `comandoId` es también el `operacion_id` de la entrada de cierre de la bitácora. */
export type SolicitudCierreIncidente = Readonly<{
  comandoId: string;
  incidenteId: string;
  rescatistaId: string;
  resultado: ResultadoRescate;
  resumen: string;
}>;

export type ResultadoRegistroCierre = Readonly<{
  informe: InformeCierre;
  /** `true` si no se escribió nada nuevo: el mismo comando ya estaba registrado. */
  repetido: boolean;
}>;

export type SolicitudLocalizacionIncidente = Readonly<{
  operacionId: string;
  incidenteId: string;
  rescatistaId: string;
}>;

/** Estado del incidente tras marcar la persona localizada. */
export type EstadoIncidenteActual = Readonly<{
  id: string;
  expedicionId: string;
  estado: EstadoIncidente;
  version: number;
  responsableId: string;
  nombreResponsable: string;
}>;

export type ResultadoLocalizacion = Readonly<{
  incidente: EstadoIncidenteActual;
  repetido: boolean;
}>;

/** Escritura del cierre (ISP). */
export interface IRegistroCierreIncidente {
  /**
   * Atómico (fila del incidente bloqueada con FOR UPDATE), idempotente por `comandoId`.
   * Anexa la entrada 'cierre' a la bitácora y no modifica la expedición.
   * @throws ErrorCierreIncidente si alguna regla de negocio lo rechaza.
   */
  cerrar(solicitud: SolicitudCierreIncidente): Promise<ResultadoRegistroCierre>;
}

/** Escritura de "persona localizada" (ISP). */
export interface IRegistroLocalizacionIncidente {
  /**
   * abierto → localizado, solo el responsable vigente, idempotente por `operacionId`.
   * @throws ErrorCierreIncidente si alguna regla de negocio lo rechaza.
   */
  marcarLocalizado(solicitud: SolicitudLocalizacionIncidente): Promise<ResultadoLocalizacion>;
}

/** Lectura (ISP). */
export interface ILectorCierreIncidente {
  /** Informe más reciente de cualquier incidente cerrado de la expedición, o `null`. */
  ultimoCierreDeExpedicion(expedicionId: string): Promise<InformeCierre | null>;
}

export interface ICierreIncidenteDAO
  extends IRegistroCierreIncidente,
    IRegistroLocalizacionIncidente,
    ILectorCierreIncidente {}
