import type { TipoAviso } from '../../domain/entities/Aviso.js';

export interface RespuestaAvisoDTO {
  id: string;
  usuarioId: string;
  expedicionId: string | null;
  eventoId?: string | null;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
}

export interface ListadoAvisosDTO {
  avisos: RespuestaAvisoDTO[];
  conteoNoLeidos: number;
}

export interface EventoExpedicionEntradaDTO {
  usuarioId: string;
  expedicionId?: string | null;
  eventoId?: string; // Clave de idempotencia única del evento para evitar duplicados (CA-03)
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
}
