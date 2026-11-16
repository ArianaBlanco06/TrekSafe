import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { IListasEquipoDAO } from '../domain/repositories/IListasEquipoDAO.js';

type ContextoContrato = {
  dao: IListasEquipoDAO;
  senderistaA: string;
  senderistaB: string;
};

const ID_INEXISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** Misma evidencia de comportamiento para el sustituto y el futuro adaptador real. */
export function verificarContratoListasEquipoDAO(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContrato | Promise<ContextoContrato>,
): void {
  describe(nombre, () => {
    it('crea listas vacías con identidad y fechas, y conserva los nombres normalizados', async (t) => {
      const { dao, senderistaA } = await crearContexto(t);
      const lista = await dao.crear(senderistaA, { nombre: '  Montaña  ', items: [] });
      assert.ok(lista.id);
      assert.equal(lista.senderistaId, senderistaA);
      assert.equal(lista.nombre, 'Montaña');
      assert.deepEqual(lista.items, []);
      assert.ok(Number.isFinite(Date.parse(lista.creadoEn)));
      assert.ok(Number.isFinite(Date.parse(lista.actualizadoEn)));
      assert.deepEqual(await dao.buscarPorId(senderistaA, lista.id), lista);
    });

    it('lista y consulta únicamente las listas del propietario', async (t) => {
      const { dao, senderistaA, senderistaB } = await crearContexto(t);
      assert.deepEqual(await dao.listar(senderistaA), []);
      const propia = await dao.crear(senderistaA, { nombre: 'Propia', items: [] });
      await dao.crear(senderistaB, { nombre: 'Ajena', items: [] });
      assert.deepEqual((await dao.listar(senderistaA)).map((lista) => lista.id), [propia.id]);
      assert.equal(await dao.buscarPorId(senderistaB, propia.id), null);
      assert.equal(await dao.buscarPorId(senderistaA, ID_INEXISTENTE), null);
    });

    it('conserva identidad, propietario e ítems retenidos al editar la colección', async (t) => {
      const { dao, senderistaA } = await crearContexto(t);
      const anterior = await dao.crear(senderistaA, {
        nombre: 'Montaña',
        items: [{ nombre: 'Casco', obligatorio: true }, { nombre: 'Cámara', obligatorio: false }],
      });
      const actual = await dao.actualizar(senderistaA, anterior.id, {
        nombre: '  Invierno  ',
        items: [{ ...anterior.items[0], nombre: 'Casco nuevo', obligatorio: false }, { nombre: 'Abrigo', obligatorio: true }],
      });
      assert.ok(actual);
      assert.equal(actual.id, anterior.id);
      assert.equal(actual.senderistaId, anterior.senderistaId);
      assert.equal(actual.creadoEn, anterior.creadoEn);
      assert.equal(actual.nombre, 'Invierno');
      assert.equal(actual.items[0].id, anterior.items[0].id);
      assert.equal(actual.items[0].obligatorio, false);
      assert.equal(actual.items[1].obligatorio, true);
      assert.notEqual(actual.items[1].id, anterior.items[1].id);
      assert.equal(anterior.nombre, 'Montaña');
      assert.equal(anterior.items[0].nombre, 'Casco');
      assert.deepEqual(await dao.buscarPorId(senderistaA, anterior.id), actual);
    });

    it('no modifica ni elimina listas ajenas y devuelve ausencia para ids inexistentes', async (t) => {
      const { dao, senderistaA, senderistaB } = await crearContexto(t);
      const lista = await dao.crear(senderistaA, { nombre: 'Montaña', items: [] });
      assert.equal(await dao.actualizar(senderistaB, lista.id, { nombre: 'Ajena', items: [] }), null);
      assert.equal(await dao.eliminar(senderistaB, lista.id), false);
      assert.equal(await dao.actualizar(senderistaA, ID_INEXISTENTE, { nombre: 'Otra', items: [] }), null);
      assert.equal(await dao.eliminar(senderistaA, ID_INEXISTENTE), false);
      assert.deepEqual(await dao.buscarPorId(senderistaA, lista.id), lista);
    });

    it('rechaza una creación inválida sin guardar listas parciales', async (t) => {
      const { dao, senderistaA } = await crearContexto(t);
      await assert.rejects(dao.crear(senderistaA, {
        nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }, { nombre: '', obligatorio: false }],
      }), { codigo: 'NOMBRE_ITEM_INVALIDO' });
      await assert.rejects(dao.crear(senderistaA, {
        nombre: 'Montaña', items: [{ id: 'prestado', nombre: 'Casco', obligatorio: true }],
      }), { codigo: 'ITEM_ID_NO_PERMITIDO' });
      assert.deepEqual(await dao.listar(senderistaA), []);
    });

    it('rechaza una edición inválida o con un ítem de otra lista sin escrituras parciales', async (t) => {
      const { dao, senderistaA, senderistaB } = await crearContexto(t);
      const lista = await dao.crear(senderistaA, { nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }] });
      const ajena = await dao.crear(senderistaB, { nombre: 'Ajena', items: [{ nombre: 'Abrigo', obligatorio: true }] });
      await assert.rejects(dao.actualizar(senderistaA, lista.id, {
        nombre: 'Cambio inválido', items: [{ nombre: '', obligatorio: false }],
      }), { codigo: 'NOMBRE_ITEM_INVALIDO' });
      await assert.rejects(dao.actualizar(senderistaA, lista.id, {
        nombre: '\u00a0\ufeff', items: [],
      }), { codigo: 'NOMBRE_LISTA_INVALIDO' });
      await assert.rejects(dao.actualizar(senderistaA, lista.id, {
        nombre: 'Cambio ajeno', items: [ajena.items[0]],
      }), { codigo: 'ITEM_NO_PERTENECE' });
      await assert.rejects(dao.actualizar(senderistaA, lista.id, {
        nombre: 'Duplicados', items: [lista.items[0], lista.items[0]],
      }), { codigo: 'ITEM_DUPLICADO' });
      assert.deepEqual(await dao.buscarPorId(senderistaA, lista.id), lista);
      assert.deepEqual(await dao.buscarPorId(senderistaB, ajena.id), ajena);
    });

    it('elimina la lista sin afectar otras y permite vaciar una colección existente', async (t) => {
      const { dao, senderistaA } = await crearContexto(t);
      const lista = await dao.crear(senderistaA, { nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }] });
      const otra = await dao.crear(senderistaA, { nombre: 'Otra', items: [] });
      const vacia = await dao.actualizar(senderistaA, lista.id, { nombre: 'Montaña', items: [] });
      assert.deepEqual(vacia?.items, []);
      assert.equal(await dao.eliminar(senderistaA, lista.id), true);
      assert.equal(await dao.buscarPorId(senderistaA, lista.id), null);
      assert.equal(await dao.eliminar(senderistaA, lista.id), false);
      assert.deepEqual(await dao.buscarPorId(senderistaA, otra.id), otra);
    });
  });
}
