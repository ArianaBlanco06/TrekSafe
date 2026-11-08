import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  listarAvisos,
  contarNoLeidos,
  marcarAvisoLeido,
  marcarTodosLeidos,
} from '../controllers/controladorAvisos.js';

export function crearRutasAvisos(): Router {
  const router = Router();

  // HU-37: Seguridad estricta - solo el senderista autenticado puede consultar o mutar su bandeja
  router.use(middlewareAutenticacion, requerirRol('senderista'));

  router.get('/', asyncHandler(listarAvisos));
  router.get('/no-leidos/conteo', asyncHandler(contarNoLeidos));
  router.patch('/:id/leido', asyncHandler(marcarAvisoLeido));
  router.patch('/marcar-todos-leidos', asyncHandler(marcarTodosLeidos));

  return router;
}
