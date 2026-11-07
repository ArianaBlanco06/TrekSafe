import { ErrorAplicacion } from './ErrorAplicacion.js';

/** Errores compartidos por los adaptadores del historial de cambios (HU-36). */
export function errorHistorialCambiosNoDisponible(): ErrorAplicacion {
  return new ErrorAplicacion(500, 'No se pudo consultar el historial de cambios.', 'HISTORIAL_CAMBIOS_NO_DISPONIBLE');
}

export function errorOperacionYaRegistrada(): ErrorAplicacion {
  return new ErrorAplicacion(409, 'La operación ya fue registrada.', 'OPERACION_YA_REGISTRADA');
}
