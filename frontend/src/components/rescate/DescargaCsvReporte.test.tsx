import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { setImmediate as turno } from 'node:timers/promises';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReporteEstadisticasRescate } from '../../services/estadisticasRescate';
import { DescargaCsvReporte } from './DescargaCsvReporte';

const reporte: ReporteEstadisticasRescate = {
  resumen: { atendidos: 1, abiertos: 0, cerrados: 1 },
  filtros: { fechaDesde: '2026-11-01', fechaHasta: '2026-11-13', criterioFecha: 'cierre', zona: 'Huaraz', resultado: 'evacuado', zonaHoraria: 'UTC', desdeInclusivo: '2026-11-01T00:00:00.000Z', hastaExclusivo: '2026-11-14T00:00:00.000Z' },
};
const csv = () => new Response('\uFEFF"id","zona"\r\n"id-ficticio","Huaraz"\r\n', { headers: { 'Content-Type': 'text/csv' } });
function diferida<T>() { let resolver!: (v: T) => void; const promesa = new Promise<T>(r => { resolver = r; }); return { promesa, resolver }; }
function texto(nodo: unknown): string {
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(texto).join('');
  if (nodo && typeof nodo === 'object') return texto((nodo as { children?: unknown }).children);
  return '';
}
async function montar(t: TestContext, responder: () => Response | Promise<Response> = csv, bloqueada = false) {
  const originales = ['window', 'navigator', 'document', 'sessionStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const);
  const eventos = new EventTarget(), navegador = { onLine: true };
  const datos = new Map([['treksafe:token', 'fixture-a'], ['treksafe:usuario', JSON.stringify({ id: 'actor-a', rol: 'rescatista' })]]);
  let clics = 0;
  const enlaces: { download: string; href: string; click: () => void; remove: () => void }[] = [];
  const valores = {
    window: { addEventListener: eventos.addEventListener.bind(eventos), removeEventListener: eventos.removeEventListener.bind(eventos) },
    navigator: navegador,
    sessionStorage: { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v), removeItem: (k: string) => datos.delete(k) },
    document: { body: { appendChild() {} }, createElement: () => {
      const e = { download: '', href: '', click: () => { clics++; }, remove() {} }; enlaces.push(e); return e;
    } },
  };
  for (const [clave, valor] of Object.entries(valores)) Object.defineProperty(globalThis, clave, { configurable: true, value: valor });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const objetos = t.mock.method(URL, 'createObjectURL', () => 'blob:fixture');
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const peticiones: { url: URL; signal: AbortSignal | null | undefined }[] = [];
  t.mock.method(globalThis, 'fetch', async (entrada: string | URL | Request, opciones?: RequestInit) => {
    peticiones.push({ url: new URL(String(entrada), 'http://localhost'), signal: opciones?.signal }); return responder();
  });
  let arbol!: ReactTestRenderer;
  t.after(async () => {
    await act(async () => arbol.unmount()); t.mock.timers.tick(1000);
    for (const [clave, descriptor] of originales) {
      if (descriptor) Object.defineProperty(globalThis, clave, descriptor); else Reflect.deleteProperty(globalThis, clave);
    }
  });
  await act(async () => { arbol = create(<DescargaCsvReporte reporte={reporte} bloqueada={bloqueada} />); });
  const pulsar = () => act(async () => { arbol.root.findByType('button').props.onClick(); await turno(); });
  const actualizar = (nuevo: ReporteEstadisticasRescate, bloqueo = false) => act(async () => arbol.update(<DescargaCsvReporte reporte={nuevo} bloqueada={bloqueo} />));
  return { arbol, pulsar, actualizar, peticiones, objetos, datos, enlaces, clics: () => clics, contenido: () => texto(arbol.toJSON()),
    conexion: (online: boolean) => act(async () => { navegador.onLine = online; eventos.dispatchEvent(new Event(online ? 'online' : 'offline')); }),
  };
}

