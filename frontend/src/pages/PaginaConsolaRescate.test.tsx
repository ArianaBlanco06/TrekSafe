import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { PaginaConsolaRescate } from './PaginaConsolaRescate';
import type { ExpedicionRescate } from '../services/rescate';

function expedicion(id: string, numeroParticipantes: number): ExpedicionRescate {
  return {
    expedicionId: id,
    numeroParticipantes,
    estado: 'alerta',
    nivelRiesgo: 'rojo',
    nombreCompletoSenderista: `Senderista ${id}`,
    telefonoSenderista: '900000000',
    lugarInicio: 'Inicio ficticio',
    lugarFin: `Destino ${id}`,
    coordenadasInicio: null,
    coordenadasFin: null,
    horaInicio: '2030-01-15T08:00:00Z',
    horaRetornoEstimada: '2030-01-15T10:00:00Z',
    fechaLimite: '2030-01-15T10:30:00Z',
    minutosRestantes: null,
    minutosExcedidos: 90,
    enAlertaDesde: '2030-01-15T10:30:00Z',
    confirmadoPorMi: false,
    confirmadoEn: null,
    estadoRescate: null,
    coordinacion: {
      incidenteId: `incidente-${id}`,
      responsableId: 'responsable',
      nombreResponsable: 'Ana Rescate',
      version: 1,
      asumidoEn: '2030-01-15T11:00:00Z',
      esMia: false,
    },
  };
}

const porTiempo = [expedicion('a', 1), expedicion('b', 2), expedicion('c', 8)];
const porGrupo = [porTiempo[2], porTiempo[0], porTiempo[1]];
const respuesta = (grupo = false) => Response.json({ expediciones: grupo ? porGrupo : porTiempo });

function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (causa: Error) => void;
  const promesa = new Promise<T>((resuelve, rechaza) => {
    resolver = resuelve;
    rechazar = rechaza;
  });
  return { promesa, resolver, rechazar };
}

function contenidoTexto(nodo: unknown): string {
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(contenidoTexto).join('');
  if (nodo && typeof nodo === 'object') return contenidoTexto((nodo as { children?: unknown }).children);
  return '';
}

function texto(arbol: ReactTestRenderer): string {
  return arbol.root.findAllByType('p').map(contenidoTexto).join(' ');
}

function ids(arbol: ReactTestRenderer): string[] {
  return arbol.root.findAllByType('article').map((tarjeta) =>
    String(tarjeta.findByType('a').props.href).split('/').at(-1)!,
  );
}

