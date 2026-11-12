import type { EstadoIncidente } from '../repositories/IIncidenteDAO.js';
import { LIMITE_TEXTO_ENTRADA_BITACORA } from './entradaBitacora.js';

/**
 * Resultado del rescate que declara quien cierra el incidente (HU-42).
 * D1, pendiente de confirmar con Marko y con Jhon: sin estado de salud (no hay `fallecido` ni
 * `con_lesiones`). Debe coincidir con `chk_informes_cierre_resultado` y con la validación de
 * `treksafe_cerrar_incidente` (025).
 */
export const RESULTADOS_RESCATE = [
  'localizado_sin_asistencia',
  'asistido_en_terreno',
  'evacuado',
  'falsa_alarma',
] as const;
export type ResultadoRescate = (typeof RESULTADOS_RESCATE)[number];

/** El resumen se anexa como entrada 'cierre' de la bitácora: mismo límite que ella (019). */
export const LIMITE_RESUMEN_CIERRE = LIMITE_TEXTO_ENTRADA_BITACORA;

/** D2: estados desde los que se cierra. Debe coincidir con treksafe_cerrar_incidente (025). */
export const ESTADOS_INCIDENTE_CERRABLES: readonly EstadoIncidente[] = ['localizado'];
/** D2: estados desde los que se marca la persona localizada. Debe coincidir con treksafe_marcar_incidente_localizado (025). */
export const ESTADOS_INCIDENTE_LOCALIZABLES: readonly EstadoIncidente[] = ['abierto'];

/** D3: nota fija que deja "marcar localizada" en la bitácora. Debe coincidir con la 025. */
export const TEXTO_ENTRADA_LOCALIZADO = 'Persona localizada. El incidente pasa a estado localizado.';

export function admiteCierre(estado: EstadoIncidente): boolean {
  return ESTADOS_INCIDENTE_CERRABLES.includes(estado);
}

export function admiteLocalizar(estado: EstadoIncidente): boolean {
  return ESTADOS_INCIDENTE_LOCALIZABLES.includes(estado);
}
