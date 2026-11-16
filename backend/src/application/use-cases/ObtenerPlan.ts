import type { IExpedicionDAO, PlanExpedicion } from '../../domain/repositories/IExpedicionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Devuelve el plan completo de una expedición a su propietario. */
export class ObtenerPlan {
  constructor(private readonly dao: IExpedicionDAO) {}

  async ejecutar(senderistaId: string, expedicionId: string): Promise<PlanExpedicion> {
    const plan = await this.dao.obtenerPlan(expedicionId, senderistaId);
    if (!plan) {
      throw new ErrorAplicacion(404, 'Expedición no encontrada', 'EXPEDICION_NO_ENCONTRADA');
    }
    return plan;
  }
}
