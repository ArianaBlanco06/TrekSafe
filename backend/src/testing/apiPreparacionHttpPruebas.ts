import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { TestContext } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { ServicioPreparacionExpedicion } from '../application/services/servicioPreparacionExpedicion.js';
import type { IPreparacionExpedicionDAO } from '../domain/repositories/IPreparacionExpedicionDAO.js';
import { crearRutasPreparacionExpedicion } from '../presentation/http/routes/rutasPreparacionExpedicion.js';
import { errorHandler, notFoundHandler } from '../shared/errors/errorHandler.js';
import type { respuestaPreparacion } from '../presentation/http/dto/preparacionExpedicion.dto.js';

const secreto = 'secreto-ficticio-exclusivo-http-hu31-000000';
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: secreto, SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', CRON_ENABLED: 'false',
  MEDICAL_ENCRYPTION_KEY: 'clave-medica-ficticia-de-32-caracteres',
});

type CuerpoPreparacion = {
  preparacion?: ReturnType<typeof respuestaPreparacion>;
  codigo?: string;
  mensaje?: string;
};

/** HTTP y JWT reales contra el DAO recibido; no inicia main, cron ni correo. */
export async function iniciarApiPreparacionHttpPruebas(t: TestContext, dao: IPreparacionExpedicionDAO) {
  const app = express();
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/expediciones', crearRutasPreparacionExpedicion(new ServicioPreparacionExpedicion(dao)));
  // Testigos: el router nuevo debe dejar pasar las rutas de otras historias.
  app.get('/api/expediciones/activa', (_req, res) => res.json({ testigo: 'activa' }));
  app.post('/api/expediciones/:id/confirmar-retorno', (_req, res) => res.json({ testigo: 'retorno' }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    servidor.closeAllConnections();
    servidor.close((error) => error ? reject(error) : resolve());
  }));
  const direccion = servidor.address();
  assert.ok(direccion && typeof direccion !== 'string');
  const origen = `http://127.0.0.1:${direccion.port}`;
  return {
    origen,
    tokenPara(actor: string, rol = 'senderista', expira = 3600): string {
      return jwt.sign({ sub: actor, rol }, secreto, { expiresIn: expira });
    },
    async pedir(metodo: string, ruta: string, datos?: unknown, token?: string | null) {
      const respuesta = await fetch(`${origen}/api/expediciones${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(datos === undefined ? {} : { body: JSON.stringify(datos) }),
      });
      return { estado: respuesta.status, cuerpo: await respuesta.json() as CuerpoPreparacion, headers: respuesta.headers };
    },
  };
}
