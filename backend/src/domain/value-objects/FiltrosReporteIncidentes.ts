import { ErrorFiltrosReporteIncidentes } from '../errors/ErrorFiltrosReporteIncidentes.js';
import { RESULTADOS_RESCATE, type ResultadoRescate } from './cierreIncidente.js';

export const CRITERIOS_FECHA_REPORTE = ['apertura', 'cierre'] as const;
export type CriterioFechaReporte = (typeof CRITERIOS_FECHA_REPORTE)[number];

export type DatosFiltrosReporteIncidentes = Readonly<{
  fechaDesde: string;
  fechaHasta: string;
  criterioFecha?: string;
  zona?: string;
  resultado?: string;
}>;

/** Metadatos para que la pantalla y HU-48 expliquen el mismo conjunto consultado. */
export type FiltrosAplicadosReporteIncidentes = Readonly<{
  fechaDesde: string;
  fechaHasta: string;
  criterioFecha: CriterioFechaReporte;
  zona: string | null;
  resultado: ResultadoRescate | null;
  zonaHoraria: 'UTC';
  desdeInclusivo: string;
  hastaExclusivo: string;
}>;

function inicioDia(fecha: string): Date {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000-')) {
    throw new ErrorFiltrosReporteIncidentes(
      'FECHA_REPORTE_INVALIDA',
      'Las fechas del reporte deben ser días válidos con formato AAAA-MM-DD.',
    );
  }
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  // Date normaliza, por ejemplo, el 30 de febrero; se rechaza esa conversión.
  if (!Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
    throw new ErrorFiltrosReporteIncidentes(
      'FECHA_REPORTE_INVALIDA',
      'Las fechas del reporte deben existir en el calendario.',
    );
  }
  return dia;
}

function criterioValido(valor: string): valor is CriterioFechaReporte {
  return CRITERIOS_FECHA_REPORTE.some((criterio) => criterio === valor);
}

function resultadoValido(valor: string): valor is ResultadoRescate {
  return RESULTADOS_RESCATE.some((resultado) => resultado === valor);
}

/**
 * Rango de días inclusivos, normalizado a [desdeInclusivo, hastaExclusivo) en UTC.
 * Apertura usa incidentes.abierto_en; cierre usa incidentes.cerrado_en.
 * Zona es una búsqueda textual del destino declarado de la expedición.
 */
export class FiltrosReporteIncidentes implements FiltrosAplicadosReporteIncidentes {
  readonly fechaDesde: string;
  readonly fechaHasta: string;
  readonly criterioFecha: CriterioFechaReporte;
  readonly zona: string | null;
  readonly resultado: ResultadoRescate | null;
  readonly zonaHoraria = 'UTC' as const;
  readonly desdeInclusivo: string;
  readonly hastaExclusivo: string;

  constructor(datos: DatosFiltrosReporteIncidentes) {
    const desde = inicioDia(datos.fechaDesde);
    const hasta = inicioDia(datos.fechaHasta);
    if (desde.getTime() > hasta.getTime()) {
      throw new ErrorFiltrosReporteIncidentes(
        'RANGO_REPORTE_INVALIDO',
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
    }
    const criterio = datos.criterioFecha ?? 'apertura';
    if (!criterioValido(criterio)) {
      throw new ErrorFiltrosReporteIncidentes(
        'CRITERIO_FECHA_INVALIDO',
        'El criterio de fecha debe ser apertura o cierre.',
      );
    }
    if (datos.zona !== undefined && (typeof datos.zona !== 'string' || datos.zona.trim().length > 120)) {
      throw new ErrorFiltrosReporteIncidentes(
        'ZONA_REPORTE_INVALIDA',
        'La zona debe ser un texto de hasta 120 caracteres.',
      );
    }
    if (datos.resultado !== undefined && !resultadoValido(datos.resultado)) {
      throw new ErrorFiltrosReporteIncidentes(
        'RESULTADO_REPORTE_INVALIDO',
        'El resultado debe pertenecer al catálogo de cierre de incidentes.',
      );
    }

    hasta.setUTCDate(hasta.getUTCDate() + 1);
    this.fechaDesde = datos.fechaDesde;
    this.fechaHasta = datos.fechaHasta;
    this.criterioFecha = criterio;
    this.zona = datos.zona?.trim() || null;
    this.resultado = datos.resultado ?? null;
    this.desdeInclusivo = desde.toISOString();
    this.hastaExclusivo = hasta.toISOString();
    Object.freeze(this);
  }
}
