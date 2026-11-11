import { Router } from 'express';
import { AsignarResponsable } from '../../../application/use-cases/AsignarResponsable.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  middlewareAutenticacion,
  requerirRol,
} from '../middleware/middlewareAutenticacion.js';
import { crearControladorRescate } from '../controllers/controladorRescate.js';
import { crearModuloRescate } from '../../../infrastructure/composicion/servicios.js';
import type { ServicioRescate } from '../../../application/services/servicioRescate.js';
import { crearControladorCoordinacion } from '../controllers/controladorCoordinacion.js';

export type DependenciasRutasRescate = {
  /** Ejecutor de HU-39. Por defecto, con el DAO de Supabase; las pruebas inyectan uno propio. */
  asignarResponsable?: AsignarResponsable;
  servicio?: ServicioRescate;
};

export function crearRutasRescate(
  dependencias: DependenciasRutasRescate = {},
): Router {
  const modulo =
    dependencias.servicio && dependencias.asignarResponsable
      ? (dependencias as Required<DependenciasRutasRescate>)
      : { ...crearModuloRescate(), ...dependencias };
  const {
    listarAlertas,
    obtenerDetalleAlerta,
    listarExpediciones,
    listarHistorial,
    actualizarBitacoraRescate,
    confirmarAlerta,
  } = crearControladorRescate(modulo.servicio);
  const router = Router();
  // Ensamblaje: las clases concretas se crean solo aquí.
  const coordinacion = crearControladorCoordinacion(modulo.asignarResponsable);

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

  return router;
}
