import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { GestionEquipoExpedicion } from './PaginaEquipoExpedicion';
import { contextoEquipoExpedicionPruebas } from '../testing/contextoEquipoExpedicionPruebas';
import { promesaPendiente } from '../testing/listasEquipoApiPruebas';
import { ErrorClienteApi } from '../services/clienteApi';
import { guardarSesion } from '../lib/sesion';

async function preparar(t: TestContext, c: Awaited<ReturnType<typeof contextoEquipoExpedicionPruebas>>, enLinea = true) {
  const descriptores = new Map(['window', 'navigator', 'sessionStorage'].map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
  const eventos = new EventTarget();
  const navegador = { onLine: enLinea };
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: eventos });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navegador });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (clave: string) => storage.get(clave) ?? null,
    setItem: (clave: string, valor: string) => storage.set(clave, valor), removeItem: (clave: string) => storage.delete(clave),
  } });
  guardarSesion('fixture-a', { id: c.senderistaA, correoElectronico: 'a@example.invalid', rol: 'senderista' });
  let arbol!: ReactTestRenderer;
  const vista = (id = c.expedicionA, key = 'a') => <MemoryRouter><GestionEquipoExpedicion key={key} expedicionId={id} fuentes={c.fuentes} /></MemoryRouter>;
  await act(async () => { arbol = create(vista()); });
  t.after(() => {
    act(() => arbol.unmount());
    for (const [nombre, descriptor] of descriptores) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else Reflect.deleteProperty(globalThis, nombre);
    }
  });
  const raiz = () => arbol.root;
  function boton(texto: string) {
    const ambito = raiz().findAllByType('dialog')[0] ?? raiz();
    return ambito.findAllByType('button').find((b) => b.children.some((hijo) => typeof hijo === 'string' && hijo.trim() === texto))!;
  }
  async function pulsar(texto: string) { await act(async () => { boton(texto).props.onClick(); }); }
  function seleccionar(id = c.listaA.id) {
    act(() => raiz().findByType('select').props.onChange({ target: { value: id } }));
  }
  async function asociar(id = c.listaA.id) { seleccionar(id); await pulsar('Asociar lista'); await pulsar('Confirmar asociación'); }
  async function marcar(indice: number, preparado: boolean) {
    await act(async () => { raiz().findAllByType('input')[indice].props.onChange({ target: { checked: preparado } }); });
  }
  return { arbol, raiz, boton, pulsar, seleccionar, asociar, marcar, eventos, navegador, storage,
    texto: () => JSON.stringify(arbol.toJSON()),
    async remontar(id = c.expedicionA, key = 'recarga') { await act(async () => { arbol.update(vista(id, key)); }); },
  };
}

