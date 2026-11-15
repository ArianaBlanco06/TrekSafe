import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import { ConsultarDisponibilidad } from './ConsultarDisponibilidad.js';

const opciones = { maxAntiguedadHeartbeatMs: 180000, maxAntiguedadPendientesMs: 600000 };

it('disponibilidad comparte consulta y cache10s; no infiere worker a partir de salud API', async () => {
  let ahora = 0, llamadas = 0;
  let disponible = true;
  const servicio = new ConsultarDisponibilidad({ consultarDisponibilidad: async (valores) => {
    assert.deepEqual(valores, opciones); llamadas++; return disponible;
  } }, { ...opciones, ahora: () => ahora });
  assert.deepEqual(await Promise.all([servicio.ejecutar(), servicio.ejecutar()]), [true, true]);
  assert.equal(llamadas, 1);
  disponible = false; ahora = 9999;
  assert.equal(await servicio.ejecutar(), true);
  ahora = 10000;
  assert.equal(await servicio.ejecutar(), false);
  assert.equal(llamadas, 2);
});

it('DB caída responde degradado sin exponer el error ni devolver éxito de caché vencida', async () => {
  const servicio = new ConsultarDisponibilidad({ consultarDisponibilidad: async () => {
    throw new Error('credencial-ficticia');
  } }, opciones);
  assert.equal(await servicio.ejecutar(), false);
});

it('consulta bloqueada queda degradada en el timeout operativo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const servicio = new ConsultarDisponibilidad({ consultarDisponibilidad: () => new Promise(() => {}) }, opciones);
  const pendiente = servicio.ejecutar();
  t.mock.timers.tick(3000); await siguienteTurno();
  assert.equal(await pendiente, false);
});
