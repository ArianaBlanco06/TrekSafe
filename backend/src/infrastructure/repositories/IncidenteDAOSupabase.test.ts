import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorCoordinacion } from '../../domain/errors/ErrorCoordinacion.js';
import type { SolicitudAsuncion } from '../../domain/repositories/IIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { IncidenteDAOSupabase } from './IncidenteDAOSupabase.js';

const solicitud: SolicitudAsuncion = {
  expedicionId: '11111111-1111-4111-8111-111111111111',
  rescatistaId: '22222222-2222-4222-8222-222222222222',
  operacionId: '33333333-3333-4333-8333-333333333333',
};
const OTRO = '44444444-4444-4444-8444-444444444444';

function clienteConRpc(respuesta: { data?: unknown; error?: { message: string; details?: unknown } }) {
  const llamadas: { nombre: string; parametros: unknown }[] = [];
  const cliente = {
    rpc: async (nombre: string, parametros: unknown) => {
      llamadas.push({ nombre, parametros });
      return { data: respuesta.data ?? null, error: respuesta.error ?? null };
    },
  } as unknown as Pick<SupabaseClient, 'from' | 'rpc'>;
  return { cliente, llamadas };
}

const resultadoRpc = (extra: Record<string, unknown> = {}) => ({
  id: '55555555-5555-4555-8555-555555555555',
  expedicionId: solicitud.expedicionId,
  estado: 'abierto',
  version: 1,
  responsable: { id: solicitud.rescatistaId, nombreCompleto: 'Ana Rescate' },
  asumidoEn: '2030-01-15T12:00:00+00:00',
  repetido: false,
  ...extra,
});

/** Silencia console.error durante `fn` y devuelve lo registrado. */
async function conLogCapturado(fn: () => Promise<void>): Promise<unknown[][]> {
  const original = console.error;
  const registros: unknown[][] = [];
  console.error = (...args: unknown[]) => void registros.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return registros;
}

