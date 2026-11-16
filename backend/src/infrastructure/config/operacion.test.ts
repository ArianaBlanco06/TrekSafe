import assert from 'node:assert/strict';
import { it } from 'node:test';
import { envSchema } from './env.js';

const ficticio = { SUPABASE_URL: 'https://ficticio.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'ficticio',
  JWT_SECRET: 'ficticio-exclusivo-pruebas-0000000000000000', MEDICAL_ENCRYPTION_KEY: 'ficticio-medico-pruebas-00000000000000' };

it('configuración omite trabajo y simulación por defecto; intervalos operativos son separados', () => {
  const config = envSchema.parse(ficticio);
  assert.equal(config.CRON_ENABLED, false);
  assert.equal(config.MAIL_DEV_FALLBACK, false);
  assert.equal(config.CRON_INTERVAL_MS, 60000);
  assert.equal(config.OUTBOX_INTERVAL_MS, 15000);
  assert.equal(config.OUTBOX_BATCH_SIZE, 1);
  assert.equal(config.WORKER_HEARTBEAT_MAX_AGE_MS, 180000);
  assert.equal(config.OUTBOX_PENDING_MAX_AGE_MS, 600000);
});

it('producción rechaza fallback simulado y tamaño de lote incompatible con heartbeat', () => {
  assert.equal(envSchema.safeParse({ ...ficticio, NODE_ENV: 'production', MAIL_DEV_FALLBACK: 'true' }).success, false);
  assert.equal(envSchema.safeParse({ ...ficticio, OUTBOX_BATCH_SIZE: '4', WORKER_HEARTBEAT_MAX_AGE_MS: '90000' }).success, false);
  assert.equal(envSchema.safeParse({ ...ficticio, CRON_INTERVAL_MS: '0' }).success, false);
  assert.equal(envSchema.safeParse({ ...ficticio, OUTBOX_INTERVAL_MS: '0' }).success, false);
  assert.equal(envSchema.safeParse({ ...ficticio, OUTBOX_BATCH_SIZE: '11' }).success, false);
  assert.equal(envSchema.safeParse({ ...ficticio, NODE_ENV: 'production', CRON_ENABLED: 'true' }).success, false);
  assert.equal(envSchema.safeParse({ ...ficticio, NODE_ENV: 'production', CRON_ENABLED: 'true', PUBLIC_APP_URL: 'https://app.example.invalid' }).success, true);
  for (const url of ['http://app.example.invalid', 'https://usuario:secreto@app.example.invalid', 'https://app.example.invalid/ruta', 'https://app.example.invalid?token=ficticio']) {
    assert.equal(envSchema.safeParse({ ...ficticio, NODE_ENV: 'production', PUBLIC_APP_URL: url }).success, false);
  }
});
