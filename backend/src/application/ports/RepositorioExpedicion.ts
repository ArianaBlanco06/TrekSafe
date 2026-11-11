/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
export { calcularFechaLimite };
export type FilaExpedicion = {
  id: string;
  lugar_inicio: string;
  lugar_fin: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  minutos_recordatorio?: number;
  estado: string;
  version: number;
  creado_en?: string;
  actualizado_en?: string;
};
type FilaExpedicionActiva = FilaExpedicion & {
  acompanantes_expedicion: {
    nombre_acompanante: string;
  }[];
  vinculos_expedicion_contacto: {
    contactos_emergencia: {
      nombre_completo: string;
      correo_electronico: string;
    } | null;
  }[];
  /** HU-35: solo el tipo, para contar las ampliaciones del retorno. */
  eventos_plan?: {
    tipo: string;
  }[];
};
export interface IRepositorioExpedicion {
  tieneExpedicionBloqueante(senderistaId: string): Promise<boolean>;
  validarPropiedadContactos(
    senderistaId: string,
    idsContactos: string[],
  ): Promise<void>;
  crearExpedicion(
    senderistaId: string,
    input: {
      lugarInicio: string;
      lugarFin: string;
      coordenadasInicio?: string;
      coordenadasFin?: string;
      horaInicio: string;
      horaRetornoEstimada: string;
      minutosTolerancia: number;
      minutosRecordatorio?: number;
      estado: 'programada' | 'en_progreso';
      idsContactos: string[];
      nombresAcompanantes: string[];
    },
  ): Promise<FilaExpedicion>;
  listarExpedicionesCompletadas(
    senderistaId: string,
  ): Promise<FilaExpedicion[]>;
  listarExpediciones(senderistaId: string): Promise<FilaExpedicion[]>;
  buscarActivaPorSenderista(
    senderistaId: string,
  ): Promise<FilaExpedicionActiva | null>;
  buscarPorIdParaSenderista(
    expedicionId: string,
    senderistaId: string,
  ): Promise<FilaExpedicion | null>;
  promoverProgramadasListas(): Promise<number>;
  marcarEnProgresoExpiradaComoAlerta(): Promise<string[]>;
  completarConfirmacionRetorno(
    expedicionId: string,
    senderistaId: string,
  ): Promise<FilaExpedicion>;
  buscarEnProgresoParaRecordatorio(): Promise<
    Array<{
      id: string;
      senderistaId: string;
      horaRetornoEstimada: string;
      minutosRecordatorio: number;
    }>
  >;
}
