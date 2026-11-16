import { cancelarExpedicionSchema } from '../dto/expedicion.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de cancelar un plan. Es el mismo para cualquier repetición. */
export type ResultadoCancelarPlan = {
  id: string;
  version: number;
  estado: 'cancelada';
};

/**
 * Comando de HU-27: "cancelar este plan".
 *
 * - Identidad: `operacionId`, generado por el cliente una vez por intento. Repetirlo
 *   devuelve el mismo resultado sin aplicar la cancelación dos veces.
 * - Parámetros: plan, propietario y motivo opcional, ya validados e inmutables.
 * - Resultado: `ResultadoCancelarPlan`, que produce su ejecutor `CancelarPlan`.
 */
export class ComandoCancelarPlan implements Comando<ResultadoCancelarPlan> {
  private constructor(
    readonly operacionId: string,
    readonly expedicionId: string,
    readonly senderistaId: string,
    readonly motivo: string | null,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si el cuerpo no cumple `cancelarExpedicionSchema`.
   */
  static crear(
    senderistaId: string,
    expedicionId: string,
    cuerpoSinValidar: unknown,
  ): ComandoCancelarPlan {
    const entrada = cancelarExpedicionSchema.parse(cuerpoSinValidar ?? {});
    return new ComandoCancelarPlan(
      entrada.operacionId,
      expedicionId,
      senderistaId,
      entrada.motivo ? entrada.motivo : null,
    );
  }
}
