export type CodigoErrorAmpliacionRetorno =
  | 'EXPEDICION_NO_ENCONTRADA'
  | 'DATOS_INVALIDOS'
  | 'RETORNO_NO_AMPLIABLE'
  | 'ALERTA_YA_DECLARADA'
  | 'PLAZO_VENCIDO'
  | 'VERSION_OBSOLETA'
  | 'AMPLIACION_NO_DISPONIBLE';

/** Rechazo de negocio de una ampliación del retorno. No conoce HTTP: el caso de uso lo traduce. */
export class ErrorAmpliacionRetorno extends Error {
  constructor(
    public readonly codigo: CodigoErrorAmpliacionRetorno,
    public readonly versionActual?: number,
  ) {
    super(codigo);
    this.name = 'ErrorAmpliacionRetorno';
  }
}
