import type { ResultadoRelevo } from '../../domain/repositories/IIncidenteDAO.js';
import { rechazarRelevoSchema } from '../dto/relevo.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de rechazo un relevo. Es el mismo para cualquier repetición del comando. */
export type ResultadoRechazarRelevo = ResultadoRelevo;

/**
 * Comando de HU-40: "rechazo este relevo". Sin motivo ni versión: lo que se resuelve es
 * una propuesta concreta (`relevoId`), cuya vigencia garantizan el estado `pendiente` y el
 * bloqueo del incidente. Quién y cuándo los registra la persistencia.
 *
 * El rescatista, la expedición y el relevo vienen del JWT y de la ruta.
 */
export class ComandoRechazarRelevo implements Comando<ResultadoRechazarRelevo> {
  private constructor(
    readonly operacionId: string,
    readonly expedicionId: string,
    readonly relevoId: string,
    readonly rescatistaId: string,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si algún dato no cumple `rechazarRelevoSchema`.
   */
  static crear(
    rescatistaId: string,
    expedicionId: string,
    relevoId: string,
    cuerpoSinValidar: unknown,
  ): ComandoRechazarRelevo {
    const operacionId =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null
        ? (cuerpoSinValidar as { operacionId?: unknown }).operacionId
        : undefined;
    const entrada = rechazarRelevoSchema.parse({ operacionId, expedicionId, relevoId, rescatistaId });
    return new ComandoRechazarRelevo(entrada.operacionId, entrada.expedicionId, entrada.relevoId, entrada.rescatistaId);
  }
}
