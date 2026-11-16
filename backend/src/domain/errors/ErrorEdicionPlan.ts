export type CodigoErrorEdicionPlan =
  | 'EXPEDICION_NO_ENCONTRADA'
  | 'PLAN_NO_EDITABLE'
  | 'SALIDA_YA_INICIADA'
  | 'VERSION_OBSOLETA'
  | 'SALIDA_EN_PASADO'
  | 'RETORNO_INVALIDO'
  | 'TOLERANCIA_INVALIDA'
  | 'CONTACTOS_INVALIDOS'
  | 'DATOS_INVALIDOS';

/** Rechazo de negocio de una edición. No conoce HTTP: el caso de uso lo traduce. */
export class ErrorEdicionPlan extends Error {
  constructor(
    public readonly codigo: CodigoErrorEdicionPlan,
    public readonly versionActual?: number,
  ) {
    super(codigo);
    this.name = 'ErrorEdicionPlan';
  }
}
