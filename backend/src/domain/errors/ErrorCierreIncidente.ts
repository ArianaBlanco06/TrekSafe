import type { ResponsableVigente } from './ErrorCoordinacion.js';

export type CodigoErrorCierreIncidente =
  | 'DATOS_INVALIDOS'
  | 'INCIDENTE_NO_ENCONTRADO'
  | 'NO_ES_RESPONSABLE'
  | 'INCIDENTE_NO_LOCALIZADO'
  | 'INCIDENTE_CERRADO'
  | 'OPERACION_YA_REGISTRADA';

/**
 * Rechazo de negocio al cerrar un incidente o marcarlo como localizado (HU-42).
 * No conoce HTTP: el caso de uso lo traduce a `ErrorAplicacion`.
 * `responsableVigente` solo acompaña a `NO_ES_RESPONSABLE`.
 */
export class ErrorCierreIncidente extends Error {
  constructor(
    public readonly codigo: CodigoErrorCierreIncidente,
    public readonly responsableVigente?: ResponsableVigente,
  ) {
    super(codigo);
    this.name = 'ErrorCierreIncidente';
  }
}
