import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  middlewareAutenticacion,
  requerirRol,
} from '../middleware/middlewareAutenticacion.js';
import { crearControladorExpedicion } from '../controllers/controladorExpedicion.js';
import { crearModuloExpediciones } from '../../../infrastructure/composicion/servicios.js';
import { crearControladorPlanExpedicion } from '../controllers/controladorPlanExpedicion.js';

export function crearRutasExpedicion(
  modulo = crearModuloExpediciones(),
): Router {
  const {
    obtenerExpedicionActiva,
    obtenerHistorialExpediciones,
    listarExpediciones,
    confirmarRetorno,
    crearExpedicion,
  } = crearControladorExpedicion(modulo.servicio);
  const router = Router();
  const planes = crearControladorPlanExpedicion(
    modulo.obtener,
    modulo.editar,
    modulo.cancelar,
    modulo.ampliar,
    modulo.avisador,
  );

  router.use(middlewareAutenticacion, requerirRol('senderista'));

  router.get('/activa', asyncHandler(obtenerExpedicionActiva));
  router.get('/historial', asyncHandler(obtenerHistorialExpediciones));
  router.get('/:id', asyncHandler(planes.obtener));
  router.put('/:id', asyncHandler(planes.editar));
  router.post('/:id/cancelar', asyncHandler(planes.cancelar));
  router.post('/:id/ampliar-retorno', asyncHandler(planes.ampliarRetorno));
  router.post('/:id/confirmar-retorno', asyncHandler(confirmarRetorno));
  router.post('/', asyncHandler(crearExpedicion));
  router.get('/', asyncHandler(listarExpediciones));

  return router;
}
