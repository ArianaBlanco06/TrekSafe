import cors from 'cors';
import express, { type Router } from 'express';
import helmet from 'helmet';
import { ensamblarHttp } from '../../infrastructure/composicion/http.js';
import {
  errorHandler,
  notFoundHandler,
} from '../../shared/errors/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimitMiddleware.js';

export type DependenciasHttp = {
  config: { apiPrefix: string; corsOrigin: string };
  rutas: { prefijo: string; router: Router }[];
  salud: () => unknown;
};

/** La composición inyectada evita inicializar entorno, Supabase o correo en pruebas. */
export function createApp(dependencias?: DependenciasHttp) {
  const { config, rutas, salud } = dependencias ?? ensamblarHttp();
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(config.apiPrefix, (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get(`${config.apiPrefix}/salud`, (_req, res) => res.json(salud()));
  const limiteTasaAuth = createRateLimiter(20, 15 * 60_000);
  for (const { prefijo, router } of rutas) {
    if (prefijo === '/auth')
      app.use(config.apiPrefix + prefijo, limiteTasaAuth, router);
    else app.use(config.apiPrefix + prefijo, router);
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
