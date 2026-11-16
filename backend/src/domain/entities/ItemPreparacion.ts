import { ItemEquipo, type EstadoItemEquipo } from './ItemEquipo.js';
import { ErrorPreparacionExpedicion } from '../errors/ErrorPreparacionExpedicion.js';

export type EstadoItemPreparacion = EstadoItemEquipo & { readonly preparado: boolean };

export class ItemPreparacion {
  readonly id: string;
  readonly nombre: string;
  readonly obligatorio: boolean;
  readonly preparado: boolean;

  constructor(estado: EstadoItemPreparacion) {
    const item = new ItemEquipo(estado);
    ItemPreparacion.validarPreparado(estado.preparado);
    this.id = item.id;
    this.nombre = item.nombre;
    this.obligatorio = item.obligatorio;
    this.preparado = estado.preparado;
    Object.freeze(this);
  }

  static validarPreparado(preparado: unknown): asserts preparado is boolean {
    if (typeof preparado !== 'boolean') {
      throw new ErrorPreparacionExpedicion('PREPARADO_INVALIDO', 'La marca de equipo preparado debe ser booleana.');
    }
  }
}
