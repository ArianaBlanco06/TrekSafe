import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PaginaEstadisticasRescate } from './PaginaEstadisticasRescate';

function texto(nodo: unknown): string {
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(texto).join('');
  if (nodo && typeof nodo === 'object') return texto((nodo as { children?: unknown }).children);
  return '';
}
const respuesta = (url: URL, atendidos = 5) => Response.json({
  resumen: { atendidos, abiertos: atendidos ? 2 : 0, cerrados: atendidos ? atendidos - 2 : 0 },
  filtros: {
    fechaDesde: url.searchParams.get('fechaDesde'), fechaHasta: url.searchParams.get('fechaHasta'),
    criterioFecha: url.searchParams.get('criterioFecha'), zona: url.searchParams.get('zona'),
    resultado: url.searchParams.get('resultado'), zonaHoraria: 'UTC',
    desdeInclusivo: '2026-11-01T00:00:00.000Z', hastaExclusivo: '2026-11-14T00:00:00.000Z',
  },
});
function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>(r => { resolver = r; });
  return { promesa, resolver };
}
async function montar(t: TestContext, responder: (url: URL) => Response | Promise<Response> = respuesta) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const datos = new Map([
    ['treksafe:token', 'token-ficticio'], ['treksafe:usuario', JSON.stringify({ id: 'actor', rol: 'rescatista' })],
  ]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v),
    removeItem: (k: string) => datos.delete(k),
  } });
  const peticiones: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (entrada: string | URL | Request) => {
    const url = new URL(String(entrada), 'http://localhost');
    peticiones.push(url);
    return responder(url);
  });
  let arbol!: ReactTestRenderer;
  t.after(async () => {
    if (arbol) await act(async () => arbol.unmount());
    if (anterior) Object.defineProperty(globalThis, 'sessionStorage', anterior);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  await act(async () => { arbol = create(<PaginaEstadisticasRescate />); });
  const cambiar = (id: string, valor: string) => act(async () => arbol.root.findByProps({ id }).props.onChange({ target: { value: valor } }));
  const enviar = () => act(async () => arbol.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  return { arbol, peticiones, cambiar, enviar, contenido: () => texto(arbol.toJSON()) };
}

describe('HU-47: pantalla de estadísticas', () => {
  it('consulta al entrar, muestra los tres conteos y explica fechas, UTC y alcance global', async t => {
    const h = await montar(t);
    assert.equal(h.peticiones.length, 1);
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-atendidos' })), '5');
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-abiertos' })), '2');
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-cerrados' })), '3');
    assert.match(h.contenido(), /todos los incidentes/);
    assert.match(h.contenido(), /Apertura.*UTC/);
    assert.match(h.contenido(), /localizados pendientes de cierre/);
  });

  it('editar filtros conserva los aplicados hasta consultar de nuevo', async t => {
    const h = await montar(t);
    await h.cambiar('reporte-zona', 'Cusco');
    await h.cambiar('reporte-criterio', 'cierre');
    await h.cambiar('reporte-resultado', 'evacuado');
    assert.equal(h.peticiones.length, 1);
    assert.match(h.contenido(), /Hay filtros sin aplicar/);
    assert.match(h.contenido(), /Destino: Todos/);
    await h.enviar();
    assert.equal(h.peticiones[1].searchParams.get('criterioFecha'), 'cierre');
    assert.equal(h.peticiones[1].searchParams.get('resultado'), 'evacuado');
    assert.match(h.contenido(), /Destino: Cusco.*Evacuado/);
    assert.doesNotMatch(h.contenido(), /Hay filtros sin aplicar/);
  });

  it('un rango invertido no llama al servidor ni borra el reporte anterior', async t => {
    const h = await montar(t);
    await h.cambiar('reporte-desde', '2026-11-14');
    await h.cambiar('reporte-hasta', '2026-11-13');
    await h.enviar();
    assert.equal(h.peticiones.length, 1);
    assert.match(h.contenido(), /fecha inicial debe ser anterior/);
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-atendidos' })), '5');
  });

  it('muestra conjunto vacío con conteos cero y filtros conservados', async t => {
    const h = await montar(t, url => respuesta(url, 0));
    assert.match(h.contenido(), /No hay incidentes que coincidan/);
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-atendidos' })), '0');
    assert.match(h.contenido(), /Filtros aplicados/);
  });

  it('una carga pendiente conserva los datos y declara que son la consulta anterior', async t => {
    const pendiente = diferida<Response>();
    const h = await montar(t, url => url.searchParams.get('zona') ? pendiente.promesa : respuesta(url));
    await h.cambiar('reporte-zona', 'Cusco');
    await h.enviar();
    assert.match(h.contenido(), /Actualizando. Se muestra la última consulta correcta/);
    assert.match(h.contenido(), /Destino: Todos/);
    await act(async () => pendiente.resolver(respuesta(h.peticiones[1], 8)));
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-atendidos' })), '8');
    assert.match(h.contenido(), /Destino: Cusco/);
  });

  it('un fallo conserva el reporte con sus filtros y permite reintentar la consulta fallida', async t => {
    let fallo = true;
    const h = await montar(t, url => {
      if (url.searchParams.get('zona') && fallo) return Response.json({ mensaje: 'Fallo interno' }, { status: 500 });
      return respuesta(url);
    });
    await h.cambiar('reporte-zona', 'Cusco');
    await h.enviar();
    assert.match(h.contenido(), /Se conserva la última consulta correcta/);
    assert.match(h.contenido(), /Destino: Todos/);
    fallo = false;
    await act(async () => h.arbol.root.findAllByType('button').find(b => texto(b) === 'Reintentar consulta')!.props.onClick());
    assert.equal(h.peticiones.at(-1)?.searchParams.get('zona'), 'Cusco');
    assert.match(h.contenido(), /Destino: Cusco/);
    assert.doesNotMatch(h.contenido(), /No se pudieron actualizar/);
  });

  it('un rechazo de perfil elimina el reporte anterior', async t => {
    const h = await montar(t, url => url.searchParams.get('zona')
      ? Response.json({ codigo: 'RESCATISTA_NO_VALIDADO' }, { status: 403 }) : respuesta(url));
    await h.cambiar('reporte-zona', 'Cusco');
    await h.enviar();
    assert.match(h.contenido(), /perfil validado/);
    assert.equal(h.arbol.root.findAllByProps({ 'aria-label': 'Resumen de incidentes' }).length, 0);
  });

  it('una respuesta tardía no reemplaza los filtros ni conteos de una consulta más reciente', async t => {
    const lenta = diferida<Response>();
    const h = await montar(t, url => url.searchParams.get('zona') === 'Lenta' ? lenta.promesa : respuesta(url, 8));
    await h.cambiar('reporte-zona', 'Lenta'); await h.enviar();
    await h.cambiar('reporte-zona', 'Reciente'); await h.enviar();
    await act(async () => lenta.resolver(respuesta(h.peticiones[1], 20)));
    assert.match(h.contenido(), /Destino: Reciente/);
    assert.equal(texto(h.arbol.root.findByProps({ 'data-testid': 'conteo-atendidos' })), '8');
  });
});
