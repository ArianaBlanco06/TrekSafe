import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  iniciarSesion,
  registrarRescatista,
  registrarSenderista,
} from '../controllers/controladorAutenticacion.js';

export function crearRutasAutenticacion(): Router {
  const router = Router();

  router.post('/registrar-senderista', asyncHandler(registrarSenderista));
  router.post('/iniciar-sesion', asyncHandler(iniciarSesion));
  router.post('/registrar-rescatista', asyncHandler(registrarRescatista));

  return router;
}
