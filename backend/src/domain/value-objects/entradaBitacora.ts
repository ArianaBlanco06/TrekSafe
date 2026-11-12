import type { EstadoIncidente } from '../repositories/IIncidenteDAO.js';

/**
 * Tipos de entrada de la bitácora del incidente (HU-41). Deben coincidir con
 * `chk_entradas_bitacora_tipo` de la migración 019. La RPC pública solo crea 'nota' y
 * 'correccion'; 'cierre' queda reservado para HU-42 (un solo cierre por incidente).
 */
export const TIPOS_ENTRADA_BITACORA = ['nota', 'correccion', 'cierre'] as const;
export type TipoEntradaBitacora = (typeof TIPOS_ENTRADA_BITACORA)[number];

/** Longitud máxima del texto tras recortar espacios. Debe coincidir con la migración 019. */
export const LIMITE_TEXTO_ENTRADA_BITACORA = 2000;

/** Estados en los que el responsable puede escribir. Debe coincidir con treksafe_agregar_entrada_bitacora (019). */
export const ESTADOS_INCIDENTE_CON_ESCRITURA: readonly EstadoIncidente[] = ['abierto', 'localizado'];

export function admiteEntradas(estado: EstadoIncidente): boolean {
  return ESTADOS_INCIDENTE_CON_ESCRITURA.includes(estado);
}
