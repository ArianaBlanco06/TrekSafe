import type { Request, Response } from 'express';
import { confirmarRetornoSchema } from '../../../application/dto/expedicion.dto.js';
import { crearExpedicionSchema } from '../../../application/dto/usuario.dto.js';
import { ServicioExpedicion } from '../../../application/services/servicioExpedicion.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const servicioExpedicion = new ServicioExpedicion();

function solicitudAuth(req: Request): SolicitudAutenticada {
  return req as SolicitudAutenticada;
}

export async function crearExpedicion(req: Request, res: Response): Promise<void> {
  const entrada = crearExpedicionSchema.parse(req.body);
  const expedicion = await servicioExpedicion.crearExpedicion(solicitudAuth(req).user.id, entrada);
  res.status(201).json({ mensaje: 'Expedición registrada', expedicion });
}

export async function listarExpediciones(req: Request, res: Response): Promise<void> {
  const expediciones = await servicioExpedicion.listarExpediciones(solicitudAuth(req).user.id);
  res.status(200).json({ expediciones });
}

export async function obtenerExpedicionActiva(req: Request, res: Response): Promise<void> {
  const expedicion = await servicioExpedicion.obtenerExpedicionActiva(solicitudAuth(req).user.id);
  res.status(200).json({ expedicion });
}

export async function obtenerHistorialExpediciones(req: Request, res: Response): Promise<void> {
  const historial = await servicioExpedicion.obtenerHistorialExpediciones(solicitudAuth(req).user.id);
  res.status(200).json(historial);
}

export async function confirmarRetorno(req: Request, res: Response): Promise<void> {
  const expedicionId = String(req.params.id);
  const entrada = confirmarRetornoSchema.parse(req.body);
  const resultado = await servicioExpedicion.confirmarRetorno(
    solicitudAuth(req).user.id,
    expedicionId,
    entrada,
  );
  res.status(200).json({
    mensaje: 'Retorno seguro registrado',
    expedicion: resultado.expedicion,
    confirmadoEn: resultado.confirmadoEn,
  });
}
