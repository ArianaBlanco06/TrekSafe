import type { ResultadoAmpliacionRetorno } from '../../domain/repositories/IExpedicionDAO.js';
import { ampliarRetornoSchema } from '../dto/expedicion.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de ampliar el retorno. Es el mismo para cualquier repetición de la operación. */
export type ResultadoAmpliarRetorno = ResultadoAmpliacionRetorno;

/**
 * Comando de HU-35: "amplía mi retorno estos minutos, porque...".
 *
 * - Identidad: `operacionId`, generado por el cliente una vez por intento. Repetirlo
 *   devuelve el mismo resultado sin sumar los minutos dos veces.
 * - Parámetros: plan, propietario, versión esperada, minutos y motivo, ya validados
 *   e inmutables.
 * - Resultado: `ResultadoAmpliarRetorno`, que produce su ejecutor `AmpliarRetorno`.
 */
export class ComandoAmpliarRetorno implements Comando<ResultadoAmpliarRetorno> {
  private constructor(
    readonly operacionId: string,
    readonly expedicionId: string,
    readonly senderistaId: string,
    readonly versionEsperada: number,
    readonly minutos: number,
    readonly motivo: string,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si el cuerpo no cumple `ampliarRetornoSchema`.
   */
  static crear(
    senderistaId: string,
    expedicionId: string,
    cuerpoSinValidar: unknown,
  ): ComandoAmpliarRetorno {
    const entrada = ampliarRetornoSchema.parse(cuerpoSinValidar ?? {});
    return new ComandoAmpliarRetorno(
      entrada.operacionId,
      expedicionId,
      senderistaId,
      entrada.versionEsperada,
      entrada.minutos,
      entrada.motivo,
    );
  }
}
