import type { Request, Response } from 'express';
import { FachadaEntregaAvisosIncidente } from '../../../application/services/FachadaEntregaAvisosIncidente.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const fachada = new FachadaEntregaAvisosIncidente();

function solicitudAuth(req: Request): SolicitudAutenticada {
  return req as SolicitudAutenticada;
}

export async function listarDespachosIncidente(req: Request, res: Response): Promise<void> {
  const usuario = solicitudAuth(req).user;
  const expedicionId = String(req.params.id);

  const resultado = await fachada.consultarDespachosIncidente(usuario.id, expedicionId);
  res.json({ datos: resultado });
}

export async function reintentarDespachoIncidente(req: Request, res: Response): Promise<void> {
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
}
