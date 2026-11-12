import { Router } from 'express';
import type { ConsultarHistorialCambios } from '../../../application/use-cases/ConsultarHistorialCambios.js';
import { crearControladorHistorialCambios } from '../controllers/controladorHistorialCambios.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';

/** HU-36: solo lectura. La autenticación se aplica solo a esta ruta. */
export function crearRutasHistorialCambios(consultar: ConsultarHistorialCambios): Router {
  const router = Router();
  const controlador = crearControladorHistorialCambios(consultar);
  router.get('/:id/cambios', middlewareAutenticacion, requerirRol('senderista'),
    asyncHandler(controlador.obtener));
  return router;
}
