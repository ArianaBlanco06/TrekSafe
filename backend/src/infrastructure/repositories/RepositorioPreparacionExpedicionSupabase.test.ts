import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { RepositorioPreparacionExpedicionSupabase } from './RepositorioPreparacionExpedicionSupabase.js';
import { crearContextoPreparacionEnMemoria } from '../../testing/contextoPreparacionEnMemoria.js';

function repositorio(transporte: typeof fetch) {
  return new RepositorioPreparacionExpedicionSupabase(createClient('http://127.0.0.1:1', 'clave-ficticia', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transporte },
  }));
}

const errorPersistencia = { codigoEstado: 500, codigo: 'PERSISTENCIA_PREPARACION_FALLIDA', message: 'No se pudo completar la operación de preparación.' };

describe('RepositorioPreparacionExpedicionSupabase: SDK real con transporte sustituido', () => {
  it('serializa las tres RPC y sus parámetros y reconstruye el contador del dominio', async () => {
    const c = await crearContextoPreparacionEnMemoria();
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const llamadas: { nombre: string; parametros: unknown }[] = [];
    const dao = repositorio(async (input, init) => {
      llamadas.push({ nombre: String(input).split('/').at(-1)!, parametros: JSON.parse(String(init?.body)) });
      return Response.json(copia);
    });
    assert.equal((await dao.obtener(c.senderistaA, c.expedicionA))?.obligatoriosPendientes, 2);
    await dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, false);
    assert.deepEqual(llamadas, [
      { nombre: 'treksafe_obtener_preparacion', parametros: { p_senderista_id: c.senderistaA, p_expedicion_id: c.expedicionA } },
      { nombre: 'treksafe_asociar_lista_expedicion', parametros: { p_senderista_id: c.senderistaA, p_expedicion_id: c.expedicionA, p_lista_id: c.listaA.id } },
      { nombre: 'treksafe_establecer_item_preparado', parametros: { p_senderista_id: c.senderistaA, p_expedicion_id: c.expedicionA, p_item_id: copia.items[0].id, p_preparado: false } },
    ]);
  });

  for (const codigo of ['EXPEDICION_NO_ENCONTRADA', 'LISTA_EQUIPO_NO_ENCONTRADA', 'ITEM_PREPARACION_NO_ENCONTRADO',
    'PREPARACION_YA_ASOCIADA', 'PREPARACION_NO_EDITABLE', 'PREPARADO_INVALIDO']) {
    it(`traduce ${codigo} sin devolver el mensaje SQL`, async () => {
      const dao = repositorio(async () => Response.json({ code: 'P0001', details: codigo, message: 'detalle SQL privado' }, { status: 400 }));
      await assert.rejects(dao.asociarLista('actor', 'expedicion', 'lista'), (error: unknown) => {
        assert.ok(error instanceof Error && 'codigo' in error);
        assert.equal(error.codigo, codigo);
        assert.equal(error.message.includes('privado'), false);
        return true;
      });
    });
  }

  it('distingue ausencia en consulta de una respuesta nula imposible al escribir', async () => {
    const dao = repositorio(async () => Response.json(null));
    assert.equal(await dao.obtener('actor', 'expedicion'), null);
    await assert.rejects(dao.asociarLista('actor', 'expedicion', 'lista'), errorPersistencia);
    await assert.rejects(dao.establecerPreparado('actor', 'expedicion', 'item', true), errorPersistencia);
  });

  it('oculta fallos de transporte, SQL desconocido y datos corruptos', async () => {
    for (const transporte of [
      async () => { throw new Error('red interna privada'); },
      async () => Response.json({ code: 'XX000', details: 'privado', message: 'SQL privado' }, { status: 500 }),
      async () => Response.json({ code: 'P0001', details: 'PREPARACION_INVALIDA', message: 'SQL privado' }, { status: 400 }),
      async () => Response.json({ id: 'incompleta', items: [] }),
    ]) {
      await assert.rejects(repositorio(transporte).obtener('actor', 'expedicion'), errorPersistencia);
    }
  });

  it('no convierte una cadena en booleano ni envía una marca inválida al servidor', async () => {
    let invocado = false;
    const dao = repositorio(async () => { invocado = true; return Response.json(null); });
    await assert.rejects(dao.establecerPreparado('actor', 'expedicion', 'item', 'false' as unknown as boolean), { codigo: 'PREPARADO_INVALIDO' });
    assert.equal(invocado, false);
  });
});
