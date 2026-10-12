import type { Request, Response, NextFunction } from 'express';

type Cubo = { count: number; resetAt: number };

const cubos = new Map<string, Cubo>();

export function createRateLimiter(maxSolicitudes: number, ventanaMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clave = `${req.ip}:${req.path}`;
    const ahora = Date.now();
    const cubo = cubos.get(clave);

    if (!cubo || ahora >= cubo.resetAt) {
      cubos.set(clave, { count: 1, resetAt: ahora + ventanaMs });
      next();
      return;
    }

    if (cubo.count >= maxSolicitudes) {
      res.status(429).json({
        mensaje: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
        codigo: 'LIMITE_TASA',
      });
      return;
    }

    cubo.count += 1;
    next();
  };
}
