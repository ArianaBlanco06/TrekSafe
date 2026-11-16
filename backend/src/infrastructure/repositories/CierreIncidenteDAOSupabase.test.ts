import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorCierreIncidente, type CodigoErrorCierreIncidente } from '../../domain/errors/ErrorCierreIncidente.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { CierreIncidenteDAOSupabase } from './CierreIncidenteDAOSupabase.js';

const INCIDENTE = '11111111-1111-4111-8111-111111111111';
const RESCATISTA = '22222222-2222-4222-8222-222222222222';
const COMANDO = '33333333-3333-4333-8333-333333333333';
const ENTRADA = '44444444-4444-4444-8444-444444444444';
const EXPEDICION = '55555555-5555-4555-8555-555555555555';
const INFORME = '66666666-6666-4666-8666-666666666666';

type Respuesta = { data?: unknown; error?: { message: string; details?: unknown } | null };

function cliente(respuesta: Respuesta) {
  const rpcs: { nombre: string; parametros: unknown }[] = [];
  const simulado = {
    rpc: async (nombre: string, parametros: unknown) => {
      rpcs.push({ nombre, parametros });
      return { data: respuesta.data ?? null, error: respuesta.error ?? null };
    },
  } as unknown as Pick<SupabaseClient, 'rpc'>;
  return { cliente: simulado, rpcs };
}

const informeRpc = (extra: Record<string, unknown> = {}) => ({
  id: INFORME, incidenteId: INCIDENTE, expedicionId: EXPEDICION, resultado: 'evacuado', resumen: 'Evacuada',
  cerradoPor: { id: RESCATISTA, nombreCompleto: 'Ana Rescate' },
  cerradoEn: '2030-01-15T12:00:00.123456+00:00', entradaBitacoraId: ENTRADA, estadoExpedicion: 'alerta',
  repetido: false, ...extra,
});

const solicitud = {
  comandoId: COMANDO, incidenteId: INCIDENTE, rescatistaId: RESCATISTA, resultado: 'evacuado' as const, resumen: 'Evacuada',
};

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

