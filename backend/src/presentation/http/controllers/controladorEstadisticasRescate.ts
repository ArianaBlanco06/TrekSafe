import type { Request, Response } from 'express';
import type { ConsultarEstadisticasRescate } from '../../../application/use-cases/ConsultarEstadisticasRescate.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export function crearControladorEstadisticasRescate(consulta: ConsultarEstadisticasRescate) {
  return async (req: Request, res: Response): Promise<void> => {
    const actor = (req as SolicitudAutenticada).user.id;
    const reporte = await consulta.ejecutar(actor, req.query);
    res.status(200).json(reporte);
  };
}
