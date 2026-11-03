import type { EstadoExpedicion } from './enums.js';

/** Longitud máxima del motivo opcional de una cancelación (HU-27). */
export const MAX_MOTIVO_CANCELACION = 200;

/**
 * Regla de HU-27: "todavía no inicia" significa que el plan sigue en `programada`.
 *
 * Se puede cancelar aunque la hora de salida ya haya pasado, mientras el cron no lo
 * haya promovido a `en_progreso`. Así se evita que un plan que el senderista ya no
 * usará termine en una alerta falsa.
 *
 * PENDIENTE: el Product Owner debe confirmar esta regla. Si decide exigir salida
 * futura, el cambio va aquí y en `treksafe_cancelar_expedicion` (005).
 */
export const ESTADO_CANCELABLE: EstadoExpedicion = 'programada';

export function esCancelable(estado: string): boolean {
  return estado === ESTADO_CANCELABLE;
}
