export type CodigoErrorCoordinacion =
  | 'DATOS_INVALIDOS'
  | 'ALERTA_NO_ENCONTRADA'
  | 'NO_ES_RESCATISTA'
  | 'COORDINACION_YA_ASUMIDA';

/** Responsable vigente de una alerta. Usa los mismos nombres que `Coordinacion`. */
export type ResponsableVigente = {
  responsableId: string;
  nombreResponsable: string;
};

/**
 * Rechazo de negocio al asumir la coordinación de una alerta (HU-39).
 * No conoce HTTP: el caso de uso lo traduce a `ErrorAplicacion`.
 * `responsableVigente` solo acompaña a `COORDINACION_YA_ASUMIDA`.
 */
export class ErrorCoordinacion extends Error {
  constructor(
    public readonly codigo: CodigoErrorCoordinacion,
    public readonly responsableVigente?: ResponsableVigente,
  ) {
    super(codigo);
    this.name = 'ErrorCoordinacion';
  }
}
