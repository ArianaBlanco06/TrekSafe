import { Router } from 'express';
import { AgregarEntradaBitacora } from '../../../application/use-cases/AgregarEntradaBitacora.js';
import { AsignarResponsable } from '../../../application/use-cases/AsignarResponsable.js';
import { ConsultarBitacoraIncidente } from '../../../application/use-cases/ConsultarBitacoraIncidente.js';
import type { ServicioRescate } from '../../../application/services/servicioRescate.js';
import { getSupabaseAdmin } from '../../../infrastructure/database/supabase.js';
import { BitacoraIncidenteDAOSupabase } from '../../../infrastructure/repositories/BitacoraIncidenteDAOSupabase.js';
import { IncidenteDAOSupabase } from '../../../infrastructure/repositories/IncidenteDAOSupabase.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol } from '../middleware/middlewareAutenticacion.js';
import {
  crearControladorListadosRescate,
  obtenerDetalleAlerta,
  listarHistorial,
  actualizarBitacoraRescate,
  confirmarAlerta,
} from '../controllers/controladorRescate.js';
import { crearControladorBitacoraIncidente } from '../controllers/controladorBitacoraIncidente.js';
import { crearControladorCoordinacion } from '../controllers/controladorCoordinacion.js';

export type DependenciasRutasRescate = {
  listadosRescate?: Pick<ServicioRescate, 'listarExpediciones' | 'listarAlertas'>;
  /** Ejecutor de HU-39. Por defecto, con el DAO de Supabase; las pruebas inyectan uno propio. */
  asignarResponsable?: AsignarResponsable;
  /** Casos de uso de HU-41. Por defecto, con el DAO de Supabase; las pruebas inyectan los suyos. */
  consultarBitacoraIncidente?: ConsultarBitacoraIncidente;
  agregarEntradaBitacora?: AgregarEntradaBitacora;
};

export function crearRutasRescate(dependencias: DependenciasRutasRescate = {}): Router {
  const router = Router();
  const listados = crearControladorListadosRescate(dependencias.listadosRescate);
  // Ensamblaje: las clases concretas se crean solo aquí.
  const coordinacion = crearControladorCoordinacion(
    dependencias.asignarResponsable ?? new AsignarResponsable(new IncidenteDAOSupabase(getSupabaseAdmin())),
  );

  // HU-41: un solo DAO se comparte entre lectura y escritura, y solo se crea si falta algún caso de uso.
  const daoBitacora =
    dependencias.consultarBitacoraIncidente && dependencias.agregarEntradaBitacora
      ? null
      : new BitacoraIncidenteDAOSupabase(getSupabaseAdmin());
  const bitacora = crearControladorBitacoraIncidente({
    consultar: dependencias.consultarBitacoraIncidente ?? new ConsultarBitacoraIncidente(daoBitacora!),
    agregar: dependencias.agregarEntradaBitacora ?? new AgregarEntradaBitacora(daoBitacora!),
  });

  router.use(middlewareAutenticacion, requerirRol('rescatista'));

  router.get('/expediciones', asyncHandler(listados.listarExpediciones));
  router.get('/historial', asyncHandler(listarHistorial));
  router.get('/alertas', asyncHandler(listados.listarAlertas));
  router.get('/alertas/:expedicionId', asyncHandler(obtenerDetalleAlerta));
  router.patch('/alertas/:expedicionId/bitacora', asyncHandler(actualizarBitacoraRescate));
  router.post('/alertas/:expedicionId/confirmar', asyncHandler(confirmarAlerta));
  // HU-39: coordinación (incidente), separada de la recepción histórica de HU-14.
  router.post('/alertas/:expedicionId/coordinacion', asyncHandler(coordinacion.asumir));
  // HU-41: bitácora cronológica compartida del incidente (distinta de la bitácora personal de HU-14).
  router.get('/incidentes/:incidenteId/bitacora', asyncHandler(bitacora.consultar));
  router.post('/incidentes/:incidenteId/bitacora', asyncHandler(bitacora.agregar));

  return router;
}
