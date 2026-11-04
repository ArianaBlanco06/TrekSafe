import { ErrorValidacionEquipo } from '../errors/ErrorValidacionEquipo.js';

export type DatosItemEquipo = {
  readonly id?: string;
  readonly nombre: string;
  readonly obligatorio: boolean;
};

export type EstadoItemEquipo = DatosItemEquipo & { readonly id: string };

export class ItemEquipo {
  readonly id: string;
  readonly nombre: string;
  readonly obligatorio: boolean;

  constructor(estado: EstadoItemEquipo) {
    const datos = ItemEquipo.normalizarDatos(estado);
    if (datos.id === undefined) {
      throw new ErrorValidacionEquipo('ID_ITEM_INVALIDO', 'Un ítem guardado debe tener identificador.');
    }
    this.id = datos.id;
    this.nombre = datos.nombre;
    this.obligatorio = datos.obligatorio;
    Object.freeze(this);
  }

  static normalizarDatos(datos: DatosItemEquipo): DatosItemEquipo {
    if (!datos || typeof datos !== 'object') {
      throw new ErrorValidacionEquipo('ITEM_INVALIDO', 'El ítem debe contener nombre e indicador obligatorio.');
    }
    if (typeof datos.nombre !== 'string' || !datos.nombre.trim()) {
      throw new ErrorValidacionEquipo('NOMBRE_ITEM_INVALIDO', 'El nombre del ítem es obligatorio.');
    }
    if (typeof datos.obligatorio !== 'boolean') {
      throw new ErrorValidacionEquipo('OBLIGATORIO_INVALIDO', 'Indica si el ítem es obligatorio u opcional.');
    }
    if (datos.id !== undefined && (typeof datos.id !== 'string' || !datos.id.trim())) {
      throw new ErrorValidacionEquipo('ID_ITEM_INVALIDO', 'El identificador del ítem no es válido.');
    }

    return Object.freeze({
      ...(datos.id === undefined ? {} : { id: datos.id }),
      nombre: datos.nombre.trim(),
      obligatorio: datos.obligatorio,
    });
  }
}
