import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import { it } from 'node:test';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { iniciarApiEquipoHttpPruebas } from '../../../backend/src/testing/apiEquipoHttpPruebas';
import { crearPoolEquipoPruebas, contextoPostgresEquipoPruebas } from '../../../backend/src/testing/contextoPostgresEquipoPruebas';
import { GestionListasEquipo } from '../pages/PaginaListasEquipo';
import { listasEquipoApi } from '../services/listasEquipo';

const conexion = process.env.HU30_TEST_DATABASE_URL;

it('HU-30: React, HTTP y PostgreSQL conservan listas y aíslan dos usuarios', { skip: !conexion, timeout: 20_000 }, async (t) => {
  const pool = crearPoolEquipoPruebas(conexion!);
  const { dao, senderistaA, senderistaB } = await contextoPostgresEquipoPruebas(pool, t);
  const apiHttp = await iniciarApiEquipoHttpPruebas(dao);
  const origen = apiHttp.origen;
  const fetchReal = globalThis.fetch;
  const descriptores = new Map(['window', 'navigator', 'sessionStorage'].map((nombre) =>
    [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
  const ventana = new EventTarget();
  let token = '';
  let arbol: ReactTestRenderer | undefined;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: ventana });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true,
    value: { getItem: (clave: string) => clave === 'treksafe:token' ? token : null } });
  // Solo resuelve URLs relativas como lo haría el navegador; la respuesta viene de Express real.
  globalThis.fetch = (input, opciones) => {
    const url = new URL(String(input), origen);
    if (url.origin !== origen) throw new Error('La prueba no permite solicitudes fuera de su API local.');
    return fetchReal(url, opciones);
  };
  t.after(async () => {
    if (arbol) act(() => arbol!.unmount());
    globalThis.fetch = fetchReal;
    for (const [nombre, descriptor] of descriptores) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else Reflect.deleteProperty(globalThis, nombre);
    }
    await apiHttp.cerrar();
    await pool.end();
  });

  function raiz(): ReactTestInstance { return arbol!.root; }
  async function hasta(criterio: () => boolean) {
    for (let intento = 0; intento < 200; intento++) {
      if (criterio()) return;
      await act(async () => { await esperar(10); });
    }
    assert.fail('La vista no alcanzó el estado esperado dentro del plazo local de pruebas.');
  }
  function boton(texto: string) {
    const ambito = raiz().findAllByType('dialog')[0] ?? raiz();
    return ambito.findAllByType('button').find((elemento) => elemento.children.some((hijo) =>
      typeof hijo === 'string' && hijo.trim() === texto))!;
  }
  async function pulsar(texto: string) { await act(async () => { boton(texto).props.onClick(); }); }
  function cambiarNombre(nombre: string) {
    act(() => { raiz().findByProps({ placeholder: 'Ej. Equipo de alta montaña' }).props.onChange({ target: { value: nombre } }); });
  }
  function cambiarItem(indice: number, nombre: string) {
    act(() => { raiz().findAllByProps({ placeholder: 'Ej. Casco' })[indice].props.onChange({ target: { value: nombre } }); });
  }
  async function guardar() {
    await act(async () => { raiz().findByType('form').props.onSubmit({ preventDefault() {} }); });
    if (raiz().findAllByType('dialog').length > 0) await pulsar('Confirmar cambios');
    await hasta(() => raiz().findAllByType('form').length === 0);
  }
  async function sesion(actor: string) {
    token = apiHttp.tokenPara(actor);
    const vista = <MemoryRouter><GestionListasEquipo key={randomUUID()} api={listasEquipoApi} /></MemoryRouter>;
    await act(async () => { if (arbol) arbol.update(vista); else arbol = create(vista); });
    await hasta(() => boton('Nueva lista')?.props.disabled === false);
  }

  await sesion(senderistaA);
  await pulsar('Nueva lista');
  cambiarNombre('Equipo de montaña 🧗');
  await pulsar('Añadir ítem');
  cambiarItem(0, 'Casco');
  act(() => { raiz().findByProps({ 'aria-label': 'Ítem 1 obligatorio' }).props.onChange({ target: { checked: true } }); });
  await pulsar('Añadir ítem');
  cambiarItem(1, 'Cámara');
  await guardar();
  const listaA = (await listasEquipoApi.listar())[0];
  assert.equal(listaA.senderistaId, senderistaA);
  assert.equal(listaA.nombre, 'Equipo de montaña 🧗');
  assert.deepEqual(listaA.items.map(({ nombre, obligatorio }) => ({ nombre, obligatorio })), [
    { nombre: 'Casco', obligatorio: true }, { nombre: 'Cámara', obligatorio: false },
  ]);
  assert.equal((await pool.query('SELECT nombre FROM public.listas_equipo WHERE id=$1', [listaA.id])).rows[0].nombre, listaA.nombre);

  // Otra sesión del mismo usuario reconstruye la vista únicamente desde HTTP y la base.
  await sesion(senderistaA);
  assert.match(JSON.stringify(arbol!.toJSON()), /Equipo de montaña/);
  await pulsar('Editar');
  await hasta(() => raiz().findAllByType('form').length === 1);
  cambiarNombre('Equipo de invierno');
  cambiarItem(0, 'Casco certificado');
  act(() => { raiz().findByProps({ 'aria-label': 'Quitar ítem 2' }).props.onClick(); });
  await pulsar('Añadir ítem');
  cambiarItem(1, 'Linterna');
  await guardar();
  const editada = await listasEquipoApi.obtener(listaA.id);
  assert.equal(editada.items[0].id, listaA.items[0].id);
  assert.equal(editada.items[0].nombre, 'Casco certificado');
  assert.equal(editada.items[1].nombre, 'Linterna');
  assert.notEqual(editada.items[1].id, listaA.items[1].id);

  await sesion(senderistaB);
  assert.doesNotMatch(JSON.stringify(arbol!.toJSON()), /Equipo de invierno/);
  assert.deepEqual(await listasEquipoApi.listar(), []);
  await assert.rejects(listasEquipoApi.obtener(listaA.id), { status: 404 });
  await assert.rejects(listasEquipoApi.actualizar(listaA.id, { nombre: 'Intento ajeno', items: [] }), { status: 404 });
  await assert.rejects(listasEquipoApi.eliminar(listaA.id), { status: 404 });
  await pulsar('Nueva lista');
  cambiarNombre('Equipo personal B');
  await guardar();
  const listaB = (await listasEquipoApi.listar())[0];
  assert.equal(listaB.senderistaId, senderistaB);
  assert.deepEqual(listaB.items, []);

  await sesion(senderistaA);
  assert.doesNotMatch(JSON.stringify(arbol!.toJSON()), /Equipo personal B/);
  assert.deepEqual(await listasEquipoApi.obtener(listaA.id), editada);
  await pulsar('Eliminar');
  await pulsar('Cancelar');
  assert.equal((await listasEquipoApi.listar()).length, 1);
  await pulsar('Eliminar');
  await pulsar('Eliminar lista');
  await hasta(() => raiz().findAllByProps({ 'aria-label': `Eliminar lista ${editada.nombre}` }).length === 0);
  assert.deepEqual(await listasEquipoApi.listar(), []);
  const restantes = await pool.query('SELECT id,senderista_id FROM public.listas_equipo');
  assert.deepEqual(restantes.rows, [{ id: listaB.id, senderista_id: senderistaB }]);
  assert.equal((await pool.query('SELECT count(*)::int AS cantidad FROM public.items_lista_equipo WHERE lista_equipo_id=$1', [listaA.id])).rows[0].cantidad, 0);
});
