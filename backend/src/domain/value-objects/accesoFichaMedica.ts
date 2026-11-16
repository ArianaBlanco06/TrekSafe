import type { EstadoIncidente } from '../repositories/IIncidenteDAO.js';

/**
 * Acceso a la ficha médica de un incidente (HU-50). Catálogos y datos de decisión.
 * Ningún tipo de este archivo contiene datos de salud.
 */
export const MOTIVO_PERMITIDO_FICHA = 'RESPONSABLE_VIGENTE' as const;

export const MOTIVOS_DENEGACION_FICHA = [
  'NO_ES_RESCATISTA',
  'INCIDENTE_NO_ENCONTRADO',
  'INCIDENTE_CERRADO',
  'NO_ES_RESPONSABLE',
  'SIN_CONSENTIMIENTO',
  'CONTEXTO_CAMBIADO',
] as const;

export type MotivoDenegacionFicha = (typeof MOTIVOS_DENEGACION_FICHA)[number];
export type MotivoAccesoFicha = typeof MOTIVO_PERMITIDO_FICHA | MotivoDenegacionFicha;
export type ResultadoAccesoFicha = 'permitido' | 'denegado';

/** "Incidente abierto" = no cerrado: abierto o localizado (D1). */
export const ESTADOS_INCIDENTE_CON_ACCESO_FICHA: readonly EstadoIncidente[] = ['abierto', 'localizado'];

/** Datos de decisión: sin carga cifrada ni datos de salud. */
export type ContextoAccesoFicha = Readonly<{
  incidenteId: string;
  actorId: string;
  actorEsRescatista: boolean;
  incidente: Readonly<{
    id: string;
    expedicionId: string;
    senderistaId: string;
    estado: EstadoIncidente;
    responsableId: string;
  }> | null;
  consentimientoVigente: boolean;
}>;

export type DecisionAccesoFicha =
  | Readonly<{ permitido: true; motivo: typeof MOTIVO_PERMITIDO_FICHA; incidenteId: string }>
  | Readonly<{ permitido: false; motivo: MotivoDenegacionFicha; incidenteId: string }>;
