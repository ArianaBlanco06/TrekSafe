import type { AlertaPriorizable, IEstrategiaPrioridad } from './IEstrategiaPrioridad.js';

export class PorTamanoGrupo implements IEstrategiaPrioridad {
  comparar(primera: AlertaPriorizable, segunda: AlertaPriorizable): number {
    return segunda.numeroParticipantes - primera.numeroParticipantes;
  }
}
