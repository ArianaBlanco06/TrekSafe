import type { Request, Response } from 'express';
import {
  confirmarAlertaSchema,
  consultaListarExpedicionesSchema,
  actualizarBitacoraRescateSchema,
} from '../../../application/dto/rescate.dto.js';
import { ServicioRescate } from '../../../application/services/servicioRescate.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const servicioRescate = new ServicioRescate();

function solicitudAuth(req: Request): SolicitudAutenticada {
  return req as SolicitudAutenticada;
}

export async function listarExpediciones(req: Request, res: Response): Promise<void> {
  const consulta = consultaListarExpedicionesSchema.parse(req.query);
  const expediciones = await servicioRescate.listarExpediciones(solicitudAuth(req).user.id, consulta);
  res.status(200).json({ expediciones });
}

export async function obtenerDetalleAlerta(req: Request, res: Response): Promise<void> {
  const expedicionId = String(req.params.expedicionId);
  const detalle = await servicioRescate.obtenerDetalleAlerta(solicitudAuth(req).user.id, expedicionId);
  res.status(200).json({ alerta: detalle });
}

export async function listarAlertas(req: Request, res: Response): Promise<void> {
  const alertas = await servicioRescate.listarAlertas(solicitudAuth(req).user.id);
  res.status(200).json({ alertas });
}

export async function listarHistorial(req: Request, res: Response): Promise<void> {
  const historial = await servicioRescate.listarHistorial(solicitudAuth(req).user.id);
  res.status(200).json({ historial });
}

export async function actualizarBitacoraRescate(req: Request, res: Response): Promise<void> {
  const expedicionId = String(req.params.expedicionId);
  const entrada = actualizarBitacoraRescateSchema.parse(req.body ?? {});
  const resultado = await servicioRescate.actualizarBitacoraRescate(
    solicitudAuth(req).user.id,
    expedicionId,
    entrada,
  );
  res.status(200).json(resultado);
}

export async function confirmarAlerta(req: Request, res: Response): Promise<void> {
  const expedicionId = String(req.params.expedicionId);
  const entrada = confirmarAlertaSchema.parse(req.body ?? {});
  const resultado = await servicioRescate.confirmarAlerta(
    solicitudAuth(req).user.id,
    expedicionId,
    entrada,
  );
  res.status(201).json(resultado);
}
