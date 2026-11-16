import type { EstadoExpedicion } from './enums.js';

/** Longitud máxima del motivo opcional de una cancelación (HU-27). */
export const MAX_MOTIVO_CANCELACION = 200;

/** Único estado desde el que se puede cancelar: el plan todavía no inicia. */
export const ESTADO_CANCELABLE: EstadoExpedicion = 'programada';

/**
 * Regla de HU-27 (CA-01): solo se cancela un plan `programada` cuya hora de salida es futura.
 *
 * La comparación es estricta: una salida igual a "ahora" no es futura. Es la misma regla que HU-26
 * aplica al editar (`hora_inicio <= now()` ya inició) y coincide con el cron, que promueve a
 * `en_progreso` cuando `hora_inicio <= ahora`. La RPC `treksafe_cancelar_expedicion` (migración 018)
 * repite la regla con el reloj de la base, con la fila bloqueada.
 *
 * Un plan con la salida ya pasada que el cron aún no promovió (o que no puede promover porque el
 * senderista tiene otra expedición activa) ya no se cancela.
 */
export function esCancelable(
  plan: { estado: string; horaInicio: string },
  ahora: Date,
): boolean {
  if (plan.estado !== ESTADO_CANCELABLE) return false;
  return new Date(plan.horaInicio).getTime() > ahora.getTime();
}
