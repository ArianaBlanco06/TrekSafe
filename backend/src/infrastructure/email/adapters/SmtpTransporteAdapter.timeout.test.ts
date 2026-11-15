import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import nodemailer from 'nodemailer';
import { SmtpTransporteAdapter } from './SmtpTransporteAdapter.js';

process.env.SUPABASE_URL = 'https://ficticio.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'ficticio';
process.env.JWT_SECRET = 'ficticio-pruebas-exclusivas-000000000000';
process.env.MEDICAL_ENCRYPTION_KEY = 'ficticio-medico-pruebas-000000000000000';
process.env.SMTP_HOST = 'smtp.example.invalid';
process.env.SMTP_USER = 'ficticio';
process.env.SMTP_PASS = 'ficticio';
process.env.SMTP_FROM = 'Prueba <ficticio@example.invalid>';

it('SMTP cierra el transporte al agotarse el plazo absoluto y conserva resultado incierto', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cierres = 0;
  const configuraciones: unknown[] = [];
  t.mock.method(nodemailer, 'createTransport', (config: unknown) => {
    configuraciones.push(config);
    return { sendMail: () => new Promise(() => {}), close: () => { cierres++; } } as never;
  });
  const pendiente = new SmtpTransporteAdapter().enviar({
    destinatario: 'ficticio@example.invalid', asunto: 'Prueba', cuerpoTexto: 'Prueba',
  });
  await siguienteTurno();
  t.mock.timers.tick(30000);
  assert.deepEqual(await pendiente, { estado: 'incierto', modo: 'smtp', error: 'RESULTADO_INCIERTO' });
  assert.equal(cierres, 1);
  assert.equal((configuraciones[0] as { socketTimeout: number }).socketTimeout, 30000);
});
