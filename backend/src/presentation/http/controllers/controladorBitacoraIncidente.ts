import type { Request, Response } from 'express';
import { ComandoAgregarEntradaBitacora } from '../../../application/commands/ComandoAgregarEntradaBitacora.js';
import { aVistaEntrada } from '../../../application/dto/bitacoraIncidente.dto.js';
import type { AgregarEntradaBitacora } from '../../../application/use-cases/AgregarEntradaBitacora.js';
import type { ConsultarBitacoraIncidente } from '../../../application/use-cases/ConsultarBitacoraIncidente.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

/**
 * Bitácora cronológica del incidente (HU-41), distinta de la bitácora personal de HU-14.
 *
 * GET  /api/rescate/incidentes/:incidenteId/bitacora  → 200 { bitacora }
 * POST /api/rescate/incidentes/:incidenteId/bitacora  → 201 { entrada } (200 si es una repetición)
 *
 * El actor sale siempre del JWT: el cuerpo no puede traer autor, tipo ni hora. Los rechazos de
 * negocio salen de los casos de uso como `ErrorAplicacion` (400, 403, 404, 409): ninguno es 401.
 * Ninguna respuesta lleva datos médicos.
 */
export function crearControladorBitacoraIncidente(casos: {
  consultar: ConsultarBitacoraIncidente;
  agregar: AgregarEntradaBitacora;
}) {
  return {
    async consultar(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const bitacora = await casos.consultar.ejecutar(rescatistaId, String(req.params.incidenteId));
      res.status(200).json({ bitacora });
    },

    async agregar(req: Request, res: Response): Promise<void> {
      const autorId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoAgregarEntradaBitacora.crear(autorId, String(req.params.incidenteId), req.body);
      const { entrada, repetido } = await casos.agregar.ejecutar(comando);
      res.status(repetido ? 200 : 201).json({ entrada: aVistaEntrada(entrada, autorId) });
    },
  };
}
