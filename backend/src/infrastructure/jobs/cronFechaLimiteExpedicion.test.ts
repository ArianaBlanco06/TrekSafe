import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import type { DependenciasPlazos } from '../../application/use-cases/ProcesarPlazosExpedicion.js';
import { envSchema } from '../config/env.js';
import { iniciarCronFechaLimiteExpedicion } from './cronFechaLimiteExpedicion.js';
import { cronHealth } from './cronState.js';

const entornoFicticio = {
  SUPABASE_URL: 'https://dev-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia-no-usar',
  JWT_SECRET: 'jwt-ficticio-exclusivo-pruebas-00000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-ficticio-exclusivo-pruebas-0000',
};

function dependencias(promover: () => Promise<number>): DependenciasPlazos {
  return {
    repo: {
      promoverProgramadasListas: promover,
      marcarEnProgresoExpiradaComoAlerta: async () => [],
    },
    alertasContacto: {
      notificarContactosEmergencia: async () => {
        throw new Error('No hay alertas');
      },
    },
    alertasRescate: {
      notificarEquiposRescate: async () => {
        throw new Error('No hay alertas');
      },
    },
    recordatorios: {
      procesarRecordatorios: async () => ({
        evaluadas: 0,
        avisosGenerados: 0,
        avisosOmitidosPorDuplicidad: 0,
      }),
    },
  };
}

it('acepta false explícito, conserva true por omisión y rechaza valores ambiguos', () => {
  assert.equal(envSchema.parse(entornoFicticio).CRON_ENABLED, true);
  assert.equal(
    envSchema.parse({ ...entornoFicticio, CRON_ENABLED: 'false' }).CRON_ENABLED,
    false,
  );
  assert.equal(
    envSchema.parse({ ...entornoFicticio, CRON_ENABLED: 'true' }).CRON_ENABLED,
    true,
  );
  assert.equal(
    envSchema.safeParse({ ...entornoFicticio, CRON_ENABLED: '0' }).success,
    false,
  );
});

it('false no ensambla adaptadores, ejecuta ticks ni crea un temporizador', async (t) => {
  let ensamblajes = 0;
  const timer = t.mock.method(globalThis, 'setInterval');
  const detener = iniciarCronFechaLimiteExpedicion(
    { cronEnabled: false, cronIntervalMs: 1 },
    () => {
      ensamblajes++;
      throw new Error('No debe ensamblarse');
    },
  );
  await detener();
  assert.equal(ensamblajes, 0);
  assert.equal(timer.mock.callCount(), 0);
});

it('true ejecuta un tick inmediato y siguientes, y el cierre detiene nuevos ciclos', async (t) => {
  let llamadas = 0;
  t.mock.timers.enable({ apis: ['setInterval'] });
  const detener = iniciarCronFechaLimiteExpedicion(
    { cronEnabled: true, cronIntervalMs: 1000 },
    () =>
      dependencias(async () => {
        llamadas++;
        return 0;
      }),
  );
  await siguienteTurno();
  assert.equal(llamadas, 1);
  t.mock.timers.tick(1000);
  await siguienteTurno();
  assert.equal(llamadas, 2);
  await detener();
  t.mock.timers.tick(1000);
  await siguienteTurno();
  assert.equal(llamadas, 2);
});

it('un tick lento no se solapa y el cierre espera el trabajo en curso', async (t) => {
  let liberar!: () => void;
  const bloqueo = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let llamadas = 0;
  t.mock.timers.enable({ apis: ['setInterval'] });
  const detener = iniciarCronFechaLimiteExpedicion(
    { cronEnabled: true, cronIntervalMs: 10 },
    () =>
      dependencias(async () => {
        llamadas++;
        await bloqueo;
        return 0;
      }),
  );
  t.mock.timers.tick(100);
  await siguienteTurno();
  assert.equal(llamadas, 1);
  let cerrado = false;
  const cierre = detener().then(() => {
    cerrado = true;
  });
  await siguienteTurno();
  assert.equal(cerrado, false);
  liberar();
  await cierre;
  assert.equal(cerrado, true);
  t.mock.timers.tick(100);
  assert.equal(llamadas, 1);
});

it('un error de ciclo queda visible y el próximo ciclo puede recuperarse', async (t) => {
  let llamadas = 0;
  t.mock.method(console, 'error', () => {});
  t.mock.timers.enable({ apis: ['setInterval'] });
  const detener = iniciarCronFechaLimiteExpedicion(
    { cronEnabled: true, cronIntervalMs: 1000 },
    () =>
      dependencias(async () => {
        if (++llamadas === 1) throw new Error('fallo ficticio');
        return 2;
      }),
  );
  await siguienteTurno();
  assert.equal(cronHealth.lastError, 'fallo ficticio');
  t.mock.timers.tick(1000);
  await siguienteTurno();
  assert.equal(cronHealth.lastError, null);
  assert.equal(cronHealth.lastPromoted, 2);
  await detener();
});
