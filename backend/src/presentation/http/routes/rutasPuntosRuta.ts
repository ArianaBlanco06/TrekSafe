import { Router } from 'express';
import type { ServicioPuntosRuta } from '../../../application/services/servicioPuntosRuta.js';
import { crearControladorPuntosRuta } from '../controllers/controladorPuntosRuta.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';

export function crearRutasPuntosRuta(servicio: ServicioPuntosRuta): Router {
  const router = Router();
  const controlador = crearControladorPuntosRuta(servicio);
  router.route('/:id/puntos')
    .all(middlewareAutenticacion, requerirRol('senderista'))
    .get(asyncHandler(controlador.consultar))
    .put(asyncHandler(controlador.guardar));
  return router;
}
