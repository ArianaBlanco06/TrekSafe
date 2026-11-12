import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  middlewareAutenticacion,
  requerirRol,
} from '../middleware/middlewareAutenticacion.js';
import { crearControladorAvisos } from '../controllers/controladorAvisos.js';
import { crearServiciosAvisos } from '../../../infrastructure/composicion/servicios.js';

export function crearRutasAvisos(modulo = crearServiciosAvisos()): Router {
  const { listarAvisos, contarNoLeidos, marcarAvisoLeido, marcarTodosLeidos } =
    crearControladorAvisos(modulo.servicio, modulo.avisador);
  const router = Router();

  // HU-37: Seguridad estricta - solo el senderista autenticado puede consultar o mutar su bandeja
  router.use(middlewareAutenticacion, requerirRol('senderista'));

  router.get('/', asyncHandler(listarAvisos));
  router.get('/no-leidos/conteo', asyncHandler(contarNoLeidos));
  router.patch('/:id/leido', asyncHandler(marcarAvisoLeido));
  router.patch('/marcar-todos-leidos', asyncHandler(marcarTodosLeidos));

  return router;
}