describe('IncidenteDAOSupabase.asumir', () => {
  it('invoca la RPC con sus tres parámetros y mapea el resultado', async () => {
    const { cliente, llamadas } = clienteConRpc({ data: resultadoRpc() });

    const resultado = await new IncidenteDAOSupabase(cliente).asumir(solicitud);

    assert.deepEqual(llamadas, [
      {
        nombre: 'treksafe_asumir_coordinacion',
        parametros: {
          p_expedicion_id: solicitud.expedicionId,
          p_rescatista_id: solicitud.rescatistaId,
          p_operacion_id: solicitud.operacionId,
        },
      },
    ]);
    assert.deepEqual(resultado, {
      incidente: {
        id: '55555555-5555-4555-8555-555555555555',
        expedicionId: solicitud.expedicionId,
        estado: 'abierto',
        version: 1,
        responsableId: solicitud.rescatistaId,
        nombreResponsable: 'Ana Rescate',
        asumidoEn: '2030-01-15T12:00:00.000Z', // normalizado a ISO en UTC
      },
      repetido: false,
    });
  });

  it('conserva repetido=true de la RPC', async () => {
    const { cliente } = clienteConRpc({ data: resultadoRpc({ repetido: true }) });
    assert.equal((await new IncidenteDAOSupabase(cliente).asumir(solicitud)).repetido, true);
  });

  for (const codigo of ['DATOS_INVALIDOS', 'ALERTA_NO_ENCONTRADA', 'NO_ES_RESCATISTA'] as const) {
    it(`traduce ${codigo} a ErrorCoordinacion sin responsable vigente`, async () => {
      const { cliente } = clienteConRpc({ error: { message: codigo } });
      await assert.rejects(new IncidenteDAOSupabase(cliente).asumir(solicitud), (err) => {
        assert.ok(err instanceof ErrorCoordinacion);
        assert.equal(err.codigo, codigo);
        assert.equal(err.responsableVigente, undefined);
        return true;
      });
    });
  }

  it('traduce COORDINACION_YA_ASUMIDA y convierte {id, nombreCompleto} del DETAIL en {responsableId, nombreResponsable}', async () => {
    const { cliente } = clienteConRpc({
      error: {
        message: 'COORDINACION_YA_ASUMIDA',
        details: JSON.stringify({ id: OTRO, nombreCompleto: 'Beto Rescate' }),
      },
    });
    await assert.rejects(new IncidenteDAOSupabase(cliente).asumir(solicitud), (err) => {
      assert.ok(err instanceof ErrorCoordinacion);
      assert.equal(err.codigo, 'COORDINACION_YA_ASUMIDA');
      assert.deepEqual(err.responsableVigente, { responsableId: OTRO, nombreResponsable: 'Beto Rescate' });
      return true;
    });
  });

  for (const [descripcion, detalle] of [
    ['ausente', undefined],
    ['vacío', ''],
    ['no JSON', 'Rescatista Beto'],
    ['JSON sin forma', '[1,2]'],
    ['JSON nulo', 'null'],
    ['sin id', JSON.stringify({ nombreCompleto: 'Beto' })],
    ['id numérico', JSON.stringify({ id: 7, nombreCompleto: 'Beto' })],
    ['sin nombre', JSON.stringify({ id: OTRO })],
    ['no es texto', 42],
  ] as const) {
    it(`un DETAIL ${descripcion} de COORDINACION_YA_ASUMIDA da 500, nunca 401`, async () => {
      const { cliente } = clienteConRpc({ error: { message: 'COORDINACION_YA_ASUMIDA', details: detalle } });
      const registros = await conLogCapturado(async () => {
        await assert.rejects(new IncidenteDAOSupabase(cliente).asumir(solicitud), (err) => {
          assert.ok(err instanceof ErrorAplicacion);
          assert.equal(err.codigoEstado, 500);
          assert.notEqual(err.codigoEstado, 401);
          return true;
        });
      });
      assert.equal(registros.length, 1);
    });
  }

  it('un error desconocido da 500 sin exponer el mensaje de la base', async () => {
    const mensajeBase = 'relation "public.incidentes" does not exist';
    const { cliente } = clienteConRpc({ error: { message: mensajeBase } });
    const registros = await conLogCapturado(async () => {
      await assert.rejects(new IncidenteDAOSupabase(cliente).asumir(solicitud), (err) => {
        assert.ok(err instanceof ErrorAplicacion);
        assert.equal(err.codigoEstado, 500);
        assert.ok(!err.message.includes('incidentes'));
        assert.ok(!err.message.includes(mensajeBase));
        return true;
      });
    });
    assert.equal(registros.length, 1);
  });

  for (const [descripcion, data] of [
    ['nulo', null],
    ['sin responsable', resultadoRpc({ responsable: null })],
    ['estado inventado', resultadoRpc({ estado: 'otro' })],
    ['fecha inválida', resultadoRpc({ asumidoEn: 'ayer' })],
    ['sin repetido', resultadoRpc({ repetido: undefined })],
  ] as const) {
    it(`una respuesta de la RPC ${descripcion} da 500`, async () => {
      const { cliente } = clienteConRpc({ data });
      await conLogCapturado(async () => {
        await assert.rejects(new IncidenteDAOSupabase(cliente).asumir(solicitud), (err) => {
          assert.ok(err instanceof ErrorAplicacion);
          assert.equal(err.codigoEstado, 500);
          return true;
        });
      });
    });
  }
});

function clienteConConsulta(respuesta: { data?: unknown; error?: { message: string } }) {
  const pasos: { paso: string; args: unknown[] }[] = [];
  let consultas = 0;
  const cadena = {
    select: (...args: unknown[]) => (pasos.push({ paso: 'select', args }), cadena),
    in: (...args: unknown[]) => (pasos.push({ paso: 'in', args }), cadena),
    neq: (...args: unknown[]) => {
      pasos.push({ paso: 'neq', args });
      return Promise.resolve({ data: respuesta.data ?? [], error: respuesta.error ?? null });
    },
  };
  const cliente = {
    from: (tabla: string) => {
      consultas += 1;
      pasos.push({ paso: 'from', args: [tabla] });
      return cadena;
    },
  } as unknown as Pick<SupabaseClient, 'from' | 'rpc'>;
  return { cliente, pasos, consultas: () => consultas };
}

