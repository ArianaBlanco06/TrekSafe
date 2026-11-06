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
import { ensamblarModuloPlantillas } from '../../infrastructure/composicion/moduloPlantillas.js';
import { crearRutasPlantillas } from './routes/rutasPlantillas.js';
import { crearRutasRescate } from './routes/rutasRescate.js';
import { crearRutasUsuario } from './routes/rutasUsuario.js';
import { crearRutasListasEquipo } from './routes/rutasListasEquipo.js';
import { ServicioListasEquipo } from '../../application/services/servicioListasEquipo.js';
import { RepositorioListasEquipoSupabase } from '../../infrastructure/repositories/RepositorioListasEquipoSupabase.js';
import { getSupabaseAdmin } from '../../infrastructure/database/supabase.js';
import { ServicioPreparacionExpedicion } from '../../application/services/servicioPreparacionExpedicion.js';
import { RepositorioPreparacionExpedicionSupabase } from '../../infrastructure/repositories/RepositorioPreparacionExpedicionSupabase.js';
import { crearRutasPreparacionExpedicion } from './routes/rutasPreparacionExpedicion.js';
import { CreadorDesdeHistorial } from '../../application/creacion-plan/CreadorDesdeHistorial.js';
import { DAOContactosVigentesSupabase } from '../../infrastructure/repositories/DAOContactosVigentesSupabase.js';
import { HistorialExpedicionesDAOSupabase } from '../../infrastructure/repositories/HistorialExpedicionesDAOSupabase.js';
import { crearRutasRepetirExpedicion } from './routes/rutasRepetirExpedicion.js';

export function createApp() {
  const env = loadEnv();

  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  // Evitar tambien persistencia en la cache HTTP del navegador o proxies.
  app.use(env.apiPrefix, (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
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
  const servicioEquipo = new ServicioListasEquipo(new RepositorioListasEquipoSupabase(getSupabaseAdmin()));
  app.use(`${env.apiPrefix}/usuario/listas-equipo`, crearRutasListasEquipo(servicioEquipo));
  app.use(`${env.apiPrefix}/usuario`, crearRutasUsuario());
  const servicioPreparacion = new ServicioPreparacionExpedicion(new RepositorioPreparacionExpedicionSupabase(getSupabaseAdmin()));
  app.use(`${env.apiPrefix}/expediciones`, crearRutasPreparacionExpedicion(servicioPreparacion));
  const creadorDesdeHistorial = new CreadorDesdeHistorial(
    new DAOContactosVigentesSupabase(getSupabaseAdmin()),
    new HistorialExpedicionesDAOSupabase(getSupabaseAdmin()),
  );
  app.use(`${env.apiPrefix}/expediciones`, crearRutasRepetirExpedicion(creadorDesdeHistorial));
  app.use(`${env.apiPrefix}/expediciones`, crearRutasExpedicion());
  app.use(`${env.apiPrefix}/plantillas`, crearRutasPlantillas(ensamblarModuloPlantillas()));
  app.use(`${env.apiPrefix}/rescate`, crearRutasRescate());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
