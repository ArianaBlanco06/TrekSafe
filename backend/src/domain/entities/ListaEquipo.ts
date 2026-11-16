import { ItemEquipo, type DatosItemEquipo, type EstadoItemEquipo } from './ItemEquipo.js';
import { ErrorValidacionEquipo } from '../errors/ErrorValidacionEquipo.js';

export type DatosListaEquipo = {
  readonly nombre: string;
  readonly items: readonly DatosItemEquipo[];
};

export type EstadoListaEquipo = {
  readonly id: string;
  readonly senderistaId: string;
  readonly nombre: string;
  readonly items: readonly EstadoItemEquipo[];
  readonly creadoEn: string;
  readonly actualizadoEn: string;
};

/** Instantánea inmutable de una lista guardada. Las escrituras crean otra versión. */
export class ListaEquipo {
  readonly id: string;
  readonly senderistaId: string;
  readonly nombre: string;
  readonly items: readonly ItemEquipo[];
  readonly creadoEn: string;
  readonly actualizadoEn: string;

  constructor(estado: EstadoListaEquipo) {
    const contenido = ListaEquipo.normalizarContenido(estado);
    this.id = estado.id;
    this.senderistaId = estado.senderistaId;
    this.nombre = contenido.nombre;
    this.items = Object.freeze(estado.items.map((item) => new ItemEquipo(item)));
    this.creadoEn = estado.creadoEn;
    this.actualizadoEn = estado.actualizadoEn;
    Object.freeze(this);
  }

  static normalizarContenido(datos: DatosListaEquipo): DatosListaEquipo {
    if (!datos || typeof datos.nombre !== 'string' || !datos.nombre.trim()) {
      throw new ErrorValidacionEquipo('NOMBRE_LISTA_INVALIDO', 'El nombre de la lista es obligatorio.');
    }
    if (!Array.isArray(datos.items)) {
      throw new ErrorValidacionEquipo('ITEMS_INVALIDOS', 'Los ítems deben ser una colección, que puede estar vacía.');
    }

    const items = Array.from(datos.items, (item: DatosItemEquipo) => ItemEquipo.normalizarDatos(item));
    const identificadores = new Set<string>();
    for (const item of items) {
      if (item.id === undefined) continue;
      if (identificadores.has(item.id)) {
        throw new ErrorValidacionEquipo('ITEM_DUPLICADO', 'Un identificador de ítem no puede repetirse en la lista.');
      }
      identificadores.add(item.id);
    }

    return Object.freeze({ nombre: datos.nombre.trim(), items: Object.freeze(items) });
  }
}
