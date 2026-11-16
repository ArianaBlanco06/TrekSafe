import type { AlertaPriorizable, IEstrategiaPrioridad } from '../strategies/IEstrategiaPrioridad.js';

export class OrdenadorAlertas {
  constructor(private readonly estrategia: IEstrategiaPrioridad) {}

  ordenar<T extends AlertaPriorizable>(
    alertas: readonly T[],
    grupo: (alerta: T) => number = () => 0,
  ): T[] {
    return [...alertas].sort((primera, segunda) =>
      grupo(primera) - grupo(segunda)
      || this.estrategia.comparar(primera, segunda)
      || Date.parse(primera.fechaLimite) - Date.parse(segunda.fechaLimite)
      || primera.expedicionId.localeCompare(segunda.expedicionId),
    );
  }
}
