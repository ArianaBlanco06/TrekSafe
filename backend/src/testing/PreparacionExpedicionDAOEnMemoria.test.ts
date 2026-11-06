import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crearContextoPreparacionEnMemoria } from './contextoPreparacionEnMemoria.js';
import { verificarContratoPreparacionExpedicionDAO } from './contratoPreparacionExpedicionDAO.js';

verificarContratoPreparacionExpedicionDAO('Contrato IPreparacionExpedicionDAO: memoria', () => crearContextoPreparacionEnMemoria());

describe('Preparación en memoria: fallos y límites del sustituto', () => {
  it('un fallo al generar los ítems no guarda una cabecera ni impide reintentar', async () => {
    let llamadas = 0;
    let fallar = true;
    const fallo = new Error('Generación interrumpida');
    const c = await crearContextoPreparacionEnMemoria({
      generarId: () => {
        if (++llamadas === 3 && fallar) throw fallo;
        return `identidad-${llamadas}`;
      },
    });
    await assert.rejects(c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id), (error) => error === fallo);
    assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    fallar = false;
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    assert.equal(copia.items.length, c.listaA.items.length);
    assert.deepEqual(c.listas.get(c.listaA.id), c.listaA);
  });

  it('un fallo al obtener la fecha de guardado conserva la marca y el contador anteriores', async () => {
    let fallar = false;
    const fallo = new Error('Reloj no disponible');
    const c = await crearContextoPreparacionEnMemoria({
      ahora: () => {
        if (fallar) throw fallo;
        return '2026-11-05T15:00:00Z';
      },
    });
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    fallar = true;
    await assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true), (error) => error === fallo);
    assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
  });

  it('las marcas no modifican los datos ni el estado de la expedición origen', async () => {
    const c = await crearContextoPreparacionEnMemoria();
    const expedicionOriginal = c.expediciones.get(c.expedicionA);
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true);
    assert.deepEqual(c.expediciones.get(c.expedicionA), expedicionOriginal);
    assert.deepEqual(c.listas.get(c.listaA.id), c.listaA);
  });

  it('un estado no reconocido tampoco permite guardar una marca que ya era igual', async () => {
    const c = await crearContextoPreparacionEnMemoria();
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    c.cambiarEstado(c.expedicionA, 'cancelada');
    await assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, false), {
      codigo: 'PREPARACION_NO_EDITABLE',
    });
    assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
  });

  it('una petición de marca sin preparación devuelve la misma ausencia de ítem', async () => {
    const c = await crearContextoPreparacionEnMemoria();
    await assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, 'inexistente', true), {
      codigo: 'ITEM_PREPARACION_NO_ENCONTRADO',
    });
    assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
  });
});
