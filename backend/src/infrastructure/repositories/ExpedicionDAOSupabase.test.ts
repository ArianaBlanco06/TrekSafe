import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorCancelacionPlan } from '../../domain/errors/ErrorCancelacionPlan.js';
import { ErrorEdicionPlan } from '../../domain/errors/ErrorEdicionPlan.js';
import type {
  ComandoEditarPlan,
  SolicitudCancelacionPlan,
} from '../../domain/repositories/IExpedicionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ExpedicionDAOSupabase } from './ExpedicionDAOSupabase.js';

const comando: ComandoEditarPlan = {
  expedicionId: 'exp-1',
  senderistaId: 'sen-1',
  versionEsperada: 2,
  operacionId: 'op-1',
  datos: {
    lugarInicio: 'Cebollapampa',
    lugarFin: 'Laguna 69',
    coordenadasInicio: null,
    coordenadasFin: null,
    horaInicio: '2026-12-01T10:00:00.000Z',
    horaRetornoEstimada: '2026-12-01T18:00:00.000Z',
    minutosTolerancia: 30,
    idsContactos: ['c-1'],
    nombresAcompanantes: ['Ana Ríos'],
  },
};

function clienteConRpc(respuesta: { data?: unknown; error?: { message: string; details?: string } }) {
  const llamadas: { nombre: string; parametros: unknown }[] = [];
  const cliente = {
    rpc: async (nombre: string, parametros: unknown) => {
      llamadas.push({ nombre, parametros });
      return { data: respuesta.data ?? null, error: respuesta.error ?? null };
    },
  } as unknown as Pick<SupabaseClient, 'from' | 'rpc'>;
  return { cliente, llamadas };
}

describe('ExpedicionDAOSupabase.editarPlan', () => {
  it('invoca la RPC con sus parámetros y devuelve id y versión', async () => {
    const { cliente, llamadas } = clienteConRpc({ data: { id: 'exp-1', version: 3 } });

    const resultado = await new ExpedicionDAOSupabase(cliente).editarPlan(comando);

    assert.deepEqual(resultado, { id: 'exp-1', version: 3 });
    assert.deepEqual(llamadas, [
      {
        nombre: 'treksafe_editar_expedicion',
        parametros: {
          p_expedicion_id: 'exp-1',
          p_senderista_id: 'sen-1',
          p_version_esperada: 2,
          p_datos: comando.datos,
          p_operacion_id: 'op-1',
        },
      },
    ]);
  });

  it('traduce VERSION_OBSOLETA con la versión actual del DETAIL', async () => {
    const { cliente } = clienteConRpc({ error: { message: 'VERSION_OBSOLETA', details: '7' } });

    await assert.rejects(new ExpedicionDAOSupabase(cliente).editarPlan(comando), (err) => {
      assert.ok(err instanceof ErrorEdicionPlan);
      assert.equal(err.codigo, 'VERSION_OBSOLETA');
      assert.equal(err.versionActual, 7);
      return true;
    });
  });

  for (const codigo of [
    'EXPEDICION_NO_ENCONTRADA',
    'PLAN_NO_EDITABLE',
    'SALIDA_YA_INICIADA',
    'SALIDA_EN_PASADO',
    'RETORNO_INVALIDO',
    'TOLERANCIA_INVALIDA',
    'CONTACTOS_INVALIDOS',
    'DATOS_INVALIDOS',
  ]) {
    it(`traduce ${codigo} a un error de dominio`, async () => {
      const { cliente } = clienteConRpc({ error: { message: codigo } });

      await assert.rejects(new ExpedicionDAOSupabase(cliente).editarPlan(comando), (err) => {
        assert.ok(err instanceof ErrorEdicionPlan);
        assert.equal(err.codigo, codigo);
        assert.equal(err.versionActual, undefined);
        return true;
      });
    });
  }

  it('no expone al cliente un error desconocido de la base', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const { cliente } = clienteConRpc({ error: { message: 'relation secreta does not exist' } });

    await assert.rejects(new ExpedicionDAOSupabase(cliente).editarPlan(comando), (err) => {
      assert.ok(err instanceof ErrorAplicacion);
      assert.equal(err.codigoEstado, 500);
      assert.ok(!err.message.includes('secreta'));
      return true;
    });
  });
});

describe('ExpedicionDAOSupabase.cancelarPlan', () => {
  const solicitud: SolicitudCancelacionPlan = {
    expedicionId: 'exp-1',
    senderistaId: 'sen-1',
    operacionId: 'op-2',
    motivo: 'Lluvia',
  };

  it('invoca la RPC con sus parámetros y devuelve id, versión y estado', async () => {
    const { cliente, llamadas } = clienteConRpc({
      data: { id: 'exp-1', version: 4, estado: 'cancelada' },
    });

    const resultado = await new ExpedicionDAOSupabase(cliente).cancelarPlan(solicitud);

    assert.deepEqual(resultado, { id: 'exp-1', version: 4, estado: 'cancelada' });
    assert.deepEqual(llamadas, [
      {
        nombre: 'treksafe_cancelar_expedicion',
        parametros: {
          p_expedicion_id: 'exp-1',
          p_senderista_id: 'sen-1',
          p_motivo: 'Lluvia',
          p_operacion_id: 'op-2',
        },
      },
    ]);
  });

  for (const codigo of ['EXPEDICION_NO_ENCONTRADA', 'PLAN_NO_CANCELABLE', 'DATOS_INVALIDOS']) {
    it(`traduce ${codigo} a un error de dominio`, async () => {
      const { cliente } = clienteConRpc({ error: { message: codigo } });

      await assert.rejects(new ExpedicionDAOSupabase(cliente).cancelarPlan(solicitud), (err) => {
        assert.ok(err instanceof ErrorCancelacionPlan);
        assert.equal(err.codigo, codigo);
        return true;
      });
    });
  }

  it('no confunde los códigos de edición con los de cancelación', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const { cliente } = clienteConRpc({ error: { message: 'PLAN_NO_EDITABLE' } });

    await assert.rejects(new ExpedicionDAOSupabase(cliente).cancelarPlan(solicitud), (err) => {
      assert.ok(err instanceof ErrorAplicacion);
      assert.equal(err.codigoEstado, 500);
      return true;
    });
  });

  it('no expone al cliente un error desconocido de la base', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const { cliente } = clienteConRpc({ error: { message: 'relation secreta does not exist' } });

    await assert.rejects(new ExpedicionDAOSupabase(cliente).cancelarPlan(solicitud), (err) => {
      assert.ok(err instanceof ErrorAplicacion);
      assert.equal(err.codigoEstado, 500);
      assert.ok(!err.message.includes('secreta'));
      return true;
    });
  });
});
