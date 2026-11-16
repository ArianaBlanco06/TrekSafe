import type { ResponsableVigente } from './ErrorCoordinacion.js';

export type CodigoErrorBitacoraIncidente =
  | 'DATOS_INVALIDOS'
  | 'INCIDENTE_NO_ENCONTRADO'
  | 'NO_ES_RESPONSABLE'
  | 'INCIDENTE_CERRADO'
  | 'CORRECCION_INVALIDA'
  | 'OPERACION_YA_REGISTRADA';

/**
 * Rechazo de negocio al escribir en la bitácora del incidente (HU-41).
 * No conoce HTTP: el caso de uso lo traduce a `ErrorAplicacion`.
 * `responsableVigente` solo acompaña a `NO_ES_RESPONSABLE`.
 */
export class ErrorBitacoraIncidente extends Error {
  constructor(
    public readonly codigo: CodigoErrorBitacoraIncidente,
    public readonly responsableVigente?: ResponsableVigente,
  ) {
    super(codigo);
    this.name = 'ErrorBitacoraIncidente';
  }
}