async function montar(t: TestContext, responder?: (url: URL) => Response | Promise<Response>) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const descriptorStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const almacenamiento = new Map([
    ['treksafe:token', 'token-ficticio'],
    ['treksafe:usuario', JSON.stringify({ id: 'rescatista', rol: 'rescatista' })],
    ['treksafe:offline-scope', 'sesion-ficticia'],
  ]);
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (clave: string) => almacenamiento.get(clave) ?? null,
      setItem: (clave: string, valor: string) => almacenamiento.set(clave, valor),
      removeItem: (clave: string) => almacenamiento.delete(clave),
    },
  });
  const peticiones: { url: URL; opciones?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (entrada: string | URL | Request, opciones?: RequestInit) => {
    const url = new URL(String(entrada), 'http://localhost');
    peticiones.push({ url, opciones });
    return responder ? responder(url) : respuesta(url.searchParams.get('criterio') === 'tamano_grupo');
  });
  let arbol!: ReactTestRenderer;
  t.after(async () => {
    if (arbol) await act(async () => arbol.unmount());
    if (descriptorStorage) Object.defineProperty(globalThis, 'sessionStorage', descriptorStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  await act(async () => { arbol = create(<MemoryRouter><PaginaConsolaRescate /></MemoryRouter>); });
  const seleccionar = (criterio: string) => act(async () => {
    arbol.root.findByType('select').props.onChange({ target: { value: criterio } });
  });
  return { arbol, peticiones, seleccionar };
}

describe('HU-43: prioridad en la consola de rescate', () => {
  it('muestra tiempo excedido, participantes y la coordinación vigente al abrir', async (t) => {
    const { arbol, peticiones } = await montar(t);
    assert.equal(arbol.root.findByType('select').props.value, 'tiempo_excedido');
    assert.deepEqual(ids(arbol), ['a', 'b', 'c']);
    assert.match(texto(arbol), /Orden activo por tiempo excedido/);
    assert.match(texto(arbol), /fecha límite e identificador/);
    assert.match(texto(arbol), /1 participante declarado/);
    assert.match(texto(arbol), /8 participantes declarados/);
    assert.match(texto(arbol), /Coordinada por Ana Rescate/);
    assert.equal(peticiones[0].url.searchParams.get('criterio'), 'tiempo_excedido');
  });

  it('cambia el orden conservando todas las alertas, sus plazos y su coordinación mediante GET', async (t) => {
    const { arbol, peticiones, seleccionar } = await montar(t);
    const anteriores = [...ids(arbol)].sort();
    const plazos = arbol.root.findAllByType('p').filter((parrafo) => parrafo.children.join('').startsWith('Límite:'))
      .map((parrafo) => parrafo.children.join(''));
    await seleccionar('tamano_grupo');
    assert.deepEqual(ids(arbol), ['c', 'a', 'b']);
    assert.deepEqual([...ids(arbol)].sort(), anteriores);
    assert.match(texto(arbol), /Orden activo por participantes declarados/);
    assert.match(texto(arbol), /incluyendo al senderista/);
    assert.equal(texto(arbol).match(/Coordinada por Ana Rescate/g)?.length, 3);
    assert.deepEqual(arbol.root.findAllByType('p').filter((parrafo) => parrafo.children.join('').startsWith('Límite:'))
      .map((parrafo) => parrafo.children.join('')), plazos);
    assert.ok(peticiones.every((peticion) => peticion.opciones?.method === 'GET'));
  });

  it('mantiene visibles las alertas y el criterio aplicado mientras llega el nuevo orden', async (t) => {
    const pendiente = diferida<Response>();
    const { arbol, seleccionar } = await montar(t, (url) =>
      url.searchParams.get('criterio') === 'tamano_grupo' ? pendiente.promesa : respuesta(),
    );
    await seleccionar('tamano_grupo');
    assert.deepEqual(ids(arbol), ['a', 'b', 'c']);
    assert.match(texto(arbol), /Orden activo por tiempo excedido/);
    assert.match(texto(arbol), /Actualizando expediciones/);
    await act(async () => pendiente.resolver(respuesta(true)));
    assert.deepEqual(ids(arbol), ['c', 'a', 'b']);
    assert.match(texto(arbol), /Orden activo por participantes declarados/);
  });

  it('una respuesta tardía de otro criterio conserva el orden de la selección más reciente', async (t) => {
    const grupo = diferida<Response>();
    const tiempo = diferida<Response>();
    let consultasTiempo = 0;
    const { arbol, seleccionar } = await montar(t, (url) => {
      if (url.searchParams.get('criterio') === 'tamano_grupo') return grupo.promesa;
      consultasTiempo += 1;
      return consultasTiempo === 1 ? respuesta() : tiempo.promesa;
    });
    await seleccionar('tamano_grupo');
    await seleccionar('tiempo_excedido');
    await act(async () => tiempo.resolver(respuesta()));
    await act(async () => grupo.resolver(respuesta(true)));
    assert.deepEqual(ids(arbol), ['a', 'b', 'c']);
    assert.match(texto(arbol), /Orden activo por tiempo excedido/);
  });

  it('un error tardío de otro criterio conserva el resultado actual', async (t) => {
    const pendiente = diferida<Response>();
    const { arbol, seleccionar } = await montar(t, (url) =>
      url.searchParams.get('criterio') === 'tamano_grupo' ? pendiente.promesa : respuesta(),
    );
    await seleccionar('tamano_grupo');
    await seleccionar('tiempo_excedido');
    await act(async () => pendiente.rechazar(new Error('Conexión interrumpida')));
    assert.deepEqual(ids(arbol), ['a', 'b', 'c']);
    assert.equal(arbol.root.findAll((nodo) => nodo.props.className === 'error-banner mb-4').length, 0);
  });

  it('un fallo conserva el último orden y permite reintentar el criterio seleccionado', async (t) => {
    let intentosGrupo = 0;
    const { arbol, seleccionar } = await montar(t, (url) => {
      if (url.searchParams.get('criterio') !== 'tamano_grupo') return respuesta();
      intentosGrupo += 1;
      return intentosGrupo === 1
        ? Response.json({ mensaje: 'Error temporal de prueba' }, { status: 500 })
        : respuesta(true);
    });
    await seleccionar('tamano_grupo');
    assert.deepEqual(ids(arbol), ['a', 'b', 'c']);
    assert.match(texto(arbol), /Orden activo por tiempo excedido/);
    const reintentar = arbol.root.findAllByType('button').find((boton) => boton.children.join('') === 'Reintentar')!;
    await act(async () => { await reintentar.props.onClick(); });
    assert.equal(intentosGrupo, 2);
    assert.deepEqual(ids(arbol), ['c', 'a', 'b']);
  });

  it('combina el criterio con la zona y mantiene la selección al limpiar el filtro', async (t) => {
    const { arbol, peticiones, seleccionar } = await montar(t);
    await act(async () => {
      arbol.root.findByType('input').props.onChange({ target: { value: '  Valle & río  ' } });
    });
    await act(async () => { arbol.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    await seleccionar('tamano_grupo');
    assert.equal(peticiones.at(-1)!.url.searchParams.get('zona'), 'Valle & río');
    assert.equal(peticiones.at(-1)!.url.searchParams.get('criterio'), 'tamano_grupo');
    const limpiar = arbol.root.findAllByType('button').find((boton) => boton.children.join('') === 'Limpiar')!;
    await act(async () => limpiar.props.onClick());
    assert.equal(peticiones.at(-1)!.url.searchParams.has('zona'), false);
    assert.equal(peticiones.at(-1)!.url.searchParams.get('criterio'), 'tamano_grupo');
    assert.equal(arbol.root.findByType('select').props.value, 'tamano_grupo');
  });

  it('el refresco usa el criterio actual, evita solapar consultas y se detiene al salir', async (t) => {
    const pendiente = diferida<Response>();
    let consultasGrupo = 0;
    const { arbol, peticiones, seleccionar } = await montar(t, (url) => {
      if (url.searchParams.get('criterio') !== 'tamano_grupo') return respuesta();
      consultasGrupo += 1;
      return consultasGrupo === 2 ? pendiente.promesa : respuesta(true);
    });
    await seleccionar('tamano_grupo');
    await act(async () => t.mock.timers.tick(30_000));
    assert.equal(consultasGrupo, 2);
    await act(async () => t.mock.timers.tick(30_000));
    assert.equal(consultasGrupo, 2, 'espera la consulta anterior antes de refrescar');
    await act(async () => pendiente.resolver(respuesta(true)));
    assert.deepEqual(ids(arbol), ['c', 'a', 'b']);
    assert.equal(peticiones.at(-1)!.url.searchParams.get('criterio'), 'tamano_grupo');
    await act(async () => arbol.unmount());
    const anteriores = peticiones.length;
    await act(async () => t.mock.timers.tick(60_000));
    assert.equal(peticiones.length, anteriores);
  });
});
