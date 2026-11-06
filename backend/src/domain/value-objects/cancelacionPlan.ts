import type { EstadoExpedicion } from './enums.js';

/** Longitud máxima del motivo opcional de una cancelación (HU-27). */
export const MAX_MOTIVO_CANCELACION = 200;

/** Único estado desde el que se puede cancelar: el plan todavía no inicia. */
export const ESTADO_CANCELABLE: EstadoExpedicion = 'programada';

/**
 * Regla de HU-27: "todavía no inicia" significa que el plan sigue en `programada`.
 *
 * Con `false`, se puede cancelar aunque la hora de salida ya haya pasado, mientras el
 * cron no lo haya promovido a `en_progreso`. Así se evita que un plan que el senderista
 * ya no usará termine en una alerta falsa.
 *
 * PENDIENTE: el Product Owner debe confirmar esta regla. Si decide exigir salida futura,
 * cambia esta constante a `true` y agrega la misma comprobación en
 * `treksafe_cancelar_expedicion` (migración 005), que hoy no compara la hora.
 */
export const CANCELAR_EXIGE_SALIDA_FUTURA: boolean = false;

export function esCancelable(
  plan: { estado: string; horaInicio: string },
  ahora: Date,
): boolean {
  if (plan.estado !== ESTADO_CANCELABLE) return false;
  if (!CANCELAR_EXIGE_SALIDA_FUTURA) return true;
  return new Date(plan.horaInicio).getTime() > ahora.getTime();
}
