import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { DatosListaEquipo, ListaEquipo } from '../domain/entities/ListaEquipo.js';
import type { IPreparacionExpedicionDAO } from '../domain/repositories/IPreparacionExpedicionDAO.js';

export type ContextoContratoPreparacion = {
  dao: IPreparacionExpedicionDAO;
  senderistaA: string;
  senderistaB: string;
  expedicionA: string;
  otraExpedicionA: string;
  expedicionB: string;
  listaA: ListaEquipo;
  listaB: ListaEquipo;
  listaVaciaA: ListaEquipo;
  cambiarEstado(expedicionId: string, estado: string): void | Promise<void>;
  actualizarLista(senderistaId: string, listaId: string, datos: DatosListaEquipo): void | Promise<void>;
  eliminarLista(senderistaId: string, listaId: string): void | Promise<void>;
};

const INEXISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const expedicionNoEncontrada = { codigo: 'EXPEDICION_NO_ENCONTRADA' };
const itemNoEncontrado = { codigo: 'ITEM_PREPARACION_NO_ENCONTRADO' };

/** Suite reutilizable por el sustituto y por el futuro adaptador SQL real. */
export function verificarContratoPreparacionExpedicionDAO(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoPreparacion | Promise<ContextoContratoPreparacion>,
): void {
  describe(nombre, () => {
    it('distingue una expedición propia sin preparación de una ajena o inexistente', async (t) => {
      const c = await crearContexto(t);
      assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
      await assert.rejects(c.dao.obtener(c.senderistaB, c.expedicionA), expedicionNoEncontrada);
      await assert.rejects(c.dao.obtener(c.senderistaA, INEXISTENTE), expedicionNoEncontrada);
    });

    it('copia contenido y orden con identidades nuevas, marcas falsas y fechas guardadas', async (t) => {
      const c = await crearContexto(t);
      const original = c.listaA;
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, original.id);
      assert.ok(copia.id);
      assert.notEqual(copia.id, original.id);
      assert.equal(copia.expedicionId, c.expedicionA);
      assert.equal(copia.senderistaId, c.senderistaA);
      assert.equal(copia.listaOrigenId, original.id);
      assert.equal(copia.nombreLista, original.nombre);
      assert.equal(new Set(copia.items.map((item) => item.id)).size, original.items.length);
      assert.ok(copia.items.every((item) => !original.items.some((origen) => origen.id === item.id)));
      assert.deepEqual(copia.items.map(({ nombre, obligatorio, preparado }) => ({ nombre, obligatorio, preparado })),
        original.items.map(({ nombre, obligatorio }) => ({ nombre, obligatorio, preparado: false })));
      assert.equal(copia.obligatoriosPendientes, 2);
      assert.ok(Number.isFinite(Date.parse(copia.creadoEn)));
      assert.ok(Number.isFinite(Date.parse(copia.actualizadoEn)));
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
      assert.ok(Object.isFrozen(copia) && Object.isFrozen(copia.items) && Object.isFrozen(copia.items[0]));
    });

    it('asocia una lista vacía y conserva que existe preparación', async (t) => {
      const c = await crearContexto(t);
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaVaciaA.id);
      assert.deepEqual(copia.items, []);
      assert.equal(copia.obligatoriosPendientes, 0);
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
    });

    it('renombrar, editar o eliminar la lista base conserva el contenido y las marcas copiados', async (t) => {
      const c = await crearContexto(t);
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      const marcada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true);
      await c.actualizarLista(c.senderistaA, c.listaA.id, { nombre: 'Otra temporada', items: [] });
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), marcada);
      await c.eliminarLista(c.senderistaA, c.listaA.id);
      const conservada = await c.dao.obtener(c.senderistaA, c.expedicionA);
      assert.ok(conservada);
      assert.equal(conservada.listaOrigenId, null);
      assert.equal(conservada.nombreLista, marcada.nombreLista);
      assert.deepEqual(conservada.items, marcada.items);
      assert.equal(conservada.obligatoriosPendientes, 1);
      assert.equal(conservada.id, marcada.id);
      assert.equal(conservada.creadoEn, marcada.creadoEn);
      const desmarcada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, false);
      assert.equal(desmarcada.obligatoriosPendientes, 2);
    });

    it('marca y desmarca sin invertir reintentos ni contar los opcionales como pendientes', async (t) => {
      const c = await crearContexto(t);
      const inicial = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      const opcional = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, inicial.items[1].id, true);
      assert.equal(opcional.obligatoriosPendientes, 2);
      const marcada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, inicial.items[0].id, true);
      assert.equal(marcada.obligatoriosPendientes, 1);
      assert.equal(inicial.items[0].preparado, false);
      assert.equal(inicial.obligatoriosPendientes, 2);
      assert.deepEqual(await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, inicial.items[0].id, true), marcada);
      const desmarcada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, inicial.items[0].id, false);
      assert.equal(desmarcada.obligatoriosPendientes, 2);
      assert.equal(desmarcada.items[1].preparado, true);
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), desmarcada);
    });

    it('reutilizar la misma lista en dos expediciones no comparte identidades ni marcas', async (t) => {
      const c = await crearContexto(t);
      const a = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      const otra = await c.dao.asociarLista(c.senderistaA, c.otraExpedicionA, c.listaA.id);
      assert.notEqual(a.id, otra.id);
      assert.notEqual(a.items[0].id, otra.items[0].id);
      await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, a.items[0].id, true);
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.otraExpedicionA), otra);
    });

    it('rechaza asociar listas ajenas o inexistentes sin crear una copia parcial', async (t) => {
      const c = await crearContexto(t);
      for (const id of [c.listaB.id, INEXISTENTE]) {
        await assert.rejects(c.dao.asociarLista(c.senderistaA, c.expedicionA, id), { codigo: 'LISTA_EQUIPO_NO_ENCONTRADA' });
      }
      assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    });

    it('oculta expediciones ajenas en todas las operaciones y antes de revelar su estado', async (t) => {
      const c = await crearContexto(t);
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      await c.cambiarEstado(c.expedicionA, 'completada');
      for (const id of [c.expedicionA, INEXISTENTE]) {
        await assert.rejects(c.dao.obtener(c.senderistaB, id), expedicionNoEncontrada);
        await assert.rejects(c.dao.asociarLista(c.senderistaB, id, c.listaB.id), expedicionNoEncontrada);
        await assert.rejects(c.dao.establecerPreparado(c.senderistaB, id, copia.items[0].id, true), expedicionNoEncontrada);
      }
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
    });

    it('rechaza ítems inexistentes y de otra copia, incluso del mismo propietario', async (t) => {
      const c = await crearContexto(t);
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      const otra = await c.dao.asociarLista(c.senderistaA, c.otraExpedicionA, c.listaA.id);
      const ajena = await c.dao.asociarLista(c.senderistaB, c.expedicionB, c.listaB.id);
      for (const itemId of [INEXISTENTE, otra.items[0].id, ajena.items[0].id, c.listaA.items[0].id]) {
        await assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, itemId, true), itemNoEncontrado);
      }
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.otraExpedicionA), otra);
    });

    it('rechaza una segunda asociación y conserva la copia con sus marcas', async (t) => {
      const c = await crearContexto(t);
      const inicial = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      const marcada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, inicial.items[0].id, true);
      for (const listaId of [c.listaA.id, c.listaVaciaA.id]) {
        await assert.rejects(c.dao.asociarLista(c.senderistaA, c.expedicionA, listaId), { codigo: 'PREPARACION_YA_ASOCIADA' });
      }
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), marcada);
    });

    for (const estado of ['programada', 'en_progreso']) {
      it(`permite asociar y marcar en ${estado}`, async (t) => {
        const c = await crearContexto(t);
        await c.cambiarEstado(c.expedicionA, estado);
        const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
        const marcada = await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true);
        assert.equal(marcada.obligatoriosPendientes, 1);
      });
    }

    for (const estado of ['completada', 'alerta']) {
      it(`consulta en ${estado} y revalida el estado al asociar y marcar`, async (t) => {
        const c = await crearContexto(t);
        const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
        await c.cambiarEstado(c.expedicionA, estado);
        const rechazo = { codigo: 'PREPARACION_NO_EDITABLE' };
        await assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true), rechazo);
        assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
        // El esquema permite una sola expedicion activa/alerta por senderista.
        await c.cambiarEstado(c.expedicionA, 'completada');
        await c.cambiarEstado(c.otraExpedicionA, estado);
        await assert.rejects(c.dao.asociarLista(c.senderistaA, c.otraExpedicionA, c.listaA.id), rechazo);
        assert.equal(await c.dao.obtener(c.senderistaA, c.otraExpedicionA), null);
      });
    }

    it('rechaza marcas de tipo incorrecto sin alterar la preparación', async (t) => {
      const c = await crearContexto(t);
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      await assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, 'false' as unknown as boolean), {
        codigo: 'PREPARADO_INVALIDO',
      });
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
    });

    it('dos solicitudes de asociación dejan como máximo una copia sin combinar listas', async (t) => {
      const c = await crearContexto(t);
      const resultados = await Promise.allSettled([
        c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id),
        c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaVaciaA.id),
      ]);
      assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
      const rechazada = resultados.find((r) => r.status === 'rejected');
      assert.equal(rechazada?.reason.codigo, 'PREPARACION_YA_ASOCIADA');
      const ganadora = resultados.find((r) => r.status === 'fulfilled');
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), ganadora?.value);
    });

    it('dos solicitudes de marcas distintas conservan ambas y llegan a cero pendientes', async (t) => {
      const c = await crearContexto(t);
      const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      await Promise.all([
        c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true),
        c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[2].id, true),
      ]);
      const final = await c.dao.obtener(c.senderistaA, c.expedicionA);
      assert.equal(final?.obligatoriosPendientes, 0);
      assert.equal(final?.items[0].preparado, true);
      assert.equal(final?.items[2].preparado, true);
    });
  });
}
