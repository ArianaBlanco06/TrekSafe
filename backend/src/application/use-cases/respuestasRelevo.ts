import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../domain/errors/ErrorCoordinacion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/**
 * Estado HTTP y mensaje de cada rechazo de relevo (HU-40). Definición única que usan
 * `ProponerRelevo`, `AceptarRelevo`, `RechazarRelevo` y `CancelarRelevo`. Ningún rechazo de negocio es 401: el frontend lo
 * interpreta como sesión vencida (misma regla que HU-39).
 */
export const RESPUESTAS_RELEVO: Record<CodigoErrorRelevo, { estado: number; mensaje: string }> = {
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de entrada inválidos' },
  DESTINATARIO_INVALIDO: { estado: 400, mensaje: 'No puedes proponerte a ti mismo como relevo' },
  DESTINATARIO_NO_VALIDADO: { estado: 400, mensaje: 'El destinatario no es un rescatista validado' },
  NO_ES_RESCATISTA: { estado: 403, mensaje: 'Solo un rescatista validado puede gestionar un relevo' },
  NO_ES_RESPONSABLE: { estado: 403, mensaje: 'Solo el responsable vigente puede proponer el relevo' },
  NO_ES_DESTINATARIO: { estado: 403, mensaje: 'Solo el destinatario puede aceptar o rechazar el relevo' },
  NO_ES_PROPONENTE: { estado: 403, mensaje: 'Solo quien propuso el relevo puede cancelarlo' },
  INCIDENTE_NO_ENCONTRADO: { estado: 404, mensaje: 'La alerta no tiene una coordinación abierta' },
  RELEVO_NO_ENCONTRADO: { estado: 404, mensaje: 'Relevo no encontrado' },
  INCIDENTE_CERRADO: { estado: 409, mensaje: 'El caso está cerrado y no admite relevos' },
  RELEVO_PENDIENTE: { estado: 409, mensaje: 'Ya hay un relevo pendiente para esta alerta' },
  VERSION_DESACTUALIZADA: { estado: 409, mensaje: 'La coordinación cambió: actualiza la pantalla e inténtalo de nuevo' },
  RELEVO_YA_RESUELTO: { estado: 409, mensaje: 'El relevo ya fue resuelto' },
};

/**
 * Traduce un rechazo de relevo a `ErrorAplicacion`, conservando `versionActual`,
 * `relevoPendiente` y `estadoRelevo` (cómo quedó un relevo ya resuelto).
 */
export function traducirErrorRelevo(error: ErrorCoordinacion<CodigoErrorRelevo>): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS_RELEVO[error.codigo];
  return new ErrorAplicacion(estado, mensaje, error.codigo, error.detalle ? { ...error.detalle } : undefined);
}
