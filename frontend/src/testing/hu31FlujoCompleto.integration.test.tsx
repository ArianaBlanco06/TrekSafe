import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { iniciarApiPreparacionHttpPruebas } from '../../../backend/src/testing/apiPreparacionHttpPruebas';
import { contextoPostgresPreparacionPruebas } from '../../../backend/src/testing/contextoPostgresPreparacionPruebas';
import { crearPoolEquipoPruebas } from '../../../backend/src/testing/contextoPostgresEquipoPruebas';
import { GestionEquipoExpedicion } from '../pages/PaginaEquipoExpedicion';
import { fuentesEquipoExpedicion, preparacionExpedicionApi } from '../services/preparacionExpedicion';
import { guardarSesion } from '../lib/sesion';

const conexion = process.env.HU31_TEST_DATABASE_URL;

it('HU-31: React, JWT, HTTP, SDK y PostgreSQL conservan marcas y aíslan cuentas', { skip: !conexion, timeout: 25_000 }, async (t) => {
  const pool = crearPoolEquipoPruebas(conexion!);
  const c = await contextoPostgresPreparacionPruebas(pool, t);
  const http = await iniciarApiPreparacionHttpPruebas(t, c.dao, {
    listasDAO: c.listasDAO,
    async obtenerExpedicion(actor, id) {
      return (await pool.query('SELECT id,lugar_fin AS "lugarFin",estado FROM public.expediciones WHERE id=$1 AND senderista_id=$2', [id, actor])).rows[0] ?? null;
    },
  });
  const fetchReal = globalThis.fetch;
  const descriptores = new Map(['window', 'navigator', 'sessionStorage'].map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (clave: string) => storage.get(clave) ?? null,
    setItem: (clave: string, valor: string) => storage.set(clave, valor), removeItem: (clave: string) => storage.delete(clave),
  } });
  globalThis.fetch = (input, opciones) => {
    const url = new URL(String(input), http.origen);
    if (url.origin !== http.origen) throw new Error('Solo se permiten solicitudes a la API local de esta prueba.');
    return fetchReal(url, opciones);
  };
  let arbol: ReactTestRenderer | undefined;
  // Se registra tras la limpieza de usuarios: los after del test se ejecutan en orden.
  t.after(async () => {
    if (arbol) act(() => arbol!.unmount());
    globalThis.fetch = fetchReal;
    for (const [nombre, descriptor] of descriptores) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else Reflect.deleteProperty(globalThis, nombre);
    }
    await pool.end();
  });
  function raiz() { return arbol!.root; }
  async function hasta(criterio: () => boolean) {
    for (let i = 0; i < 250; i++) {
      if (criterio()) return;
      await act(async () => { await esperar(10); });
    }
    assert.fail('La pantalla no alcanzó el estado esperado.');
  }
  async function sesion(actor: string, id: string) {
    guardarSesion(http.tokenPara(actor), { id: actor, correoElectronico: 'fixture@example.invalid', rol: 'senderista' });
    const vista = <MemoryRouter><GestionEquipoExpedicion key={crypto.randomUUID()} expedicionId={id} fuentes={fuentesEquipoExpedicion} /></MemoryRouter>;
    await act(async () => { if (arbol) arbol.update(vista); else arbol = create(vista); });
    await hasta(() => !JSON.stringify(arbol!.toJSON()).includes('Cargando equipo…'));
  }
  function boton(texto: string) {
    const ambito = raiz().findAllByType('dialog')[0] ?? raiz();
    return ambito.findAllByType('button').find((b) => b.children.some((hijo) => typeof hijo === 'string' && hijo.trim() === texto))!;
  }
  async function pulsar(texto: string) { await act(async () => { boton(texto).props.onClick(); }); }
  async function marcar(indice: number, preparado: boolean) {
    await act(async () => { raiz().findAllByType('input')[indice].props.onChange({ target: { checked: preparado } }); });
    await hasta(() => !raiz().findAllByType('input')[0].props.disabled);
  }
  await sesion(c.senderistaA, c.expedicionA);
  act(() => raiz().findByType('select').props.onChange({ target: { value: c.listaA.id } }));
  await pulsar('Asociar lista');
  await pulsar('Confirmar asociación');
  await hasta(() => raiz().findAllByType('input').length === 3 && !raiz().findAllByType('input')[0].props.disabled);
  await marcar(0, true);
  const copia = await preparacionExpedicionApi.obtener(c.expedicionA);
  assert.equal(copia?.obligatoriosPendientes, 1);
  assert.equal((await pool.query('SELECT preparado FROM public.items_preparacion_expedicion WHERE id=$1', [copia!.items[0].id])).rows[0].preparado, true);
  await sesion(c.senderistaA, c.expedicionA);
  assert.equal(raiz().findAllByType('input')[0].props.checked, true);
  await c.actualizarLista(c.senderistaA, c.listaA.id, { nombre: 'Otra temporada', items: [] });
  await c.eliminarLista(c.senderistaA, c.listaA.id);
  await sesion(c.senderistaA, c.expedicionA);
  assert.equal(raiz().findAllByType('input').length, 3);
  assert.match(JSON.stringify(arbol!.toJSON()), /La lista original fue eliminada/);
  await marcar(0, false);
  assert.equal((await preparacionExpedicionApi.obtener(c.expedicionA))?.obligatoriosPendientes, 2);
  await c.cambiarEstado(c.expedicionA, 'completada');
  await sesion(c.senderistaA, c.expedicionA);
  assert.ok(raiz().findAllByType('input').every((input) => input.props.disabled));
  await sesion(c.senderistaB, c.expedicionA);
  assert.match(JSON.stringify(arbol!.toJSON()), /Expedición no encontrada/);
  assert.doesNotMatch(JSON.stringify(arbol!.toJSON()), /Montaña|Casco/);
  await assert.rejects(preparacionExpedicionApi.obtener(c.expedicionA), { status: 404 });
  assert.deepEqual([...storage.keys()].sort(), ['treksafe:offline-scope', 'treksafe:token', 'treksafe:usuario']);
});
