export type CodigoErrorEquipo =
  | 'NOMBRE_LISTA_INVALIDO'
  | 'ITEM_INVALIDO'
  | 'NOMBRE_ITEM_INVALIDO'
  | 'OBLIGATORIO_INVALIDO'
  | 'ID_ITEM_INVALIDO'
  | 'ITEMS_INVALIDOS'
  | 'ITEM_DUPLICADO'
  | 'ITEM_ID_NO_PERMITIDO'
  | 'ITEM_NO_PERTENECE';

/** Error de negocio; la capa HTTP decidirá cómo representarlo. */
export class ErrorValidacionEquipo extends Error {
  constructor(
    public readonly codigo: CodigoErrorEquipo,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorValidacionEquipo';
  }
}
