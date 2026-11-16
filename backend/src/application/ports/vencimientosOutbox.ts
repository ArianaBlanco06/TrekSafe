export type ResultadoVencimientosOutbox = {
  enAlerta: number;
  pendientes: number;
  sinDestinatarios: string[];
};

/** El cambio de estado y sus avisos se confirman en una sola transacción. */
export interface IVencimientosOutbox {
  evaluar(limite: number): Promise<ResultadoVencimientosOutbox>;
}
