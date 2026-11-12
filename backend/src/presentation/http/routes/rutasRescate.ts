import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  middlewareAutenticacion,
  requerirRol,
} from '../middleware/middlewareAutenticacion.js';
import { crearControladorRescate } from '../controllers/controladorRescate.js';
import { crearControladorBitacoraIncidente } from '../controllers/controladorBitacoraIncidente.js';
import { crearControladorCoordinacion } from '../controllers/controladorCoordinacion.js';
import { crearControladorCierreIncidente } from '../controllers/controladorCierreIncidente.js';
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
  const bitacora = crearControladorBitacoraIncidente({
    consultar: modulo.consultarBitacoraIncidente,
    agregar: modulo.agregarEntradaBitacora,
  });
  const cierre = crearControladorCierreIncidente({
    cerrar: modulo.cerrarIncidente,
    marcarLocalizado: modulo.marcarIncidenteLocalizado,
    consultar: modulo.consultarCierreIncidente,
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
  // HU-41: bitácora cronológica compartida; la bitácora personal anterior se conserva.
  router.get(
    '/incidentes/:incidenteId/bitacora',
    asyncHandler(bitacora.consultar),
  );
  router.post(
    '/incidentes/:incidenteId/bitacora',
    asyncHandler(bitacora.agregar),
  );
  // HU-42: localizar y cerrar el incidente con informe; lectura del último cierre por alerta.
  router.post(
    '/incidentes/:incidenteId/localizacion',
    asyncHandler(cierre.marcarLocalizado),
  );
  router.post(
    '/incidentes/:incidenteId/cierre',
    asyncHandler(cierre.cerrar),
  );
  router.get(
    '/alertas/:expedicionId/cierre',
    asyncHandler(cierre.consultarPorExpedicion),
  );
  return router;
}
