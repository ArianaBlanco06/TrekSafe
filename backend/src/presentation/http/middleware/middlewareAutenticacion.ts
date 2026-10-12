import type { Request, Response, NextFunction } from 'express';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';
import { verificarToken, type JwtPayload } from '../../../infrastructure/security/jwt.js';

export type UsuarioAutenticado = JwtPayload & { id: string };

export type SolicitudAutenticada = Request & { user: UsuarioAutenticado };

export function middlewareAutenticacion(req: Request, _res: Response, next: NextFunction): void {
  const encabezado = req.headers.authorization;
  if (!encabezado?.startsWith('Bearer ')) {
    next(new ErrorAplicacion(401, 'Token de autenticación requerido', 'NO_AUTORIZADO'));
    return;
  }

  try {
    const token = encabezado.slice(7);
    const payload = verificarToken(token);
    (req as SolicitudAutenticada).user = { ...payload, id: payload.sub };
    next();
  } catch {
    next(new ErrorAplicacion(401, 'Token inválido o expirado', 'TOKEN_INVALIDO'));
  }
}

export function requerirRol(...roles: Array<'senderista' | 'rescatista'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const usuario = (req as SolicitudAutenticada).user;
    if (!roles.includes(usuario.rol)) {
      next(new ErrorAplicacion(403, 'No tienes permiso para esta acción', 'PROHIBIDO'));
      return;
    }
    next();
  };
}
