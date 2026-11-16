import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { FichaMedicaIncidenteDAOSupabase } from './FichaMedicaIncidenteDAOSupabase.js';

const INCIDENTE = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const EXPEDICION = '33333333-3333-4333-8333-333333333333';
const SENDERISTA = '44444444-4444-4444-8444-444444444444';
const AUDITORIA = '55555555-5555-4555-8555-555555555555';
const CIFRADO = 'CIFRADO-SECRETO-DAO';

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

const contextoRpc = (extra: Record<string, unknown> = {}) => ({
  actorEsRescatista: true,
  consentimientoVigente: true,
  incidente: { id: INCIDENTE, expedicionId: EXPEDICION, senderistaId: SENDERISTA, estado: 'abierto', responsableId: ACTOR },
  ...extra,
});

const registroRpc = (extra: Record<string, unknown> = {}) => ({
  id: AUDITORIA, incidenteId: INCIDENTE, expedicionId: EXPEDICION, senderistaId: SENDERISTA, actorId: ACTOR,
  resultado: 'permitido', motivo: 'RESPONSABLE_VIGENTE', registradoEn: '2030-01-15T12:00:00.123456+00:00', ...extra,
});

async function conLogCapturado(fn: () => Promise<void>): Promise<string> {
  const original = console.error;
  const registros: unknown[][] = [];
  console.error = (...args: unknown[]) => void registros.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return JSON.stringify(registros);
}

