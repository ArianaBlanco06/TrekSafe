import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ErrorAplicacion } from './ErrorAplicacion.js';
import { ErrorValidacionEquipo } from '../../domain/errors/ErrorValidacionEquipo.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NoEncontrado',
    mensaje: `Ruta no encontrada: ${req.method} ${req.path}`,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ErrorValidacionEquipo) {
    res.status(400).json({ error: err.name, mensaje: err.message, codigo: err.codigo });
    return;
  }
  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'ErrorValidacion', mensaje: 'El cuerpo JSON no es válido.' });
    return;
  }
  if (err instanceof ErrorAplicacion) {
    res.status(err.codigoEstado).json({
      error: err.name,
      mensaje: err.message,
      codigo: err.codigo,
      ...err.extras,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ErrorValidacion',
      mensaje: 'Datos de entrada inválidos',
      detalles: err.flatten().fieldErrors,
    });
    return;
  }

  console.error('[error]', err);
  res.status(500).json({
    error: 'ErrorInternoServidor',
    mensaje: 'Error interno del servidor',
  });
}
