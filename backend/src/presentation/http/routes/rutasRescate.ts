import { Router } from 'express';
import { AceptarRelevo } from '../../../application/use-cases/AceptarRelevo.js';
import { AsignarResponsable } from '../../../application/use-cases/AsignarResponsable.js';
import { ProponerRelevo } from '../../../application/use-cases/ProponerRelevo.js';
import { RechazarRelevo } from '../../../application/use-cases/RechazarRelevo.js';
import { CancelarRelevo } from '../../../application/use-cases/CancelarRelevo.js';
import { getSupabaseAdmin } from '../../../infrastructure/database/supabase.js';
import { IncidenteDAOSupabase } from '../../../infrastructure/repositories/IncidenteDAOSupabase.js';
import { RescatistasDAOSupabase } from '../../../infrastructure/repositories/RescatistasDAOSupabase.js';
import type { IRescatistasDAO } from '../../../domain/repositories/IRescatistasDAO.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  listarAlertas,
  obtenerDetalleAlerta,
  listarExpediciones,
  listarHistorial,
  actualizarBitacoraRescate,
  confirmarAlerta,
} from '../controllers/controladorRescate.js';
import { crearControladorCoordinacion } from '../controllers/controladorCoordinacion.js';
import { crearControladorRelevo } from '../controllers/controladorRelevo.js';
import { crearControladorRescatistas } from '../controllers/controladorRescatistas.js';

export type DependenciasRutasRescate = {
  /** Ejecutor de HU-39. Por defecto, con el DAO de Supabase; las pruebas inyectan uno propio. */
  asignarResponsable?: AsignarResponsable;
  /** Ejecutores de HU-40. Por defecto, con el mismo DAO de Supabase; las pruebas inyectan los suyos. */
  proponerRelevo?: ProponerRelevo;
  aceptarRelevo?: AceptarRelevo;
  rechazarRelevo?: RechazarRelevo;
  cancelarRelevo?: CancelarRelevo;
  /** Catálogo de rescatistas validados para elegir destinatario (HU-40). */
  rescatistas?: IRescatistasDAO;
};

export function crearRutasRescate(dependencias: DependenciasRutasRescate = {}): Router {
  const router = Router();
  // Ensamblaje: las clases concretas se crean solo aquí. El DAO de Supabase se crea una sola
  // vez y solo si alguna dependencia no se inyectó.
  const necesitaDao =
    !dependencias.asignarResponsable ||
    !dependencias.proponerRelevo ||
    !dependencias.aceptarRelevo ||
    !dependencias.rechazarRelevo ||
    !dependencias.cancelarRelevo;
  const dao = necesitaDao ? new IncidenteDAOSupabase(getSupabaseAdmin()) : null;
  const coordinacion = crearControladorCoordinacion(
    dependencias.asignarResponsable ?? new AsignarResponsable(dao!),
  );
  const relevo = crearControladorRelevo(
    dependencias.proponerRelevo ?? new ProponerRelevo(dao!),
    dependencias.aceptarRelevo ?? new AceptarRelevo(dao!),
    dependencias.rechazarRelevo ?? new RechazarRelevo(dao!),
    dependencias.cancelarRelevo ?? new CancelarRelevo(dao!),
  );

  const rescatistas = crearControladorRescatistas(
    dependencias.rescatistas ?? new RescatistasDAOSupabase(getSupabaseAdmin()),
  );

  router.use(middlewareAutenticacion, requerirRol('rescatista'));

  router.get('/expediciones', asyncHandler(listarExpediciones));
  router.get('/historial', asyncHandler(listarHistorial));
  router.get('/alertas', asyncHandler(listarAlertas));
  router.get('/alertas/:expedicionId', asyncHandler(obtenerDetalleAlerta));
  router.patch('/alertas/:expedicionId/bitacora', asyncHandler(actualizarBitacoraRescate));
  router.post('/alertas/:expedicionId/confirmar', asyncHandler(confirmarAlerta));
  // HU-39: coordinación (incidente), separada de la recepción histórica de HU-14.
  router.post('/alertas/:expedicionId/coordinacion', asyncHandler(coordinacion.asumir));
  // HU-40: relevo de la coordinación (proponer, aceptar, rechazar y cancelar).
  // HU-40: rescatistas validados para elegir destinatario (solo id y nombre).
  router.get('/rescatistas', asyncHandler(rescatistas.listar));
  router.post('/alertas/:expedicionId/coordinacion/relevos', asyncHandler(relevo.proponer));
  router.post('/alertas/:expedicionId/coordinacion/relevos/:relevoId/aceptar', asyncHandler(relevo.aceptar));
  router.post('/alertas/:expedicionId/coordinacion/relevos/:relevoId/rechazar', asyncHandler(relevo.rechazar));
  router.post('/alertas/:expedicionId/coordinacion/relevos/:relevoId/cancelar', asyncHandler(relevo.cancelar));

  return router;
}
