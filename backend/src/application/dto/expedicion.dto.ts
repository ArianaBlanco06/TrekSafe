import { z } from 'zod';
import {
  MAX_MINUTOS_AMPLIACION,
  MAX_MOTIVO_AMPLIACION,
  MIN_MINUTOS_AMPLIACION,
  MIN_MOTIVO_AMPLIACION,
} from '../../domain/value-objects/ampliacionRetorno.js';
import { MAX_MOTIVO_CANCELACION } from '../../domain/value-objects/cancelacionPlan.js';
import {
  camposExpedicionSchema,
  errorRetornoPosteriorASalida,
  retornoPosteriorASalida,
} from './usuario.dto.js';

export const confirmarRetornoSchema = z.object({
  contrasena: z.string().min(1, 'Contraseña requerida'),
});

const camposCrear = camposExpedicionSchema.shape;

/**
 * Reutiliza los validadores de crear. Cambios propios de la edición:
 * - La tolerancia es obligatoria: con su valor por defecto, omitirla reiniciaría el plan a 30 minutos.
 * - Las horas deben ser ISO 8601 con zona horaria, para que no dependan de la zona del servidor.
 * - Las longitudes respetan las columnas, para responder 400 en lugar de un error de base.
 */
export const editarExpedicionSchema = camposExpedicionSchema
  .extend({
    lugarInicio: camposCrear.lugarInicio.max(500, 'Ubicación inicial demasiado larga'),
    lugarFin: camposCrear.lugarFin.max(500, 'Destino demasiado largo'),
    horaInicio: camposCrear.horaInicio.datetime({ offset: true, message: 'Hora de salida inválida' }),
    horaRetornoEstimada: camposCrear.horaRetornoEstimada.datetime({
      offset: true,
      message: 'Hora de retorno inválida',
    }),
    minutosTolerancia: camposCrear.minutosTolerancia.removeDefault(),
    nombresAcompanantes: z
      .array(z.string().trim().min(2).max(200))
      .min(1, 'Agrega al menos un acompañante'),
    versionEsperada: z.number().int().min(1),
    operacionId: z.string().uuid(),
  })
  .refine(retornoPosteriorASalida, errorRetornoPosteriorASalida);

export const idExpedicionSchema = z.string().uuid('Identificador de expedición inválido');

/** HU-27. Sin `versionEsperada`: la cancelación es idempotente por `operacionId` y por estado. */
export const cancelarExpedicionSchema = z.object({
  operacionId: z.string().uuid('Identificador de operación inválido'),
  motivo: z
    .string()
    .trim()
    .max(MAX_MOTIVO_CANCELACION, `El motivo admite como máximo ${MAX_MOTIVO_CANCELACION} caracteres`)
    .nullish(),
});

/**
 * HU-35. Exige `versionEsperada` (compare-and-swap) y `operacionId` (un doble toque no
 * suma dos veces). Los minutos se suman a la hora de retorno estimada, no a "ahora".
 */
export const ampliarRetornoSchema = z.object({
  versionEsperada: z.number().int().min(1),
  operacionId: z.string().uuid('Identificador de operación inválido'),
  minutos: z
    .number({ invalid_type_error: 'Los minutos deben ser un número' })
    .int('Los minutos deben ser un número entero')
    .min(MIN_MINUTOS_AMPLIACION, `Amplía al menos ${MIN_MINUTOS_AMPLIACION} minuto`)
    .max(MAX_MINUTOS_AMPLIACION, `Amplía como máximo ${MAX_MINUTOS_AMPLIACION} minutos`),
  motivo: z
    .string({ required_error: 'El motivo es obligatorio' })
    .trim()
    .min(MIN_MOTIVO_AMPLIACION, `El motivo debe tener al menos ${MIN_MOTIVO_AMPLIACION} caracteres`)
    .max(MAX_MOTIVO_AMPLIACION, `El motivo admite como máximo ${MAX_MOTIVO_AMPLIACION} caracteres`),
});

export type EntradaConfirmarRetorno = z.infer<typeof confirmarRetornoSchema>;
export type EntradaEditarExpedicion = z.infer<typeof editarExpedicionSchema>;
export type EntradaCancelarExpedicion = z.infer<typeof cancelarExpedicionSchema>;
export type EntradaAmpliarRetorno = z.infer<typeof ampliarRetornoSchema>;
