import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../domain/errors/ErrorCoordinacion.js';
import type { SolicitudAceptarRelevo, SolicitudProponerRelevo } from '../../domain/repositories/IIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { IncidenteDAOSupabase } from './IncidenteDAOSupabase.js';

const ANA = '22222222-2222-4222-8222-222222222222';
const BETO = '44444444-4444-4444-8444-444444444444';
const CARLA = '66666666-6666-4666-8666-666666666666';
const EXPEDICION = '11111111-1111-4111-8111-111111111111';
const RELEVO = '77777777-7777-4777-8777-777777777777';

const proponer: SolicitudProponerRelevo = {
  expedicionId: EXPEDICION,
  rescatistaId: ANA,
  destinatarioId: BETO,
  motivo: 'Cambio de turno',
  versionIncidente: 1,
  operacionId: '33333333-3333-4333-8333-333333333333',
};
const aceptar: SolicitudAceptarRelevo = {
  expedicionId: EXPEDICION,
  rescatistaId: BETO,
  relevoId: RELEVO,
  operacionId: '88888888-8888-4888-8888-888888888888',
};

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

const resultadoRpc = (extra: Record<string, unknown> = {}, relevo: Record<string, unknown> = {}) => ({
  id: '55555555-5555-4555-8555-555555555555',
  expedicionId: EXPEDICION,
  estado: 'abierto',
  version: 1,
  responsable: { id: ANA, nombreCompleto: 'Ana Rescate' },
  asumidoEn: '2030-01-15T12:00:00+00:00',
  repetido: false,
  relevo: {
    id: RELEVO,
    estado: 'pendiente',
    responsableAnterior: { id: ANA, nombreCompleto: 'Ana Rescate' },
    destinatario: { id: BETO, nombreCompleto: 'Beto Rescate' },
    motivo: 'Cambio de turno',
    solicitadoEn: '2030-01-15T14:00:00+00:00',
    resueltoEn: null,
    versionIncidente: 1,
    ...relevo,
  },
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

describe('IncidenteDAOSupabase.proponerRelevo', () => {
  it('invoca treksafe_proponer_relevo con sus seis parámetros y mapea el resultado', async () => {
    const { cliente, llamadas } = clienteConRpc({ data: resultadoRpc() });

    const resultado = await new IncidenteDAOSupabase(cliente).proponerRelevo(proponer);

    assert.deepEqual(llamadas, [
      {
        nombre: 'treksafe_proponer_relevo',
        parametros: {
          p_expedicion_id: EXPEDICION,
          p_actor_id: ANA,
          p_destinatario_id: BETO,
          p_motivo: 'Cambio de turno',
          p_version_incidente: 1,
          p_operacion_id: proponer.operacionId,
        },
      },
    ]);
    assert.deepEqual(resultado, {
      incidente: {
        id: '55555555-5555-4555-8555-555555555555',
        expedicionId: EXPEDICION,
        estado: 'abierto',
        version: 1,
        responsableId: ANA,
        nombreResponsable: 'Ana Rescate',
        asumidoEn: '2030-01-15T12:00:00.000Z',
      },
      relevo: {
        id: RELEVO,
        estado: 'pendiente',
        responsableAnteriorId: ANA,
        nombreResponsableAnterior: 'Ana Rescate',
        destinatarioId: BETO,
        nombreDestinatario: 'Beto Rescate',
        motivo: 'Cambio de turno',
        solicitadoEn: '2030-01-15T14:00:00.000Z',
        resueltoEn: null,
        versionIncidente: 1,
      },
      repetido: false,
    });
  });

  it('conserva repetido=true de la RPC', async () => {
    const { cliente } = clienteConRpc({ data: resultadoRpc({ repetido: true }) });
    assert.equal((await new IncidenteDAOSupabase(cliente).proponerRelevo(proponer)).repetido, true);
  });

  const sinDetalle: CodigoErrorRelevo[] = [
    'DATOS_INVALIDOS',
    'INCIDENTE_NO_ENCONTRADO',
    'NO_ES_RESCATISTA',
    'INCIDENTE_CERRADO',
    'NO_ES_RESPONSABLE',
    'DESTINATARIO_INVALIDO',
    'DESTINATARIO_NO_VALIDADO',
  ];
  for (const codigo of sinDetalle) {
    it(`traduce ${codigo} a ErrorCoordinacion sin detalle`, async () => {
      const { cliente } = clienteConRpc({ error: { message: codigo } });
      await assert.rejects(new IncidenteDAOSupabase(cliente).proponerRelevo(proponer), (err) => {
        assert.ok(err instanceof ErrorCoordinacion);
        assert.equal(err.codigo, codigo);
        assert.equal(err.detalle, undefined);
        return true;
      });
    });
  }

  it('traduce VERSION_DESACTUALIZADA y conserva versionActual del DETAIL', async () => {
    const { cliente } = clienteConRpc({
      error: { message: 'VERSION_DESACTUALIZADA', details: JSON.stringify({ versionActual: 4 }) },
    });
    await assert.rejects(new IncidenteDAOSupabase(cliente).proponerRelevo(proponer), (err) => {
      assert.ok(err instanceof ErrorCoordinacion);
      assert.equal(err.codigo, 'VERSION_DESACTUALIZADA');
      assert.deepEqual(err.detalle, { versionActual: 4 });
      return true;
    });
  });

  it('traduce RELEVO_PENDIENTE y mapea el relevo del DETAIL (sin motivo)', async () => {
    const { cliente } = clienteConRpc({
      error: {
        message: 'RELEVO_PENDIENTE',
        details: JSON.stringify({
          relevoId: RELEVO,
          destinatarioId: CARLA,
          nombreDestinatario: 'Carla Rescate',
          solicitadoEn: '2030-01-15T14:00:00+00:00',
        }),
      },
    });
    await assert.rejects(new IncidenteDAOSupabase(cliente).proponerRelevo(proponer), (err) => {
      assert.ok(err instanceof ErrorCoordinacion);
      assert.equal(err.codigo, 'RELEVO_PENDIENTE');
      assert.deepEqual(err.detalle, {
        relevoPendiente: {
          relevoId: RELEVO,
          destinatarioId: CARLA,
          nombreDestinatario: 'Carla Rescate',
          solicitadoEn: '2030-01-15T14:00:00.000Z',
        },
      });
      return true;
    });
  });

  for (const [codigo, details] of [
    ['VERSION_DESACTUALIZADA', undefined],
    ['VERSION_DESACTUALIZADA', 'no es json'],
    ['VERSION_DESACTUALIZADA', JSON.stringify({ versionActual: 'cuatro' })],
    ['RELEVO_PENDIENTE', undefined],
    ['RELEVO_PENDIENTE', JSON.stringify({ relevoId: RELEVO })],
  ] as const) {
    it(`${codigo} con un DETAIL mal formado (${String(details).slice(0, 20)}) da 500`, async () => {
      const { cliente } = clienteConRpc({ error: { message: codigo, details } });
      const registros = await conLogCapturado(async () => {
        await assert.rejects(new IncidenteDAOSupabase(cliente).proponerRelevo(proponer), (err) => {
          assert.ok(err instanceof ErrorAplicacion);
          assert.equal(err.codigoEstado, 500);
          return true;
        });
      });
      assert.equal(registros.length, 1);
    });
  }

  it('un error desconocido de la base da 500, sin exponer su mensaje y sin ser 401', async () => {
    const { cliente } = clienteConRpc({ error: { message: 'permission denied for function treksafe_proponer_relevo' } });
    const registros = await conLogCapturado(async () => {
      await assert.rejects(new IncidenteDAOSupabase(cliente).proponerRelevo(proponer), (err) => {
        assert.ok(err instanceof ErrorAplicacion);
        assert.equal(err.codigoEstado, 500);
        assert.ok(!err.message.includes('permission'));
        return true;
      });
    });
    assert.equal(registros.length, 1);
  });

  for (const [descripcion, data] of [
    ['nula', null],
    ['sin relevo', resultadoRpc({ relevo: undefined })],
    ['con estado de relevo inventado', resultadoRpc({}, { estado: 'cancelado' })],
    ['con fecha de relevo inválida', resultadoRpc({}, { solicitadoEn: 'ayer' })],
    ['con resueltoEn inválido', resultadoRpc({}, { resueltoEn: 'mañana' })],
    ['sin destinatario', resultadoRpc({}, { destinatario: null })],
    ['sin versionIncidente', resultadoRpc({}, { versionIncidente: undefined })],
  ] as const) {
    it(`una respuesta ${descripcion} da 500`, async () => {
      const { cliente } = clienteConRpc({ data });
      await conLogCapturado(async () => {
        await assert.rejects(new IncidenteDAOSupabase(cliente).proponerRelevo(proponer), (err) => {
          assert.ok(err instanceof ErrorAplicacion);
          assert.equal(err.codigoEstado, 500);
          return true;
        });
      });
    });
  }
});

describe('IncidenteDAOSupabase.aceptarRelevo', () => {
  it('invoca treksafe_aceptar_relevo con sus cuatro parámetros, sin versión', async () => {
    const { cliente, llamadas } = clienteConRpc({
      data: resultadoRpc(
        { version: 2, responsable: { id: BETO, nombreCompleto: 'Beto Rescate' } },
        { estado: 'aceptado', resueltoEn: '2030-01-15T15:00:00+00:00' },
      ),
    });

    const resultado = await new IncidenteDAOSupabase(cliente).aceptarRelevo(aceptar);

    assert.deepEqual(llamadas, [
      {
        nombre: 'treksafe_aceptar_relevo',
        parametros: {
          p_expedicion_id: EXPEDICION,
          p_actor_id: BETO,
          p_relevo_id: RELEVO,
          p_operacion_id: aceptar.operacionId,
        },
      },
    ]);
    assert.equal(resultado.incidente.responsableId, BETO);
    assert.equal(resultado.incidente.version, 2);
    assert.equal(resultado.relevo.estado, 'aceptado');
    assert.equal(resultado.relevo.resueltoEn, '2030-01-15T15:00:00.000Z');
  });

  for (const codigo of [
    'DATOS_INVALIDOS',
    'RELEVO_NO_ENCONTRADO',
    'NO_ES_RESCATISTA',
    'NO_ES_DESTINATARIO',
    'RELEVO_YA_RESUELTO',
    'INCIDENTE_CERRADO',
    'DESTINATARIO_NO_VALIDADO',
  ] as const) {
    it(`traduce ${codigo} a ErrorCoordinacion`, async () => {
      const { cliente } = clienteConRpc({ error: { message: codigo } });
      await assert.rejects(new IncidenteDAOSupabase(cliente).aceptarRelevo(aceptar), (err) => {
        assert.ok(err instanceof ErrorCoordinacion);
        assert.equal(err.codigo, codigo);
        return true;
      });
    });
  }

  it('un código que no es de la RPC (por ejemplo, de HU-39) da 500', async () => {
    const { cliente } = clienteConRpc({ error: { message: 'COORDINACION_YA_ASUMIDA' } });
    await conLogCapturado(async () => {
      await assert.rejects(new IncidenteDAOSupabase(cliente).aceptarRelevo(aceptar), (err) => {
        assert.ok(err instanceof ErrorAplicacion);
        assert.equal(err.codigoEstado, 500);
        return true;
      });
    });
  });
});

type PasoConsulta = { paso: string; args: unknown[] };

function clienteConConsulta(data: unknown) {
  const pasos: PasoConsulta[] = [];
  let consultas = 0;
  const cadena = {
    select: (...args: unknown[]) => (pasos.push({ paso: 'select', args }), cadena),
    in: (...args: unknown[]) => (pasos.push({ paso: 'in', args }), cadena),
    neq: (...args: unknown[]) => {
      pasos.push({ paso: 'neq', args });
      return Promise.resolve({ data, error: null });
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

describe('IncidenteDAOSupabase.leerCoordinaciones: relevo pendiente', () => {
  const relevoEmbebido = (extra: Record<string, unknown> = {}) => ({
    id: RELEVO,
    estado: 'pendiente',
    destinatario_id: BETO,
    responsable_anterior_id: ANA,
    solicitado_en: '2030-01-15T14:00:00+00:00',
    motivo: 'Cambio de turno',
    perfiles_rescatista: { nombre_completo: 'Beto Rescate' },
    ...extra,
  });
  const fila = (relevos: unknown) => ({
    id: 'inc-1',
    expedicion_id: 'e1',
    version: 2,
    responsable_id: ANA,
    asumido_en: '2030-01-15T12:00:00+00:00',
    perfiles_rescatista: { nombre_completo: 'Ana Rescate' },
    relevos_coordinacion: relevos,
  });

  it('sigue siendo una sola consulta e incluye los relevos embebidos con la pista de la clave foránea y sin datos médicos', async () => {
    const { cliente, pasos, consultas } = clienteConConsulta([]);
    await new IncidenteDAOSupabase(cliente).leerCoordinaciones(['e1'], ANA);
    assert.equal(consultas(), 1);
    const seleccion = String(pasos.find((p) => p.paso === 'select')?.args[0]);
    assert.ok(seleccion.includes('relevos_coordinacion ('));
    assert.ok(seleccion.includes('perfiles_rescatista!fk_relevos_destinatario'));
    assert.ok(!seleccion.includes('*'));
    assert.ok(!/ficha|medic|sangre|alergi|condicion/i.test(seleccion));
  });

  it('sin relevos (o solo aceptados) la coordinación no lleva la clave relevoPendiente', async () => {
    for (const relevos of [[], null, undefined, [relevoEmbebido({ estado: 'aceptado' })]]) {
      const { cliente } = clienteConConsulta([fila(relevos)]);
      const coordinacion = (await new IncidenteDAOSupabase(cliente).leerCoordinaciones(['e1'], ANA)).get('e1');
      assert.deepEqual(Object.keys(coordinacion ?? {}).sort(), [
        'asumidoEn', 'esMia', 'incidenteId', 'nombreResponsable', 'responsableId', 'version',
      ]);
    }
  });

  it('el relevo pendiente lo ven todos; el motivo solo el responsable y el destinatario', async () => {
    const datos = [fila([relevoEmbebido({ estado: 'aceptado', id: 'viejo' }), relevoEmbebido()])];
    const leer = async (quien: string) =>
      (await new IncidenteDAOSupabase(clienteConConsulta(datos).cliente).leerCoordinaciones(['e1'], quien)).get('e1')
        ?.relevoPendiente;
    const base = {
      relevoId: RELEVO,
      destinatarioId: BETO,
      nombreDestinatario: 'Beto Rescate',
      solicitadoEn: '2030-01-15T14:00:00.000Z',
    };
    assert.deepEqual(await leer(ANA), { ...base, esParaMi: false, motivo: 'Cambio de turno' });
    assert.deepEqual(await leer(BETO), { ...base, esParaMi: true, motivo: 'Cambio de turno' });
    assert.deepEqual(await leer(CARLA), { ...base, esParaMi: false });
  });

  it('acepta el perfil del destinatario como arreglo y usa un nombre por defecto si falta', async () => {
    const comoArreglo = [fila([relevoEmbebido({ perfiles_rescatista: [{ nombre_completo: 'Beto Rescate' }] })])];
    const sinPerfil = [fila([relevoEmbebido({ perfiles_rescatista: null })])];
    const a = (await new IncidenteDAOSupabase(clienteConConsulta(comoArreglo).cliente).leerCoordinaciones(['e1'], CARLA)).get('e1');
    const b = (await new IncidenteDAOSupabase(clienteConConsulta(sinPerfil).cliente).leerCoordinaciones(['e1'], CARLA)).get('e1');
    assert.equal(a?.relevoPendiente?.nombreDestinatario, 'Beto Rescate');
    assert.equal(b?.relevoPendiente?.nombreDestinatario, 'Rescatista');
  });
});
