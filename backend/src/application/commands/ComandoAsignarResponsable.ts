import type { ResultadoAsuncion } from '../../domain/repositories/IIncidenteDAO.js';
import { asignarResponsableSchema } from '../dto/coordinacion.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de asumir la coordinación. Es el mismo para cualquier repetición del comando. */
export type ResultadoAsignarResponsable = ResultadoAsuncion;

/**
 * Comando de HU-39: "asumo la coordinación de esta alerta".
 *
 * - Identidad: `operacionId`, generado por el cliente una vez por intento. Repetirlo
 *   devuelve el mismo incidente sin crear otro.
 * - Parámetros: expedición y rescatista, ya validados e inmutables.
 * - Resultado: `ResultadoAsignarResponsable`, que produce su ejecutor `AsignarResponsable`.
 */
export class ComandoAsignarResponsable implements Comando<ResultadoAsignarResponsable> {
  private constructor(
    readonly operacionId: string,
    readonly expedicionId: string,
    readonly rescatistaId: string,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si algún dato no cumple `asignarResponsableSchema`.
   */
  static crear(
    rescatistaId: string,
    expedicionId: string,
    cuerpoSinValidar: unknown,
  ): ComandoAsignarResponsable {
    const operacionId =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null
        ? (cuerpoSinValidar as { operacionId?: unknown }).operacionId
        : undefined;
    const entrada = asignarResponsableSchema.parse({ operacionId, expedicionId, rescatistaId });
    return new ComandoAsignarResponsable(entrada.operacionId, entrada.expedicionId, entrada.rescatistaId);
  }
}
