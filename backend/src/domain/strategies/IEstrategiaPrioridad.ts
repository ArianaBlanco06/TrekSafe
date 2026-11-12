export const CRITERIOS_PRIORIDAD = ['tiempo_excedido', 'tamano_grupo'] as const;
export type CriterioPrioridad = typeof CRITERIOS_PRIORIDAD[number];

export const CRITERIO_PRIORIDAD_PREDETERMINADO: CriterioPrioridad = 'tiempo_excedido';

export type AlertaPriorizable = {
  readonly expedicionId: string;
  readonly fechaLimite: string;
  readonly numeroParticipantes: number;
};

/** Compara datos operativos de dos alertas sin modificar sus datos. */
export interface IEstrategiaPrioridad {
  comparar(primera: AlertaPriorizable, segunda: AlertaPriorizable): number;
}
