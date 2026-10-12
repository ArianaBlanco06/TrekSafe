export class ErrorAplicacion extends Error {
  constructor(
    public readonly codigoEstado: number,
    message: string,
    public readonly codigo?: string,
  ) {
    super(message);
    this.name = 'ErrorAplicacion';
  }
}
