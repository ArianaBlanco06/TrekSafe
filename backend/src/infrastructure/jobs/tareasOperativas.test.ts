import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import type { IEstadoWorker } from '../../application/ports/IEstadoWorker.js';
import { iniciarTareasOperativas } from './tareasOperativas.js';

function estadoFicticio(eventos: unknown[]): IEstadoWorker {
  return {
    registrarInicio: async (instanciaId) => { eventos.push(['inicio', instanciaId]); },
    registrarCiclo: async (entrada) => { eventos.push(entrada); },
    registrarParada: async (instanciaId) => { eventos.push(['parada', instanciaId]); },
    consultarDisponibilidad: async () => false,
  };
}

it('worker desactivado no registra heartbeat ni ejecuta trabajo', async () => {
  const eventos: unknown[] = [];
  const detener = await iniciarTareasOperativas(
    { cronEnabled: false, cronIntervalMs: 60000, outboxIntervalMs: 15000 },
    { estado: estadoFicticio(eventos), procesarPlazos: async () => { eventos.push('plazos'); },
      procesarOutbox: async () => { eventos.push('outbox'); } },
  );
  await detener();
  assert.deepEqual(eventos, []);
});

it('el consumidor procesa pendientes aun sin alertas nuevas, con intervalo independiente', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const eventos: unknown[] = [];
  let plazos = 0, outbox = 0;
  const detener = await iniciarTareasOperativas(
    { cronEnabled: true, cronIntervalMs: 60000, outboxIntervalMs: 15000 },
    { instanciaId: 'instancia-ficticia', estado: estadoFicticio(eventos),
      procesarPlazos: async () => { plazos++; return { enAlerta: 0 }; },
      procesarOutbox: async () => { outbox++; } },
  );
  await siguienteTurno();
  assert.equal(plazos, 1); assert.equal(outbox, 1);
  t.mock.timers.tick(15000); await siguienteTurno();
  assert.equal(plazos, 1); assert.equal(outbox, 2);
  t.mock.timers.tick(45000); await siguienteTurno();
  assert.equal(plazos, 2); assert.equal(outbox, 3);
  await detener();
  assert.deepEqual(eventos[0], ['inicio', 'instancia-ficticia']);
  assert.deepEqual(eventos.at(-1), ['parada', 'instancia-ficticia']);
  assert.ok(eventos.some((e) => (e as { ciclo?: string }).ciclo === 'outbox'));
});

it('no solapa ciclos lentos, cierre espera ambos y no comienza trabajo tras detener', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const eventos: unknown[] = [];
  let liberar!: () => void;
  const bloqueo = new Promise<void>((resolve) => { liberar = resolve; });
  let llamadas = 0;
  const detener = await iniciarTareasOperativas(
    { cronEnabled: true, cronIntervalMs: 100, outboxIntervalMs: 50 },
    { instanciaId: 'lento', estado: estadoFicticio(eventos),
      procesarPlazos: async () => {}, procesarOutbox: async () => { llamadas++; await bloqueo; } },
  );
  t.mock.timers.tick(500); await siguienteTurno();
  assert.equal(llamadas, 1);
  const cierre = detener();
  assert.equal(detener(), cierre);
  await siguienteTurno();
  assert.ok(!eventos.some((e) => Array.isArray(e) && e[0] === 'parada'));
  liberar(); await cierre;
  t.mock.timers.tick(1000); await siguienteTurno();
  assert.equal(llamadas, 1);
  assert.equal(eventos.filter((e) => Array.isArray(e) && e[0] === 'parada').length, 1);
});

it('fallo queda persistido como error y otro ciclo puede recuperar; no filtra mensajes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const logs: unknown[] = [];
  t.mock.method(console, 'error', (...datos: unknown[]) => { logs.push(datos); });
  const eventos: unknown[] = [];
  let intentos = 0;
  const detener = await iniciarTareasOperativas(
    { cronEnabled: true, cronIntervalMs: 60000, outboxIntervalMs: 15000 },
    { instanciaId: 'fallo', estado: estadoFicticio(eventos), procesarPlazos: async () => {},
      procesarOutbox: async () => { if (++intentos === 1) throw new Error('secreto-ficticio@example.invalid'); } },
  );
  await siguienteTurno();
  assert.ok(eventos.some((e) => (e as { resultado?: string }).resultado === 'error'));
  assert.doesNotMatch(JSON.stringify(logs), /secreto-ficticio/);
  t.mock.timers.tick(15000); await siguienteTurno();
  assert.ok(eventos.some((e) => (e as { ciclo?: string; resultado?: string }).ciclo === 'outbox' &&
    (e as { resultado?: string }).resultado === 'ok'));
  await detener();
});

it('si falla persistir inicio, el worker no inicia productores ni consumidor', async () => {
  let trabajos = 0;
  const estado = estadoFicticio([]);
  estado.registrarInicio = async () => { throw new Error('DB_NO_DISPONIBLE'); };
  await assert.rejects(() => iniciarTareasOperativas(
    { cronEnabled: true, cronIntervalMs: 60000, outboxIntervalMs: 15000 },
    { estado, procesarPlazos: async () => { trabajos++; }, procesarOutbox: async () => { trabajos++; } },
  ), /DB_NO_DISPONIBLE/);
  assert.equal(trabajos, 0);
});
