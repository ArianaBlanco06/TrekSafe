import assert from 'node:assert/strict';
import { it } from 'node:test';
import { obtenerEstadisticasRescate } from './estadisticasRescate';

it('HU-47: consulta autenticada GET sin caché, con fechas, zona literal y resultado opcionales', async t => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const datos = new Map([
    ['treksafe:token', 'token-ficticio'], ['treksafe:usuario', JSON.stringify({ id: 'actor', rol: 'rescatista' })],
  ]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v),
  } });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, 'sessionStorage', anterior);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const llamadas: { url: URL; opciones?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (entrada: string | URL | Request, opciones?: RequestInit) => {
    llamadas.push({ url: new URL(String(entrada), 'http://localhost'), opciones });
    return Response.json({ resumen: { atendidos: 0, abiertos: 0, cerrados: 0 } });
  });
  const rango = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-13', criterioFecha: 'apertura' as const };
  await obtenerEstadisticasRescate(rango);
  await obtenerEstadisticasRescate({ ...rango, criterioFecha: 'cierre', zona: '  Valle & Ruta_50%  ', resultado: 'evacuado' });
  assert.equal(llamadas[0].url.pathname, '/api/rescate/estadisticas');
  assert.equal(llamadas[0].url.searchParams.has('resultado'), false);
  assert.equal(llamadas[0].url.searchParams.has('zona'), false);
  const parametros = llamadas[1].url.searchParams;
  assert.equal(parametros.get('fechaDesde'), rango.fechaDesde);
  assert.equal(parametros.get('fechaHasta'), rango.fechaHasta);
  assert.equal(parametros.get('criterioFecha'), 'cierre');
  assert.equal(parametros.get('zona'), 'Valle & Ruta_50%');
  assert.equal(parametros.get('resultado'), 'evacuado');
  assert.equal(parametros.has('rescatistaId'), false);
  for (const { opciones } of llamadas) {
    assert.equal(opciones?.method, 'GET');
    assert.equal(opciones?.cache, 'no-store');
    assert.equal((opciones?.headers as Record<string, string>).Authorization, 'Bearer token-ficticio');
  }
});
