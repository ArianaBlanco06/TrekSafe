import assert from 'node:assert/strict';
import { it } from 'node:test';
import { obtenerExpedicionesRescate } from './rescate';

it('HU-43: conserva las llamadas existentes y combina criterio y zona con JWT y sin caché', async (t) => {
  const descriptorStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: () => 'token-ficticio' },
  });
  t.after(() => {
    if (descriptorStorage) Object.defineProperty(globalThis, 'sessionStorage', descriptorStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const peticiones: { url: URL; opciones?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (entrada: string | URL | Request, opciones?: RequestInit) => {
    peticiones.push({ url: new URL(String(entrada), 'http://localhost'), opciones });
    return Response.json({ expediciones: [] });
  });

  await obtenerExpedicionesRescate();
  await obtenerExpedicionesRescate('  Valle & río  ');
  await obtenerExpedicionesRescate(undefined, 'tiempo_excedido');
  await obtenerExpedicionesRescate('  Valle & río  ', 'tamano_grupo');

  assert.equal(peticiones[0].url.search, '');
  assert.equal(peticiones[1].url.searchParams.get('zona'), 'Valle & río');
  assert.equal(peticiones[1].url.searchParams.has('criterio'), false);
  assert.equal(peticiones[2].url.searchParams.get('criterio'), 'tiempo_excedido');
  assert.equal(peticiones[3].url.searchParams.get('zona'), 'Valle & río');
  assert.equal(peticiones[3].url.searchParams.get('criterio'), 'tamano_grupo');
  for (const { url, opciones } of peticiones) {
    assert.equal(url.pathname, '/api/rescate/expediciones');
    assert.equal(opciones?.method, 'GET');
    assert.equal(opciones?.cache, 'no-store');
    assert.equal((opciones?.headers as Record<string, string>).Authorization, 'Bearer token-ficticio');
  }
});
