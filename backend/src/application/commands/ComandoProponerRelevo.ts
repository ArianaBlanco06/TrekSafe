import type { ResultadoRelevo } from '../../domain/repositories/IIncidenteDAO.js';
import { proponerRelevoSchema } from '../dto/relevo.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de proponer un relevo. Es el mismo para cualquier repetición del comando. */
export type ResultadoProponerRelevo = ResultadoRelevo;

/**
 * Comando de HU-40: "propongo que este rescatista me releve en la coordinación".
 *
 * - Identidad: `operacionId`, generado por el cliente una vez por intento.
 * - Parámetros: destinatario, motivo y la versión del incidente que vio el cliente
 *   (control optimista: proponer la compara con la vigente).
 * - El rescatista (quien propone) y la expedición vienen del JWT y de la ruta, nunca del cuerpo.
 */
export class ComandoProponerRelevo implements Comando<ResultadoProponerRelevo> {
  private constructor(
    readonly operacionId: string,
    readonly expedicionId: string,
    readonly rescatistaId: string,
    readonly destinatarioId: string,
    readonly motivo: string,
    readonly versionIncidente: number,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si algún dato no cumple `proponerRelevoSchema`.
   */
  static crear(rescatistaId: string, expedicionId: string, cuerpoSinValidar: unknown): ComandoProponerRelevo {
    const cuerpo =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null
        ? (cuerpoSinValidar as Record<string, unknown>)
        : {};
    const entrada = proponerRelevoSchema.parse({
      operacionId: cuerpo.operacionId,
      destinatarioId: cuerpo.destinatarioId,
      motivo: cuerpo.motivo,
      versionIncidente: cuerpo.versionIncidente,
      expedicionId,
      rescatistaId,
    });
    return new ComandoProponerRelevo(
      entrada.operacionId,
      entrada.expedicionId,
      entrada.rescatistaId,
      entrada.destinatarioId,
      entrada.motivo,
      entrada.versionIncidente,
    );
  }
}
