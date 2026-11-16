import { z } from 'zod';
import type { EntradaBitacora } from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import type { EstadoIncidente } from '../../domain/repositories/IIncidenteDAO.js';
import {
  LIMITE_TEXTO_ENTRADA_BITACORA,
  type TipoEntradaBitacora,
} from '../../domain/value-objects/entradaBitacora.js';

/**
 * Cuerpo de POST /api/rescate/incidentes/:incidenteId/bitacora.
 * `.strict()`: el cliente no envía el tipo, el autor ni la hora (salen del servidor y del JWT).
 */
export const cuerpoAgregarEntradaBitacoraSchema = z
  .object({
    operacionId: z
      .string({ required_error: 'El identificador de operación es obligatorio' })
      .uuid('Identificador de operación inválido'),
    texto: z
      .string({ required_error: 'El texto es obligatorio' })
      .trim()
      .min(1, 'El texto no puede estar vacío')
      .max(LIMITE_TEXTO_ENTRADA_BITACORA, `Máximo ${LIMITE_TEXTO_ENTRADA_BITACORA} caracteres`),
    corrigeEntradaId: z.string().uuid('Entrada a corregir inválida').nullable().optional(),
  })
  .strict();

/** Datos completos del comando: cuerpo + autor (JWT) + incidente de la ruta. */
export const agregarEntradaBitacoraSchema = cuerpoAgregarEntradaBitacoraSchema.extend({
  incidenteId: z.string().uuid('Identificador de incidente inválido'),
  autorId: z.string().uuid('Identificador de rescatista inválido'),
});

export const consultarBitacoraSchema = z.object({
  incidenteId: z.string().uuid('Identificador de incidente inválido'),
  rescatistaId: z.string().uuid('Identificador de rescatista inválido'),
});

export type EntradaBitacoraVista = {
  id: string;
  tipo: TipoEntradaBitacora;
  texto: string;
  autor: { autorId: string; nombreAutor: string; esMia: boolean };
  registradaEn: string;
  corrigeEntradaId: string | null;
};

export type BitacoraIncidenteVista = {
  incidenteId: string;
  expedicionId: string;
  estado: EstadoIncidente;
  responsable: { responsableId: string; nombreResponsable: string };
  esResponsable: boolean;
  /** Solo una pista para la UI: la autorización real se repite en la RPC. */
  puedeEscribir: boolean;
  entradas: EntradaBitacoraVista[];
};

export function aVistaEntrada(entrada: EntradaBitacora, rescatistaId: string): EntradaBitacoraVista {
  return {
    id: entrada.id,
    tipo: entrada.tipo,
    texto: entrada.texto,
    autor: {
      autorId: entrada.autorId,
      nombreAutor: entrada.nombreAutor,
      esMia: entrada.autorId === rescatistaId,
    },
    registradaEn: entrada.registradaEn,
    corrigeEntradaId: entrada.corrigeEntradaId,
  };
}
