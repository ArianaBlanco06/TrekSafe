import { Router } from 'express';
import type { ICreadorPlanIdempotente } from '../../../application/ports/creacionPlan.js';
import { CrearPlan } from '../../../application/commands/CrearPlan.js';
import { sincronizarBorradorSchema } from '../../../application/dto/crearPlan.dto.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol, type SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export function crearRutasBorradores(creador: ICreadorPlanIdempotente) {
  const router = Router();
  router.post('/borradores/sincronizar', middlewareAutenticacion, requerirRol('senderista'), asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { borradorId, ...datos } = sincronizarBorradorSchema.parse(req.body);
    const resultado = await new CrearPlan({ senderistaId: (req as SolicitudAutenticada).user.id, borradorId, datos }, creador).ejecutar();
    res.status(resultado.repetido ? 200 : 201).json(resultado);
  }));
  return router;
}
