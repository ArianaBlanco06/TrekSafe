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