describe('Pantalla HU-31: React con reglas reales y transporte sustituido', () => {
  it('asocia con confirmación PWA, muestra el contador y conserva marcas tras remontar', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const v = await preparar(t, c);
    assert.match(v.texto(), /Sin lista de equipo asociada/);
    assert.equal(v.boton('Asociar lista').props.disabled, true);
    v.seleccionar();
    await v.pulsar('Asociar lista');
    assert.equal(v.raiz().findAllByType('dialog').length, 1);
    assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    await v.pulsar('Cancelar');
    await v.asociar();
    assert.match(v.texto(), /2 ítems obligatorios pendientes/);
    assert.equal(v.raiz().findAllByType('select').length, 0);
    await v.marcar(1, true);
    assert.match(v.texto(), /2 ítems obligatorios pendientes/);
    await v.marcar(0, true);
    assert.match(v.texto(), /1 ítem obligatorio pendiente/);
    await v.remontar();
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, true);
    await v.marcar(0, false);
    assert.match(v.texto(), /2 ítems obligatorios pendientes/);
  });

  it('permite asociar una lista vacía y distingue ese estado de no tener copia', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const v = await preparar(t, c);
    await v.asociar(c.listaVaciaA.id);
    assert.match(v.texto(), /Esta lista se asoció sin ítems/);
    assert.match(v.texto(), /No quedan ítems obligatorios pendientes/);
    assert.equal(v.raiz().findAllByType('input').length, 0);
    assert.doesNotMatch(v.texto(), /Sin lista de equipo asociada/);
  });

  it('la copia conserva contenido y marcas después de editar o eliminar el origen', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const v = await preparar(t, c);
    await v.asociar();
    await v.marcar(0, true);
    await c.actualizarLista(c.senderistaA, c.listaA.id, { nombre: 'Otra lista', items: [] });
    await c.eliminarLista(c.senderistaA, c.listaA.id);
    await v.pulsar('Actualizar equipo');
    assert.match(v.texto(), /La lista original fue eliminada/);
    assert.equal(v.raiz().findAllByType('input').length, 3);
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, true);
  });

  it('distingue no tener listas de un fallo al obtenerlas y permite reintentar', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const listar = c.fuentes.listarListas;
    c.fuentes.listarListas = async () => { throw new Error('No se pudieron consultar las listas'); };
    const v = await preparar(t, c);
    assert.match(v.texto(), /No se pudieron consultar las listas/);
    assert.doesNotMatch(v.texto(), /Aún no tienes listas disponibles/);
    c.fuentes.listarListas = async () => [];
    await v.pulsar('Actualizar equipo');
    assert.match(v.texto(), /Aún no tienes listas disponibles/);
    assert.ok(v.raiz().findAllByProps({ to: '/senderista/perfil/equipo' }).length);
    c.fuentes.listarListas = listar;
    await v.pulsar('Actualizar equipo');
    assert.equal(v.raiz().findAllByType('select').length, 1);
  });

  it('un error de carga no bloquea el acceso al retorno y permite reintentar', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const obtener = c.fuentes.preparacion.obtener;
    c.fuentes.preparacion.obtener = async () => { throw new ErrorClienteApi('Expedición no encontrada.', 404); };
    const v = await preparar(t, c);
    assert.match(v.texto(), /Expedición no encontrada/);
    assert.ok(v.raiz().findAllByProps({ to: '/senderista/expedicion/activa' }).length);
    c.fuentes.preparacion.obtener = obtener;
    await v.pulsar('Actualizar equipo');
    assert.equal(v.raiz().findAllByType('select').length, 1);
  });

  it('un fallo de marca conserva casilla y contador y permite reintentar', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const guardar = c.fuentes.preparacion.establecerPreparado;
    c.fuentes.preparacion.establecerPreparado = async () => { throw new ErrorClienteApi('No se pudo guardar.', 500); };
    const v = await preparar(t, c);
    await v.marcar(0, true);
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, false);
    assert.match(v.texto(), /2 ítems obligatorios pendientes/);
    assert.match(v.texto(), /No se pudo guardar/);
    c.fuentes.preparacion.establecerPreparado = guardar;
    await v.marcar(0, true);
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, true);
  });

  it('si eliminan la lista seleccionada durante la asociación cierra la confirmación y permite elegir otra', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const v = await preparar(t, c);
    v.seleccionar();
    await v.pulsar('Asociar lista');
    await c.eliminarLista(c.senderistaA, c.listaA.id);
    await v.pulsar('Confirmar asociación');
    assert.equal(v.raiz().findAllByType('dialog').length, 0);
    assert.match(v.texto(), /Lista de equipo no encontrada/);
    v.seleccionar(c.listaVaciaA.id);
    assert.equal(v.raiz().findAllByType('dialog').length, 0);
    await v.pulsar('Asociar lista');
    await v.pulsar('Confirmar asociación');
    assert.match(v.texto(), /Esta lista se asoció sin ítems/);
  });

  it('bloquea dobles escrituras y no muestra la marca hasta que se confirma', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const pendiente = promesaPendiente<NonNullable<Awaited<ReturnType<typeof c.fuentes.preparacion.obtener>>>>();
    let peticiones = 0;
    c.fuentes.preparacion.establecerPreparado = async () => { peticiones++; return pendiente.promesa; };
    const v = await preparar(t, c);
    await act(async () => {
      const casilla = v.raiz().findAllByType('input')[0];
      casilla.props.onChange({ target: { checked: true } });
      casilla.props.onChange({ target: { checked: true } });
    });
    assert.equal(peticiones, 1);
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, false);
    assert.equal(v.raiz().findAllByType('input')[0].props.disabled, true);
    const guardada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true);
    await act(async () => { pendiente.resolver({ ...guardada, items: [...guardada.items], obligatoriosPendientes: guardada.obligatoriosPendientes }); });
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, true);
  });

  for (const estado of ['completada', 'alerta', 'cancelada']) {
    it(`muestra la copia en modo consulta con estado ${estado}`, async (t) => {
      const c = await contextoEquipoExpedicionPruebas();
      await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      c.cambiarEstado(c.expedicionA, estado);
      let listar = false;
      c.fuentes.listarListas = async () => { listar = true; return []; };
      const v = await preparar(t, c);
      assert.ok(v.raiz().findAllByType('input').every((input) => input.props.disabled));
      assert.match(v.texto(), /El equipo es de consulta/);
      assert.equal(listar, false);
    });
  }

  it('un cambio de estado concurrente devuelve conflicto, refresca y deshabilita las marcas', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const v = await preparar(t, c);
    c.cambiarEstado(c.expedicionA, 'alerta');
    await v.marcar(0, true);
    assert.match(v.texto(), /Solo puedes preparar el equipo/);
    assert.ok(v.raiz().findAllByType('input').every((input) => input.props.disabled));
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, false);
  });

  it('recupera una asociación hecha en otra sesión sin reemplazarla', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const v = await preparar(t, c);
    await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaVaciaA.id);
    await v.asociar();
    assert.match(v.texto(), /Esta lista se asoció sin ítems/);
    assert.equal(v.raiz().findAllByType('select').length, 0);
    assert.equal(v.raiz().findAllByType('dialog').length, 0);
  });

  it('sin red no consulta ni escribe y reconectar recupera el estado vigente', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    let consultas = 0;
    const obtener = c.fuentes.preparacion.obtener;
    c.fuentes.preparacion.obtener = async (id) => { consultas++; return obtener(id); };
    const v = await preparar(t, c, false);
    assert.equal(consultas, 0);
    await act(async () => { v.navegador.onLine = true; v.eventos.dispatchEvent(new Event('online')); });
    await v.asociar();
    await act(async () => { v.navegador.onLine = false; v.eventos.dispatchEvent(new Event('offline')); });
    assert.ok(v.raiz().findAllByType('input').every((input) => input.props.disabled));
    await v.marcar(0, true);
    assert.equal((await c.dao.obtener(c.senderistaA, c.expedicionA))?.items[0].preparado, false);
    c.cambiarEstado(c.expedicionA, 'completada');
    await act(async () => { v.navegador.onLine = true; v.eventos.dispatchEvent(new Event('online')); });
    assert.match(v.texto(), /El equipo es de consulta/);
    assert.deepEqual([...v.storage.keys()].sort(), ['treksafe:offline-scope', 'treksafe:token', 'treksafe:usuario']);
  });

  it('volver al foco relee el estado sin perder las marcas confirmadas', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const v = await preparar(t, c);
    await v.asociar();
    await v.marcar(0, true);
    c.cambiarEstado(c.expedicionA, 'completada');
    await act(async () => { v.eventos.dispatchEvent(new Event('focus')); });
    assert.equal(v.raiz().findAllByType('input')[0].props.checked, true);
    assert.equal(v.raiz().findAllByType('input')[0].props.disabled, true);
  });

  it('descarta una carga tardía de la cuenta anterior y no la muestra tras cambiar de sesión', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const copia = await c.fuentes.preparacion.asociar(c.expedicionA, c.listaA.id);
    const pendiente = promesaPendiente<typeof copia>();
    const obtener = c.fuentes.preparacion.obtener;
    c.fuentes.preparacion.obtener = () => pendiente.promesa;
    const v = await preparar(t, c);
    c.cambiarActor(c.senderistaB);
    guardarSesion('fixture-b', { id: c.senderistaB, correoElectronico: 'b@example.invalid', rol: 'senderista' });
    c.fuentes.preparacion.obtener = obtener;
    await v.remontar(c.expedicionB, 'b');
    await act(async () => { pendiente.resolver(copia); });
    assert.doesNotMatch(v.texto(), /Montaña/);
    assert.match(v.texto(), /Equipo de B/);
    assert.equal(v.raiz().findAllByType('input').length, 0);
  });

  it('descarta un guardado tardío al cambiar a otra expedición y cuenta', async (t) => {
    const c = await contextoEquipoExpedicionPruebas();
    const copia = await c.fuentes.preparacion.asociar(c.expedicionA, c.listaA.id);
    const pendiente = promesaPendiente<typeof copia>();
    c.fuentes.preparacion.establecerPreparado = () => pendiente.promesa;
    const v = await preparar(t, c);
    await v.marcar(0, true);
    guardarSesion('fixture-b', { id: c.senderistaB, correoElectronico: 'b@example.invalid', rol: 'senderista' });
    c.cambiarActor(c.senderistaB);
    await v.remontar(c.expedicionB, 'b');
    await act(async () => { pendiente.resolver(copia); });
    assert.doesNotMatch(v.texto(), /Montaña|Ítem marcado como preparado/);
  });
});
