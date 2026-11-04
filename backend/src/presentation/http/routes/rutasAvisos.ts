import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion } from '../middleware/middlewareAutenticacion.js';
import {
  crearAvisoDev,
  listarAvisos,
  marcarAvisoLeido,
  marcarTodosLeidos,
} from '../controllers/controladorAvisos.js';

export function crearRutasAvisos(): Router {
  const router = Router();

  // Todos los endpoints de avisos requieren autenticación
  router.use(middlewareAutenticacion);

  router.get('/', asyncHandler(listarAvisos));
  router.patch('/marcar-todos-leidos', asyncHandler(marcarTodosLeidos));
  router.patch('/:id/leido', asyncHandler(marcarAvisoLeido));

  // Endpoint auxiliar para pruebas y registro de avisos
  router.post('/', asyncHandler(crearAvisoDev));

  return router;
}
