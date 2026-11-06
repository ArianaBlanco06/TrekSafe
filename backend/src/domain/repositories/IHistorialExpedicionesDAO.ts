/** Datos reutilizables del origen; nunca se devuelve la fila completa de la base. */
export type ExpedicionParaRepetir = {
  readonly id: string;
  readonly senderistaId: string;
  readonly estado: string;
  readonly lugarInicio: string;
  readonly lugarFin: string;
  readonly coordenadasInicio: string | null;
  readonly coordenadasFin: string | null;
  readonly minutosTolerancia: number;
  readonly idsContactos: readonly string[];
  readonly nombresAcompanantes: readonly string[];
};

/** Consulta pequeña para HU-28, independiente de las escrituras del plan. */
export interface IHistorialExpedicionesDAO {
  /** Origen propio o null. Las consultas reales deben filtrar siempre por propietario. */
  buscarPorId(senderistaId: string, expedicionId: string): Promise<ExpedicionParaRepetir | null>;
}
