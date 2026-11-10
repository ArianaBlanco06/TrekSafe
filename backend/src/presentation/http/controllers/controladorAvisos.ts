import type { Request, Response } from 'express';
import { ServicioBandejaAvisos } from '../../../application/services/servicioBandejaAvisos.js';
import { AvisadorCambiosPlan } from '../../../application/services/AvisadorCambiosPlan.js';
import {
  consultaListarAvisosSchema,
  paramsAvisoIdSchema,
} from '../../../application/dto/aviso.dto.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const servicioBandeja = new ServicioBandejaAvisos();
const avisador = new AvisadorCambiosPlan();

function obtenerUsuarioId(req: Request): string {
  return (req as SolicitudAutenticada).user.id;
}

export async function listarAvisos(req: Request, res: Response): Promise<void> {
  const usuarioId = obtenerUsuarioId(req);
  const { soloNoLeidos } = consultaListarAvisosSchema.parse(req.query);

  // Reconsumo durable e idempotente de eventos huérfanos del plan
  await avisador.reconstruirEventosPendientes(usuarioId);

  const avisos = await servicioBandeja.listarAvisos(usuarioId, soloNoLeidos);
  res.status(200).json({ datos: avisos });
}

export async function contarNoLeidos(req: Request, res: Response): Promise<void> {
  const usuarioId = obtenerUsuarioId(req);
  const conteo = await servicioBandeja.contarNoLeidos(usuarioId);
  res.status(200).json({ datos: conteo });
}

export async function marcarAvisoLeido(req: Request, res: Response): Promise<void> {
  const usuarioId = obtenerUsuarioId(req);
  const { id } = paramsAvisoIdSchema.parse(req.params);

  const actualizado = await servicioBandeja.marcarComoLeido(id, usuarioId);
  res.status(200).json({ datos: actualizado });
}

export async function marcarTodosLeidos(req: Request, res: Response): Promise<void> {
  const usuarioId = obtenerUsuarioId(req);
  const resultado = await servicioBandeja.marcarTodosComoLeidos(usuarioId);
  res.status(200).json({ datos: resultado });
}
