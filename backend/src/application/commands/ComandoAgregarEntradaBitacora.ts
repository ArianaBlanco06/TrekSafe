import type { ResultadoEntradaBitacora } from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import { agregarEntradaBitacoraSchema, cuerpoAgregarEntradaBitacoraSchema } from '../dto/bitacoraIncidente.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** Resultado de añadir una entrada. Es el mismo para cualquier repetición del comando. */
export type ResultadoAgregarEntradaBitacora = ResultadoEntradaBitacora;

/**
 * Comando de HU-41: "añado una entrada (nota o corrección) a la bitácora del incidente".
 *
 * - Identidad: `operacionId`, generado por el cliente una vez por intento. Repetirlo
 *   devuelve la misma entrada sin crear otra.
 * - Parámetros: incidente, autor (el actor del JWT), texto recortado y, si corrige,
 *   la entrada corregida. Ya validados e inmutables.
 */
export class ComandoAgregarEntradaBitacora implements Comando<ResultadoAgregarEntradaBitacora> {
  private constructor(
    readonly operacionId: string,
    readonly incidenteId: string,
    readonly autorId: string,
    readonly texto: string,
    readonly corrigeEntradaId: string | null,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si algún dato es inválido o el cuerpo trae claves desconocidas
   *   (por ejemplo `tipo` o `autorId`: el autor siempre es el actor del JWT).
   */
  static crear(autorId: string, incidenteId: string, cuerpoSinValidar: unknown): ComandoAgregarEntradaBitacora {
    // Un cuerpo que no es objeto se valida como {} y produce el 400 de campos obligatorios.
    const sinValidar =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null && !Array.isArray(cuerpoSinValidar)
        ? cuerpoSinValidar
        : {};
    const cuerpo = cuerpoAgregarEntradaBitacoraSchema.parse(sinValidar);
    const entrada = agregarEntradaBitacoraSchema.parse({ ...cuerpo, incidenteId, autorId });
    return new ComandoAgregarEntradaBitacora(
      entrada.operacionId,
      entrada.incidenteId,
      entrada.autorId,
      entrada.texto,
      entrada.corrigeEntradaId ?? null,
    );
  }
}