describe('HU-48: descarga del reporte aplicado', () => {
  it('usa los filtros aplicados y ofrece el archivo completo con nombre informativo', async t => {
    const h = await montar(t); await h.pulsar();
    assert.equal(h.peticiones[0].url.searchParams.get('zona'), 'Huaraz');
    assert.equal(h.peticiones[0].url.searchParams.get('criterioFecha'), 'cierre');
    assert.equal(h.peticiones[0].url.searchParams.get('resultado'), 'evacuado');
    assert.equal(h.clics(), 1); assert.equal(h.objetos.mock.callCount(), 1);
    assert.equal(h.enlaces[0].download, 'incidentes-cierre-2026-11-01_2026-11-13.csv');
    assert.match(h.contenido(), /Descarga solicitada/);
  });
  it('bloquea clics repetidos mientras espera el archivo', async t => {
    const pendiente = diferida<Response>(); const h = await montar(t, () => pendiente.promesa);
    await act(async () => { h.arbol.root.findByType('button').props.onClick(); h.arbol.root.findByType('button').props.onClick(); await turno(); });
    assert.equal(h.peticiones.length, 1); assert.equal(h.clics(), 0);
    assert.equal(h.arbol.root.findByType('button').props.disabled, true); assert.match(h.contenido(), /Preparando CSV/);
    await act(async () => { pendiente.resolver(csv()); await turno(); });
    assert.equal(h.clics(), 1);
  });
  it('un fallo no guarda archivos y permite reintentar el mismo filtro', async t => {
    let falla = true;
    const h = await montar(t, () => falla ? Response.json({ mensaje: 'No disponible' }, { status: 500 }) : csv());
    await h.pulsar(); assert.equal(h.objetos.mock.callCount(), 0); assert.match(h.contenido(), /No se pudo completar/);
    falla = false; await h.pulsar();
    assert.equal(h.clics(), 1); assert.equal(h.peticiones.length, 2);
    assert.equal(h.peticiones[1].url.search, h.peticiones[0].url.search);
  });
  it('un reporte que se actualiza cancela la descarga anterior y descarta su respuesta', async t => {
    const pendiente = diferida<Response>(); const h = await montar(t, () => pendiente.promesa);
    await h.pulsar();
    await h.actualizar({ ...reporte, filtros: { ...reporte.filtros, zona: 'Cusco' } });
    assert.equal(h.peticiones[0].signal?.aborted, true);
    await act(async () => { pendiente.resolver(csv()); await turno(); });
    assert.equal(h.clics(), 0); assert.equal(h.objetos.mock.callCount(), 0);
  });
  it('cambiar de sesión durante la descarga no guarda datos de la cuenta anterior', async t => {
    const pendiente = diferida<Response>(); const h = await montar(t, () => pendiente.promesa);
    await h.pulsar(); h.datos.set('treksafe:token', 'fixture-b');
    h.datos.set('treksafe:usuario', JSON.stringify({ id: 'actor-b', rol: 'rescatista' }));
    await act(async () => { pendiente.resolver(csv()); await turno(); });
    assert.equal(h.clics(), 0); assert.equal(h.objetos.mock.callCount(), 0);
    assert.equal(h.datos.get('treksafe:token'), 'fixture-b');
  });
  it('offline cancela la descarga, no guarda un archivo y reconectar no reintenta automáticamente', async t => {
    const pendiente = diferida<Response>(); const h = await montar(t, () => pendiente.promesa);
    await h.pulsar(); await h.conexion(false);
    assert.equal(h.peticiones[0].signal?.aborted, true); assert.match(h.contenido(), /Conéctate a internet/);
    await act(async () => { pendiente.resolver(csv()); await turno(); });
    assert.equal(h.clics(), 0);
    await h.conexion(true); assert.equal(h.peticiones.length, 1);
  });
  it('un reporte bloqueado no exporta y desmontar cancela sin guardar una respuesta tardía', async t => {
    const pendiente = diferida<Response>(); const h = await montar(t, () => pendiente.promesa, true);
    await h.pulsar(); assert.equal(h.peticiones.length, 0);
    await h.actualizar(reporte, false); await h.pulsar();
    await act(async () => h.arbol.unmount());
    assert.equal(h.peticiones[0].signal?.aborted, true);
    await act(async () => { pendiente.resolver(csv()); await turno(); });
    assert.equal(h.clics(), 0);
  });
  it('un perfil rechazado no descarga y explica el permiso requerido', async t => {
    const h = await montar(t, () => Response.json({ codigo: 'RESCATISTA_NO_VALIDADO' }, { status: 403 }));
    await h.pulsar(); assert.equal(h.clics(), 0); assert.match(h.contenido(), /perfil de rescatista validado/);
  });
});
