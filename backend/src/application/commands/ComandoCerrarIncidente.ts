import type { InformeCierre } from '../../domain/repositories/ICierreIncidenteDAO.js';
import type { ResultadoRescate } from '../../domain/value-objects/cierreIncidente.js';
import { cerrarIncidenteSchema, cuerpoCerrarIncidenteSchema } from '../dto/cierreIncidente.dto.js';
import type { Comando } from './IEjecutorComando.js';

/** `ya_cerrado_mismo_comando`: el comando ya estaba registrado; no se escribió nada nuevo. */
export type ResultadoCierre = Readonly<{
  tipo: 'cerrado' | 'ya_cerrado_mismo_comando';
  informe: InformeCierre;
}>;

/**
 * Comando de HU-42: "cierro el incidente con un informe (resultado y resumen)".
 *
 * - Identidad: `comandoId`, generado por el cliente una vez por intento. Repetirlo devuelve
 *   el mismo informe sin crear otro. `operacionId` vale lo mismo (lo exige `Comando<T>`).
 * - Parámetros: incidente, rescatista (el actor del JWT), resultado del catálogo y resumen
 *   recortado. Ya validados e inmutables.
 */
export class ComandoCerrarIncidente implements Comando<ResultadoCierre> {
  readonly operacionId: string;

  private constructor(
    readonly comandoId: string,
    readonly incidenteId: string,
    readonly rescatistaId: string,
    readonly resultado: ResultadoRescate,
    readonly resumen: string,
  ) {
    this.operacionId = comandoId;
    Object.freeze(this);
  }

  /**
   * Construye el comando a partir de la petición.
   * @throws ZodError si algún dato es inválido o el cuerpo trae claves desconocidas
   *   (por ejemplo `rescatistaId`, `estadoExpedicion` o `confirmarRetorno`).
   */
  static crear(rescatistaId: string, incidenteId: string, cuerpoSinValidar: unknown): ComandoCerrarIncidente {
    // Un cuerpo que no es objeto se valida como {} y produce el 400 de campos obligatorios.
    const sinValidar =
      typeof cuerpoSinValidar === 'object' && cuerpoSinValidar !== null && !Array.isArray(cuerpoSinValidar)
        ? cuerpoSinValidar
        : {};
    const cuerpo = cuerpoCerrarIncidenteSchema.parse(sinValidar);
    const datos = cerrarIncidenteSchema.parse({ ...cuerpo, incidenteId, rescatistaId });
    return new ComandoCerrarIncidente(datos.comandoId, datos.incidenteId, datos.rescatistaId, datos.resultado, datos.resumen);
  }
}
