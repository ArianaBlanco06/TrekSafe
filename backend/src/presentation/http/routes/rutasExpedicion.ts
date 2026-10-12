import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  obtenerExpedicionActiva,
  obtenerHistorialExpediciones,
  listarExpediciones,
  confirmarRetorno,
  crearExpedicion,
} from '../controllers/controladorExpedicion.js';

export function crearRutasExpedicion(): Router {
  const router = Router();

  router.use(middlewareAutenticacion, requerirRol('senderista'));

  router.get('/activa', asyncHandler(obtenerExpedicionActiva));
  router.get('/historial', asyncHandler(obtenerHistorialExpediciones));
  router.post('/:id/confirmar-retorno', asyncHandler(confirmarRetorno));
  router.post('/', asyncHandler(crearExpedicion));
  router.get('/', asyncHandler(listarExpediciones));

  return router;
}
