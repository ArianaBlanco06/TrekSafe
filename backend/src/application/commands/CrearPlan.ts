import type { ICreadorPlanIdempotente, OrdenCrearPlan } from '../ports/creacionPlan.js';

/** Command: conserva el identificador local durante todos los reintentos. */
export class CrearPlan {
  private readonly orden: OrdenCrearPlan;
  constructor(orden: OrdenCrearPlan, private readonly creador: ICreadorPlanIdempotente) {
    this.orden = structuredClone(orden);
  }
  ejecutar() { return this.creador.crear(structuredClone(this.orden)); }
}
