import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServicioListasEquipo } from './servicioListasEquipo.js';
import { ListasEquipoDAOEnMemoria } from '../../testing/ListasEquipoDAOEnMemoria.js';

function preparar() {
  const dao = new ListasEquipoDAOEnMemoria();
  return { dao, servicio: new ServicioListasEquipo(dao) };
}

const noEncontrada = { codigoEstado: 404, codigo: 'LISTA_EQUIPO_NO_ENCONTRADA' };

describe('ServicioListasEquipo', () => {
  it('crea una lista vacía, la consulta y la incluye solo en el listado del propietario', async () => {
    const { servicio } = preparar();
    const lista = await servicio.crearLista('senderista-a', { nombre: '  Montaña  ', items: [] });
    assert.equal(lista.nombre, 'Montaña');
    assert.equal(lista.senderistaId, 'senderista-a');
    assert.deepEqual(lista.items, []);
    assert.deepEqual(await servicio.obtenerLista('senderista-a', lista.id), lista);
    assert.deepEqual(await servicio.listarListas('senderista-a'), [lista]);
    assert.deepEqual(await servicio.listarListas('senderista-b'), []);
  });

  it('normaliza nombres y conserva la selección de obligatorio y opcional', async () => {
    const { servicio } = preparar();
    const lista = await servicio.crearLista('senderista-a', {
      nombre: 'Montaña',
      items: [{ nombre: '  Casco  ', obligatorio: true }, { nombre: ' Cámara ', obligatorio: false }],
    });
    assert.deepEqual(lista.items.map(({ nombre, obligatorio }) => ({ nombre, obligatorio })), [
      { nombre: 'Casco', obligatorio: true }, { nombre: 'Cámara', obligatorio: false },
    ]);
    assert.notEqual(lista.items[0].id, lista.items[1].id);
  });

  it('edita nombre e ítems, conserva sus ids y permite quitar todos los ítems', async () => {
    const { servicio } = preparar();
    const original = await servicio.crearLista('senderista-a', {
      nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }, { nombre: 'Cámara', obligatorio: false }],
    });
    const editada = await servicio.actualizarLista('senderista-a', original.id, {
      nombre: 'Invierno',
      items: [{ ...original.items[0], nombre: 'Casco nuevo', obligatorio: false }, { nombre: 'Abrigo', obligatorio: true }],
    });
    assert.equal(editada.id, original.id);
    assert.equal(editada.nombre, 'Invierno');
    assert.equal(editada.items[0].id, original.items[0].id);
    assert.equal(editada.items[0].obligatorio, false);
    assert.equal(editada.items[1].nombre, 'Abrigo');
    assert.equal(editada.items.some((item) => item.id === original.items[1].id), false);
    const vacia = await servicio.actualizarLista('senderista-a', original.id, { nombre: 'Invierno', items: [] });
    assert.deepEqual(vacia.items, []);
  });

  it('rechaza nombres inválidos sin guardar o alterar listas', async () => {
    const { servicio } = preparar();
    await assert.rejects(servicio.crearLista('senderista-a', { nombre: ' \t ', items: [] }), {
      codigo: 'NOMBRE_LISTA_INVALIDO',
    });
    assert.deepEqual(await servicio.listarListas('senderista-a'), []);
    const original = await servicio.crearLista('senderista-a', { nombre: 'Montaña', items: [] });
    await assert.rejects(servicio.actualizarLista('senderista-a', original.id, {
      nombre: 'Invierno', items: [{ nombre: '', obligatorio: true }],
    }), { codigo: 'NOMBRE_ITEM_INVALIDO' });
    assert.deepEqual(await servicio.obtenerLista('senderista-a', original.id), original);
  });

  it('impide consultar, editar y eliminar una lista ajena sin revelar su existencia', async () => {
    const { servicio } = preparar();
    const propia = await servicio.crearLista('senderista-a', { nombre: 'Montaña', items: [] });
    await assert.rejects(servicio.obtenerLista('senderista-b', propia.id), noEncontrada);
    await assert.rejects(servicio.actualizarLista('senderista-b', propia.id, { nombre: 'Ajena', items: [] }), noEncontrada);
    await assert.rejects(servicio.eliminarLista('senderista-b', propia.id), noEncontrada);
    await assert.rejects(servicio.obtenerLista('senderista-b', 'inexistente'), noEncontrada);
    assert.deepEqual(await servicio.obtenerLista('senderista-a', propia.id), propia);
  });

  it('rechaza ids de ítems al crear para impedir reutilizar identidades ajenas', async () => {
    const { servicio } = preparar();
    await assert.rejects(servicio.crearLista('senderista-a', {
      nombre: 'Montaña', items: [{ id: 'prestado', nombre: 'Casco', obligatorio: true }],
    }), { codigo: 'ITEM_ID_NO_PERMITIDO' });
    assert.deepEqual(await servicio.listarListas('senderista-a'), []);
  });

  it('rechaza ítems de otra lista incluso si ambas listas son del mismo usuario', async () => {
    const { servicio } = preparar();
    const lista = await servicio.crearLista('senderista-a', { nombre: 'Montaña', items: [] });
    const otra = await servicio.crearLista('senderista-a', {
      nombre: 'Invierno', items: [{ nombre: 'Abrigo', obligatorio: true }],
    });
    await assert.rejects(servicio.actualizarLista('senderista-a', lista.id, {
      nombre: 'Montaña modificada', items: [otra.items[0]],
    }), { codigo: 'ITEM_NO_PERTENECE' });
    assert.deepEqual(await servicio.obtenerLista('senderista-a', lista.id), lista);
    assert.deepEqual(await servicio.obtenerLista('senderista-a', otra.id), otra);
  });

  it('rechaza ids de ítems duplicados sin perder el contenido anterior', async () => {
    const { servicio } = preparar();
    const lista = await servicio.crearLista('senderista-a', {
      nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }],
    });
    await assert.rejects(servicio.actualizarLista('senderista-a', lista.id, {
      nombre: 'Duplicada', items: [lista.items[0], lista.items[0]],
    }), { codigo: 'ITEM_DUPLICADO' });
    assert.deepEqual(await servicio.obtenerLista('senderista-a', lista.id), lista);
  });

  it('no acepta cambiar propietario ni identidad mediante campos extra de entrada', async () => {
    const { servicio } = preparar();
    const entrada = { id: 'impuesto', senderistaId: 'senderista-b', nombre: 'Montaña', items: [] };
    const lista = await servicio.crearLista('senderista-a', entrada);
    assert.equal(lista.senderistaId, 'senderista-a');
    assert.notEqual(lista.id, entrada.id);
    const editada = await servicio.actualizarLista('senderista-a', lista.id, entrada);
    assert.equal(editada.senderistaId, 'senderista-a');
    assert.equal(editada.id, lista.id);
  });

  it('requiere actor en todas las operaciones, incluso cuando la lista no existe', async () => {
    const { servicio, dao } = preparar();
    const noAutorizado = { codigoEstado: 401, codigo: 'NO_AUTORIZADO' };
    const datos = { nombre: 'Montaña', items: [] };
    await assert.rejects(servicio.listarListas(' '), noAutorizado);
    await assert.rejects(servicio.obtenerLista('', 'lista'), noAutorizado);
    await assert.rejects(servicio.crearLista('', datos), noAutorizado);
    await assert.rejects(servicio.actualizarLista('', 'lista', datos), noAutorizado);
    await assert.rejects(servicio.eliminarLista('', 'lista'), noAutorizado);
    assert.deepEqual(await dao.listar(''), []);
  });

  it('elimina una lista propia y devuelve ausencia al volver a consultarla o eliminarla', async () => {
    const { servicio } = preparar();
    const lista = await servicio.crearLista('senderista-a', {
      nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }],
    });
    await servicio.eliminarLista('senderista-a', lista.id);
    assert.deepEqual(await servicio.listarListas('senderista-a'), []);
    await assert.rejects(servicio.obtenerLista('senderista-a', lista.id), noEncontrada);
    await assert.rejects(servicio.eliminarLista('senderista-a', lista.id), noEncontrada);
  });

  it('maneja una eliminación entre la lectura y la escritura sin recrear la lista', async () => {
    const { servicio, dao } = preparar();
    const lista = await servicio.crearLista('senderista-a', { nombre: 'Montaña', items: [] });
    const actualizar = dao.actualizar.bind(dao);
    dao.actualizar = async (actor, id, datos) => {
      await dao.eliminar(actor, id);
      return actualizar(actor, id, datos);
    };
    await assert.rejects(servicio.actualizarLista('senderista-a', lista.id, {
      nombre: 'Invierno', items: [],
    }), noEncontrada);
    assert.deepEqual(await servicio.listarListas('senderista-a'), []);
  });

  it('propaga los fallos de persistencia sin anunciar un guardado exitoso', async () => {
    const { servicio, dao } = preparar();
    const fallo = new Error('Persistencia no disponible');
    dao.crear = async () => { throw fallo; };
    await assert.rejects(servicio.crearLista('senderista-a', { nombre: 'Montaña', items: [] }), (err) => err === fallo);
    assert.deepEqual(await servicio.listarListas('senderista-a'), []);
  });
});
