import { Router } from 'express';
import type { ServicioPreparacionExpedicion } from '../../../application/services/servicioPreparacionExpedicion.js';
import { ControladorPreparacionExpedicion } from '../controllers/controladorPreparacionExpedicion.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';

export function crearRutasPreparacionExpedicion(servicio: ServicioPreparacionExpedicion): Router {
  const router = Router();
  const controlador = new ControladorPreparacionExpedicion(servicio);
  // Solo estas rutas: no interceptar el listado, la edición ni el retorno existentes.
  const autorizacion = [middlewareAutenticacion, requerirRol('senderista')];
  router.get('/:id/equipo', ...autorizacion, asyncHandler(controlador.obtener));
  router.post('/:id/equipo', ...autorizacion, asyncHandler(controlador.asociar));
  router.patch('/:id/equipo/items/:itemId', ...autorizacion, asyncHandler(controlador.establecerPreparado));
  return router;
}
