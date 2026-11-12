import { it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { crearRutasRecorrido } from './rutasRecorrido.js';
import { FachadaPlanExpedicion } from '../../../application/services/FachadaPlanExpedicion.js';
import { rutaFixture, senderistaFixture as actor } from '../../../testing/puntosRuta/fixtures.js';
import { firmarToken } from '../../../infrastructure/security/jwt.js';
import { errorHandler } from '../../../shared/errors/errorHandler.js';

Object.assign(process.env, { NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture', JWT_SECRET: 'secreto-ficticio-recorrido-00000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-ficticio-medico-0000000000000000' });

it('HU-33 HTTP: autenticación, rol, UUID, propiedad y respuesta privada', async () => {
  const ruta = rutaFixture();
  const plan = { ...ruta.expedicion, senderistaId: actor, horaRetornoEstimada: '2099-01-01T18:00:00Z',
    minutosTolerancia: 30, idsContactos: [], nombresAcompanantes: [] };
  const fachada = new FachadaPlanExpedicion({ obtenerPlan: async (_id, usuario) => usuario === actor ? plan : null },
    { consultarPropia: async () => ruta }, { obtenerPreparacion: async () => null });
  const app = express(); app.use('/api/expediciones', crearRutasRecorrido(fachada)); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/expediciones`;
  const token = (sub: string, rol: 'senderista' | 'rescatista') => ({ Authorization: `Bearer ${firmarToken({ sub, rol })}` });
  try {
    assert.equal((await fetch(`${base}/${plan.id}/recorrido`)).status, 401);
    assert.equal((await fetch(`${base}/${plan.id}/recorrido`, { headers: token(actor, 'rescatista') })).status, 403);
    assert.equal((await fetch(`${base}/invalido/recorrido`, { headers: token(actor, 'senderista') })).status, 400);
    assert.equal((await fetch(`${base}/${plan.id}/recorrido`, { headers: token('otro', 'senderista') })).status, 404);
    const response = await fetch(`${base}/${plan.id}/recorrido`, { headers: token(actor, 'senderista') });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as { plan: Record<string, unknown>; puntos: unknown[]; preparacion: unknown };
    assert.equal(body.plan.id, plan.id); assert.equal(body.preparacion, null);
    assert.ok(!('senderistaId' in body.plan));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
