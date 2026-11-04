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
import {
  listarDespachosIncidente,
  reintentarDespachoIncidente,
} from '../controllers/controladorEntregaIncidente.js';

export function crearRutasRescate(): Router {
  const router = Router();

  router.use(middlewareAutenticacion, requerirRol('rescatista'));

  router.get('/expediciones', asyncHandler(listarExpediciones));
  router.get('/historial', asyncHandler(listarHistorial));
  router.get('/alertas', asyncHandler(listarAlertas));
  router.get('/alertas/:expedicionId', asyncHandler(obtenerDetalleAlerta));
  router.patch('/alertas/:expedicionId/bitacora', asyncHandler(actualizarBitacoraRescate));
  router.post('/alertas/:expedicionId/confirmar', asyncHandler(confirmarAlerta));

  // HU-46: Revisar la entrega de avisos de un incidente y reintento manual
  router.get('/alertas/:id/despachos', asyncHandler(listarDespachosIncidente));
  router.post('/alertas/:id/despachos/:mensajeId/reintentar', asyncHandler(reintentarDespachoIncidente));

  return router;
}
