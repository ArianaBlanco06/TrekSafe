/** Lecturas de rescate sin columnas ni relaciones de persistencia. */
export type DestinatarioRescatista = {
  correoElectronico: string;
  nombreCompleto: string;
};
export type ExpedicionAlertaLeida = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  actualizadoEn: string;
  senderista: { nombreCompleto: string; telefono: string } | null;
};
export type ExpedicionMonitorLeida = ExpedicionAlertaLeida & {
  estado: 'en_progreso' | 'alerta';
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
};
export type BitacoraRescateLeida = {
  id: string;
  expedicionId: string;
  estadoRescate: string;
  actualizadoEn: string;
  notas: string | null;
};
export type HistorialRescatistaLeido = BitacoraRescateLeida & {
  expedicion: (ExpedicionAlertaLeida & { estado: string }) | null;
};
export interface IRepositorioRescate {
  verificarEsRescatista(rescatistaId: string): Promise<void>;
  listarCorreosRescatistasValidados(): Promise<DestinatarioRescatista[]>;
  listarExpedicionesMonitor(zona?: string): Promise<ExpedicionMonitorLeida[]>;
  buscarConfirmacionesPorExpediciones(
    expedicionIds: string[],
    rescatistaId: string,
  ): Promise<Map<string, BitacoraRescateLeida>>;
  listarExpedicionesEnAlerta(): Promise<ExpedicionAlertaLeida[]>;
  buscarConfirmacion(
    expedicionId: string,
    rescatistaId: string,
  ): Promise<BitacoraRescateLeida | null>;
  buscarExpedicionEnAlerta(
    expedicionId: string,
  ): Promise<ExpedicionAlertaLeida | null>;
  crearConfirmacion(
    expedicionId: string,
    rescatistaId: string,
    notas?: string,
  ): Promise<BitacoraRescateLeida>;
  actualizarBitacoraRescate(
    expedicionId: string,
    rescatistaId: string,
    input: {
      estadoRescate?: string;
      notas?: string;
    },
  ): Promise<BitacoraRescateLeida>;
  listarHistorialCompletadas(
    rescatistaId: string,
  ): Promise<HistorialRescatistaLeido[]>;
}
