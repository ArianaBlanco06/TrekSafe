import type {
  ContextoAccesoFicha,
  MotivoAccesoFicha,
  ResultadoAccesoFicha,
} from '../value-objects/accesoFichaMedica.js';

/** tipoSangre se guarda en claro en fichas_medicas (esquema base); cargaCifrada = condiciones_encriptadas. */
export type FichaCifrada = Readonly<{ tipoSangre: string; cargaCifrada: string }>;

export type SolicitudRegistroAccesoFicha = Readonly<{
  incidenteId: string;
  actorId: string;
  resultado: ResultadoAccesoFicha;
  motivo: MotivoAccesoFicha;
}>;

export type RegistroAccesoFicha = Readonly<{
  id: string;
  incidenteId: string;
  expedicionId: string | null;
  senderistaId: string | null;
  actorId: string;
  resultado: ResultadoAccesoFicha;
  motivo: MotivoAccesoFicha;
  /** ISO UTC, hora del servidor. */
  registradoEn: string;
}>;

/** Datos para decidir (sin salud). */
export interface ILectorContextoFichaIncidente {
  leerContexto(incidenteId: string, actorId: string): Promise<ContextoAccesoFicha>;
}

/**
 * Guarda de lectura: entrega el texto cifrado solo si el actor sigue siendo el responsable
 * de un incidente no cerrado en el momento de leer. `null` si el contexto cambió.
 */
export interface ILectorFichaCifradaResponsable {
  leerSiResponsable(incidenteId: string, actorId: string): Promise<FichaCifrada | null>;
}

/** Auditoría anexada de cada acceso, permitido o denegado. Sin datos de salud. */
export interface IRegistroAccesoFicha {
  registrar(solicitud: SolicitudRegistroAccesoFicha): Promise<RegistroAccesoFicha>;
}

export interface IFichaMedicaIncidenteDAO
  extends ILectorContextoFichaIncidente,
    ILectorFichaCifradaResponsable,
    IRegistroAccesoFicha {}
