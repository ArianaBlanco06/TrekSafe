import type { Aviso, TipoAviso } from '../entities/Aviso.js';

export type CrearAvisoInput = {
  usuarioId: string;
  expedicionId?: string | null;
  eventoId: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
};

export interface INotificacionDAO {
  guardar(input: CrearAvisoInput): Promise<Aviso>;
  buscarPorEvento(usuarioId: string, eventoId: string): Promise<Aviso | null>;
  listarPorUsuario(usuarioId: string, soloNoLeidos?: boolean): Promise<Aviso[]>;
  contarNoLeidos(usuarioId: string): Promise<number>;
  marcarComoLeido(avisoId: string, usuarioId: string): Promise<Aviso>;
  marcarTodosComoLeidos(usuarioId: string): Promise<number>;
  eliminarPorUsuario(usuarioId: string): Promise<number>;
}
