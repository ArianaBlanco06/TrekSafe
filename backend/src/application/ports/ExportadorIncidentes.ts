import type { IncidenteReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';

/** El caso de uso solicita fragmentos de archivo sin depender de un formato concreto. */
export interface IExportadorIncidentes {
  exportar(incidentes: AsyncIterable<IncidenteReporte>): AsyncIterable<string>;
}
