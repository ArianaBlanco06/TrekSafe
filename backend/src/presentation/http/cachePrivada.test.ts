import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// La configuracion historica carga .env al importar. Se sustituyen sus destinos
// antes del primer createApp/loadEnv; ninguna prueba accede a la base o al cron.
Object.assign(process.env, {
  NODE_ENV: 'test', API_PREFIX: '/api', SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-invalido', JWT_SECRET: 'secreto-ficticio-privacidad-000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-000000000000000000',
  BREVO_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', CRON_ENABLED: 'false',
});
delete process.env.DATABASE_URL;
const { createApp } = await import('./app.js');

describe('Politica HTTP de privacidad', () => {
  let server: Server;
  let base: string;
  before(async () => {
    server = await new Promise<Server>(resolve => {
      const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  for (const endpoint of ['/usuario/ficha-medica', '/usuario/contactos', '/expediciones', '/rescate/alertas']) {
    it(`${endpoint}: el rechazo sin autenticacion tampoco se almacena`, async () => {
      const response = await fetch(`${base}/api${endpoint}`);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
  }
  it('propaga no-store en respuestas correctas, 404 y errores de JSON', async (ctx) => {
    ctx.mock.method(console, 'error', () => {});
    for (const [endpoint, options, status] of [
      ['/salud', undefined, 200], ['/inexistente', undefined, 404],
      // El manejador existente responde 500 a errores del parser; no se cambia
      // esa politica en este fix. Incluso ese rechazo debe llevar no-store.
      ['/auth/iniciar-sesion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, 500],
    ] as const) {
      const response = await fetch(`${base}/api${endpoint}`, options);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
});
