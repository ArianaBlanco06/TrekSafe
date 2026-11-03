import { calcularFechaLimite } from '../entities/Expedicion.js';
import type { EstadoExpedicion } from './enums.js';

/**
 * Ampliaciones permitidas por expedición (HU-35).
 *
 * PENDIENTE: el Product Owner debe confirmar el valor. Si cambia, cambia también
 * `c_max_ampliaciones` en `treksafe_ampliar_retorno` (migración 007).
 */
export const MAX_AMPLIACIONES = 1;

/** Minutos que se suman a `hora_retorno_estimada` en una ampliación. */
export const MIN_MINUTOS_AMPLIACION = 1;
export const MAX_MINUTOS_AMPLIACION = 120;

/** Longitud del motivo obligatorio, sin espacios al inicio ni al final. */
export const MIN_MOTIVO_AMPLIACION = 3;
export const MAX_MOTIVO_AMPLIACION = 200;

/** Único estado desde el que se amplía. Una programada se corrige con la edición (HU-26). */
export const ESTADO_AMPLIABLE: EstadoExpedicion = 'en_progreso';

/**
 * El plazo sigue vigente si `ahora` es anterior al límite (retorno + tolerancia).
 * Usa `calcularFechaLimite`, la misma fórmula que el resto del backend y que
 * `treksafe_fecha_limite` en SQL. La RPC repite esta comprobación con `NOW()`.
 */
export function plazoVigente(
  plan: { horaRetornoEstimada: string; minutosTolerancia: number },
  ahora: Date,
): boolean {
  const limiteMs = new Date(
    calcularFechaLimite(plan.horaRetornoEstimada, plan.minutosTolerancia),
  ).getTime();
  return ahora.getTime() < limiteMs;
}

/** Ampliaciones que quedan, a partir de las ya registradas. Nunca es negativo. */
export function ampliacionesRestantes(ampliacionesRegistradas: number): number {
  return Math.max(0, MAX_AMPLIACIONES - ampliacionesRegistradas);
}
