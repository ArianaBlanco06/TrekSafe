import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ItemPreparacion, type EstadoItemPreparacion } from './ItemPreparacion.js';
import { PreparacionExpedicion, type EstadoPreparacionExpedicion } from './PreparacionExpedicion.js';
import { validarEstadoPreparacionEditable } from '../errors/ErrorPreparacionExpedicion.js';

function estadoPreparacion(items: readonly EstadoItemPreparacion[] = []): EstadoPreparacionExpedicion {
  return {
    id: 'preparacion', senderistaId: 'senderista-a', expedicionId: 'expedicion-a',
    listaOrigenId: 'lista-a', nombreLista: '  Montaña  ', items,
    creadoEn: '2026-11-05T12:00:00Z', actualizadoEn: '2026-11-05T12:00:00Z',
  };
}

describe('Preparación de equipo: dominio', () => {
  it('reutiliza las reglas de HU-30 y no acepta un ítem sin identidad guardada', () => {
    assert.throws(() => new ItemPreparacion({ id: 'casco', nombre: ' ', obligatorio: true, preparado: false }), {
      codigo: 'NOMBRE_ITEM_INVALIDO',
    });
    assert.throws(() => new ItemPreparacion({ nombre: 'Casco', obligatorio: true, preparado: false } as EstadoItemPreparacion), {
      codigo: 'ID_ITEM_INVALIDO',
    });
  });

  for (const [indice, preparado] of [undefined, null, 'false', 'true', 0, 1, new Boolean(false)].entries()) {
    it(`rechaza una marca no booleana sin coerción (${indice + 1})`, () => {
      assert.throws(() => new ItemPreparacion({
        id: 'casco', nombre: 'Casco', obligatorio: true, preparado,
      } as EstadoItemPreparacion), { codigo: 'PREPARADO_INVALIDO' });
    });
  }

  it('distingue lista vacía y copia de origen eliminado, ambas con cero pendientes', () => {
    const vacia = new PreparacionExpedicion(estadoPreparacion());
    assert.equal(vacia.nombreLista, 'Montaña');
    assert.equal(vacia.obligatoriosPendientes, 0);
    const eliminada = new PreparacionExpedicion({ ...vacia, listaOrigenId: null });
    assert.equal(eliminada.listaOrigenId, null);
    assert.equal(eliminada.nombreLista, 'Montaña');
  });

  it('deriva los pendientes y descarta un contador impuesto en los datos de entrada', () => {
    const estado = {
      ...estadoPreparacion([
        { id: 'casco', nombre: 'Casco', obligatorio: true, preparado: false },
        { id: 'agua', nombre: 'Agua', obligatorio: true, preparado: true },
        { id: 'camara', nombre: 'Cámara', obligatorio: false, preparado: false },
      ]),
      obligatoriosPendientes: 999,
    };
    assert.equal(new PreparacionExpedicion(estado).obligatoriosPendientes, 1);
  });

  it('no comparte estado mutable ni permite alterar marcas o el contador por fuera del caso de uso', () => {
    const item = { id: 'casco', nombre: ' Casco ', obligatorio: true, preparado: false };
    const items = [item];
    const preparacion = new PreparacionExpedicion(estadoPreparacion(items));
    item.preparado = true;
    item.nombre = 'Alterado';
    items.length = 0;
    assert.equal(preparacion.items[0].nombre, 'Casco');
    assert.equal(preparacion.obligatoriosPendientes, 1);
    assert.equal(Reflect.set(preparacion.items[0], 'preparado', true), false);
    assert.equal(Reflect.set(preparacion.items, 'length', 0), false);
    assert.equal(Reflect.set(preparacion, 'obligatoriosPendientes', 0), false);
  });

  it('rechaza ítems duplicados y una colección ausente', () => {
    const item = { id: 'casco', nombre: 'Casco', obligatorio: true, preparado: false };
    assert.throws(() => new PreparacionExpedicion(estadoPreparacion([item, item])), { codigo: 'ITEM_DUPLICADO' });
    assert.throws(() => new PreparacionExpedicion({ ...estadoPreparacion(), items: null } as unknown as EstadoPreparacionExpedicion), {
      codigo: 'ITEMS_INVALIDOS',
    });
  });

  it('exige identidades propias y una referencia origen válida o nula', () => {
    for (const campo of ['id', 'expedicionId', 'senderistaId', 'listaOrigenId'] as const) {
      assert.throws(() => new PreparacionExpedicion({ ...estadoPreparacion(), [campo]: ' ' }), {
        codigo: 'PREPARACION_INVALIDA',
      });
    }
  });

  it('permite escribir solo en los dos estados acordados, incluso ante estados futuros', () => {
    validarEstadoPreparacionEditable('programada');
    validarEstadoPreparacionEditable('en_progreso');
    for (const estado of ['completada', 'alerta', 'cancelada', '', 'desconocido']) {
      assert.throws(() => validarEstadoPreparacionEditable(estado), { codigo: 'PREPARACION_NO_EDITABLE' });
    }
  });
});
