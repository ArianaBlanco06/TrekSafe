import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ItemEquipo, type DatosItemEquipo, type EstadoItemEquipo } from './ItemEquipo.js';
import { ListaEquipo, type DatosListaEquipo, type EstadoListaEquipo } from './ListaEquipo.js';

const estadoLista = (items: readonly EstadoItemEquipo[] = []): EstadoListaEquipo => ({
  id: 'lista-a',
  senderistaId: 'senderista-a',
  nombre: '  Montaña  ',
  items,
  creadoEn: '2026-11-01T12:00:00.000Z',
  actualizadoEn: '2026-11-01T12:00:00.000Z',
});

describe('ItemEquipo', () => {
  it('normaliza el nombre y conserva obligatorio y opcional sin coerciones', () => {
    const casco = new ItemEquipo({ id: 'casco', nombre: '  Casco  ', obligatorio: true });
    const camara = new ItemEquipo({ id: 'camara', nombre: 'Cámara', obligatorio: false });
    assert.equal(casco.nombre, 'Casco');
    assert.equal(casco.obligatorio, true);
    assert.equal(camara.obligatorio, false);
  });

  for (const nombre of ['', '   ', '\t\n']) {
    it(`rechaza el nombre vacío ${JSON.stringify(nombre)}`, () => {
      assert.throws(() => ItemEquipo.normalizarDatos({ nombre, obligatorio: true }), {
        codigo: 'NOMBRE_ITEM_INVALIDO',
      });
    });
  }

  it('rechaza un indicador obligatorio que no sea booleano', () => {
    const datos = { nombre: 'Casco', obligatorio: 'false' } as unknown as DatosItemEquipo;
    assert.throws(() => ItemEquipo.normalizarDatos(datos), { codigo: 'OBLIGATORIO_INVALIDO' });
  });

  it('rechaza ítems nulos e identificadores vacíos', () => {
    assert.throws(() => ItemEquipo.normalizarDatos(null as unknown as DatosItemEquipo), {
      codigo: 'ITEM_INVALIDO',
    });
    assert.throws(() => ItemEquipo.normalizarDatos({ id: ' ', nombre: 'Casco', obligatorio: true }), {
      codigo: 'ID_ITEM_INVALIDO',
    });
  });

  it('exige identificador al reconstruir un ítem guardado', () => {
    const incompleto = { nombre: 'Casco', obligatorio: true } as EstadoItemEquipo;
    assert.throws(() => new ItemEquipo(incompleto), { codigo: 'ID_ITEM_INVALIDO' });
  });
});

describe('ListaEquipo', () => {
  it('permite una lista sin ítems y normaliza su nombre', () => {
    const lista = new ListaEquipo(estadoLista());
    assert.equal(lista.nombre, 'Montaña');
    assert.deepEqual(lista.items, []);
  });

  for (const nombre of ['', '   ', '\t\n']) {
    it(`rechaza el nombre de lista vacío ${JSON.stringify(nombre)}`, () => {
      assert.throws(() => ListaEquipo.normalizarContenido({ nombre, items: [] }), {
        codigo: 'NOMBRE_LISTA_INVALIDO',
      });
    });
  }

  it('rechaza una colección ausente o con ítems inválidos', () => {
    assert.throws(() => ListaEquipo.normalizarContenido({ nombre: 'Montaña' } as DatosListaEquipo), {
      codigo: 'ITEMS_INVALIDOS',
    });
    assert.throws(() => ListaEquipo.normalizarContenido({ nombre: 'Montaña', items: [undefined] } as unknown as DatosListaEquipo), {
      codigo: 'ITEM_INVALIDO',
    });
  });

  it('rechaza identificadores repetidos sin prohibir nombres repetidos', () => {
    const item = { id: 'casco', nombre: 'Casco', obligatorio: true };
    assert.throws(() => ListaEquipo.normalizarContenido({ nombre: 'Montaña', items: [item, item] }), {
      codigo: 'ITEM_DUPLICADO',
    });
    assert.equal(ListaEquipo.normalizarContenido({
      nombre: 'Montaña',
      items: [{ nombre: 'Casco', obligatorio: true }, { nombre: 'Casco', obligatorio: false }],
    }).items.length, 2);
  });

  it('no comparte estado mutable con el formulario ni permite saltarse las reglas', () => {
    const items = [{ id: 'casco', nombre: 'Casco', obligatorio: true }];
    const lista = new ListaEquipo(estadoLista(items));
    items[0].nombre = '';
    items.length = 0;
    assert.equal(lista.items.length, 1);
    assert.equal(lista.items[0].nombre, 'Casco');
    assert.equal(Reflect.set(lista.items[0], 'nombre', ''), false);
    assert.equal(Reflect.set(lista, 'nombre', ''), false);
    assert.equal(Reflect.set(lista.items, 'length', 0), false);
  });
});
