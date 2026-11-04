import { api } from './clienteApi';

export type TipoAviso = 'EDICION' | 'CANCELACION' | 'AMPLIACION' | 'RECORDATORIO' | 'SISTEMA';

export interface AvisoFrontend {
  id: string;
  usuarioId: string;
  expedicionId: string | null;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
}

export interface ListadoAvisosFrontend {
  avisos: AvisoFrontend[];
  conteoNoLeidos: number;
}

export async function obtenerAvisos(soloNoLeidos = false): Promise<ListadoAvisosFrontend> {
  const query = soloNoLeidos ? '?soloNoLeidos=true' : '';
  return api.get<ListadoAvisosFrontend>(`/avisos${query}`, true);
}

export async function marcarAvisoComoLeido(id: string): Promise<{ exito: boolean }> {
  return api.patch<{ exito: boolean; mensaje: string }>(`/avisos/${id}/leido`, {}, true);
}

export async function marcarTodosComoLeidos(): Promise<{ marcados: number }> {
  return api.patch<{ marcados: number; mensaje: string }>('/avisos/marcar-todos-leidos', {}, true);
}
