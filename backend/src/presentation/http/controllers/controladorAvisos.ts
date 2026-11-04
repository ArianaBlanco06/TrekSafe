import type { Request, Response } from 'express';
import { ServicioBandejaAvisos } from '../../../application/services/servicioBandejaAvisos.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const servicioBandejaAvisos = new ServicioBandejaAvisos();

function solicitudAuth(req: Request): SolicitudAutenticada {
  return req as SolicitudAutenticada;
}

export async function listarAvisos(req: Request, res: Response): Promise<void> {
  const usuarioId = solicitudAuth(req).user.id;
  const soloNoLeidos = req.query.soloNoLeidos === 'true';

  const resultado = await servicioBandejaAvisos.listarAvisos(usuarioId, soloNoLeidos);
  res.status(200).json(resultado);
}

export async function marcarAvisoLeido(req: Request, res: Response): Promise<void> {
  const usuarioId = solicitudAuth(req).user.id;
  const avisoId = String(req.params.id);

  const resultado = await servicioBandejaAvisos.marcarComoLeido(avisoId, usuarioId);
  res.status(200).json({
    mensaje: 'Aviso marcado como leído',
    ...resultado,
  });
}

export async function marcarTodosLeidos(req: Request, res: Response): Promise<void> {
  const usuarioId = solicitudAuth(req).user.id;

  const resultado = await servicioBandejaAvisos.marcarTodosComoLeidos(usuarioId);
  res.status(200).json({
    mensaje: 'Todos los avisos marcados como leídos',
    ...resultado,
  });
}

export async function crearAvisoDev(req: Request, res: Response): Promise<void> {
  const usuarioId = solicitudAuth(req).user.id;
  const { expedicionId, tipo, titulo, mensaje } = req.body;

  const aviso = await servicioBandejaAvisos.registrarAvisoDesdeEvento({
    usuarioId,
    expedicionId,
    tipo,
    titulo,
    mensaje,
  });

  res.status(201).json({
    mensaje: 'Aviso creado con éxito',
    aviso,
  });
}
