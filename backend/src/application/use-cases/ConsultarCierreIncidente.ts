import type { ILectorCierreIncidente } from '../../domain/repositories/ICierreIncidenteDAO.js';
import { aVistaInformeCierre, consultarCierreSchema, type InformeCierreVista } from '../dto/cierreIncidente.dto.js';

/**
 * Lectura del último cierre de una expedición (HU-42). El detalle de la alerta lo necesita
 * porque, tras el cierre, el incidente ya no está activo y la expedición sigue en `alerta`.
 * Devuelve `null` si la expedición no tiene ningún incidente cerrado. Sin datos médicos.
 */
export class ConsultarCierreIncidente {
  constructor(private readonly lector: ILectorCierreIncidente) {}

  /** @throws ZodError (400) si los id no son UUID. */
  async ejecutar(rescatistaId: string, expedicionId: string): Promise<InformeCierreVista | null> {
    const datos = consultarCierreSchema.parse({ rescatistaId, expedicionId });
    const informe = await this.lector.ultimoCierreDeExpedicion(datos.expedicionId);
    return informe ? aVistaInformeCierre(informe, datos.rescatistaId) : null;
  }
}
