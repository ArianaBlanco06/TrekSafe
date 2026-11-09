import type { IRegistroAvances, OrdenRegistrarAvance } from '../ports/avancesExpedicion.js';

/** Command: encapsula una acción y su identidad; el receptor garantiza atomicidad. */
export class RegistrarAvance {
  private readonly orden: OrdenRegistrarAvance;
  constructor(orden: OrdenRegistrarAvance, private readonly registro: IRegistroAvances) {
    this.orden = Object.freeze({ ...orden });
  }
  ejecutar() { return this.registro.registrarPropio(this.orden); }
}
