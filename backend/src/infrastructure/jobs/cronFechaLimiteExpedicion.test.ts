import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import { envSchema } from '../config/env.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { iniciarCronFechaLimiteExpedicion } from './cronFechaLimiteExpedicion.js';

const entornoFicticio = {
  SUPABASE_URL: 'https://dev-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia-no-usar',
  JWT_SECRET: 'jwt-ficticio-exclusivo-pruebas-00000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-ficticio-exclusivo-pruebas-0000',
};

it('acepta false explícito, conserva true por omisión y rechaza valores ambiguos', () => {
  assert.equal(envSchema.parse(entornoFicticio).CRON_ENABLED, true);
  assert.equal(envSchema.parse({ ...entornoFicticio, CRON_ENABLED: 'false' }).CRON_ENABLED, false);
  assert.equal(envSchema.parse({ ...entornoFicticio, CRON_ENABLED: 'true' }).CRON_ENABLED, true);
  assert.equal(envSchema.safeParse({ ...entornoFicticio, CRON_ENABLED: '0' }).success, false);
});

it('false no ejecuta ni el primer tick ni ticks posteriores', async (t) => {
  const promover = t.mock.method(RepositorioExpedicion.prototype, 'promoverProgramadasListas', async () => 0);
  const expirar = t.mock.method(RepositorioExpedicion.prototype, 'marcarEnProgresoExpiradaComoAlerta', async () => []);
  const timer = t.mock.method(globalThis, 'setInterval');
  const detener = iniciarCronFechaLimiteExpedicion({ cronEnabled: false, cronIntervalMs: 1 });
  await siguienteTurno();
  detener();
  assert.equal(timer.mock.callCount(), 0);
  assert.equal(promover.mock.callCount(), 0);
  assert.equal(expirar.mock.callCount(), 0);
});

it('true ejecuta un tick inmediato, programa los siguientes y permite detenerlos', async (t) => {
  // Solo configuración ficticia y métodos de persistencia sustitutos; nunca consulta una base.
  for (const [nombre, valor] of Object.entries(entornoFicticio)) process.env[nombre] ??= valor;
  const promover = t.mock.method(RepositorioExpedicion.prototype, 'promoverProgramadasListas', async () => 0);
  t.mock.method(RepositorioExpedicion.prototype, 'marcarEnProgresoExpiradaComoAlerta', async () => []);
  t.mock.timers.enable({ apis: ['setInterval'] });
  const detener = iniciarCronFechaLimiteExpedicion({ cronEnabled: true, cronIntervalMs: 1000 });
  await siguienteTurno();
  assert.equal(promover.mock.callCount(), 1);
  t.mock.timers.tick(1000);
  await siguienteTurno();
  assert.equal(promover.mock.callCount(), 2);
  detener();
  t.mock.timers.tick(1000);
  await siguienteTurno();
  assert.equal(promover.mock.callCount(), 2);
});
