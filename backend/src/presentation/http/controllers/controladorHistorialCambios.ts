import type { Request, Response } from 'express';
import { idExpedicionSchema } from '../../../application/dto/expedicion.dto.js';
import type { ConsultarHistorialCambios } from '../../../application/use-cases/ConsultarHistorialCambios.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export function crearControladorHistorialCambios(consultar: ConsultarHistorialCambios) {
  return {
    async obtener(req: Request, res: Response): Promise<void> {
      const expedicionId = idExpedicionSchema.parse(req.params.id);
      const historial = await consultar.ejecutar((req as SolicitudAutenticada).user.id, expedicionId);
      res.status(200).json(historial);
    },
  };
}
