import { Router } from 'express';
import type { ServicioListasEquipo } from '../../../application/services/servicioListasEquipo.js';
import { ControladorListasEquipo } from '../controllers/controladorListasEquipo.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';

export function crearRutasListasEquipo(servicio: ServicioListasEquipo): Router {
  const router = Router();
  const controlador = new ControladorListasEquipo(servicio);
  router.use(middlewareAutenticacion, requerirRol('senderista'));
  router.get('/', asyncHandler(controlador.listar));
  router.get('/:listaId', asyncHandler(controlador.obtener));
  router.post('/', asyncHandler(controlador.crear));
  router.put('/:listaId', asyncHandler(controlador.actualizar));
  router.delete('/:listaId', asyncHandler(controlador.eliminar));
  return router;
}
