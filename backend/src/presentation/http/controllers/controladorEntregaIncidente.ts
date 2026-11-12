import type { Request, Response } from 'express';
import type { FachadaEntregaAvisosIncidente } from '../../../application/services/FachadaEntregaAvisosIncidente.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

function solicitudAuth(req: Request): SolicitudAutenticada {
  return req as SolicitudAutenticada;
}

export function crearControladorEntregaIncidente(fachada: FachadaEntregaAvisosIncidente) {
  return {
    async listarDespachosIncidente(req: Request, res: Response): Promise<void> {
      const usuario = solicitudAuth(req).user;
      const expedicionId = String(req.params.id);

      const resultado = await fachada.consultarDespachosIncidente(usuario.id, expedicionId);
      res.json({ datos: resultado });
    },

    async reintentarDespachoIncidente(req: Request, res: Response): Promise<void> {
      const usuario = solicitudAuth(req).user;
      const expedicionId = String(req.params.id);
      const mensajeId = String(req.params.mensajeId);
      const claveIdempotencia = req.headers['x-idempotency-key'] as string | undefined;

      const resultado = await fachada.reintentarDespachoManual(
        usuario.id,
        expedicionId,
        mensajeId,
        claveIdempotencia,
      );
      res.json({ datos: resultado });
    },
  };
}
