import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  listarAlertas,
  obtenerDetalleAlerta,
  listarExpediciones,
  listarHistorial,
  actualizarBitacoraRescate,
  confirmarAlerta,
} from '../controllers/controladorRescate.js';

export function crearRutasRescate(): Router {
  const router = Router();

  router.use(middlewareAutenticacion, requerirRol('rescatista'));

  router.get('/expediciones', asyncHandler(listarExpediciones));
  router.get('/historial', asyncHandler(listarHistorial));
  router.get('/alertas', asyncHandler(listarAlertas));
  router.get('/alertas/:expedicionId', asyncHandler(obtenerDetalleAlerta));
  router.patch('/alertas/:expedicionId/bitacora', asyncHandler(actualizarBitacoraRescate));
  router.post('/alertas/:expedicionId/confirmar', asyncHandler(confirmarAlerta));

  return router;
}
