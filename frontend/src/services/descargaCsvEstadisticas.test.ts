import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { setImmediate as turno } from 'node:timers/promises';
import { ErrorClienteApi } from './clienteApi';
import { descargarCsvEstadisticas } from './estadisticasRescate';

const filtros = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-13', criterioFecha: 'cierre' as const, zona: '  Valle & Ruta_50%  ', resultado: 'evacuado' as const };
const csv = '\uFEFF"id","zona","fecha_apertura","fecha_cierre","estado","resultado"\r\n';
const respuesta = () => new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
function sesion(t: TestContext) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const datos = new Map([
    ['treksafe:token', 'token-ficticio'], ['treksafe:usuario', JSON.stringify({ id: 'actor-a', rol: 'rescatista' })],
  ]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v),
    removeItem: (k: string) => datos.delete(k),
  } });
  t.after(() => { if (anterior) Object.defineProperty(globalThis, 'sessionStorage', anterior); else Reflect.deleteProperty(globalThis, 'sessionStorage'); });
  return datos;
}
function diferida<T>() { let resolver!: (v: T) => void; const promesa = new Promise<T>(r => { resolver = r; }); return { promesa, resolver }; }

describe('HU-48: servicio de descarga CSV', () => {
  it('envía el filtro autorizado por GET, JWT, señal de cancelación y no-store', async t => {
    sesion(t); const control = new AbortController();
    t.mock.method(globalThis, 'fetch', async (entrada: string | URL | Request, opciones?: RequestInit) => {
      const url = new URL(String(entrada), 'http://localhost');
      assert.equal(url.pathname, '/api/rescate/estadisticas.csv');
      assert.equal(url.searchParams.get('fechaDesde'), filtros.fechaDesde);
      assert.equal(url.searchParams.get('fechaHasta'), filtros.fechaHasta);
      assert.equal(url.searchParams.get('criterioFecha'), 'cierre');
      assert.equal(url.searchParams.get('zona'), 'Valle & Ruta_50%');
      assert.equal(url.searchParams.get('resultado'), 'evacuado');
      assert.equal(url.searchParams.has('rescatistaId'), false);
      assert.equal(opciones?.signal, control.signal); assert.equal(opciones?.method, 'GET');
      assert.equal(opciones?.cache, 'no-store');
      assert.equal((opciones?.headers as Record<string, string>).Authorization, 'Bearer token-ficticio');
      assert.equal((opciones?.headers as Record<string, string>).Accept, 'text/csv');
      return respuesta();
    });
    const archivo = await descargarCsvEstadisticas(filtros, control.signal);
    assert.equal(archivo.nombre, 'incidentes-cierre-2026-11-01_2026-11-13.csv');
    assert.deepEqual([...new Uint8Array(await archivo.contenido.arrayBuffer()).subarray(0, 3)], [239, 187, 191]);
  });

  it('espera el cuerpo completo después de recibir las cabeceras', async t => {
    sesion(t); const cuerpo = diferida<Blob>(); const res = respuesta();
    t.mock.method(res, 'blob', () => cuerpo.promesa);
    t.mock.method(globalThis, 'fetch', async () => res);
    let resuelta = false;
    const pendiente = descargarCsvEstadisticas(filtros, new AbortController().signal).then(a => { resuelta = true; return a; });
    await turno(); assert.equal(resuelta, false);
    cuerpo.resolver(new Blob([csv], { type: 'text/csv' }));
    assert.equal((await pendiente).contenido.size, new Blob([csv]).size);
  });

  it('una respuesta truncada falla sin devolver un archivo parcial', async t => {
    sesion(t); const res = respuesta();
    t.mock.method(res, 'blob', async () => { throw new Error('Conexión interrumpida a mitad de página'); });
    t.mock.method(globalThis, 'fetch', async () => res);
    await assert.rejects(descargarCsvEstadisticas(filtros, new AbortController().signal), (e: unknown) => {
      assert.ok(e instanceof ErrorClienteApi); assert.equal(e.codigo, 'DESCARGA_INCOMPLETA'); return true;
    });
  });

  it('rechaza HTML/JSON de éxito y un cuerpo CSV vacío', async t => {
    sesion(t);
    for (const res of [new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
      Response.json({ mensaje: 'No es CSV' }), new Response('', { headers: { 'Content-Type': 'text/csv' } })]) {
      t.mock.method(globalThis, 'fetch', async () => res);
      await assert.rejects(descargarCsvEstadisticas(filtros, new AbortController().signal), (e: unknown) => {
        assert.ok(e instanceof ErrorClienteApi); assert.equal(e.codigo, 'ARCHIVO_CSV_INVALIDO'); return true;
      });
    }
  });

  it('un 403 conserva su código y no elimina la sesión', async t => {
    const datos = sesion(t);
    t.mock.method(globalThis, 'fetch', async () => Response.json({ mensaje: 'Perfil no validado', codigo: 'RESCATISTA_NO_VALIDADO' }, { status: 403 }));
    await assert.rejects(descargarCsvEstadisticas(filtros, new AbortController().signal), (e: unknown) => {
      assert.ok(e instanceof ErrorClienteApi); assert.equal(e.status, 403); return true;
    });
    assert.equal(datos.get('treksafe:token'), 'token-ficticio');
  });

  it('descarta el cuerpo tardío si cambia la cuenta o el token durante la lectura', async t => {
    const datos = sesion(t); const cuerpo = diferida<Blob>(); const res = respuesta();
    t.mock.method(res, 'blob', () => cuerpo.promesa); t.mock.method(globalThis, 'fetch', async () => res);
    const pendiente = descargarCsvEstadisticas(filtros, new AbortController().signal);
    await turno();
    datos.set('treksafe:token', 'token-b');
    datos.set('treksafe:usuario', JSON.stringify({ id: 'actor-b', rol: 'rescatista' }));
    cuerpo.resolver(new Blob([csv], { type: 'text/csv' }));
    await assert.rejects(pendiente, (e: unknown) => { assert.ok(e instanceof ErrorClienteApi); assert.equal(e.codigo, 'SESSION_CHANGED'); return true; });
    assert.equal(datos.get('treksafe:token'), 'token-b');
  });

  it('una señal abortada descarta el archivo aunque el transporte simulado la ignore', async t => {
    sesion(t); const control = new AbortController();
    t.mock.method(globalThis, 'fetch', async () => { control.abort(); return respuesta(); });
    await assert.rejects(descargarCsvEstadisticas(filtros, control.signal), (e: unknown) => {
      assert.ok(e instanceof ErrorClienteApi); assert.equal(e.codigo, 'SOLICITUD_CANCELADA'); return true;
    });
  });
});
