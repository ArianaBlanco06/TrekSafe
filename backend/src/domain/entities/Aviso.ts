export type TipoAviso = 'edicion' | 'cancelacion' | 'ampliacion' | 'recordatorio';

export type Aviso = {
  id: string;
  usuarioId: string;
  expedicionId: string | null;
  eventoId: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
  actualizadoEn: string;
};
