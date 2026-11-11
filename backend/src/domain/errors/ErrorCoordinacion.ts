export type CodigoErrorCoordinacion =
  | 'DATOS_INVALIDOS'
  | 'ALERTA_NO_ENCONTRADA'
  | 'NO_ES_RESCATISTA'
  | 'COORDINACION_YA_ASUMIDA';

/** Códigos de rechazo de proponer, aceptar, rechazar o cancelar un relevo (HU-40, migración 019). */
export type CodigoErrorRelevo =
  | 'DATOS_INVALIDOS'
  | 'INCIDENTE_NO_ENCONTRADO'
  | 'RELEVO_NO_ENCONTRADO'
  | 'NO_ES_RESCATISTA'
  | 'INCIDENTE_CERRADO'
  | 'NO_ES_RESPONSABLE'
  | 'NO_ES_DESTINATARIO'
  | 'NO_ES_PROPONENTE'
  | 'DESTINATARIO_INVALIDO'
  | 'DESTINATARIO_NO_VALIDADO'
  | 'VERSION_DESACTUALIZADA'
  | 'RELEVO_PENDIENTE'
  | 'RELEVO_YA_RESUELTO';

/** Relevo pendiente tal como lo ve cualquier rescatista: sin el motivo. */
export type RelevoPendientePublico = {
  relevoId: string;
  destinatarioId: string;
  nombreDestinatario: string;
  solicitadoEn: string;
};

/** Estado en el que ya quedó un relevo resuelto (acompaña a `RELEVO_YA_RESUELTO`). */
export type EstadoRelevoResuelto = 'aceptado' | 'rechazado' | 'cancelado';

/** Datos que acompañan a algunos rechazos de relevo. */
export type DetalleErrorRelevo = {
  /** Solo con `VERSION_DESACTUALIZADA`: la versión vigente del incidente. */
  versionActual?: number;
  /** Solo con `RELEVO_PENDIENTE`: el relevo que bloquea la propuesta. */
  relevoPendiente?: RelevoPendientePublico;
  /** Solo con `RELEVO_YA_RESUELTO`: cómo quedó el relevo (para decirlo al usuario). */
  estadoRelevo?: EstadoRelevoResuelto;
};

/** Responsable vigente de una alerta. Usa los mismos nombres que `Coordinacion`. */
export type ResponsableVigente = {
  responsableId: string;
  nombreResponsable: string;
};

/**
 * Rechazo de negocio de la coordinación de una alerta. No conoce HTTP: el caso de uso lo
 * traduce a `ErrorAplicacion`.
 * - HU-39 (asumir): `ErrorCoordinacion` con `CodigoErrorCoordinacion`; `responsableVigente`
 *   solo acompaña a `COORDINACION_YA_ASUMIDA`.
 * - HU-40 (relevo): `ErrorCoordinacion<CodigoErrorRelevo>`; `detalle` acompaña a
 *   `VERSION_DESACTUALIZADA`, `RELEVO_PENDIENTE` y `RELEVO_YA_RESUELTO`.
 */
export class ErrorCoordinacion<C extends string = CodigoErrorCoordinacion> extends Error {
  constructor(
    public readonly codigo: C,
    public readonly responsableVigente?: ResponsableVigente,
    public readonly detalle?: DetalleErrorRelevo,
  ) {
    super(codigo);
    this.name = 'ErrorCoordinacion';
  }
}
