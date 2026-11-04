export type TipoAviso =
  | 'EDICION'
  | 'CANCELACION'
  | 'AMPLIACION'
  | 'RECORDATORIO'
  | 'SISTEMA';

export type Aviso = {
  id: string;
  usuarioId: string;
  expedicionId?: string | null;
  eventoId?: string | null;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
  actualizadoEn?: string;
};
