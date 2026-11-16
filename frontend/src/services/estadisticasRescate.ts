import { api, ErrorClienteApi, peticionArchivoApi } from './clienteApi';
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

function parametrosReporte(filtros: ConsultaEstadisticasRescate): string {
  const params = new URLSearchParams({
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    criterioFecha: filtros.criterioFecha,
  });
  if (filtros.zona?.trim()) params.set('zona', filtros.zona.trim());
  if (filtros.resultado) params.set('resultado', filtros.resultado);
  return params.toString();
}

export function obtenerEstadisticasRescate(filtros: ConsultaEstadisticasRescate) {
  return api.get<ReporteEstadisticasRescate>(`/rescate/estadisticas?${parametrosReporte(filtros)}`, true);
}

export type ArchivoCsvReporte = Readonly<{ contenido: Blob; nombre: string }>;

export async function descargarCsvEstadisticas(filtros: ConsultaEstadisticasRescate, signal: AbortSignal): Promise<ArchivoCsvReporte> {
  const contenido = await peticionArchivoApi(`/rescate/estadisticas.csv?${parametrosReporte(filtros)}`, {
    method: 'GET', headers: { Accept: 'text/csv' }, signal,
  }, true);
  if (!/^text\/csv(?:;|$)/i.test(contenido.type) || contenido.size === 0) {
    throw new ErrorClienteApi('No se recibió un archivo CSV válido.', 0, 'ARCHIVO_CSV_INVALIDO');
  }
  const nombre = `incidentes-${filtros.criterioFecha}-${filtros.fechaDesde}_${filtros.fechaHasta}.csv`;
  return { contenido, nombre: nombre.replace(/[^a-zA-Z0-9_.-]/g, '_') };
}
