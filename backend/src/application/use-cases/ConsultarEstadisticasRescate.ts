import type { IReporteIncidentesDAO } from '../../domain/repositories/IReporteIncidentesDAO.js';
import type { ReporteEstadisticasRescate } from '../dto/estadisticasRescate.dto.js';
import { prepararConsultaReporteIncidentes } from '../queries/prepararConsultaReporteIncidentes.js';

/** Consulta operativa global. Depende solo del DAO de lectura (DIP). */
export class ConsultarEstadisticasRescate {
  constructor(private readonly dao: IReporteIncidentesDAO) {}

  async ejecutar(rescatistaId: string, consulta: unknown): Promise<ReporteEstadisticasRescate> {
    const { actor, filtros } = prepararConsultaReporteIncidentes(rescatistaId, consulta);
    const resumen = await this.dao.consultar(actor, filtros);
    // Lista blanca: nunca propaga campos adicionales devueltos por un adaptador.
    return {
      resumen: { atendidos: resumen.atendidos, abiertos: resumen.abiertos, cerrados: resumen.cerrados },
      filtros,
    };
  }
}
