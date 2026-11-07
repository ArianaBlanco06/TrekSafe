import { z } from 'zod';

export const consultaListarAvisosSchema = z.object({
  soloNoLeidos: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export type ConsultaListarAvisosDTO = z.infer<typeof consultaListarAvisosSchema>;

export const paramsAvisoIdSchema = z.object({
  id: z.string().uuid('El ID del aviso debe ser un UUID válido'),
});

export type ParamsAvisoIdDTO = z.infer<typeof paramsAvisoIdSchema>;

export type RespuestaAvisoDTO = {
  id: string;
  expedicionId: string | null;
  eventoId: string;
  tipo: 'edicion' | 'cancelacion' | 'ampliacion' | 'recordatorio';
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
};

export type RespuestaConteoNoLeidosDTO = {
  totalNoLeidos: number;
};
