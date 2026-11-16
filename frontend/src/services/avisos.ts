import { api } from './clienteApi';

export type TipoAviso = 'edicion' | 'cancelacion' | 'ampliacion' | 'recordatorio';

export type Aviso = {
  id: string;
  expedicionId: string | null;
  eventoId: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
};

export function listarAvisos(soloNoLeidos = false) {
  return api.get<{ datos: Aviso[] }>(`/avisos${soloNoLeidos ? '?soloNoLeidos=true' : ''}`, true);
}

export function contarAvisosNoLeidos() {
  return api.get<{ datos: { totalNoLeidos: number } }>('/avisos/no-leidos/conteo', true);
}

export function marcarAvisoLeido(id: string) {
  return api.patch<{ datos: Aviso }>(`/avisos/${id}/leido`, {}, true);
}

export function marcarTodosLosAvisosLeidos() {
  return api.patch<{ datos: { actualizados: number } }>('/avisos/marcar-todos-leidos', {}, true);
}
