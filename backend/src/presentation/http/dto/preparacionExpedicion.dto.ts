import { z } from 'zod';
import type { PreparacionExpedicion } from '../../../domain/entities/PreparacionExpedicion.js';

export const parametroPreparacionSchema = z.object({ id: z.string().uuid('Identificador de expedición inválido.') });
export const parametroItemPreparacionSchema = parametroPreparacionSchema.extend({
  itemId: z.string().uuid('Identificador de ítem inválido.'),
});
export const asociarListaExpedicionSchema = z.object({ listaId: z.string().uuid() }).strict();
export const establecerPreparadoSchema = z.object({ preparado: z.boolean() }).strict();

/** Incluye el contador calculado y publica solo los campos del contrato HTTP. */
export function respuestaPreparacion(preparacion: PreparacionExpedicion | null) {
  if (!preparacion) return null;
  return {
    id: preparacion.id, expedicionId: preparacion.expedicionId,
    listaOrigenId: preparacion.listaOrigenId, nombreLista: preparacion.nombreLista,
    creadoEn: preparacion.creadoEn, actualizadoEn: preparacion.actualizadoEn,
    items: preparacion.items.map(({ id, nombre, obligatorio, preparado }) => ({ id, nombre, obligatorio, preparado })),
    obligatoriosPendientes: preparacion.obligatoriosPendientes,
  };
}
