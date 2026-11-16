import type { ResultadoRelevo } from '../../domain/repositories/IIncidenteDAO.js';
import { cancelarRelevoSchema } from '../dto/relevo.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de cancelo un relevo. Es el mismo para cualquier repetición del comando. */
export type ResultadoCancelarRelevo = ResultadoRelevo;

/**
 * Comando de HU-40: "cancelo este relevo". Sin motivo ni versión: lo que se resuelve es
 * una propuesta concreta (`relevoId`), cuya vigencia garantizan el estado `pendiente` y el
 * bloqueo del incidente. Quién y cuándo los registra la persistencia.
 *
 * El rescatista, la expedición y el relevo vienen del JWT y de la ruta.
 */
export class ComandoCancelarRelevo implements Comando<ResultadoCancelarRelevo> {
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
   * @throws ZodError si algún dato no cumple `cancelarRelevoSchema`.
   */
  static crear(
    rescatistaId: string,
    expedicionId: string,
    relevoId: string,
    cuerpoSinValidar: unknown,
  ): ComandoCancelarRelevo {
    const operacionId =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null
        ? (cuerpoSinValidar as { operacionId?: unknown }).operacionId
        : undefined;
    const entrada = cancelarRelevoSchema.parse({ operacionId, expedicionId, relevoId, rescatistaId });
    return new ComandoCancelarRelevo(entrada.operacionId, entrada.expedicionId, entrada.relevoId, entrada.rescatistaId);
  }
}
