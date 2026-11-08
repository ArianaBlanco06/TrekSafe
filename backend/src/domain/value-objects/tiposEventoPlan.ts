/**
 * Tipos de evento de `eventos_plan`. Fuente única en TypeScript; debe coincidir con
 * `chk_eventos_plan_tipo` (migración 002).
 */
export const TIPOS_EVENTO_PLAN = ['EDITADA', 'CANCELADA', 'RETORNO_AMPLIADO'] as const;

export type TipoEventoPlan = (typeof TIPOS_EVENTO_PLAN)[number];

export function esTipoEventoPlan(valor: unknown): valor is TipoEventoPlan {
  return typeof valor === 'string' && (TIPOS_EVENTO_PLAN as readonly string[]).includes(valor);
}
