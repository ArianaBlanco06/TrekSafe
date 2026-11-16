export type CodigoErrorPreparacionExpedicion =
  | 'EXPEDICION_NO_ENCONTRADA'
  | 'LISTA_EQUIPO_NO_ENCONTRADA'
  | 'ITEM_PREPARACION_NO_ENCONTRADO'
  | 'PREPARACION_YA_ASOCIADA'
  | 'PREPARACION_NO_EDITABLE'
  | 'PREPARADO_INVALIDO'
  | 'PREPARACION_INVALIDA';

export class ErrorPreparacionExpedicion extends Error {
  constructor(public readonly codigo: CodigoErrorPreparacionExpedicion, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPreparacionExpedicion';
  }
}

export function validarEstadoPreparacionEditable(estado: string): void {
  if (estado !== 'programada' && estado !== 'en_progreso') {
    throw new ErrorPreparacionExpedicion(
      'PREPARACION_NO_EDITABLE',
      'Solo puedes preparar el equipo de una expedición programada o en progreso.',
    );
  }
}
