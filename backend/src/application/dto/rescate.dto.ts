import { z } from 'zod';
import { CRITERIOS_PRIORIDAD } from '../../domain/strategies/IEstrategiaPrioridad.js';

export const confirmarAlertaSchema = z.object({
  notas: z.string().trim().max(2000).optional(),
});

export const consultaListarExpedicionesSchema = z.object({
  zona: z.string().trim().max(120).optional(),
  criterio: z.enum(CRITERIOS_PRIORIDAD).optional(),
});

export const consultaListarAlertasSchema = consultaListarExpedicionesSchema.pick({ criterio: true });

export const actualizarBitacoraRescateSchema = z
  .object({
    estadoRescate: z.enum(['en_busqueda', 'localizados', 'cerrado']).optional(),
    notas: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.estadoRescate !== undefined || data.notas !== undefined, {
    message: 'Debe indicar estado o notas',
  });

export type EntradaConfirmarAlerta = z.infer<typeof confirmarAlertaSchema>;
export type ConsultaListarExpediciones = z.infer<typeof consultaListarExpedicionesSchema>;
export type ConsultaListarAlertas = z.infer<typeof consultaListarAlertasSchema>;
export type EntradaActualizarBitacoraRescate = z.infer<typeof actualizarBitacoraRescateSchema>;
