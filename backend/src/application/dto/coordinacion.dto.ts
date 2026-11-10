import { z } from 'zod';

/** Cuerpo de POST /api/rescate/alertas/:expedicionId/coordinacion. */
export const cuerpoAsignarResponsableSchema = z.object({
  operacionId: z.string({ required_error: 'El identificador de operación es obligatorio' }).uuid('Identificador de operación inválido'),
});

/** Datos completos del comando: cuerpo + identidad del rescatista + expedición de la ruta. */
export const asignarResponsableSchema = cuerpoAsignarResponsableSchema.extend({
  expedicionId: z.string().uuid('Identificador de alerta inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

export type EntradaAsignarResponsable = z.infer<typeof asignarResponsableSchema>;
