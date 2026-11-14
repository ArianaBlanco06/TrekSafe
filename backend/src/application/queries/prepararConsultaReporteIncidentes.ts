import { z } from 'zod';
import { ErrorFiltrosReporteIncidentes } from '../../domain/errors/ErrorFiltrosReporteIncidentes.js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { consultaEstadisticasRescateSchema } from '../dto/estadisticasRescate.dto.js';

/** Una sola validación de actor y filtros para HU-47 y HU-48. */
export function prepararConsultaReporteIncidentes(rescatistaId: string, consulta: unknown) {
  const actor = z.string().uuid().parse(rescatistaId);
  const datos = consultaEstadisticasRescateSchema.parse(consulta);
  try {
    return { actor, filtros: new FiltrosReporteIncidentes(datos) };
  } catch (error) {
    if (error instanceof ErrorFiltrosReporteIncidentes) throw new ErrorAplicacion(400, error.message, error.codigo);
    throw error;
  }
}
