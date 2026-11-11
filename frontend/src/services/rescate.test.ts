import assert from 'node:assert/strict';
import { it } from 'node:test';
import { aceptarRelevo, cancelarRelevo, obtenerRescatistasElegibles, proponerRelevo, rechazarRelevo } from './rescate';
import { guardarSesion } from '../lib/sesion';

it('HU-40: las llamadas del relevo usan método, URL, JWT y cuerpo correctos', async (t) => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const fetchAnterior = globalThis.fetch;
  const datos = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (clave: string) => datos.get(clave) ?? null,
      setItem: (clave: string, valor: string) => datos.set(clave, valor),
      removeItem: (clave: string) => datos.delete(clave),
    },
  });
  guardarSesion('token-fixture', { id: 'actor', correoElectronico: 'fixture@example.invalid', rol: 'rescatista' });
  const llamadas: { url: string; opciones?: RequestInit }[] = [];
  globalThis.fetch = async (input, opciones) => {
    llamadas.push({ url: String(input), opciones });
    return Response.json({ rescatistas: [], coordinacion: null });
  };
  t.after(() => {
    globalThis.fetch = fetchAnterior;
    if (anterior) Object.defineProperty(globalThis, 'sessionStorage', anterior);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  await obtenerRescatistasElegibles();
  await proponerRelevo(
    'exp-1',
    { destinatarioId: 'dest-1', motivo: 'Cambio de turno', versionIncidente: 4 },
    'op-1',
  );
  await aceptarRelevo('exp-1', 'rel-1', 'op-2');
  await rechazarRelevo('exp-1', 'rel-1', 'op-3');
  await cancelarRelevo('exp-1', 'rel-1', 'op-4');

  assert.equal(llamadas.length, 5);
  for (const llamada of llamadas) {
    const cabeceras = llamada.opciones?.headers as Record<string, string>;
    assert.equal(cabeceras.Authorization, 'Bearer token-fixture');
    assert.equal(cabeceras['Content-Type'], 'application/json');
    assert.equal(llamada.opciones?.cache, 'no-store');
  }

  assert.equal(llamadas[0].url, '/api/rescate/rescatistas');
  assert.equal(llamadas[0].opciones?.method, 'GET');
  assert.equal(llamadas[0].opciones?.body, undefined);

  assert.equal(llamadas[1].url, '/api/rescate/alertas/exp-1/coordinacion/relevos');
  assert.equal(llamadas[1].opciones?.method, 'POST');
  assert.deepEqual(JSON.parse(String(llamadas[1].opciones?.body)), {
    operacionId: 'op-1',
    destinatarioId: 'dest-1',
    motivo: 'Cambio de turno',
    versionIncidente: 4,
  });

  assert.equal(llamadas[2].url, '/api/rescate/alertas/exp-1/coordinacion/relevos/rel-1/aceptar');
  assert.equal(llamadas[2].opciones?.method, 'POST');
  // Aceptar no lleva versión: solo la operación.
  assert.deepEqual(JSON.parse(String(llamadas[2].opciones?.body)), { operacionId: 'op-2' });

  // Rechazar y cancelar: solo la operación, sin motivo ni versión.
  assert.equal(llamadas[3].url, '/api/rescate/alertas/exp-1/coordinacion/relevos/rel-1/rechazar');
  assert.equal(llamadas[3].opciones?.method, 'POST');
  assert.deepEqual(JSON.parse(String(llamadas[3].opciones?.body)), { operacionId: 'op-3' });
  assert.equal(llamadas[4].url, '/api/rescate/alertas/exp-1/coordinacion/relevos/rel-1/cancelar');
  assert.equal(llamadas[4].opciones?.method, 'POST');
  assert.deepEqual(JSON.parse(String(llamadas[4].opciones?.body)), { operacionId: 'op-4' });
});
