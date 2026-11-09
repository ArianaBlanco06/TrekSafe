/**
 * Patrón Command: un comando es un objeto inmutable con identidad (`operacionId`) y
 * parámetros; su ejecutor lo procesa y devuelve un resultado.
 *
 * Separar el "qué" (comando) del "cómo" (ejecutor) permite registrar, reintentar y
 * deduplicar operaciones por su identidad sin que el emisor conozca la persistencia.
 */
export interface Comando<TResultado> {
  readonly operacionId: string;
  /** Solo para el tipado: une el comando con el tipo de resultado de su ejecutor. */
  readonly __resultado?: TResultado;
}

export interface IEjecutorComando<TComando extends Comando<TResultado>, TResultado> {
  ejecutar(comando: TComando): Promise<TResultado>;
}
