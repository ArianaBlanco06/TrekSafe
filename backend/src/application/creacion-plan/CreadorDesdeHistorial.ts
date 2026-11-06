import type { IContactosVigentes } from '../../domain/repositories/IContactosVigentes.js';
import type { IHistorialExpedicionesDAO } from '../../domain/repositories/IHistorialExpedicionesDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { CreadorPlan } from './CreadorPlan.js';
import type { IPlanEditable } from './IPlanEditable.js';
import { PlanDesdeHistorial } from './PlanDesdeHistorial.js';

export class CreadorDesdeHistorial extends CreadorPlan {
  constructor(
    contactosVigentes: IContactosVigentes,
    private readonly historial: IHistorialExpedicionesDAO,
  ) {
    super(contactosVigentes);
  }

  protected async crearBorrador(senderistaId: string, origenId: string): Promise<IPlanEditable> {
    const expedicion = await this.historial.buscarPorId(senderistaId, origenId);
    if (!expedicion || expedicion.senderistaId !== senderistaId || expedicion.estado !== 'completada') {
      throw new ErrorAplicacion(404, 'Expedición completada no encontrada', 'EXPEDICION_HISTORIAL_NO_ENCONTRADA');
    }
    return new PlanDesdeHistorial(expedicion);
  }
}