describe('CierreIncidenteDAOSupabase', () => {
  it('cerrar llama a treksafe_cerrar_incidente con los parámetros exactos y normaliza cerradoEn a ISO UTC', async () => {
    const { cliente: c, rpcs } = cliente({ data: informeRpc() });
    const { informe, repetido } = await new CierreIncidenteDAOSupabase(c).cerrar(solicitud);
    assert.deepEqual(rpcs, [{
      nombre: 'treksafe_cerrar_incidente',
      parametros: {
        p_incidente_id: INCIDENTE, p_rescatista_id: RESCATISTA, p_resultado: 'evacuado', p_resumen: 'Evacuada', p_comando_id: COMANDO,
      },
    }]);
    assert.equal(repetido, false);
    assert.equal(informe.id, INFORME);
    assert.equal(informe.cerradoPorId, RESCATISTA);
    assert.equal(informe.nombreCerradoPor, 'Ana Rescate');
    assert.equal(informe.cerradoEn, '2030-01-15T12:00:00.123Z');
    assert.equal(informe.estadoExpedicion, 'alerta');
    assert.equal(informe.entradaBitacoraId, ENTRADA);
    assert.equal('repetido' in informe, false);
  });

  it('cerrar propaga repetido=true', async () => {
    const { cliente: c } = cliente({ data: informeRpc({ repetido: true }) });
    assert.equal((await new CierreIncidenteDAOSupabase(c).cerrar(solicitud)).repetido, true);
  });

  it('cada código de negocio de la RPC se traduce a ErrorCierreIncidente', async () => {
    const codigos: CodigoErrorCierreIncidente[] = [
      'DATOS_INVALIDOS', 'INCIDENTE_NO_ENCONTRADO', 'INCIDENTE_NO_LOCALIZADO', 'INCIDENTE_CERRADO', 'OPERACION_YA_REGISTRADA',
    ];
    for (const codigo of codigos) {
      const { cliente: c } = cliente({ error: { message: codigo } });
      await assert.rejects(new CierreIncidenteDAOSupabase(c).cerrar(solicitud), (e: unknown) => {
        assert.ok(e instanceof ErrorCierreIncidente);
        assert.equal(e.codigo, codigo);
        assert.equal(e.responsableVigente, undefined);
        return true;
      });
    }
  });

  it('NO_ES_RESPONSABLE lee el responsable vigente del DETAIL; un DETAIL mal formado da 500', async () => {
    const { cliente: c } = cliente({
      error: { message: 'NO_ES_RESPONSABLE', details: JSON.stringify({ id: RESCATISTA, nombreCompleto: 'Beto Rescate' }) },
    });
    await assert.rejects(new CierreIncidenteDAOSupabase(c).cerrar(solicitud), (e: unknown) => {
      assert.ok(e instanceof ErrorCierreIncidente);
      assert.equal(e.codigo, 'NO_ES_RESPONSABLE');
      assert.deepEqual(e.responsableVigente, { responsableId: RESCATISTA, nombreResponsable: 'Beto Rescate' });
      return true;
    });
    for (const details of [undefined, null, 'no es json', '{"id": 5}', '[]', 'null']) {
      const { cliente: malo } = cliente({ error: { message: 'NO_ES_RESPONSABLE', details } });
      let error: unknown;
      await conLogCapturado(async () => {
        error = await new CierreIncidenteDAOSupabase(malo).cerrar(solicitud).catch((e: unknown) => e);
      });
      assert.ok(error instanceof ErrorAplicacion, String(details));
      assert.equal(error.codigoEstado, 500);
    }
  });

  it('un error desconocido da 500 genérico y el log solo lleva el mensaje: nunca details, el resumen ni la solicitud', async () => {
    const secreto = 'Resumen con texto sensible del rescate';
    const { cliente: c } = cliente({
      error: { message: 'fallo inesperado de la base', details: `Failing row contains (${secreto})` },
    });
    let error: unknown;
    const registros = await conLogCapturado(async () => {
      error = await new CierreIncidenteDAOSupabase(c).cerrar({ ...solicitud, resumen: secreto }).catch((e: unknown) => e);
    });
    assert.ok(error instanceof ErrorAplicacion);
    assert.equal(error.codigoEstado, 500);
    assert.ok(!error.message.includes('fallo inesperado'));
    assert.ok(!error.message.includes(secreto));
    assert.equal(registros.length, 1);
    const texto = JSON.stringify(registros);
    assert.ok(texto.includes('fallo inesperado de la base'));
    assert.ok(!texto.includes(secreto));
    assert.ok(!texto.includes(RESCATISTA));
  });

  it('una respuesta con forma inesperada da 500', async () => {
    for (const data of [null, 'texto', {}, informeRpc({ resultado: 'fallecido' }), informeRpc({ estadoExpedicion: 'x' }), informeRpc({ cerradoEn: 'ayer' })]) {
      const { cliente: c } = cliente({ data });
      await conLogCapturado(async () => {
        await assert.rejects(new CierreIncidenteDAOSupabase(c).cerrar(solicitud), (e: unknown) => {
          assert.ok(e instanceof ErrorAplicacion);
          assert.equal(e.codigoEstado, 500);
          return true;
        });
      });
    }
  });

  it('marcarLocalizado llama a treksafe_marcar_incidente_localizado y lee el resultado de coordinación', async () => {
    const { cliente: c, rpcs } = cliente({
      data: {
        id: INCIDENTE, expedicionId: EXPEDICION, estado: 'localizado', version: 2,
        responsable: { id: RESCATISTA, nombreCompleto: 'Ana Rescate' }, asumidoEn: '2030-01-15T10:00:00Z', repetido: false,
      },
    });
    const { incidente, repetido } = await new CierreIncidenteDAOSupabase(c).marcarLocalizado({
      operacionId: COMANDO, incidenteId: INCIDENTE, rescatistaId: RESCATISTA,
    });
    assert.deepEqual(rpcs, [{
      nombre: 'treksafe_marcar_incidente_localizado',
      parametros: { p_incidente_id: INCIDENTE, p_rescatista_id: RESCATISTA, p_operacion_id: COMANDO },
    }]);
    assert.equal(repetido, false);
    assert.deepEqual(incidente, {
      id: INCIDENTE, expedicionId: EXPEDICION, estado: 'localizado', version: 2,
      responsableId: RESCATISTA, nombreResponsable: 'Ana Rescate',
    });
  });

  it('marcarLocalizado traduce los códigos de negocio', async () => {
    const { cliente: c } = cliente({ error: { message: 'INCIDENTE_CERRADO' } });
    await assert.rejects(
      new CierreIncidenteDAOSupabase(c).marcarLocalizado({ operacionId: COMANDO, incidenteId: INCIDENTE, rescatistaId: RESCATISTA }),
      (e: unknown) => e instanceof ErrorCierreIncidente && e.codigo === 'INCIDENTE_CERRADO');
  });

  it('ultimoCierreDeExpedicion llama a la RPC de lectura; null da null y un informe se normaliza', async () => {
    const vacio = cliente({ data: null });
    assert.equal(await new CierreIncidenteDAOSupabase(vacio.cliente).ultimoCierreDeExpedicion(EXPEDICION), null);
    assert.deepEqual(vacio.rpcs, [{ nombre: 'treksafe_leer_ultimo_cierre_incidente', parametros: { p_expedicion_id: EXPEDICION } }]);

    const con = cliente({ data: informeRpc() });
    const informe = await new CierreIncidenteDAOSupabase(con.cliente).ultimoCierreDeExpedicion(EXPEDICION);
    assert.equal(informe?.id, INFORME);
    assert.equal(informe?.cerradoEn, '2030-01-15T12:00:00.123Z');
    assert.equal(informe && 'repetido' in informe, false);
  });

  it('un error en la lectura da 500 genérico', async () => {
    const { cliente: c } = cliente({ error: { message: 'boom' } });
    await conLogCapturado(async () => {
      await assert.rejects(new CierreIncidenteDAOSupabase(c).ultimoCierreDeExpedicion(EXPEDICION), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 500);
        return true;
      });
    });
  });
});
