import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { IListasEquipoDAO } from '../domain/repositories/IListasEquipoDAO.js';
import { ServicioListasEquipo } from '../application/services/servicioListasEquipo.js';
import { crearRutasListasEquipo } from '../presentation/http/routes/rutasListasEquipo.js';
import { errorHandler } from '../shared/errors/errorHandler.js';

/** API HTTP local de pruebas: autentica JWT, no inicia main.ts ni su cron. */
export async function iniciarApiEquipoHttpPruebas(dao: IListasEquipoDAO) {
  const secreto = 'secreto-local-integracion-hu30-pruebas';
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: secreto, SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', MEDICAL_ENCRYPTION_KEY: 'clave-medica-ficticia-de-32-caracteres',
  });
  const app = express();
  app.use(express.json());
  app.use('/api/usuario/listas-equipo', crearRutasListasEquipo(new ServicioListasEquipo(dao)));
  app.use(errorHandler);
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const direccion = servidor.address();
  assert.ok(direccion && typeof direccion !== 'string');
  return {
    origen: `http://127.0.0.1:${direccion.port}`,
    tokenPara(actor: string) {
      return jwt.sign({ sub: actor, rol: 'senderista', jti: randomUUID() }, secreto, { expiresIn: '1h' });
    },
    async cerrar() {
      servidor.closeAllConnections();
      await new Promise<void>((resolve, reject) => servidor.close((err) => err ? reject(err) : resolve()));
    },
  };
}
