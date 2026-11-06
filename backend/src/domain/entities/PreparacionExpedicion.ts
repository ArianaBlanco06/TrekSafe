import { ListaEquipo } from './ListaEquipo.js';
import { ItemPreparacion, type EstadoItemPreparacion } from './ItemPreparacion.js';
import { ErrorPreparacionExpedicion } from '../errors/ErrorPreparacionExpedicion.js';

export type EstadoPreparacionExpedicion = {
  readonly id: string;
  readonly expedicionId: string;
  readonly senderistaId: string;
  readonly listaOrigenId: string | null;
  readonly nombreLista: string;
  readonly items: readonly EstadoItemPreparacion[];
  readonly creadoEn: string;
  readonly actualizadoEn: string;
};

export class PreparacionExpedicion {
  readonly id: string;
  readonly expedicionId: string;
  readonly senderistaId: string;
  readonly listaOrigenId: string | null;
  readonly nombreLista: string;
  readonly items: readonly ItemPreparacion[];
  readonly creadoEn: string;
  readonly actualizadoEn: string;

  constructor(estado: EstadoPreparacionExpedicion) {
    if (!estado || [estado.id, estado.expedicionId, estado.senderistaId].some(
      (id) => typeof id !== 'string' || !id.trim(),
    ) || (estado.listaOrigenId !== null && (
      typeof estado.listaOrigenId !== 'string' || !estado.listaOrigenId.trim()
    ))) {
      throw new ErrorPreparacionExpedicion('PREPARACION_INVALIDA', 'La preparación debe tener identidades válidas.');
    }
    const contenido = ListaEquipo.normalizarContenido({ nombre: estado.nombreLista, items: estado.items });
    this.id = estado.id;
    this.expedicionId = estado.expedicionId;
    this.senderistaId = estado.senderistaId;
    this.listaOrigenId = estado.listaOrigenId;
    this.nombreLista = contenido.nombre;
    this.items = Object.freeze(estado.items.map((item) => new ItemPreparacion(item)));
    this.creadoEn = estado.creadoEn;
    this.actualizadoEn = estado.actualizadoEn;
    Object.freeze(this);
  }

  get obligatoriosPendientes(): number {
    return this.items.filter((item) => item.obligatorio && !item.preparado).length;
  }
}
