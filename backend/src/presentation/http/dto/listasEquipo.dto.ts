import { z } from 'zod';

const itemSchema = z.object({ nombre: z.string(), obligatorio: z.boolean() }).strict();

// Aquí se comprueba la forma de la solicitud. Las reglas de nombres pertenecen al dominio.
export const crearListaEquipoSchema = z.object({
  nombre: z.string(), items: z.array(itemSchema),
}).strict();

export const actualizarListaEquipoSchema = z.object({
  nombre: z.string(), items: z.array(itemSchema.extend({ id: z.string().uuid().optional() })),
}).strict();

export const parametroListaEquipoSchema = z.object({ listaId: z.string().uuid('Identificador de lista inválido.') });
