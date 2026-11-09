import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { crearContextoPreparacionEnMemoria } from '../../../testing/contextoPreparacionEnMemoria.js';
import { iniciarApiPreparacionHttpPruebas } from '../../../testing/apiPreparacionHttpPruebas.js';

const inexistente = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
async function preparar(t: TestContext) {
  const c = await crearContextoPreparacionEnMemoria();
  const api = await iniciarApiPreparacionHttpPruebas(t, c.dao);
  const tokenA = api.tokenPara(c.senderistaA);
  return { ...c, ...api, tokenA, ruta: `/${c.expedicionA}/equipo` };
}

describe('API HU-31: JWT real y preparación en memoria', () => {
  it('consulta sin copia, asocia, marca y recupera contador y marcas por HTTP', async (t) => {
    const c = await preparar(t);
    const vacia = await c.pedir('GET', c.ruta, undefined, c.tokenA);
    assert.equal(vacia.estado, 200);
    assert.equal(vacia.cuerpo.preparacion, null);
    const creada = await c.pedir('POST', c.ruta, { listaId: c.listaA.id }, c.tokenA);
    assert.equal(creada.estado, 201);
    const copia = creada.cuerpo.preparacion;
    assert.ok(copia);
    assert.equal(copia.obligatoriosPendientes, 2);
    assert.equal('senderistaId' in copia, false);
    const marcada = await c.pedir('PATCH', `${c.ruta}/items/${copia.items[0].id}`, { preparado: true }, c.tokenA);
    assert.equal(marcada.estado, 200);
    assert.equal(marcada.cuerpo.preparacion?.obligatoriosPendientes, 1);
    const recargada = await c.pedir('GET', c.ruta, undefined, c.tokenA);
    assert.deepEqual(recargada.cuerpo, marcada.cuerpo);
    assert.equal(recargada.headers.get('cache-control'), 'no-store');
    assert.equal(creada.headers.get('cache-control'), 'no-store');
  });

  it('asocia una lista vacía y la distingue de no tener preparación', async (t) => {
    const c = await preparar(t);
    const r = await c.pedir('POST', c.ruta, { listaId: c.listaVaciaA.id }, c.tokenA);
    assert.equal(r.estado, 201);
    assert.ok(r.cuerpo.preparacion);
    assert.deepEqual(r.cuerpo.preparacion.items, []);
    assert.equal(r.cuerpo.preparacion.obligatoriosPendientes, 0);
  });

  it('requiere sesión vigente y rol senderista en las tres rutas', async (t) => {
    const c = await preparar(t);
    const pruebas = [
      ['GET', c.ruta, undefined], ['POST', c.ruta, { listaId: c.listaA.id }],
      ['PATCH', `${c.ruta}/items/${inexistente}`, { preparado: true }],
    ] as const;
    for (const [metodo, ruta, datos] of pruebas) {
      for (const token of [null, 'alterado', c.tokenPara(c.senderistaA, 'senderista', -1)]) {
        assert.equal((await c.pedir(metodo, ruta, datos, token)).estado, 401);
      }
      assert.equal((await c.pedir(metodo, ruta, datos, c.tokenPara(c.senderistaA, 'rescatista'))).estado, 403);
    }
  });

  it('rechaza UUID, tipos y campos extra sin asignar propietario, identidades o marcas desde el cliente', async (t) => {
    const c = await preparar(t);
    for (const datos of [null, {}, { listaId: 'invalido' }, { listaId: c.listaA.id, senderistaId: c.senderistaB },
      { listaId: c.listaA.id, items: [] }, { listaId: c.listaA.id, id: inexistente }]) {
      assert.equal((await c.pedir('POST', c.ruta, datos, c.tokenA)).estado, 400);
    }
    assert.equal((await c.pedir('GET', '/invalido/equipo', undefined, c.tokenA)).estado, 400);
    assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    const copia = (await c.pedir('POST', c.ruta, { listaId: c.listaA.id }, c.tokenA)).cuerpo.preparacion!;
    for (const datos of [{}, { preparado: 'false' }, { preparado: null }, { preparado: 1 },
      { preparado: true, obligatorio: false }, { preparado: true, senderistaId: c.senderistaB }]) {
      assert.equal((await c.pedir('PATCH', `${c.ruta}/items/${copia.items[0].id}`, datos, c.tokenA)).estado, 400);
    }
    assert.equal((await c.pedir('PATCH', `${c.ruta}/items/invalido`, { preparado: true }, c.tokenA)).estado, 400);
    assert.equal((await c.dao.obtener(c.senderistaA, c.expedicionA))?.obligatoriosPendientes, 2);
  });

  it('deriva el actor del token aunque la query intente sustituirlo y oculta expediciones ajenas', async (t) => {
    const c = await preparar(t);
    const tokenB = c.tokenPara(c.senderistaB);
    for (const ruta of [c.ruta, `/${inexistente}/equipo`]) {
      for (const [metodo, sufijo, datos] of [
        ['GET', '', undefined], ['POST', '', { listaId: c.listaB.id }],
        ['PATCH', `/items/${inexistente}`, { preparado: true }],
      ] as const) {
        const r = await c.pedir(metodo, `${ruta}${sufijo}?senderistaId=${c.senderistaA}`, datos, tokenB);
        assert.equal(r.estado, 404);
        assert.equal(r.cuerpo.codigo, 'EXPEDICION_NO_ENCONTRADA');
        assert.equal(r.headers.get('cache-control'), 'no-store');
      }
    }
  });

  it('rechaza una lista ajena y un ítem de otra preparación del mismo usuario', async (t) => {
    const c = await preparar(t);
    const ajena = await c.pedir('POST', c.ruta, { listaId: c.listaB.id }, c.tokenA);
    assert.equal(ajena.estado, 404);
    assert.equal(ajena.cuerpo.codigo, 'LISTA_EQUIPO_NO_ENCONTRADA');
    await c.pedir('POST', c.ruta, { listaId: c.listaA.id }, c.tokenA);
    const otra = await c.dao.asociarLista(c.senderistaA, c.otraExpedicionA, c.listaA.id);
    const r = await c.pedir('PATCH', `${c.ruta}/items/${otra.items[0].id}`, { preparado: true }, c.tokenA);
    assert.equal(r.estado, 404);
    assert.equal(r.cuerpo.codigo, 'ITEM_PREPARACION_NO_ENCONTRADO');
  });

  it('devuelve 409 al reemplazar o escribir en otro estado y mantiene la consulta disponible', async (t) => {
    const c = await preparar(t);
    const copia = (await c.pedir('POST', c.ruta, { listaId: c.listaA.id }, c.tokenA)).cuerpo.preparacion!;
    const reemplazo = await c.pedir('POST', c.ruta, { listaId: c.listaVaciaA.id }, c.tokenA);
    assert.equal(reemplazo.estado, 409);
    assert.equal(reemplazo.cuerpo.codigo, 'PREPARACION_YA_ASOCIADA');
    c.cambiarEstado(c.expedicionA, 'completada');
    const marca = await c.pedir('PATCH', `${c.ruta}/items/${copia.items[0].id}`, { preparado: true }, c.tokenA);
    assert.equal(marca.estado, 409);
    assert.equal(marca.cuerpo.codigo, 'PREPARACION_NO_EDITABLE');
    assert.deepEqual((await c.pedir('GET', c.ruta, undefined, c.tokenA)).cuerpo.preparacion, copia);
  });

  it('no intercepta las rutas de expedición activa ni de confirmar retorno', async (t) => {
    const c = await preparar(t);
    assert.equal((await c.pedir('GET', '/activa')).estado, 200);
    assert.equal((await c.pedir('POST', `/${c.expedicionA}/confirmar-retorno`, {})).estado, 200);
  });

  it('un fallo de persistencia devuelve 500 sin filtrar detalles y permite reintentar', async (t) => {
    const c = await preparar(t);
    const asociar = c.dao.asociarLista.bind(c.dao);
    c.dao.asociarLista = async () => { throw new Error('SQL-clave-privada-fixture'); };
    t.mock.method(console, 'error', () => {});
    const fallo = await c.pedir('POST', c.ruta, { listaId: c.listaA.id }, c.tokenA);
    assert.equal(fallo.estado, 500);
    assert.equal(JSON.stringify(fallo.cuerpo).includes('SQL-clave-privada-fixture'), false);
    assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    c.dao.asociarLista = asociar;
    assert.equal((await c.pedir('POST', c.ruta, { listaId: c.listaA.id }, c.tokenA)).estado, 201);
  });

  it('rechaza JSON malformado con 400 y no-store', async (t) => {
    const c = await preparar(t);
    const r = await fetch(`${c.origen}/api/expediciones${c.ruta}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.tokenA}` }, body: '{',
    });
    assert.equal(r.status, 400);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });
});
