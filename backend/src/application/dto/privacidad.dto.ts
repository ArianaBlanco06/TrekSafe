import { z } from 'zod';

export const revocacionDatosSchema = z.object({
  accion: z.enum(['eliminar_personal', 'anonimizar_rutas']),
  confirmar: z.literal(true, {
    errorMap: () => ({ message: 'Debe confirmar la solicitud de revocación' }),
  }),
});

export type EntradaRevocacionDatos = z.infer<typeof revocacionDatosSchema>;
