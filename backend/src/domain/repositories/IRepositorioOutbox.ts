import type { MensajeOutbox, NuevoMensajeOutbox } from '../entities/OutboxNotificacion.js';

export interface IRepositorioOutbox {
  guardar(mensaje: NuevoMensajeOutbox): Promise<MensajeOutbox>;
  obtenerParaProcesar(ahora: Date, limite?: number): Promise<MensajeOutbox[]>;
  adquirirLease(id: string, workerId: string, duracionMs: number, ahora: Date): Promise<boolean>;
  marcarEnviado(id: string, modoEnvio: string, fechaEnvio: Date): Promise<void>;
  marcarReintento(id: string, proximoIntento: Date, intentosActuales: number, ultimoError: string): Promise<void>;
  marcarFallido(id: string, intentosActuales: number, errorFinal: string): Promise<void>;
  marcarIncierto(id: string, intentosActuales: number, motivoIncierto: string): Promise<void>;
  liberarLease(id: string): Promise<void>;
}
