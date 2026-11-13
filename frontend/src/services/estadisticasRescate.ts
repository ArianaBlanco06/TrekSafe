import { api } from './clienteApi';
import type { ResultadoRescate } from './cierreIncidente';

export type CriterioFechaReporte = 'apertura' | 'cierre';
export type ConsultaEstadisticasRescate = Readonly<{
  fechaDesde: string;
  fechaHasta: string;
  criterioFecha: CriterioFechaReporte;
  zona?: string;
  resultado?: ResultadoRescate;
}>;

export type ReporteEstadisticasRescate = Readonly<{
  resumen: Readonly<{ atendidos: number; abiertos: number; cerrados: number }>;
  filtros: Readonly<{
    fechaDesde: string;
    fechaHasta: string;
    criterioFecha: CriterioFechaReporte;
    zona: string | null;
    resultado: ResultadoRescate | null;
    zonaHoraria: 'UTC';
    desdeInclusivo: string;
    hastaExclusivo: string;
  }>;
}>;

export function obtenerEstadisticasRescate(filtros: ConsultaEstadisticasRescate) {
  const params = new URLSearchParams({
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    criterioFecha: filtros.criterioFecha,
  });
  if (filtros.zona?.trim()) params.set('zona', filtros.zona.trim());
  if (filtros.resultado) params.set('resultado', filtros.resultado);
  return api.get<ReporteEstadisticasRescate>(`/rescate/estadisticas?${params}`, true);
}
