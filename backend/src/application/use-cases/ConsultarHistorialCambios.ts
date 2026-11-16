import type { ILectorEventosPlan } from '../../domain/repositories/IEventosPlanDAO.js';
import type { IPropiedadExpedicion } from '../../domain/repositories/IPropiedadExpedicion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { aEntradaHistorialCambios, type HistorialCambiosPlan } from '../dto/historialCambios.dto.js';

/** HU-36: historial de cambios del plan, solo para su propietario y en orden cronológico. */
export class ConsultarHistorialCambios {
  constructor(
    private readonly propiedad: IPropiedadExpedicion,
    private readonly eventos: ILectorEventosPlan,
  ) {}

  async ejecutar(senderistaId: string, expedicionId: string): Promise<HistorialCambiosPlan> {
    // Ajena e inexistente responden igual y no se consultan sus eventos.
    if (!(await this.propiedad.esPropietario(senderistaId, expedicionId))) {
      throw new ErrorAplicacion(404, 'Expedición no encontrada', 'EXPEDICION_NO_ENCONTRADA');
    }
    const eventos = await this.eventos.listarPorExpedicion(senderistaId, expedicionId);
    return {
      expedicionId,
      cambios: eventos.map((evento) => aEntradaHistorialCambios(evento, senderistaId)),
    };
  }
}
