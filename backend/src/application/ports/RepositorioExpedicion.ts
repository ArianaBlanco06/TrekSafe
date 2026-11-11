/** Lecturas de negocio independientes de tablas, columnas y relaciones del proveedor. */
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
export { calcularFechaLimite };
export type ExpedicionLeida = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  estado: string;
  version: number;
  creadoEn?: string;
  actualizadoEn?: string;
};
export type ExpedicionActivaLeida = ExpedicionLeida & {
  acompanantes: string[];
  contactos: { nombreCompleto: string; correoElectronico: string }[];
  cantidadAmpliaciones: number;
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
  ): Promise<ExpedicionLeida>;
  listarExpedicionesCompletadas(
    senderistaId: string,
  ): Promise<ExpedicionLeida[]>;
  listarExpediciones(senderistaId: string): Promise<ExpedicionLeida[]>;
  buscarActivaPorSenderista(
    senderistaId: string,
  ): Promise<ExpedicionActivaLeida | null>;
  buscarPorIdParaSenderista(
    expedicionId: string,
    senderistaId: string,
  ): Promise<ExpedicionLeida | null>;
  promoverProgramadasListas(): Promise<number>;
  marcarEnProgresoExpiradaComoAlerta(): Promise<string[]>;
  completarConfirmacionRetorno(
    expedicionId: string,
    senderistaId: string,
  ): Promise<ExpedicionLeida>;
  buscarEnProgresoParaRecordatorio(): Promise<
    Array<{
      id: string;
      senderistaId: string;
      horaRetornoEstimada: string;
      minutosRecordatorio: number;
    }>
  >;
}
