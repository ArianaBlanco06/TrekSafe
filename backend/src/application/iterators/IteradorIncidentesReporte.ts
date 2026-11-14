import type { ILectorPaginasReporteIncidentes, IncidenteReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import type { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export const TAMANO_PAGINA_REPORTE = 200;
export const MAXIMO_TAMANO_PAGINA_REPORTE = 500;

/** Iterator por cursor, con memoria acotada a una página y sin precargar la siguiente. */
export class IteradorIncidentesReporte implements AsyncIterable<IncidenteReporte> {
  constructor(
    private readonly lector: ILectorPaginasReporteIncidentes,
    private readonly rescatistaId: string,
    private readonly filtros: FiltrosReporteIncidentes,
    private readonly tamanoPagina = TAMANO_PAGINA_REPORTE,
  ) {
    if (!Number.isInteger(tamanoPagina) || tamanoPagina < 1 || tamanoPagina > MAXIMO_TAMANO_PAGINA_REPORTE) {
      throw new RangeError(`El tamaño de página debe estar entre 1 y ${MAXIMO_TAMANO_PAGINA_REPORTE}.`);
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<IncidenteReporte> {
    let cursor: string | null = null;
    for (;;) {
      const pagina = await this.lector.leerPagina(this.rescatistaId, this.filtros, {
        despuesDe: cursor, tamano: this.tamanoPagina,
      });
      const errorRecorrido = () => new ErrorAplicacion(500, 'No se pudo completar el recorrido del reporte.', 'REPORTE_NO_DISPONIBLE');
      if (!Array.isArray(pagina.incidentes) || typeof pagina.hayMas !== 'boolean' ||
        pagina.incidentes.length > this.tamanoPagina || (pagina.hayMas && pagina.incidentes.length === 0)) {
        throw errorRecorrido();
      }
      // Valida la página completa antes de emitirla. Un cursor que retrocede o
      // no avanza se rechaza, evitando duplicados e iteraciones infinitas.
      let anterior: string | null = cursor;
      for (const incidente of pagina.incidentes) {
        if (!incidente || typeof incidente.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(incidente.id) ||
          (anterior !== null && incidente.id <= anterior)) throw errorRecorrido();
        anterior = incidente.id;
      }
      for (const incidente of pagina.incidentes) yield incidente;
      if (!pagina.hayMas) return;
      cursor = anterior;
    }
  }
}
