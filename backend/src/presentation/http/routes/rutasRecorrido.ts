import { Router } from 'express';
import type { FachadaPlanExpedicion } from '../../../application/services/FachadaPlanExpedicion.js';
import { idExpedicionSchema } from '../../../application/dto/expedicion.dto.js';
import { respuestaPreparacion } from '../dto/preparacionExpedicion.dto.js';
import { middlewareAutenticacion, requerirRol, type SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export function crearRutasRecorrido(fachada: FachadaPlanExpedicion): Router {
  const router = Router();
  router.get('/:id/recorrido', middlewareAutenticacion, requerirRol('senderista'), asyncHandler(async (req, res) => {
    const id = idExpedicionSchema.parse(req.params.id);
    const resultado = await fachada.obtener((req as SolicitudAutenticada).user.id, id);
    res.set('Cache-Control', 'no-store').json({
      ...resultado, preparacion: respuestaPreparacion(resultado.preparacion),
    });
  }));
  return router;
}
