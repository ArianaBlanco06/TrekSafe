export type EstadoIncidente = 'abierto' | 'localizado' | 'cerrado';

/** Incidente abierto al asumir la coordinación de una alerta. Sin datos médicos. */
export type Incidente = {
  id: string;
  expedicionId: string;
  estado: EstadoIncidente;
  version: number;
  responsableId: string;
  nombreResponsable: string;
  asumidoEn: string;
};

/**
 * Coordinación vigente de una alerta, tal como la ve cualquier rescatista autorizado
 * (CA-03). Solo identifica al responsable: nunca incluye datos médicos.
 */
export type Coordinacion = {
  incidenteId: string;
  version: number;
  responsableId: string;
  nombreResponsable: string;
  asumidoEn: string;
  /** `true` si el rescatista que consulta es el responsable. */
  esMia: boolean;
  /**
   * Relevo pendiente (HU-40). La clave solo existe mientras haya un relevo pendiente: sin
   * relevo, la coordinación conserva exactamente la forma de HU-39.
   */
  relevoPendiente?: RelevoPendiente;
};

/**
 * Relevo pendiente visto por quien consulta. Lo ve todo rescatista autorizado, sin datos
 * médicos; el `motivo` (texto libre) solo lo reciben las dos partes del relevo.
 */
export type RelevoPendiente = {
  relevoId: string;
  destinatarioId: string;
  nombreDestinatario: string;
  solicitadoEn: string;
  /** `true` si el rescatista que consulta es el destinatario. */
  esParaMi: boolean;
  motivo?: string;
};

export type EstadoRelevo = 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado';

/** Relevo completo: lo reciben solo quienes lo proponen o lo aceptan. */
export type Relevo = {
  id: string;
  estado: EstadoRelevo;
  responsableAnteriorId: string;
  nombreResponsableAnterior: string;
  destinatarioId: string;
  nombreDestinatario: string;
  motivo: string;
  solicitadoEn: string;
  /** Nulo mientras esté pendiente. */
  resueltoEn: string | null;
  /** Quién lo aceptó, rechazó o canceló. Nulo mientras esté pendiente. */
  resueltoPorId: string | null;
  /** Versión del incidente en la que se propuso (auditoría). */
  versionIncidente: number;
};

/** Datos que la persistencia necesita para proponer un relevo. */
export type SolicitudProponerRelevo = {
  expedicionId: string;
  /** Quien propone: el responsable vigente. */
  rescatistaId: string;
  destinatarioId: string;
  motivo: string;
  /** Versión del incidente que vio el cliente. */
  versionIncidente: number;
  operacionId: string;
};

/** Datos que la persistencia necesita para aceptar un relevo. Aceptar no lleva versión. */
export type SolicitudAceptarRelevo = {
  expedicionId: string;
  /** Quien acepta: el destinatario del relevo. */
  rescatistaId: string;
  relevoId: string;
  operacionId: string;
};

/**
 * Datos que la persistencia necesita para rechazar o cancelar un relevo pendiente. Sin motivo
 * ni versión. Rechaza el destinatario y cancela quien propuso; la persistencia lo comprueba.
 */
export type SolicitudResolverRelevo = {
  expedicionId: string;
  /** Quien rechaza (el destinatario) o cancela (quien propuso). */
  rescatistaId: string;
  relevoId: string;
  operacionId: string;
};

export type ResultadoRelevo = {
  /** El incidente tal como queda tras la operación. */
  incidente: Incidente;
  relevo: Relevo;
  /** `true` si no se escribió nada nuevo: la misma operación ya registrada. */
  repetido: boolean;
};

/** Datos que la persistencia necesita para asumir una coordinación. */
export type SolicitudAsuncion = {
  expedicionId: string;
  rescatistaId: string;
  operacionId: string;
};

export type ResultadoAsuncion = {
  incidente: Incidente;
  /** `true` si no se escribió nada nuevo: la misma operación o el mismo responsable. */
  repetido: boolean;
};

export interface IIncidenteDAO {
  /**
   * Asume la coordinación de la alerta de forma atómica e idempotente: una sola
   * transacción y una sola restricción por incidente. Dos solicitudes simultáneas
   * dejan un solo responsable; repetir la misma operación devuelve el mismo incidente.
   * @throws ErrorCoordinacion si alguna regla de negocio la rechaza.
   */
  asumir(solicitud: SolicitudAsuncion): Promise<ResultadoAsuncion>;

  /**
   * Coordinaciones vigentes (incidentes no cerrados) de varias expediciones.
   * Las expediciones sin coordinación no aparecen en el resultado.
   */
  leerCoordinaciones(
    expedicionIds: readonly string[],
    rescatistaId: string,
  ): Promise<Map<string, Coordinacion>>;
}

/**
 * Persistencia del relevo de la coordinación (HU-40). Interfaz aparte de `IIncidenteDAO`
 * (segregación de interfaces): quien solo asume o lee coordinaciones no depende del relevo.
 */
export interface IRelevoDAO {
  /**
   * Propone el relevo de la coordinación (HU-40). No cambia el responsable ni la versión
   * del incidente. A lo sumo hay un relevo pendiente por incidente.
   * @throws ErrorCoordinacion<CodigoErrorRelevo> si alguna regla de negocio lo rechaza.
   */
  proponerRelevo(solicitud: SolicitudProponerRelevo): Promise<ResultadoRelevo>;

  /**
   * Acepta el relevo pendiente (HU-40): en una sola transacción pasa el responsable al
   * destinatario, sube la versión del incidente, resuelve el relevo y registra la
   * transferencia. No compara versión.
   * @throws ErrorCoordinacion<CodigoErrorRelevo> si alguna regla de negocio lo rechaza.
   */
  aceptarRelevo(solicitud: SolicitudAceptarRelevo): Promise<ResultadoRelevo>;

  /**
   * El destinatario rechaza el relevo pendiente (HU-40). Solo resuelve el relevo: el
   * responsable actual conserva la coordinación, la versión no cambia y se puede proponer
   * otro relevo. En un caso cerrado no escribe nada (`INCIDENTE_CERRADO`).
   * @throws ErrorCoordinacion<CodigoErrorRelevo> si alguna regla de negocio lo rechaza.
   */
  rechazarRelevo(solicitud: SolicitudResolverRelevo): Promise<ResultadoRelevo>;

  /**
   * Quien propuso cancela el relevo pendiente (HU-40). Mismos efectos que rechazar.
   * @throws ErrorCoordinacion<CodigoErrorRelevo> si alguna regla de negocio lo rechaza.
   */
  cancelarRelevo(solicitud: SolicitudResolverRelevo): Promise<ResultadoRelevo>;
}