describe('FichaMedicaIncidenteDAOSupabase', () => {
  it('leerContexto llama a treksafe_contexto_ficha_medica con los parámetros exactos y lee el contexto', async () => {
    const { cliente: c, rpcs } = cliente({ data: contextoRpc() });
    const contexto = await new FichaMedicaIncidenteDAOSupabase(c).leerContexto(INCIDENTE, ACTOR);
    assert.deepEqual(rpcs, [{ nombre: 'treksafe_contexto_ficha_medica', parametros: { p_incidente_id: INCIDENTE, p_actor_id: ACTOR } }]);
    assert.deepEqual(contexto, {
      incidenteId: INCIDENTE, actorId: ACTOR, actorEsRescatista: true, consentimientoVigente: true,
      incidente: { id: INCIDENTE, expedicionId: EXPEDICION, senderistaId: SENDERISTA, estado: 'abierto', responsableId: ACTOR },
    });
  });

  it('leerContexto acepta incidente null', async () => {
    const { cliente: c } = cliente({ data: contextoRpc({ incidente: null, consentimientoVigente: false }) });
    const contexto = await new FichaMedicaIncidenteDAOSupabase(c).leerContexto(INCIDENTE, ACTOR);
    assert.equal(contexto.incidente, null);
    assert.equal(contexto.consentimientoVigente, false);
  });

  it('leerSiResponsable llama a treksafe_leer_ficha_cifrada_responsable y devuelve la ficha cifrada; null si la guarda niega', async () => {
    const con = cliente({ data: { tipoSangre: 'AB-', cargaCifrada: CIFRADO } });
    assert.deepEqual(await new FichaMedicaIncidenteDAOSupabase(con.cliente).leerSiResponsable(INCIDENTE, ACTOR), { tipoSangre: 'AB-', cargaCifrada: CIFRADO });
    assert.deepEqual(con.rpcs, [{ nombre: 'treksafe_leer_ficha_cifrada_responsable', parametros: { p_incidente_id: INCIDENTE, p_actor_id: ACTOR } }]);
    const sin = cliente({ data: null });
    assert.equal(await new FichaMedicaIncidenteDAOSupabase(sin.cliente).leerSiResponsable(INCIDENTE, ACTOR), null);
  });

  it('registrar llama a treksafe_registrar_acceso_ficha_medica y normaliza registradoEn a ISO UTC', async () => {
    const { cliente: c, rpcs } = cliente({ data: registroRpc() });
    const registro = await new FichaMedicaIncidenteDAOSupabase(c).registrar({
      incidenteId: INCIDENTE, actorId: ACTOR, resultado: 'permitido', motivo: 'RESPONSABLE_VIGENTE',
    });
    assert.deepEqual(rpcs, [{
      nombre: 'treksafe_registrar_acceso_ficha_medica',
      parametros: { p_incidente_id: INCIDENTE, p_actor_id: ACTOR, p_resultado: 'permitido', p_motivo: 'RESPONSABLE_VIGENTE' },
    }]);
    assert.equal(registro.id, AUDITORIA);
    assert.equal(registro.registradoEn, '2030-01-15T12:00:00.123Z');
    assert.equal(registro.expedicionId, EXPEDICION);
  });

  it('registrar acepta expedición y senderista null (incidente inexistente)', async () => {
    const { cliente: c } = cliente({ data: registroRpc({ expedicionId: null, senderistaId: null, resultado: 'denegado', motivo: 'INCIDENTE_NO_ENCONTRADO' }) });
    const registro = await new FichaMedicaIncidenteDAOSupabase(c).registrar({
      incidenteId: INCIDENTE, actorId: ACTOR, resultado: 'denegado', motivo: 'INCIDENTE_NO_ENCONTRADO',
    });
    assert.equal(registro.expedicionId, null);
    assert.equal(registro.senderistaId, null);
  });

  const formasInvalidas: [string, Respuesta][] = [
    ['contexto sin actorEsRescatista', { data: contextoRpc({ actorEsRescatista: 'si' }) }],
    ['contexto con estado desconocido', { data: contextoRpc({ incidente: { id: INCIDENTE, expedicionId: EXPEDICION, senderistaId: SENDERISTA, estado: 'archivado', responsableId: ACTOR } }) }],
    ['contexto no objeto', { data: 'texto' }],
    ['contexto vacío', { data: null }],
  ];
  for (const [nombre, respuesta] of formasInvalidas) {
    it(`leerContexto con ${nombre} lanza ErrorAplicacion 500 sin exponer detalles`, async () => {
      const { cliente: c } = cliente(respuesta);
      await assert.rejects(new FichaMedicaIncidenteDAOSupabase(c).leerContexto(INCIDENTE, ACTOR), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 500);
        assert.equal(e.message, 'No se pudo completar la consulta de la ficha médica');
        return true;
      });
    });
  }

  it('leerSiResponsable y registrar con una forma inválida lanzan 500', async () => {
    const mala = cliente({ data: { tipoSangre: 'AB-' } });
    await assert.rejects(new FichaMedicaIncidenteDAOSupabase(mala.cliente).leerSiResponsable(INCIDENTE, ACTOR), (e: unknown) => e instanceof ErrorAplicacion && e.codigoEstado === 500);
    for (const extra of [{ resultado: 'quizas' }, { motivo: 'INVENTADO' }, { registradoEn: 'ayer' }, { id: '' }]) {
      const c = cliente({ data: registroRpc(extra) });
      await assert.rejects(
        new FichaMedicaIncidenteDAOSupabase(c.cliente).registrar({ incidenteId: INCIDENTE, actorId: ACTOR, resultado: 'permitido', motivo: 'RESPONSABLE_VIGENTE' }),
        (e: unknown) => e instanceof ErrorAplicacion && e.codigoEstado === 500,
      );
    }
  });

  it('un error de la RPC da 500 y el log solo lleva error.message: nunca details, data ni el texto cifrado', async () => {
    const respuesta: Respuesta = {
      data: { tipoSangre: 'AB-', cargaCifrada: CIFRADO },
      error: { message: 'permission denied for table incidentes', details: `Failing row contains (${CIFRADO})` },
    };
    const registros = await conLogCapturado(async () => {
      const dao = new FichaMedicaIncidenteDAOSupabase(cliente(respuesta).cliente);
      await assert.rejects(dao.leerSiResponsable(INCIDENTE, ACTOR), (e: unknown) => e instanceof ErrorAplicacion && e.codigoEstado === 500);
      await assert.rejects(dao.leerContexto(INCIDENTE, ACTOR), (e: unknown) => e instanceof ErrorAplicacion && e.codigoEstado === 500);
      await assert.rejects(dao.registrar({ incidenteId: INCIDENTE, actorId: ACTOR, resultado: 'denegado', motivo: 'NO_ES_RESPONSABLE' }), (e: unknown) => e instanceof ErrorAplicacion);
    });
    assert.ok(registros.includes('permission denied for table incidentes'));
    assert.ok(!registros.includes(CIFRADO), 'el log no puede llevar el texto cifrado');
    assert.ok(!registros.includes('AB-'));
    assert.ok(!registros.includes('Failing row'));
  });
});
