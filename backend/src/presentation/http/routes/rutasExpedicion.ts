import { Router } from 'express';
import { AvisadorCambiosPlan } from '../../../application/services/AvisadorCambiosPlan.js';
import { AmpliarRetorno } from '../../../application/use-cases/AmpliarRetorno.js';
import { CancelarPlan } from '../../../application/use-cases/CancelarPlan.js';
import { EditarPlan } from '../../../application/use-cases/EditarPlan.js';
import { ObtenerPlan } from '../../../application/use-cases/ObtenerPlan.js';
import { getSupabaseAdmin } from '../../../infrastructure/database/supabase.js';
import { ExpedicionDAOSupabase } from '../../../infrastructure/repositories/ExpedicionDAOSupabase.js';
import { RelojSistema } from '../../../infrastructure/services/RelojSistema.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  obtenerExpedicionActiva,
  obtenerHistorialExpediciones,
  listarExpediciones,
  confirmarRetorno,
  crearExpedicion,
} from '../controllers/controladorExpedicion.js';
import { crearControladorPlanExpedicion } from '../controllers/controladorPlanExpedicion.js';

export function crearRutasExpedicion(): Router {
  const router = Router();
  const dao = new ExpedicionDAOSupabase(getSupabaseAdmin());
  const reloj = new RelojSistema();
  const planes = crearControladorPlanExpedicion(
    new ObtenerPlan(dao),
    new EditarPlan(dao, reloj),
    new CancelarPlan(dao, reloj),
    new AmpliarRetorno(dao, reloj),
    new AvisadorCambiosPlan(),
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
