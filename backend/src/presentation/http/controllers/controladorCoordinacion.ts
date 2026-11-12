import type { Request, Response } from 'express';
import { ComandoAsignarResponsable } from '../../../application/commands/ComandoAsignarResponsable.js';
import type { AsignarResponsable } from '../../../application/use-cases/AsignarResponsable.js';
import type { Coordinacion } from '../../../domain/repositories/IIncidenteDAO.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

/**
 * POST /api/rescate/alertas/:expedicionId/coordinacion  (HU-39)
 *
 * 201 si se asumió la coordinación; 200 si fue una repetición (mismo comando o mismo
 * responsable). El cuerpo es la misma `coordinacion` que devuelven las lecturas de la
 * consola, vista por quien asumió (`esMia: true`). No lleva datos médicos.
 * Los rechazos de negocio salen de `AsignarResponsable` como `ErrorAplicacion`
 * (400, 403, 404, 409): ninguno es 401.
 */
export function crearControladorCoordinacion(asignarResponsable: AsignarResponsable) {
  return {
    async asumir(req: Request, res: Response): Promise<void> {
      const comando = ComandoAsignarResponsable.crear(
        (req as SolicitudAutenticada).user.id,
        String(req.params.expedicionId),
        req.body,
      );
      const { incidente, repetido } = await asignarResponsable.ejecutar(comando);
      const coordinacion: Coordinacion = {
        incidenteId: incidente.id,
        version: incidente.version,
        responsableId: incidente.responsableId,
        nombreResponsable: incidente.nombreResponsable,
        asumidoEn: incidente.asumidoEn,
        esMia: true,
      };
      res.status(repetido ? 200 : 201).json({ coordinacion });
    },
  };
}
