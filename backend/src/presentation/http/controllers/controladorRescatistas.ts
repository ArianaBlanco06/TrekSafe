import type { Request, Response } from 'express';
import type { IRescatistasDAO } from '../../../domain/repositories/IRescatistasDAO.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

/**
 * GET /api/rescate/rescatistas (HU-40): rescatistas validados a quienes se puede proponer
 * un relevo. Devuelve solo `{id, nombreCompleto}` y excluye a quien consulta. El actor sale
 * siempre del JWT.
 */
export function crearControladorRescatistas(dao: IRescatistasDAO) {
  return {
    async listar(req: Request, res: Response): Promise<void> {
      const rescatistas = await dao.listarElegibles((req as SolicitudAutenticada).user.id);
      res.status(200).json({ rescatistas });
    },
  };
}
