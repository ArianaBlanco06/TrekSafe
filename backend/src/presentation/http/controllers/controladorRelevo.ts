import type { Request, Response } from 'express';
import { ComandoAceptarRelevo } from '../../../application/commands/ComandoAceptarRelevo.js';
import { ComandoCancelarRelevo } from '../../../application/commands/ComandoCancelarRelevo.js';
import { ComandoProponerRelevo } from '../../../application/commands/ComandoProponerRelevo.js';
import { ComandoRechazarRelevo } from '../../../application/commands/ComandoRechazarRelevo.js';
import { coordinacionDesdeRelevo } from '../../../application/mappers/coordinacionDesdeRelevo.js';
import type { AceptarRelevo } from '../../../application/use-cases/AceptarRelevo.js';
import type { CancelarRelevo } from '../../../application/use-cases/CancelarRelevo.js';
import type { ProponerRelevo } from '../../../application/use-cases/ProponerRelevo.js';
import type { RechazarRelevo } from '../../../application/use-cases/RechazarRelevo.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

/**
 * Relevo de la coordinación (HU-40: proponer, aceptar, rechazar y cancelar). Solo adapta HTTP: construye el comando, lo ejecuta y
 * responde con la `coordinacion` vigente vista por quien actúa. Los rechazos de negocio
 * salen de los casos de uso como `ErrorAplicacion` (400, 403, 404, 409): ninguno es 401.
 */
export function crearControladorRelevo(
  proponerRelevo: ProponerRelevo,
  aceptarRelevo: AceptarRelevo,
  rechazarRelevo: RechazarRelevo,
  cancelarRelevo: CancelarRelevo,
) {
  return {
    /**
     * POST /api/rescate/alertas/:expedicionId/coordinacion/relevos
     * 201 si se creó el relevo pendiente; 200 si fue una repetición de la misma operación.
     */
    async proponer(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoProponerRelevo.crear(rescatistaId, String(req.params.expedicionId), req.body);
      const resultado = await proponerRelevo.ejecutar(comando);
      res.status(resultado.repetido ? 200 : 201).json({ coordinacion: coordinacionDesdeRelevo(resultado, rescatistaId) });
    },

    /**
     * POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/aceptar
     * 200 tanto si se aplicó el relevo como si fue una repetición de la misma operación.
     */
    async aceptar(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoAceptarRelevo.crear(
        rescatistaId,
        String(req.params.expedicionId),
        String(req.params.relevoId),
        req.body,
      );
      const resultado = await aceptarRelevo.ejecutar(comando);
      res.status(200).json({ coordinacion: coordinacionDesdeRelevo(resultado, rescatistaId) });
    },

    /**
     * POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/rechazar
     * 200 tanto si se rechazó como si fue una repetición. La coordinación vuelve sin
     * `relevoPendiente` y con el mismo responsable y la misma versión.
     */
    async rechazar(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoRechazarRelevo.crear(
        rescatistaId,
        String(req.params.expedicionId),
        String(req.params.relevoId),
        req.body,
      );
      const resultado = await rechazarRelevo.ejecutar(comando);
      res.status(200).json({ coordinacion: coordinacionDesdeRelevo(resultado, rescatistaId) });
    },

    /**
     * POST /api/rescate/alertas/:expedicionId/coordinacion/relevos/:relevoId/cancelar
     * Misma respuesta que rechazar.
     */
    async cancelar(req: Request, res: Response): Promise<void> {
      const rescatistaId = (req as SolicitudAutenticada).user.id;
      const comando = ComandoCancelarRelevo.crear(
        rescatistaId,
        String(req.params.expedicionId),
        String(req.params.relevoId),
        req.body,
      );
      const resultado = await cancelarRelevo.ejecutar(comando);
      res.status(200).json({ coordinacion: coordinacionDesdeRelevo(resultado, rescatistaId) });
    },
  };
}
