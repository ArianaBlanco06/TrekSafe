import type { AlertaPriorizable, IEstrategiaPrioridad } from './IEstrategiaPrioridad.js';

export class PorTiempoExcedido implements IEstrategiaPrioridad {
  comparar(primera: AlertaPriorizable, segunda: AlertaPriorizable): number {
    // Con un mismo instante de consulta, el plazo anterior tiene mayor tiempo excedido.
    return Date.parse(primera.fechaLimite) - Date.parse(segunda.fechaLimite);
  }
}
