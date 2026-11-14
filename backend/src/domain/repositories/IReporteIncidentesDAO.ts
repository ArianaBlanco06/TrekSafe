import type { FiltrosReporteIncidentes } from '../value-objects/FiltrosReporteIncidentes.js';

/** Conteos operativos del mismo conjunto de incidentes, sin datos personales ni médicos. */
export type ResumenIncidentes = Readonly<{
  /** Cada incidentes.id se cuenta una sola vez, incluso si comparte expedición con otro. */
  atendidos: number;
  /** Estados abierto y localizado. */
  abiertos: number;
  /** Estado cerrado, también cuando un cierre histórico carece de informe. */
  cerrados: number;
}>;

/** DAO de lectura para HU-47, separado de la coordinación y la escritura de cierres (ISP). */
export interface IReporteIncidentesDAO {
  /**
   * Consulta global para el rescatista autenticado, cuyo perfil debe estar validado.
   * El id proviene de la sesión del servidor y nunca limita el reporte al responsable.
   *
   * La implementación debe comprobar ese alcance antes de consultar y calcular los
   * tres conteos en una lectura consistente, sobre todos los incidentes filtrados.
   * No debe truncar el conjunto por paginación ni multiplicarlo por notas o relevos.
   *
   * Fechas: >= desdeInclusivo y < hastaExclusivo sobre la fecha elegida.
   * Zona: coincidencia textual literal, sin distinguir mayúsculas, con lugar_fin.
   * Resultado: relación única con el informe de cierre; sin filtro se conservan
   * los incidentes sin informe. Un resultado o fecha de cierre excluyen abiertos.
   *
   * Devuelve enteros seguros no negativos; atendidos = abiertos + cerrados.
   * Sin coincidencias devuelve los tres conteos en cero. No modifica persistencia.
   */
  consultar(rescatistaId: string, filtros: FiltrosReporteIncidentes): Promise<ResumenIncidentes>;
}
