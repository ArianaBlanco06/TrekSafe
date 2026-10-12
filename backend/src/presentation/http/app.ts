import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { loadEnv } from '../../infrastructure/config/env.js';
import { cronHealth } from '../../infrastructure/jobs/cronState.js';
import { ServicioCorreo } from '../../infrastructure/email/ServicioCorreo.js';
import { errorHandler, notFoundHandler } from '../../shared/errors/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimitMiddleware.js';
import { crearRutasAutenticacion } from './routes/rutasAutenticacion.js';
import { crearRutasExpedicion } from './routes/rutasExpedicion.js';
import { crearRutasRescate } from './routes/rutasRescate.js';
import { crearRutasUsuario } from './routes/rutasUsuario.js';

export function createApp() {
  const env = loadEnv();

  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get(`${env.apiPrefix}/salud`, (_req, res) => {
    const correo = new ServicioCorreo();
    res.json({
      estado: 'ok',
      servicio: 'treksafe-api',
      correo: {
        configurado: correo.estaConfigurado(),
        modo: correo.getModoTransporte(),
      },
      cron: cronHealth,
    });
  });

  const limiteTasaAuth = createRateLimiter(20, 15 * 60_000);

  app.use(`${env.apiPrefix}/auth`, limiteTasaAuth, crearRutasAutenticacion());
  app.use(`${env.apiPrefix}/usuario`, crearRutasUsuario());
  app.use(`${env.apiPrefix}/expediciones`, crearRutasExpedicion());
  app.use(`${env.apiPrefix}/rescate`, crearRutasRescate());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
