export type CodigoErrorCancelacionPlan =
  | 'EXPEDICION_NO_ENCONTRADA'
  | 'PLAN_NO_CANCELABLE'
  | 'DATOS_INVALIDOS';

/** Rechazo de negocio de una cancelación. No conoce HTTP: el caso de uso lo traduce. */
export class ErrorCancelacionPlan extends Error {
  constructor(public readonly codigo: CodigoErrorCancelacionPlan) {
    super(codigo);
    this.name = 'ErrorCancelacionPlan';
  }
}
