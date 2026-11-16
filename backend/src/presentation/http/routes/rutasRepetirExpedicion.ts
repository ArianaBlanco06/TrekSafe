import { Router } from 'express';
import type { CreadorPlan } from '../../../application/creacion-plan/CreadorPlan.js';
import { crearControladorRepetirExpedicion } from '../controllers/controladorRepetirExpedicion.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';

export function crearRutasRepetirExpedicion(creador: CreadorPlan): Router {
  const router = Router();
  const controlador = crearControladorRepetirExpedicion(creador);
  // La autenticación se aplica solo a esta ruta; las demás conservan su router.
  router.get('/:id/borrador', middlewareAutenticacion, requerirRol('senderista'),
    asyncHandler(controlador.obtenerBorrador));
  return router;
}
