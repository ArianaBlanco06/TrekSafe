import type { ILectorPaginasReporteIncidentes, IncidenteReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import { IteradorIncidentesReporte } from '../iterators/IteradorIncidentesReporte.js';
import type { IExportadorIncidentes } from '../ports/ExportadorIncidentes.js';
import { prepararConsultaReporteIncidentes } from '../queries/prepararConsultaReporteIncidentes.js';

export type DescargaReporteIncidentes = Readonly<{
  nombreArchivo: string;
  contenido: AsyncIterable<string>;
  cancelar: () => Promise<void>;
}>;

/** Autoriza la primera página antes de permitir que HTTP envíe un archivo. */
export class ExportarReporteIncidentes {
  constructor(
    private readonly lector: ILectorPaginasReporteIncidentes,
    private readonly exportador: IExportadorIncidentes,
  ) {}

  async ejecutar(actorId: string, consulta: unknown): Promise<DescargaReporteIncidentes> {
    const { actor, filtros } = prepararConsultaReporteIncidentes(actorId, consulta);
    const iterador = new IteradorIncidentesReporte(this.lector, actor, filtros)[Symbol.asyncIterator]();
    const primera = await iterador.next();
    const cancelar = async () => { await iterador.return(undefined); };
    async function* filas(): AsyncGenerator<IncidenteReporte> {
      try {
        if (!primera.done) {
          yield primera.value;
          yield* { [Symbol.asyncIterator]: () => iterador };
        }
      } finally { await cancelar(); }
    }
    return {
      // Solo fechas validadas; ningún texto libre llega al nombre o a las cabeceras.
      nombreArchivo: `incidentes-${filtros.criterioFecha}-${filtros.fechaDesde}_${filtros.fechaHasta}.csv`,
      contenido: this.exportador.exportar(filas()),
      cancelar,
    };
  }
}
