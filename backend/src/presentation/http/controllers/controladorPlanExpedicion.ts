import type { Request, Response } from 'express';
import { ComandoAmpliarRetorno } from '../../../application/commands/ComandoAmpliarRetorno.js';
import { ComandoCancelarPlan } from '../../../application/commands/ComandoCancelarPlan.js';
import { idExpedicionSchema } from '../../../application/dto/expedicion.dto.js';
import type { AmpliarRetorno } from '../../../application/use-cases/AmpliarRetorno.js';
import type { CancelarPlan } from '../../../application/use-cases/CancelarPlan.js';
import type { EditarPlan } from '../../../application/use-cases/EditarPlan.js';
import type { ObtenerPlan } from '../../../application/use-cases/ObtenerPlan.js';
import type { PlanExpedicion } from '../../../domain/repositories/IExpedicionDAO.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

function respuestaPlan({ senderistaId: _senderistaId, ...plan }: PlanExpedicion) {
  return plan;
}

export function crearControladorPlanExpedicion(
  obtenerPlan: ObtenerPlan,
  editarPlan: EditarPlan,
  cancelarPlan: CancelarPlan,
  ampliarRetorno: AmpliarRetorno,
) {
  return {
    async obtener(req: Request, res: Response): Promise<void> {
      const expedicionId = idExpedicionSchema.parse(req.params.id);
      const plan = await obtenerPlan.ejecutar((req as SolicitudAutenticada).user.id, expedicionId);
      res.status(200).json({ expedicion: respuestaPlan(plan) });
    },

    async editar(req: Request, res: Response): Promise<void> {
      const expedicionId = idExpedicionSchema.parse(req.params.id);
      const plan = await editarPlan.ejecutar(
        (req as SolicitudAutenticada).user.id,
        expedicionId,
        req.body,
      );
      res.status(200).json({ mensaje: 'Expedición actualizada', expedicion: respuestaPlan(plan) });
    },

    async cancelar(req: Request, res: Response): Promise<void> {
      const expedicionId = idExpedicionSchema.parse(req.params.id);
      const comando = ComandoCancelarPlan.crear(
        (req as SolicitudAutenticada).user.id,
        expedicionId,
        req.body,
      );
      const expedicion = await cancelarPlan.ejecutar(comando);
      res.status(200).json({ mensaje: 'Expedición cancelada', expedicion });
    },

    async ampliarRetorno(req: Request, res: Response): Promise<void> {
      const expedicionId = idExpedicionSchema.parse(req.params.id);
      const comando = ComandoAmpliarRetorno.crear(
        (req as SolicitudAutenticada).user.id,
        expedicionId,
        req.body,
      );
      const expedicion = await ampliarRetorno.ejecutar(comando);
      res.status(200).json({ mensaje: 'Retorno ampliado', expedicion });
    },
  };
}
