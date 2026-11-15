import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';

it('sonda pública solo devuelve estado200/503; salud conserva su respuesta y no acredita worker', async () => {
  let disponible = true;
  const servidor = createApp({ config: { apiPrefix: '/api', corsOrigin: 'http://localhost' }, rutas: [],
    salud: () => ({ estado: 'ok', servicio: 'api-ficticia' }), disponibilidad: async () => disponible,
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => servidor.once('listening', resolve));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  try {
    const ok = await fetch(`${base}/api/disponibilidad`);
    assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { estado: 'operativo' });
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    disponible = false;
    const no = await fetch(`${base}/api/disponibilidad`);
    assert.equal(no.status, 503); assert.deepEqual(await no.json(), { estado: 'degradado' });
    const salud = await fetch(`${base}/api/salud`);
    assert.equal(salud.status, 200); assert.deepEqual(await salud.json(), { estado: 'ok', servicio: 'api-ficticia' });
  } finally {
    await new Promise<void>((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
});
