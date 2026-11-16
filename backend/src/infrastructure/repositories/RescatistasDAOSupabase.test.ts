import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { RescatistasDAOSupabase } from './RescatistasDAOSupabase.js';

const ACTOR = '22222222-2222-4222-8222-222222222222';

function clienteConPerfiles(respuesta: { data?: unknown; error?: { message: string } }) {
  const llamadas: { tabla?: string; columnas?: string; neq?: unknown[]; order?: unknown[] } = {};
  const consulta = {
    select: (columnas: string) => ((llamadas.columnas = columnas), consulta),
    neq: (...args: unknown[]) => ((llamadas.neq = args), consulta),
    order: async (...args: unknown[]) => {
      llamadas.order = args;
      return { data: respuesta.data ?? null, error: respuesta.error ?? null };
    },
  };
  const cliente = {
    from: (tabla: string) => ((llamadas.tabla = tabla), consulta),
  } as unknown as Pick<SupabaseClient, 'from'>;
  return { cliente, llamadas };
}

describe('RescatistasDAOSupabase.listarElegibles (HU-40)', () => {
  it('consulta solo id y nombre de perfiles_rescatista, excluye al actor y ordena por nombre', async () => {
    const { cliente, llamadas } = clienteConPerfiles({
      data: [
        { usuario_id: 'u1', nombre_completo: 'Beto Rescate' },
        { usuario_id: 'u2', nombre_completo: 'Carla Rescate' },
      ],
    });

    const resultado = await new RescatistasDAOSupabase(cliente).listarElegibles(ACTOR);

    assert.equal(llamadas.tabla, 'perfiles_rescatista');
    assert.equal(llamadas.columnas, 'usuario_id, nombre_completo');
    assert.deepEqual(llamadas.neq, ['usuario_id', ACTOR]);
    assert.deepEqual(llamadas.order, ['nombre_completo', { ascending: true }]);
    assert.deepEqual(resultado, [
      { id: 'u1', nombreCompleto: 'Beto Rescate' },
      { id: 'u2', nombreCompleto: 'Carla Rescate' },
    ]);
  });

  it('descarta filas mal formadas y devuelve lista vacía sin datos', async () => {
    const mal = clienteConPerfiles({ data: [{ usuario_id: 'u1', nombre_completo: null }, { usuario_id: 7, nombre_completo: 'X' }] });
    assert.deepEqual(await new RescatistasDAOSupabase(mal.cliente).listarElegibles(ACTOR), []);
    const nulo = clienteConPerfiles({ data: null });
    assert.deepEqual(await new RescatistasDAOSupabase(nulo.cliente).listarElegibles(ACTOR), []);
  });

  it('un error de la base es un 500 genérico que no filtra el mensaje', async () => {
    const { cliente } = clienteConPerfiles({ error: { message: 'relation secreta no existe' } });
    const original = console.error;
    console.error = () => undefined;
    try {
      await assert.rejects(new RescatistasDAOSupabase(cliente).listarElegibles(ACTOR), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 500);
        assert.doesNotMatch(e.message, /secreta/);
        return true;
      });
    } finally {
      console.error = original;
    }
  });
});
