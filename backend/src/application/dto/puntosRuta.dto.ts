import { z } from 'zod';
import { MAX_VERSION_PLAN } from '../../domain/entities/RutaConPuntos.js';
import { isValidPeruLatitude, isValidPeruLongitude } from '../../shared/utils/coordinates.js';

export const idExpedicionPuntosSchema = z.string().uuid('ID de expedición inválido')
  .transform((id) => id.toLowerCase());
export const parametrosPuntosRutaSchema = z.object({ id: idExpedicionPuntosSchema });
export const versionPuntosSchema = z.number().int().min(1).max(MAX_VERSION_PLAN);

const nombreSchema = z.string().trim().superRefine((nombre, ctx) => {
  const caracteres = Array.from(nombre);
  if (caracteres.length < 1 || caracteres.length > 100) {
    ctx.addIssue({ code: 'custom', message: 'El nombre debe tener entre 1 y 100 caracteres' });
  }
  // PostgreSQL UTF-8 no admite NUL ni sustitutos Unicode aislados.
  if (caracteres.some((c) => c.codePointAt(0) === 0 || /^[\uD800-\uDFFF]$/.test(c))) {
    ctx.addIssue({ code: 'custom', message: 'El nombre contiene caracteres Unicode no válidos' });
  }
});

export const puntoRutaSchema = z.object({
  id: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'El identificador debe ser un UUID v4',
  ).transform((id) => id.toLowerCase()),
  nombre: nombreSchema,
  latitud: z.number().finite().refine(isValidPeruLatitude, 'Latitud fuera del alcance geográfico permitido'),
  longitud: z.number().finite().refine(isValidPeruLongitude, 'Longitud fuera del alcance geográfico permitido'),
  orden: z.number().int().min(1).max(20),
}).strict();

export const coleccionPuntosSchema = z.array(puntoRutaSchema).max(20, 'Se permiten hasta 20 puntos')
  .superRefine((puntos, ctx) => {
    const ids = new Set<string>();
    const posiciones = new Set<number>();
    puntos.forEach((punto, indice) => {
      if (ids.has(punto.id)) {
        ctx.addIssue({ code: 'custom', path: [indice, 'id'], message: 'El identificador está repetido' });
      }
      if (posiciones.has(punto.orden) || punto.orden > puntos.length) {
        ctx.addIssue({
          code: 'custom', path: [indice, 'orden'], message: 'El orden debe ser único y consecutivo',
        });
      }
      ids.add(punto.id);
      posiciones.add(punto.orden);
    });
  });

export const guardarPuntosRutaSchema = z.object({
  versionEsperada: versionPuntosSchema,
  puntos: coleccionPuntosSchema,
}).strict();
