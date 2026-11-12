import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  middlewareAutenticacion,
  requerirRol,
} from '../middleware/middlewareAutenticacion.js';
import { crearControladorRescate } from '../controllers/controladorRescate.js';
import { crearControladorBitacoraIncidente } from '../controllers/controladorBitacoraIncidente.js';
import { crearControladorCoordinacion } from '../controllers/controladorCoordinacion.js';
import { crearControladorRelevo } from '../controllers/controladorRelevo.js';
import { crearControladorRescatistas } from '../controllers/controladorRescatistas.js';
import {
  crearModuloRescate,
  type ModuloRescate,
} from '../../../infrastructure/composicion/servicios.js';

/** Los casos inyectados no se sustituyen ni construyen adaptadores innecesarios. */
export type DependenciasRutasRescate = Partial<ModuloRescate>;

export function crearRutasRescate(
  dependencias: DependenciasRutasRescate = {},
): Router {
  const modulo = crearModuloRescate(dependencias);
  const {
    listarAlertas,
    obtenerDetalleAlerta,
    listarExpediciones,
    listarHistorial,
    actualizarBitacoraRescate,
    confirmarAlerta,
  } = crearControladorRescate(modulo.servicio);
  const router = Router();
  const coordinacion = crearControladorCoordinacion(modulo.asignarResponsable);
  // HU-40: relevo de la coordinación y catálogo de rescatistas validados.
  const relevo = crearControladorRelevo(
    modulo.proponerRelevo,
    modulo.aceptarRelevo,
    modulo.rechazarRelevo,
    modulo.cancelarRelevo,
  );
  const rescatistas = crearControladorRescatistas(modulo.rescatistas);
  const bitacora = crearControladorBitacoraIncidente({
    consultar: modulo.consultarBitacoraIncidente,
    agregar: modulo.agregarEntradaBitacora,
  });

  router.use(middlewareAutenticacion, requerirRol('rescatista'));
  router.get('/expediciones', asyncHandler(listarExpediciones));
  router.get('/historial', asyncHandler(listarHistorial));
  router.get('/alertas', asyncHandler(listarAlertas));
  router.get('/alertas/:expedicionId', asyncHandler(obtenerDetalleAlerta));
  router.patch(
    '/alertas/:expedicionId/bitacora',
    asyncHandler(actualizarBitacoraRescate),
  );
  router.post(
    '/alertas/:expedicionId/confirmar',
    asyncHandler(confirmarAlerta),
  );
  // HU-39: coordinación (incidente), separada de la recepción histórica de HU-14.
  router.post(
    '/alertas/:expedicionId/coordinacion',
    asyncHandler(coordinacion.asumir),
  );
  // HU-40: relevo de la coordinación (proponer, aceptar, rechazar y cancelar).
  // HU-40: rescatistas validados para elegir destinatario (solo id y nombre).
  router.get('/rescatistas', asyncHandler(rescatistas.listar));
  router.post('/alertas/:expedicionId/coordinacion/relevos', asyncHandler(relevo.proponer));
  router.post('/alertas/:expedicionId/coordinacion/relevos/:relevoId/aceptar', asyncHandler(relevo.aceptar));
  router.post('/alertas/:expedicionId/coordinacion/relevos/:relevoId/rechazar', asyncHandler(relevo.rechazar));
  router.post('/alertas/:expedicionId/coordinacion/relevos/:relevoId/cancelar', asyncHandler(relevo.cancelar));
  // HU-41: bitácora cronológica compartida; la bitácora personal anterior se conserva.
  router.get(
    '/incidentes/:incidenteId/bitacora',
    asyncHandler(bitacora.consultar),
  );
  router.post(
    '/incidentes/:incidenteId/bitacora',
    asyncHandler(bitacora.agregar),
  );
  return router;
}
