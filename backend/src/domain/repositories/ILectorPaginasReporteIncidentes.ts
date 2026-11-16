import type { EstadoIncidente } from './IIncidenteDAO.js';
import type { ResultadoRescate } from '../value-objects/cierreIncidente.js';
import type { FiltrosReporteIncidentes } from '../value-objects/FiltrosReporteIncidentes.js';

/** Lista blanca operativa de HU-48. Cada fila representa un incidente. */
export type IncidenteReporte = Readonly<{
  id: string;
  zona: string;
  abiertoEn: string;
  cerradoEn: string | null;
  estado: EstadoIncidente;
  resultado: ResultadoRescate | null;
}>;

export type SolicitudPaginaIncidentes = Readonly<{
  /** Cursor exclusivo, UUID canónico en minúsculas; null en la primera página. */
  despuesDe: string | null;
  tamano: number;
}>;

export type PaginaIncidentesReporte = Readonly<{
  incidentes: readonly IncidenteReporte[];
  hayMas: boolean;
}>;

/**
 * Lectura paginada de la misma familia DAO de HU-47. Interfaz segregada (ISP):
 * la consulta de conteos IReporteIncidentesDAO no necesita implementar un recorrido.
 * El adaptador de producción podrá implementar ambos contratos.
 */
export interface ILectorPaginasReporteIncidentes {
  /**
   * Aplica los mismos filtros y alcance global de HU-47 y vuelve a comprobar el
   * perfil validado del actor del servidor en cada página. Solo lectura.
   *
   * Orden ascendente por incidentes.id, exclusivo después del cursor. No usa
   * desplazamientos ni une notas/relevos. Devuelve como máximo tamano filas,
   * UUID canónicos y fechas ISO UTC. hayMas se determina con una fila adicional.
   *
   * Incluye cierres históricos sin informe si no se filtra resultado. No devuelve
   * ficha médica, contactos, nombres, autores ni textos libres del cierre.
   */
  leerPagina(
    rescatistaId: string,
    filtros: FiltrosReporteIncidentes,
    pagina: SolicitudPaginaIncidentes,
  ): Promise<PaginaIncidentesReporte>;
}
