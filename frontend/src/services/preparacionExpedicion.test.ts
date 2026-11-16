import assert from 'node:assert/strict';
import { it } from 'node:test';
import { preparacionExpedicionApi } from './preparacionExpedicion';
import { guardarSesion } from '../lib/sesion';

it('HU-31: envía JWT, no-store, ids codificados y solo los campos de cada operación', async (t) => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const fetchAnterior = globalThis.fetch;
  const datos = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => datos.set(clave, valor), removeItem: (clave: string) => datos.delete(clave),
  } });
  guardarSesion('token-fixture', { id: 'actor', correoElectronico: 'fixture@example.invalid', rol: 'senderista' });
  const llamadas: { url: string; opciones?: RequestInit }[] = [];
  globalThis.fetch = async (input, opciones) => {
    llamadas.push({ url: String(input), opciones });
    return Response.json({ preparacion: null });
  };
  t.after(() => {
    globalThis.fetch = fetchAnterior;
    if (anterior) Object.defineProperty(globalThis, 'sessionStorage', anterior);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  assert.equal(await preparacionExpedicionApi.obtener('exp/ajena'), null);
  await preparacionExpedicionApi.asociar('exp', 'lista');
  await preparacionExpedicionApi.establecerPreparado('exp', 'item/ajeno', false);
  for (const llamada of llamadas) {
    assert.equal((llamada.opciones?.headers as Record<string, string>).Authorization, 'Bearer token-fixture');
    assert.equal(llamada.opciones?.cache, 'no-store');
  }
  assert.equal(llamadas[0].url, '/api/expediciones/exp%2Fajena/equipo');
  assert.equal(llamadas[1].opciones?.method, 'POST');
  assert.deepEqual(JSON.parse(String(llamadas[1].opciones?.body)), { listaId: 'lista' });
  assert.equal(llamadas[2].url, '/api/expediciones/exp/equipo/items/item%2Fajeno');
  assert.equal(llamadas[2].opciones?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(llamadas[2].opciones?.body)), { preparado: false });
  assert.deepEqual([...datos.keys()].sort(), ['treksafe:offline-scope', 'treksafe:token', 'treksafe:usuario']);
});
