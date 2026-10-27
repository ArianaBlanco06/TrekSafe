import { Router } from 'express';
import type { ModuloPlantillas } from '../../../application/modulos/ModuloPlantillas.js';
import { crearControladorPlantillas } from '../controllers/controladorPlantillas.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';

export function crearRutasPlantillas(modulo: ModuloPlantillas): Router {
  const router = Router();
  const controlador = crearControladorPlantillas(modulo);

  router.use(middlewareAutenticacion, requerirRol('senderista'));

  router.get('/', asyncHandler(controlador.listar));
  router.post('/', asyncHandler(controlador.guardar));
  router.get('/:id/borrador', asyncHandler(controlador.obtenerBorrador));
  router.patch('/:id', asyncHandler(controlador.renombrar));
  router.delete('/:id', asyncHandler(controlador.eliminar));

  return router;
}
