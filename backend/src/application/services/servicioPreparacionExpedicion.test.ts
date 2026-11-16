import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServicioPreparacionExpedicion } from './servicioPreparacionExpedicion.js';
import { PreparacionExpedicion } from '../../domain/entities/PreparacionExpedicion.js';
import { ErrorPreparacionExpedicion } from '../../domain/errors/ErrorPreparacionExpedicion.js';
import type { IPreparacionExpedicionDAO } from '../../domain/repositories/IPreparacionExpedicionDAO.js';
import { crearContextoPreparacionEnMemoria } from '../../testing/contextoPreparacionEnMemoria.js';

async function preparar() {
  const c = await crearContextoPreparacionEnMemoria();
  return { ...c, servicio: new ServicioPreparacionExpedicion(c.dao) };
}

describe('ServicioPreparacionExpedicion', () => {
  it('consulta, asocia y guarda marcas manteniendo instantáneas independientes', async () => {
    const c = await preparar();
    assert.equal(await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), null);
    const inicial = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const marcada = await c.servicio.establecerPreparado(c.senderistaA, c.expedicionA, inicial.items[0].id, true);
    assert.equal(marcada.obligatoriosPendientes, 1);
    assert.equal(inicial.obligatoriosPendientes, 2);
    assert.deepEqual(await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), marcada);
  });

  it('requiere un actor antes de invocar cualquiera de las operaciones del DAO', async () => {
    let llamadas = 0;
    const inesperada = async (): Promise<never> => { llamadas++; throw new Error('No debe invocarse'); };
    const dao: IPreparacionExpedicionDAO = {
      obtener: inesperada, asociarLista: inesperada, establecerPreparado: inesperada,
    };
    const servicio = new ServicioPreparacionExpedicion(dao);
    for (const actor of ['', ' \t ', null as unknown as string]) {
      const rechazo = { codigoEstado: 401, codigo: 'NO_AUTORIZADO' };
      await assert.rejects(servicio.obtenerPreparacion(actor, 'expedicion'), rechazo);
      await assert.rejects(servicio.asociarLista(actor, 'expedicion', 'lista'), rechazo);
      await assert.rejects(servicio.establecerPreparado(actor, 'expedicion', 'item', true), rechazo);
    }
    assert.equal(llamadas, 0);
  });

  it('traduce expediciones ajenas o inexistentes al mismo error 404 en las tres operaciones', async () => {
    const c = await preparar();
    const copia = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    for (const id of [c.expedicionA, 'inexistente']) {
      const rechazo = { codigoEstado: 404, codigo: 'EXPEDICION_NO_ENCONTRADA' };
      await assert.rejects(c.servicio.obtenerPreparacion(c.senderistaB, id), rechazo);
      await assert.rejects(c.servicio.asociarLista(c.senderistaB, id, c.listaB.id), rechazo);
      await assert.rejects(c.servicio.establecerPreparado(c.senderistaB, id, copia.items[0].id, true), rechazo);
    }
    assert.deepEqual(await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), copia);
  });

  it('traduce la lista ajena y la pertenencia incorrecta de un ítem a errores 404', async () => {
    const c = await preparar();
    await assert.rejects(c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaB.id), {
      codigoEstado: 404, codigo: 'LISTA_EQUIPO_NO_ENCONTRADA',
    });
    const copia = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await assert.rejects(c.servicio.establecerPreparado(c.senderistaA, c.otraExpedicionA, copia.items[0].id, true), {
      codigoEstado: 404, codigo: 'ITEM_PREPARACION_NO_ENCONTRADO',
    });
  });

  it('devuelve conflicto al reemplazar una copia y preserva las marcas existentes', async () => {
    const c = await preparar();
    const copia = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const marcada = await c.servicio.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true);
    await assert.rejects(c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaVaciaA.id), {
      codigoEstado: 409, codigo: 'PREPARACION_YA_ASOCIADA',
    });
    assert.deepEqual(await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), marcada);
  });

  it('revalida el estado después de una lectura y permite seguir consultando', async () => {
    const c = await preparar();
    const copia = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA);
    c.cambiarEstado(c.expedicionA, 'completada');
    c.cambiarEstado(c.otraExpedicionA, 'alerta');
    const rechazo = { codigoEstado: 409, codigo: 'PREPARACION_NO_EDITABLE' };
    await assert.rejects(c.servicio.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true), rechazo);
    await assert.rejects(c.servicio.asociarLista(c.senderistaA, c.otraExpedicionA, c.listaA.id), rechazo);
    assert.deepEqual(await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), copia);
  });

  it('rechaza una marca no booleana antes de llamar al DAO y sin coerción', async () => {
    const c = await preparar();
    const copia = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    let invocado = false;
    c.dao.establecerPreparado = async () => { invocado = true; throw new Error('No debe invocarse'); };
    await assert.rejects(c.servicio.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, 'false' as unknown as boolean), {
      codigoEstado: 400, codigo: 'PREPARADO_INVALIDO',
    });
    assert.equal(invocado, false);
    assert.deepEqual(await c.servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), copia);
  });

  it('no entrega una respuesta de otra cuenta o expedición aunque un DAO defectuoso la devuelva', async () => {
    const c = await preparar();
    const copia = await c.servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    for (const falsa of [
      new PreparacionExpedicion({ ...copia, senderistaId: c.senderistaB }),
      new PreparacionExpedicion({ ...copia, expedicionId: c.otraExpedicionA }),
    ]) {
      const dao: IPreparacionExpedicionDAO = {
        obtener: async () => falsa, asociarLista: async () => falsa, establecerPreparado: async () => falsa,
      };
      const servicio = new ServicioPreparacionExpedicion(dao);
      const rechazo = { codigoEstado: 404, codigo: 'EXPEDICION_NO_ENCONTRADA' };
      await assert.rejects(servicio.obtenerPreparacion(c.senderistaA, c.expedicionA), rechazo);
      await assert.rejects(servicio.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id), rechazo);
      await assert.rejects(servicio.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true), rechazo);
    }
  });

  it('propaga fallos de persistencia en las tres operaciones sin anunciar éxito', async () => {
    const fallo = new Error('Persistencia no disponible');
    const rechazar = async (): Promise<never> => { throw fallo; };
    const servicio = new ServicioPreparacionExpedicion({
      obtener: rechazar, asociarLista: rechazar, establecerPreparado: rechazar,
    });
    const mismoFallo = (error: unknown) => error === fallo;
    await assert.rejects(servicio.obtenerPreparacion('senderista', 'expedicion'), mismoFallo);
    await assert.rejects(servicio.asociarLista('senderista', 'expedicion', 'lista'), mismoFallo);
    await assert.rejects(servicio.establecerPreparado('senderista', 'expedicion', 'item', true), mismoFallo);
  });

  it('no convierte una corrupción del agregado en un error de entrada del usuario', async () => {
    const fallo = new ErrorPreparacionExpedicion('PREPARACION_INVALIDA', 'Datos guardados inválidos');
    const servicio = new ServicioPreparacionExpedicion({
      obtener: async () => { throw fallo; },
      asociarLista: async () => { throw fallo; },
      establecerPreparado: async () => { throw fallo; },
    });
    await assert.rejects(servicio.obtenerPreparacion('senderista', 'expedicion'), (error) => error === fallo);
  });
});
