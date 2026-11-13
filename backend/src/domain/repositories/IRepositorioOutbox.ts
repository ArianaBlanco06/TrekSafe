import type { MensajeOutbox, NuevoMensajeOutbox } from '../entities/OutboxNotificacion.js';
export type FinIntento = 'enviado'|'reintentado'|'fallido'|'incierto'|'reserva_perdida';
export interface IRepositorioOutbox {
  guardar(mensaje: NuevoMensajeOutbox): Promise<MensajeOutbox>;
  obtenerParaProcesar(ahora: Date, limite?: number): Promise<MensajeOutbox[]>;
  adquirirLease(id: string, reservaId: string, duracionMs: number, ahora: Date): Promise<boolean>;
  iniciarIntento(id: string, reservaId: string): Promise<MensajeOutbox|null>;
  finalizarIntento(id: string, reservaId: string, estado: 'enviado'|'fallido'|'incierto', modo: string, ahora: Date): Promise<FinIntento>;
}
