import { z } from 'zod';
import { ErrorFiltrosReporteIncidentes } from '../../domain/errors/ErrorFiltrosReporteIncidentes.js';
import type { IReporteIncidentesDAO } from '../../domain/repositories/IReporteIncidentesDAO.js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { consultaEstadisticasRescateSchema, type ReporteEstadisticasRescate } from '../dto/estadisticasRescate.dto.js';

/** Consulta operativa global. Depende solo del DAO de lectura (DIP). */
export class ConsultarEstadisticasRescate {
  constructor(private readonly dao: IReporteIncidentesDAO) {}

  async ejecutar(rescatistaId: string, consulta: unknown): Promise<ReporteEstadisticasRescate> {
    const actor = z.string().uuid().parse(rescatistaId);
    const datos = consultaEstadisticasRescateSchema.parse(consulta);
    let filtros: FiltrosReporteIncidentes;
    try {
      filtros = new FiltrosReporteIncidentes(datos);
    } catch (error) {
      if (error instanceof ErrorFiltrosReporteIncidentes) {
        throw new ErrorAplicacion(400, error.message, error.codigo);
      }
      throw error;
    }
    const resumen = await this.dao.consultar(actor, filtros);
    // Lista blanca: nunca propaga campos adicionales devueltos por un adaptador.
    return {
      resumen: { atendidos: resumen.atendidos, abiertos: resumen.abiertos, cerrados: resumen.cerrados },
      filtros,
    };
  }
}
