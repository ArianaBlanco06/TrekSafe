export type CodigoErrorFiltrosReporteIncidentes =
  | 'FECHA_REPORTE_INVALIDA'
  | 'RANGO_REPORTE_INVALIDO'
  | 'CRITERIO_FECHA_INVALIDO'
  | 'ZONA_REPORTE_INVALIDA'
  | 'RESULTADO_REPORTE_INVALIDO';

/** La capa HTTP decide cómo representar los errores de los filtros. */
export class ErrorFiltrosReporteIncidentes extends Error {
  constructor(
    public readonly codigo: CodigoErrorFiltrosReporteIncidentes,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorFiltrosReporteIncidentes';
  }
}
