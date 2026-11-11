/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
export type DestinatarioRescatista = {
  correoElectronico: string;
  nombreCompleto: string;
};
export type FilaExpedicionAlerta = {
  id: string;
  lugar_inicio: string;
  lugar_fin: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  actualizado_en: string;
  perfiles_senderista:
    | {
        nombre_completo: string;
        telefono: string;
      }
    | {
        nombre_completo: string;
        telefono: string;
      }[]
    | null;
};
export type FilaExpedicionMonitor = FilaExpedicionAlerta & {
  estado: 'en_progreso' | 'alerta';
  coordenadas_inicio: string | null;
  coordenadas_fin: string | null;
};
export type FilaBitacoraRescate = {
  id: string;
  expedicion_id: string;
  estado_rescate: string;
  actualizado_en: string;
  notas: string | null;
};
export type FilaHistorialRescatista = {
  id: string;
  expedicion_id: string;
  estado_rescate: string;
  actualizado_en: string;
  notas: string | null;
  expediciones: {
    id: string;
    estado: string;
    lugar_inicio: string;
    lugar_fin: string;
    hora_inicio: string;
    hora_retorno_estimada: string;
    minutos_tolerancia: number;
    actualizado_en: string;
    perfiles_senderista:
      | {
          nombre_completo: string;
          telefono: string;
        }
      | {
          nombre_completo: string;
          telefono: string;
        }[]
      | null;
  };
};
export interface IRepositorioRescate {
  verificarEsRescatista(rescatistaId: string): Promise<void>;
  listarCorreosRescatistasValidados(): Promise<DestinatarioRescatista[]>;
  listarExpedicionesMonitor(zona?: string): Promise<FilaExpedicionMonitor[]>;
  buscarConfirmacionesPorExpediciones(
    expedicionIds: string[],
    rescatistaId: string,
  ): Promise<Map<string, FilaBitacoraRescate>>;
  listarExpedicionesEnAlerta(): Promise<FilaExpedicionAlerta[]>;
  buscarConfirmacion(
    expedicionId: string,
    rescatistaId: string,
  ): Promise<FilaBitacoraRescate | null>;
  buscarExpedicionEnAlerta(
    expedicionId: string,
  ): Promise<FilaExpedicionAlerta | null>;
  crearConfirmacion(
    expedicionId: string,
    rescatistaId: string,
    notas?: string,
  ): Promise<FilaBitacoraRescate>;
  actualizarBitacoraRescate(
    expedicionId: string,
    rescatistaId: string,
    input: {
      estadoRescate?: string;
      notas?: string;
    },
  ): Promise<FilaBitacoraRescate>;
  listarHistorialCompletadas(
    rescatistaId: string,
  ): Promise<FilaHistorialRescatista[]>;
}
