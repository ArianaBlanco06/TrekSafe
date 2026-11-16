import type { Request, Response } from 'express';
import { ComandoCerrarIncidente } from '../../../application/commands/ComandoCerrarIncidente.js';
import { ComandoMarcarIncidenteLocalizado } from '../../../application/commands/ComandoMarcarIncidenteLocalizado.js';
import { aVistaEstadoIncidente, aVistaInformeCierre } from '../../../application/dto/cierreIncidente.dto.js';
import type { CerrarIncidente } from '../../../application/use-cases/CerrarIncidente.js';
import type { ConsultarCierreIncidente } from '../../../application/use-cases/ConsultarCierreIncidente.js';
import type { MarcarIncidenteLocalizado } from '../../../application/use-cases/MarcarIncidenteLocalizado.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

/**
 * Cierre del incidente con informe (HU-42).
 *
 * POST /api/rescate/incidentes/:incidenteId/localizacion → 200 { incidente, repetido }
 * POST /api/rescate/incidentes/:incidenteId/cierre       → 201 { cierre } (200 si es una repetición)
 * GET  /api/rescate/alertas/:expedicionId/cierre         → 200 { cierre: InformeCierreVista | null }
 *
 * El actor sale siempre del JWT: el cuerpo no puede traer rescatista, hora ni estado de la
 * expedición. Los rechazos de negocio salen de los casos de uso como `ErrorAplicacion`
 * (400, 403, 404, 409): ninguno es 401. Ninguna respuesta lleva datos médicos.
 */
export function crearControladorCierreIncidente(casos: {
  cerrar: CerrarIncidente;
  marcarLocalizado: MarcarIncidenteLocalizado;
  consultar: ConsultarCierreIncidente;
}) {
  return {
    async marcarLocalizado(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoMarcarIncidenteLocalizado.crear(rescatistaId, String(req.params.incidenteId), req.body);
      const { incidente, repetido } = await casos.marcarLocalizado.ejecutar(comando);
      res.status(200).json({ incidente: aVistaEstadoIncidente(incidente), repetido });
    },

    async cerrar(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoCerrarIncidente.crear(rescatistaId, String(req.params.incidenteId), req.body);
      const { tipo, informe } = await casos.cerrar.ejecutar(comando);
      res.status(tipo === 'cerrado' ? 201 : 200).json({ cierre: aVistaInformeCierre(informe, rescatistaId) });
    },

    async consultarPorExpedicion(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const cierre = await casos.consultar.ejecutar(rescatistaId, String(req.params.expedicionId));
      res.status(200).json({ cierre });
    },
  };
}
