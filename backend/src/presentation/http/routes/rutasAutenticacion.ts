import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { crearControladorAutenticacion } from '../controllers/controladorAutenticacion.js';
import { crearServicioAutenticacion } from '../../../infrastructure/composicion/servicios.js';
import type { ServicioAutenticacion } from '../../../application/services/servicioAutenticacion.js';

export function crearRutasAutenticacion(
  servicio: ServicioAutenticacion = crearServicioAutenticacion(),
): Router {
  const { iniciarSesion, registrarRescatista, registrarSenderista } =
    crearControladorAutenticacion(servicio);
  const router = Router();

  router.post('/registrar-senderista', asyncHandler(registrarSenderista));
  router.post('/iniciar-sesion', asyncHandler(iniciarSesion));
  router.post('/registrar-rescatista', asyncHandler(registrarRescatista));

  return router;
}
