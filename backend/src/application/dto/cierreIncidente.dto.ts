import { z } from 'zod';
import type {
  EstadoIncidenteActual,
  InformeCierre,
} from '../../domain/repositories/ICierreIncidenteDAO.js';
import type { EstadoIncidente } from '../../domain/repositories/IIncidenteDAO.js';
import { LIMITE_RESUMEN_CIERRE, RESULTADOS_RESCATE, type ResultadoRescate } from '../../domain/value-objects/cierreIncidente.js';
import type { EstadoExpedicion } from '../../domain/value-objects/enums.js';

/**
 * Cuerpo de POST /api/rescate/incidentes/:incidenteId/cierre.
 * `.strict()`: el cliente no envía el rescatista, la hora ni el estado de la expedición
 * (salen del JWT y del servidor); un cierre no puede confirmar el retorno.
 */
export const cuerpoCerrarIncidenteSchema = z
  .object({
    comandoId: z
      .string({ required_error: 'El identificador del comando es obligatorio' })
      .uuid('Identificador de comando inválido'),
    resultado: z.enum(RESULTADOS_RESCATE, {
      required_error: 'El resultado del rescate es obligatorio',
      invalid_type_error: 'Resultado del rescate inválido',
      message: 'Resultado del rescate inválido',
    }),
    resumen: z
      .string({ required_error: 'El resumen es obligatorio' })
      .trim()
      .min(1, 'El resumen no puede estar vacío')
      .max(LIMITE_RESUMEN_CIERRE, `Máximo ${LIMITE_RESUMEN_CIERRE} caracteres`),
  })
  .strict();

/** Datos completos del comando: cuerpo + rescatista (JWT) + incidente de la ruta. */
export const cerrarIncidenteSchema = cuerpoCerrarIncidenteSchema.extend({
  incidenteId: z.string().uuid('Identificador de incidente inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

/** Cuerpo de POST /api/rescate/incidentes/:incidenteId/localizacion. */
export const cuerpoMarcarLocalizadoSchema = z
  .object({
    operacionId: z
      .string({ required_error: 'El identificador de operación es obligatorio' })
      .uuid('Identificador de operación inválido'),
  })
  .strict();

export const marcarLocalizadoSchema = cuerpoMarcarLocalizadoSchema.extend({
  incidenteId: z.string().uuid('Identificador de incidente inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

export const consultarCierreSchema = z.object({
  expedicionId: z.string().uuid('Identificador de expedición inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

export type InformeCierreVista = {
  id: string;
  incidenteId: string;
  expedicionId: string;
  resultado: ResultadoRescate;
  resumen: string;
  cerradoPor: { rescatistaId: string; nombreRescatista: string; esMio: boolean };
  cerradoEn: string;
  entradaBitacoraId: string;
  /** CA-3: es el cierre del operativo de rescate, no el retorno del senderista. */
  tipoCierre: 'operativo';
  estadoExpedicion: EstadoExpedicion;
  /** `estadoExpedicion === 'completada'`. El cierre nunca lo pone en true. */
  retornoConfirmadoPorSenderista: boolean;
};

export type EstadoIncidenteVista = {
  incidenteId: string;
  expedicionId: string;
  estado: EstadoIncidente;
  version: number;
  responsable: { responsableId: string; nombreResponsable: string };
};

export function aVistaInformeCierre(informe: InformeCierre, rescatistaId: string): InformeCierreVista {
  return {
    id: informe.id,
    incidenteId: informe.incidenteId,
    expedicionId: informe.expedicionId,
    resultado: informe.resultado,
    resumen: informe.resumen,
    cerradoPor: {
      rescatistaId: informe.cerradoPorId,
      nombreRescatista: informe.nombreCerradoPor,
      esMio: informe.cerradoPorId === rescatistaId,
    },
    cerradoEn: informe.cerradoEn,
    entradaBitacoraId: informe.entradaBitacoraId,
    tipoCierre: 'operativo',
    estadoExpedicion: informe.estadoExpedicion,
    retornoConfirmadoPorSenderista: informe.estadoExpedicion === 'completada',
  };
}

export function aVistaEstadoIncidente(incidente: EstadoIncidenteActual): EstadoIncidenteVista {
  return {
    incidenteId: incidente.id,
    expedicionId: incidente.expedicionId,
    estado: incidente.estado,
    version: incidente.version,
    responsable: { responsableId: incidente.responsableId, nombreResponsable: incidente.nombreResponsable },
  };
}
