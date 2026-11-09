import {
  ErrorCancelacionPlan,
  type CodigoErrorCancelacionPlan,
} from '../../domain/errors/ErrorCancelacionPlan.js';
import type { IExpedicionDAO } from '../../domain/repositories/IExpedicionDAO.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { esCancelable } from '../../domain/value-objects/cancelacionPlan.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type { ComandoCancelarPlan, ResultadoCancelarPlan } from '../commands/ComandoCancelarPlan.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';

const RESPUESTAS: Record<CodigoErrorCancelacionPlan, { estado: number; mensaje: string }> = {
  EXPEDICION_NO_ENCONTRADA: { estado: 404, mensaje: 'Expedición no encontrada' },
  PLAN_NO_CANCELABLE: {
    estado: 409,
    mensaje: 'Solo puedes cancelar expediciones programadas que aún no inician',
  },
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de entrada inválidos' },
};

function traducir(codigo: CodigoErrorCancelacionPlan): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS[codigo];
  return new ErrorAplicacion(estado, mensaje, codigo);
}

/**
 * Ejecutor del comando `ComandoCancelarPlan` (HU-27).
 *
 * Valida antes de escribir con el reloj inyectado; la persistencia vuelve a comprobar
 * las reglas dentro de la transacción, con la fila bloqueada, por si el cron promovió
 * el plan entretanto. No envía correos: HU-37 leerá el evento `CANCELADA`.
 *
 * Idempotente: un plan ya cancelado devuelve `{id, version, estado}` sin llamar a la
 * persistencia, sea la misma operación repetida u otra distinta.
 */
export class CancelarPlan implements IEjecutorComando<ComandoCancelarPlan, ResultadoCancelarPlan> {
  constructor(
    private readonly dao: IExpedicionDAO,
    private readonly reloj: IReloj,
  ) {}

  async ejecutar(comando: ComandoCancelarPlan): Promise<ResultadoCancelarPlan> {
    const plan = await this.dao.obtenerPlan(comando.expedicionId, comando.senderistaId);
    if (!plan) throw traducir('EXPEDICION_NO_ENCONTRADA');

    if (plan.estado === 'cancelada') {
      return { id: plan.id, version: plan.version, estado: 'cancelada' };
    }
    if (!esCancelable(plan, this.reloj.ahora())) throw traducir('PLAN_NO_CANCELABLE');

    try {
      return await this.dao.cancelarPlan({
        expedicionId: comando.expedicionId,
        senderistaId: comando.senderistaId,
        operacionId: comando.operacionId,
        motivo: comando.motivo,
      });
    } catch (err) {
      if (err instanceof ErrorCancelacionPlan) throw traducir(err.codigo);
      throw err;
    }
  }
}
