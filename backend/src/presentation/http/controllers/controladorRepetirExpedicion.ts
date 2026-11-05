import type { Request, Response } from 'express';
import { idExpedicionSchema } from '../../../application/dto/expedicion.dto.js';
import type { CreadorPlan } from '../../../application/creacion-plan/CreadorPlan.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export function crearControladorRepetirExpedicion(creador: CreadorPlan) {
  return {
    async obtenerBorrador(req: Request, res: Response): Promise<void> {
      const expedicionId = idExpedicionSchema.parse(req.params.id);
      const borrador = await creador.prepararBorrador(
        (req as SolicitudAutenticada).user.id,
        expedicionId,
      );
      res.status(200).json({ borrador });
    },
  };
}
