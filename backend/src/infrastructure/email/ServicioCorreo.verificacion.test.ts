import assert from 'node:assert/strict';
import { it } from 'node:test';
import nodemailer from 'nodemailer';
import { ServicioCorreo } from './ServicioCorreo.js';

Object.assign(process.env, {
  NODE_ENV: 'production', CRON_ENABLED: 'false', MAIL_DEV_FALLBACK: 'false',
  SUPABASE_URL: 'https://ficticio.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'ficticio',
  JWT_SECRET: 'ficticio-pruebas-exclusivas-000000000000',
  MEDICAL_ENCRYPTION_KEY: 'ficticio-medico-pruebas-000000000000000',
  SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'ficticio', SMTP_PASS: 'ficticio',
  BREVO_API_KEY: '',
});

it('verificación SMTP colgada termina a los 30s, cierra el transporte y no consulta IP externa', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cierres = 0;
  let consultasExternas = 0;
  let opciones: { connectionTimeout: number; greetingTimeout: number; socketTimeout: number } | undefined;
  t.mock.method(globalThis, 'fetch', () => { consultasExternas++; throw new Error('RED_NO_PERMITIDA'); });
  t.mock.method(nodemailer, 'createTransport', (config: typeof opciones) => {
    opciones = config;
    return { verify: () => new Promise(() => {}), close: () => { cierres++; } } as never;
  });
  const resultado = assert.rejects(new ServicioCorreo().verificarConexion(), {
    codigo: 'SMTP_VERIFICACION_FALLIDA', message: 'SMTP_VERIFICACION_TIMEOUT',
  });
  t.mock.timers.tick(29999);
  assert.equal(cierres, 0);
  t.mock.timers.tick(1);
  await resultado;
  assert.equal(cierres, 1);
  assert.equal(consultasExternas, 0);
  assert.equal(opciones?.connectionTimeout, 10000);
  assert.equal(opciones?.greetingTimeout, 10000);
  assert.equal(opciones?.socketTimeout, 30000);
});

it('verificación exitosa cierra y descarta el transporte; otra verificación crea uno nuevo', async (t) => {
  let creados = 0;
  let cierres = 0;
  t.mock.method(nodemailer, 'createTransport', () => {
    creados++;
    return { verify: async () => true, close: () => { cierres++; } } as never;
  });
  const servicio = new ServicioCorreo();
  await servicio.verificarConexion();
  await servicio.verificarConexion();
  assert.equal(creados, 2);
  assert.equal(cierres, 2);
});

it('rechazo SMTP inmediato cierra el transporte y conserva el error de verificación', async (t) => {
  let cierres = 0;
  t.mock.method(nodemailer, 'createTransport', () => ({
    verify: async () => { throw new Error('RECHAZO_FICTICIO'); }, close: () => { cierres++; },
  }) as never);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('DIAGNOSTICO_EXTERNO_INESPERADO'); });
  await assert.rejects(new ServicioCorreo().verificarConexion(), {
    codigo: 'SMTP_VERIFICACION_FALLIDA', message: 'RECHAZO_FICTICIO',
  });
  assert.equal(cierres, 1);
});
