import type { ResultadoRelevo } from '../../domain/repositories/IIncidenteDAO.js';
import { aceptarRelevoSchema } from '../dto/relevo.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de aceptar un relevo. Es el mismo para cualquier repetición del comando. */
export type ResultadoAceptarRelevo = ResultadoRelevo;

/**
 * Comando de HU-40: "acepto este relevo". Aceptar no lleva versión: lo que decide el
 * destinatario es una propuesta concreta (`relevoId`), cuya vigencia garantizan el estado
 * `pendiente` y el bloqueo del incidente (ver docs/hu-40/diseno.md, sección 2.2).
 *
 * El rescatista (quien acepta), la expedición y el relevo vienen del JWT y de la ruta.
 */
export class ComandoAceptarRelevo implements Comando<ResultadoAceptarRelevo> {
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
   * @throws ZodError si algún dato no cumple `aceptarRelevoSchema`.
   */
  static crear(
    rescatistaId: string,
    expedicionId: string,
    relevoId: string,
    cuerpoSinValidar: unknown,
  ): ComandoAceptarRelevo {
    const operacionId =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null
        ? (cuerpoSinValidar as { operacionId?: unknown }).operacionId
        : undefined;
    const entrada = aceptarRelevoSchema.parse({ operacionId, expedicionId, relevoId, rescatistaId });
    return new ComandoAceptarRelevo(entrada.operacionId, entrada.expedicionId, entrada.relevoId, entrada.rescatistaId);
  }
}
