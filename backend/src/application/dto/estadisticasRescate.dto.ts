import { z } from 'zod';
import type { ResumenIncidentes } from '../../domain/repositories/IReporteIncidentesDAO.js';
import type { FiltrosAplicadosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';

/** Solo admite filtros; la identidad del consultante proviene del JWT. */
export const consultaEstadisticasRescateSchema = z.object({
  fechaDesde: z.string(),
  fechaHasta: z.string(),
  criterioFecha: z.string().optional(),
  zona: z.string().optional(),
  resultado: z.string().optional(),
}).strict();

export type ReporteEstadisticasRescate = Readonly<{
  resumen: ResumenIncidentes;
  filtros: FiltrosAplicadosReporteIncidentes;
}>;
