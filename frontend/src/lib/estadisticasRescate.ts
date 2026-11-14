import type { ConsultaEstadisticasRescate } from '@/services/estadisticasRescate';

/** Últimos 30 días de calendario, incluido hoy, conforme al UTC del reporte. */
export function filtrosEstadisticasIniciales(ahora = new Date()): ConsultaEstadisticasRescate {
  const inicio = new Date(ahora);
  inicio.setUTCDate(inicio.getUTCDate() - 29);
  return { fechaDesde: inicio.toISOString().slice(0, 10), fechaHasta: ahora.toISOString().slice(0, 10), criterioFecha: 'apertura' };
}

function esDiaValido(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000-')) return false;
  const dia = new Date(`${fecha}T00:00:00Z`);
  return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha;
}

export function validarFechasEstadisticas(fechaDesde: string, fechaHasta: string): string | null {
  if (!esDiaValido(fechaDesde) || !esDiaValido(fechaHasta)) return 'Selecciona una fecha inicial y final válidas.';
  if (fechaDesde > fechaHasta) return 'La fecha inicial debe ser anterior o igual a la fecha final.';
  return null;
}

export function presentarDiaReporte(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}
