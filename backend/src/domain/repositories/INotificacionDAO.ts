import type { Aviso, TipoAviso } from '../entities/Aviso.js';

export interface CrearAvisoInput {
  usuarioId: string;
  expedicionId?: string | null;
  eventoId?: string | null;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
}

/**
 * Interfaz requerida por el Product Backlog (DoD HU-37)
 * para la persistencia desacoplada de avisos y notificaciones in-app.
 */
export interface INotificacionDAO {
  crear(datos: CrearAvisoInput): Promise<Aviso>;
  listarPorUsuario(usuarioId: string, soloNoLeidos?: boolean): Promise<Aviso[]>;
  contarNoLeidos(usuarioId: string): Promise<number>;
  marcarComoLeido(id: string, usuarioId: string): Promise<boolean>;
  marcarTodosComoLeidos(usuarioId: string): Promise<number>;
  obtenerPorId(id: string, usuarioId: string): Promise<Aviso | null>;
  obtenerPorEventoId(usuarioId: string, eventoId: string): Promise<Aviso | null>;
}
