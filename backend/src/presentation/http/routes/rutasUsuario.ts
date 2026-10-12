import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  eliminarContacto,
  obtenerContactos,
  obtenerFichaMedica,
  crearContacto,
  revocarDatos,
  actualizarFichaMedica,
} from '../controllers/controladorUsuario.js';

export function crearRutasUsuario(): Router {
  const router = Router();

  router.use(middlewareAutenticacion, requerirRol('senderista'));

  router.put('/ficha-medica', asyncHandler(actualizarFichaMedica));
  router.get('/ficha-medica', asyncHandler(obtenerFichaMedica));
  router.post('/privacidad/revocar', asyncHandler(revocarDatos));

  router.get('/contactos', asyncHandler(obtenerContactos));
  router.post('/contactos', asyncHandler(crearContacto));
  router.delete('/contactos/:contactoId', asyncHandler(eliminarContacto));

  return router;
}
