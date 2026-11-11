import { z } from 'zod';

/** Largo máximo del motivo del relevo (igual que `chk_relevos_motivo` de la migración 019). */
export const MOTIVO_RELEVO_MAXIMO = 280;

/** Cuerpo de POST /api/rescate/alertas/:expedicionId/coordinacion/relevos. */
export const cuerpoProponerRelevoSchema = z.object({
  operacionId: z.string({ required_error: 'El identificador de operación es obligatorio' }).uuid('Identificador de operación inválido'),
  destinatarioId: z.string({ required_error: 'El destinatario es obligatorio' }).uuid('Identificador de destinatario inválido'),
  motivo: z
    .string({ required_error: 'El motivo es obligatorio' })
    .trim()
    .min(1, 'El motivo es obligatorio')
    .max(MOTIVO_RELEVO_MAXIMO, `El motivo admite hasta ${MOTIVO_RELEVO_MAXIMO} caracteres`),
  versionIncidente: z
    .number({ required_error: 'La versión del incidente es obligatoria' })
    .int('La versión debe ser un entero')
    .min(1, 'La versión debe ser positiva'),
});

/** Datos completos del comando: cuerpo + identidad del rescatista + expedición de la ruta. */
export const proponerRelevoSchema = cuerpoProponerRelevoSchema.extend({
  expedicionId: z.string().uuid('Identificador de alerta inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

/** Cuerpo de POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/aceptar. Sin versión. */
export const cuerpoAceptarRelevoSchema = z.object({
  operacionId: z.string({ required_error: 'El identificador de operación es obligatorio' }).uuid('Identificador de operación inválido'),
});

export const aceptarRelevoSchema = cuerpoAceptarRelevoSchema.extend({
  expedicionId: z.string().uuid('Identificador de alerta inválido'),
  relevoId: z.string().uuid('Identificador de relevo inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

/**
 * Rechazar y cancelar llevan solo la operación (sin motivo ni versión): quién, qué y cuándo
 * quedan registrados por la persistencia. Misma forma que aceptar.
 */
export const rechazarRelevoSchema = aceptarRelevoSchema;
export const cancelarRelevoSchema = aceptarRelevoSchema;

export type EntradaProponerRelevo = z.infer<typeof proponerRelevoSchema>;
export type EntradaAceptarRelevo = z.infer<typeof aceptarRelevoSchema>;
export type EntradaResolverRelevo = z.infer<typeof rechazarRelevoSchema>;
