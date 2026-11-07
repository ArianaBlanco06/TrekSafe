/**
 * Campos del plan que puede registrar un evento de `eventos_plan` (HU-26, HU-27, HU-35)
 * y que el historial de cambios (HU-36) puede mostrar. Lista blanca y orden de presentación.
 *
 * Debe coincidir con `treksafe_sanear_cambios_evento_plan` (migración 010).
 */
export const CAMPOS_EVENTO_PLAN = [
  'lugarInicio',
  'lugarFin',
  'coordenadasInicio',
  'coordenadasFin',
  'horaInicio',
  'horaRetornoEstimada',
  'minutosTolerancia',
  'idsContactos',
  'nombresAcompanantes',
  'estado',
] as const;

export type CampoEventoPlan = (typeof CAMPOS_EVENTO_PLAN)[number];

/** Valores que guardan las RPC: textos, horas ISO, enteros, listas de textos o null. */
export type ValorCambio = string | number | string[] | null;

export type CambioCampo = { readonly antes: ValorCambio; readonly despues: ValorCambio };

export type CambiosEventoPlan = Partial<Record<CampoEventoPlan, CambioCampo>>;

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function aValorCambio(valor: unknown): { valido: true; valor: ValorCambio } | { valido: false } {
  if (valor === undefined || valor === null) return { valido: true, valor: null };
  if (typeof valor === 'string') return { valido: true, valor };
  if (typeof valor === 'number' && Number.isFinite(valor)) return { valido: true, valor };
  if (Array.isArray(valor) && valor.every((elemento) => typeof elemento === 'string')) {
    return { valido: true, valor: [...valor] };
  }
  return { valido: false };
}

/**
 * Conserva solo los campos de la lista blanca con forma `{antes, despues}`; descarta
 * cualquier otra clave o subclave. Además de la forma, comprueba el tipo de cada valor
 * (defensa adicional a la del trigger SQL, que solo comprueba la estructura).
 */
export function sanearCambios(crudo: unknown): CambiosEventoPlan {
  if (!esObjetoPlano(crudo)) return {};
  const saneados: CambiosEventoPlan = {};
  for (const campo of CAMPOS_EVENTO_PLAN) {
    if (!Object.hasOwn(crudo, campo)) continue;
    const cambio = crudo[campo];
    if (!esObjetoPlano(cambio)) continue;
    if (!Object.hasOwn(cambio, 'antes') && !Object.hasOwn(cambio, 'despues')) continue;
    const antes = aValorCambio(cambio.antes);
    const despues = aValorCambio(cambio.despues);
    if (!antes.valido || !despues.valido) continue;
    saneados[campo] = { antes: antes.valor, despues: despues.valor };
  }
  return saneados;
}

/**
 * Un evento está anonimizado (ARCO) solo si su `cambios` crudo, antes de sanear, es un
 * objeto vacío y no tiene motivo. Se calcula sobre la fila cruda para no confundirlo con
 * un evento cuyos campos descartó el saneamiento.
 */
export function esEventoAnonimizado(cambiosCrudos: unknown, motivo: string | null): boolean {
  return esObjetoPlano(cambiosCrudos) && Object.keys(cambiosCrudos).length === 0 && motivo === null;
}
