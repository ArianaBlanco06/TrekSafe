import type { ResultadoLocalizacion } from '../../domain/repositories/ICierreIncidenteDAO.js';
import { cuerpoMarcarLocalizadoSchema, marcarLocalizadoSchema } from '../dto/cierreIncidente.dto.js';
import type { Comando } from './IEjecutorComando.js';

export type ResultadoMarcarLocalizado = ResultadoLocalizacion;

/**
 * Comando de HU-42: "marco la persona como localizada" (abierto → localizado).
 * Identidad: `operacionId`, generado por el cliente una vez por intento.
 */
export class ComandoMarcarIncidenteLocalizado implements Comando<ResultadoMarcarLocalizado> {
  private constructor(
    readonly operacionId: string,
    readonly incidenteId: string,
    readonly rescatistaId: string,
  ) {
    Object.freeze(this);
  }

  /** @throws ZodError si algún dato es inválido o el cuerpo trae claves desconocidas. */
  static crear(rescatistaId: string, incidenteId: string, cuerpoSinValidar: unknown): ComandoMarcarIncidenteLocalizado {
    const sinValidar =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null && !Array.isArray(cuerpoSinValidar)
        ? cuerpoSinValidar
        : {};
    const cuerpo = cuerpoMarcarLocalizadoSchema.parse(sinValidar);
    const datos = marcarLocalizadoSchema.parse({ ...cuerpo, incidenteId, rescatistaId });
    return new ComandoMarcarIncidenteLocalizado(datos.operacionId, datos.incidenteId, datos.rescatistaId);
  }
}