describe('IncidenteDAOSupabase.leerCoordinaciones', () => {
  const fila = (expedicionId: string, responsableId: string, nombre: string | null, extra = {}) => ({
    id: `inc-${expedicionId}`,
    expedicion_id: expedicionId,
    version: 2,
    responsable_id: responsableId,
    asumido_en: '2030-01-15T12:00:00+00:00',
    perfiles_rescatista: nombre === null ? null : { nombre_completo: nombre },
    ...extra,
  });

  it('hace una sola consulta de incidentes no cerrados con columnas explícitas y sin datos médicos', async () => {
    const { cliente, pasos, consultas } = clienteConConsulta({ data: [] });

    await new IncidenteDAOSupabase(cliente).leerCoordinaciones(['e1', 'e2', 'e1'], 'r1');

    assert.equal(consultas(), 1);
    assert.deepEqual(pasos[0], { paso: 'from', args: ['incidentes'] });
    const seleccion = String(pasos.find((p) => p.paso === 'select')?.args[0]);
    assert.ok(!seleccion.includes('*'));
    assert.ok(!/ficha|medic|sangre|alergi|condicion/i.test(seleccion));
    assert.deepEqual(pasos.find((p) => p.paso === 'in')?.args, ['expedicion_id', ['e1', 'e2']]);
    assert.deepEqual(pasos.find((p) => p.paso === 'neq')?.args, ['estado', 'cerrado']);
  });

  it('mapea las filas, calcula esMia y acepta el perfil como objeto o como arreglo', async () => {
    const { cliente } = clienteConConsulta({
      data: [
        fila('e1', 'r1', 'Ana Rescate'),
        { ...fila('e2', 'r2', null), perfiles_rescatista: [{ nombre_completo: 'Beto Rescate' }] },
      ],
    });

    const mapa = await new IncidenteDAOSupabase(cliente).leerCoordinaciones(['e1', 'e2', 'e3'], 'r1');

    assert.deepEqual(mapa.get('e1'), {
      incidenteId: 'inc-e1',
      version: 2,
      responsableId: 'r1',
      nombreResponsable: 'Ana Rescate',
      asumidoEn: '2030-01-15T12:00:00.000Z',
      esMia: true,
    });
    assert.equal(mapa.get('e2')?.nombreResponsable, 'Beto Rescate');
    assert.equal(mapa.get('e2')?.esMia, false);
    assert.equal(mapa.has('e3'), false);
  });

  it('no incluye ninguna clave que no sea del contrato aunque la fila traiga más', async () => {
    const { cliente } = clienteConConsulta({ data: [fila('e1', 'r1', 'Ana', { tipo_sangre: 'O+', estado: 'abierto' })] });
    const coordinacion = (await new IncidenteDAOSupabase(cliente).leerCoordinaciones(['e1'], 'r1')).get('e1');
    assert.deepEqual(Object.keys(coordinacion ?? {}).sort(), [
      'asumidoEn', 'esMia', 'incidenteId', 'nombreResponsable', 'responsableId', 'version',
    ]);
  });

  it('una lista vacía no consulta la base', async () => {
    const { cliente, consultas } = clienteConConsulta({ data: [] });
    const mapa = await new IncidenteDAOSupabase(cliente).leerCoordinaciones([], 'r1');
    assert.equal(mapa.size, 0);
    assert.equal(consultas(), 0);
  });

  it('un error de la base da 500 sin exponer su mensaje', async () => {
    const { cliente } = clienteConConsulta({ error: { message: 'permission denied for table incidentes' } });
    await conLogCapturado(async () => {
      await assert.rejects(new IncidenteDAOSupabase(cliente).leerCoordinaciones(['e1'], 'r1'), (err) => {
        assert.ok(err instanceof ErrorAplicacion);
        assert.equal(err.codigoEstado, 500);
        assert.ok(!err.message.includes('permission'));
        return true;
      });
    });
  });
});
