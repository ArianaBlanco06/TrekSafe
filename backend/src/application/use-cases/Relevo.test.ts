import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorCoordinacion,
  type CodigoErrorRelevo,
} from '../../domain/errors/ErrorCoordinacion.js';
import type { Incidente, IRelevoDAO } from '../../domain/repositories/IIncidenteDAO.js';
import { IncidenteDAOMemoria } from '../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ComandoAceptarRelevo } from '../commands/ComandoAceptarRelevo.js';
import { ComandoCancelarRelevo } from '../commands/ComandoCancelarRelevo.js';
import { ComandoProponerRelevo } from '../commands/ComandoProponerRelevo.js';
import { ComandoRechazarRelevo } from '../commands/ComandoRechazarRelevo.js';
import { AceptarRelevo } from './AceptarRelevo.js';
import { CancelarRelevo } from './CancelarRelevo.js';
import { ProponerRelevo } from './ProponerRelevo.js';
import { RechazarRelevo } from './RechazarRelevo.js';
import { RESPUESTAS_RELEVO } from './respuestasRelevo.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // responsable
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // destinatario
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SIN_PERFIL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ALERTA = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const SIN_INCIDENTE = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const CERRADA = 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3';

const incidente = (expedicionId: string, estado: Incidente['estado'], id: string): Incidente => ({
  id,
  expedicionId,
  estado,
  version: 1,
  responsableId: ANA,
  nombreResponsable: 'Ana Rescate',
  asumidoEn: '2030-01-15T12:00:00.000Z',
});

const proponerCmd = (rescatista: string, extra: Record<string, unknown> = {}, expedicion = ALERTA) =>
  ComandoProponerRelevo.crear(rescatista, expedicion, {
    operacionId: crypto.randomUUID(),
    destinatarioId: BETO,
    motivo: 'Cambio de turno',
    versionIncidente: 1,
    ...extra,
  });
const aceptarCmd = (rescatista: string, relevoId: string, expedicion = ALERTA, operacionId = crypto.randomUUID()) =>
  ComandoAceptarRelevo.crear(rescatista, expedicion, relevoId, { operacionId });

const rechazarCmd = (rescatista: string, relevoId: string, expedicion = ALERTA, operacionId = crypto.randomUUID()) =>
  ComandoRechazarRelevo.crear(rescatista, expedicion, relevoId, { operacionId });
const cancelarCmd = (rescatista: string, relevoId: string, expedicion = ALERTA, operacionId = crypto.randomUUID()) =>
  ComandoCancelarRelevo.crear(rescatista, expedicion, relevoId, { operacionId });

/** Verifica que el rechazo sea un ErrorAplicacion con ese estado, código y extras. */
const rechazo = (estado: number, codigo: string, extras?: Record<string, unknown>) => (e: unknown) => {
  assert.ok(e instanceof ErrorAplicacion, `se esperaba ErrorAplicacion y llegó ${String(e)}`);
  assert.equal(e.codigoEstado, estado);
  assert.equal(e.codigo, codigo);
  assert.deepEqual(e.extras, extras);
  return true;
};

describe('ProponerRelevo, AceptarRelevo, RechazarRelevo y CancelarRelevo (HU-40)', () => {
  let dao: IncidenteDAOMemoria;
  let proponer: ProponerRelevo;
  let aceptar: AceptarRelevo;
  let rechazar: RechazarRelevo;
  let cancelar: CancelarRelevo;

  beforeEach(() => {
    dao = new IncidenteDAOMemoria(
      new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate'], [CARLA, 'Carla Rescate']]),
      new Map(),
    );
    dao.sembrar(incidente(ALERTA, 'abierto', '00000000-0000-4000-8000-000000000001'));
    dao.sembrar(incidente(CERRADA, 'cerrado', '00000000-0000-4000-8000-000000000003'));
    proponer = new ProponerRelevo(dao);
    aceptar = new AceptarRelevo(dao);
    rechazar = new RechazarRelevo(dao);
    cancelar = new CancelarRelevo(dao);
  });

  describe('ProponerRelevo', () => {
    it('CA-01: el responsable propone y el relevo queda pendiente; el caso no cambia', async () => {
      const { incidente: inc, relevo, repetido } = await proponer.ejecutar(proponerCmd(ANA));
      assert.equal(repetido, false);
      assert.equal(relevo.estado, 'pendiente');
      assert.equal(relevo.destinatarioId, BETO);
      assert.equal(inc.responsableId, ANA);
      assert.equal(inc.version, 1);
    });

    it('repetir la misma operación devuelve el mismo relevo', async () => {
      const comando = proponerCmd(ANA);
      const a = await proponer.ejecutar(comando);
      const b = await proponer.ejecutar(comando);
      assert.equal(b.repetido, true);
      assert.equal(b.relevo.id, a.relevo.id);
      assert.equal(dao.relevos.length, 1);
    });

    it('un actor que no es el responsable recibe 403 NO_ES_RESPONSABLE y no se crea nada', async () => {
      await assert.rejects(proponer.ejecutar(proponerCmd(CARLA)), rechazo(403, 'NO_ES_RESPONSABLE'));
      assert.equal(dao.relevos.length, 0);
    });

    it('quien no es rescatista validado recibe 403 NO_ES_RESCATISTA', async () => {
      await assert.rejects(proponer.ejecutar(proponerCmd(SIN_PERFIL)), rechazo(403, 'NO_ES_RESCATISTA'));
    });

    it('destinatario igual al actor: 400 DESTINATARIO_INVALIDO; no validado: 400 DESTINATARIO_NO_VALIDADO', async () => {
      await assert.rejects(proponer.ejecutar(proponerCmd(ANA, { destinatarioId: ANA })), rechazo(400, 'DESTINATARIO_INVALIDO'));
      await assert.rejects(
        proponer.ejecutar(proponerCmd(ANA, { destinatarioId: SIN_PERFIL })),
        rechazo(400, 'DESTINATARIO_NO_VALIDADO'),
      );
    });

    it('alerta sin incidente: 404 INCIDENTE_NO_ENCONTRADO; caso cerrado: 409 INCIDENTE_CERRADO', async () => {
      await assert.rejects(proponer.ejecutar(proponerCmd(ANA, {}, SIN_INCIDENTE)), rechazo(404, 'INCIDENTE_NO_ENCONTRADO'));
      await assert.rejects(proponer.ejecutar(proponerCmd(ANA, {}, CERRADA)), rechazo(409, 'INCIDENTE_CERRADO'));
    });

    it('versión desactualizada: 409 VERSION_DESACTUALIZADA con versionActual', async () => {
      await assert.rejects(
        proponer.ejecutar(proponerCmd(ANA, { versionIncidente: 9 })),
        rechazo(409, 'VERSION_DESACTUALIZADA', { versionActual: 1 }),
      );
    });

    it('CA-03: con un relevo pendiente, 409 RELEVO_PENDIENTE con el relevo vigente y sin motivo', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(proponer.ejecutar(proponerCmd(ANA, { destinatarioId: CARLA })), (e) => {
        rechazo(409, 'RELEVO_PENDIENTE', {
          relevoPendiente: {
            relevoId: relevo.id,
            destinatarioId: BETO,
            nombreDestinatario: 'Beto Rescate',
            solicitadoEn: relevo.solicitadoEn,
          },
        })(e);
        assert.ok(!JSON.stringify((e as ErrorAplicacion).extras).includes('Cambio de turno'));
        return true;
      });
    });

    it('un error inesperado del DAO se propaga sin traducirse', async () => {
      const dao500: IRelevoDAO = {
        proponerRelevo: async () => {
          throw new ErrorAplicacion(500, 'fallo interno');
        },
        aceptarRelevo: async () => {
          throw new Error('no se usa');
        },
        rechazarRelevo: async () => {
          throw new Error('no se usa');
        },
        cancelarRelevo: async () => {
          throw new Error('no se usa');
        },
      };
      await assert.rejects(new ProponerRelevo(dao500).ejecutar(proponerCmd(ANA)), rechazo(500, undefined as unknown as string));
    });
  });

  describe('AceptarRelevo', () => {
    it('CA-02: el destinatario acepta; pasa a ser el responsable y la versión sube', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const resultado = await aceptar.ejecutar(aceptarCmd(BETO, relevo.id));
      assert.equal(resultado.repetido, false);
      assert.equal(resultado.incidente.responsableId, BETO);
      assert.equal(resultado.incidente.version, 2);
      assert.equal(resultado.relevo.estado, 'aceptado');
      assert.equal(dao.transferencias.length, 1);
    });

    it('rechazo por actor incorrecto: 403 NO_ES_DESTINATARIO para un tercero y para el responsable anterior', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(aceptar.ejecutar(aceptarCmd(CARLA, relevo.id)), rechazo(403, 'NO_ES_DESTINATARIO'));
      await assert.rejects(aceptar.ejecutar(aceptarCmd(ANA, relevo.id)), rechazo(403, 'NO_ES_DESTINATARIO'));
      assert.equal(dao.filas[0].incidente.responsableId, ANA);
    });

    it('quien no es rescatista validado recibe 403 NO_ES_RESCATISTA', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(aceptar.ejecutar(aceptarCmd(SIN_PERFIL, relevo.id)), rechazo(403, 'NO_ES_RESCATISTA'));
    });

    it('relevo inexistente o de otra alerta: 404 RELEVO_NO_ENCONTRADO', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(aceptar.ejecutar(aceptarCmd(BETO, crypto.randomUUID())), rechazo(404, 'RELEVO_NO_ENCONTRADO'));
      await assert.rejects(aceptar.ejecutar(aceptarCmd(BETO, relevo.id, CERRADA)), rechazo(404, 'RELEVO_NO_ENCONTRADO'));
    });

    it('aceptar dos veces: la misma operación repite (sin escribir); otra da 409 RELEVO_YA_RESUELTO', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const comando = aceptarCmd(BETO, relevo.id);
      await aceptar.ejecutar(comando);
      const repetida = await aceptar.ejecutar(comando);
      assert.equal(repetida.repetido, true);
      await assert.rejects(
        aceptar.ejecutar(aceptarCmd(BETO, relevo.id)),
        rechazo(409, 'RELEVO_YA_RESUELTO', { estadoRelevo: 'aceptado' }),
      );
      assert.equal(dao.transferencias.length, 1);
      assert.equal(dao.filas[0].incidente.version, 2);
    });

    it('un caso cerrado tras la propuesta: 409 INCIDENTE_CERRADO', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      dao.filas[0].incidente = { ...dao.filas[0].incidente, estado: 'cerrado' };
      await assert.rejects(aceptar.ejecutar(aceptarCmd(BETO, relevo.id)), rechazo(409, 'INCIDENTE_CERRADO'));
    });

    it('competencia entre relevos: proponer contra aceptar no deja dos relevos ni dos responsables', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const [propuesta, aceptacion] = await Promise.allSettled([
        proponer.ejecutar(proponerCmd(ANA, { destinatarioId: CARLA })),
        aceptar.ejecutar(aceptarCmd(BETO, relevo.id)),
      ]);
      assert.equal(aceptacion.status, 'fulfilled');
      assert.equal(propuesta.status, 'rejected');
      const { reason } = propuesta as PromiseRejectedResult;
      assert.ok(reason instanceof ErrorAplicacion);
      assert.ok(['NO_ES_RESPONSABLE', 'RELEVO_PENDIENTE'].includes(String(reason.codigo)));
      assert.equal(dao.relevos.length, 1);
      assert.equal(dao.filas[0].incidente.responsableId, BETO);
    });
  });

  describe('RechazarRelevo', () => {
    it('el destinatario rechaza: el relevo queda rechazado y el responsable y la versión no cambian', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const resultado = await rechazar.ejecutar(rechazarCmd(BETO, relevo.id));
      assert.equal(resultado.repetido, false);
      assert.equal(resultado.relevo.estado, 'rechazado');
      assert.equal(resultado.relevo.resueltoPorId, BETO);
      assert.equal(resultado.incidente.responsableId, ANA);
      assert.equal(resultado.incidente.version, 1);
      assert.equal(dao.transferencias.length, 0);
    });

    it('403 NO_ES_DESTINATARIO para quien propuso y para un tercero; 403 NO_ES_RESCATISTA sin perfil', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(rechazar.ejecutar(rechazarCmd(ANA, relevo.id)), rechazo(403, 'NO_ES_DESTINATARIO'));
      await assert.rejects(rechazar.ejecutar(rechazarCmd(CARLA, relevo.id)), rechazo(403, 'NO_ES_DESTINATARIO'));
      await assert.rejects(rechazar.ejecutar(rechazarCmd(SIN_PERFIL, relevo.id)), rechazo(403, 'NO_ES_RESCATISTA'));
      assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
    });

    it('404 RELEVO_NO_ENCONTRADO si no existe o es de otra alerta', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(rechazar.ejecutar(rechazarCmd(BETO, crypto.randomUUID())), rechazo(404, 'RELEVO_NO_ENCONTRADO'));
      await assert.rejects(rechazar.ejecutar(rechazarCmd(BETO, relevo.id, CERRADA)), rechazo(404, 'RELEVO_NO_ENCONTRADO'));
    });

    it('la misma operación repite; otra da 409 RELEVO_YA_RESUELTO con el estado; después se puede proponer otro', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const comando = rechazarCmd(BETO, relevo.id);
      await rechazar.ejecutar(comando);
      assert.equal((await rechazar.ejecutar(comando)).repetido, true);
      await assert.rejects(
        rechazar.ejecutar(rechazarCmd(BETO, relevo.id)),
        rechazo(409, 'RELEVO_YA_RESUELTO', { estadoRelevo: 'rechazado' }),
      );
      await assert.rejects(
        aceptar.ejecutar(aceptarCmd(BETO, relevo.id)),
        rechazo(409, 'RELEVO_YA_RESUELTO', { estadoRelevo: 'rechazado' }),
      );
      const otro = await proponer.ejecutar(proponerCmd(ANA, { destinatarioId: CARLA }));
      assert.equal(otro.relevo.estado, 'pendiente');
    });

    it('un caso cerrado tras la propuesta: 409 INCIDENTE_CERRADO y el relevo no cambia', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      dao.filas[0].incidente = { ...dao.filas[0].incidente, estado: 'cerrado' };
      await assert.rejects(rechazar.ejecutar(rechazarCmd(BETO, relevo.id)), rechazo(409, 'INCIDENTE_CERRADO'));
      assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
    });
  });

  describe('CancelarRelevo', () => {
    it('quien propuso cancela: el relevo queda cancelado y el responsable y la versión no cambian', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const resultado = await cancelar.ejecutar(cancelarCmd(ANA, relevo.id));
      assert.equal(resultado.repetido, false);
      assert.equal(resultado.relevo.estado, 'cancelado');
      assert.equal(resultado.relevo.resueltoPorId, ANA);
      assert.equal(resultado.incidente.responsableId, ANA);
      assert.equal(resultado.incidente.version, 1);
    });

    it('403 NO_ES_PROPONENTE para el destinatario y para un tercero; 403 NO_ES_RESCATISTA sin perfil', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await assert.rejects(cancelar.ejecutar(cancelarCmd(BETO, relevo.id)), rechazo(403, 'NO_ES_PROPONENTE'));
      await assert.rejects(cancelar.ejecutar(cancelarCmd(CARLA, relevo.id)), rechazo(403, 'NO_ES_PROPONENTE'));
      await assert.rejects(cancelar.ejecutar(cancelarCmd(SIN_PERFIL, relevo.id)), rechazo(403, 'NO_ES_RESCATISTA'));
      assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
    });

    it('la misma operación repite; otra da 409 RELEVO_YA_RESUELTO con el estado; después se puede proponer otro', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      const comando = cancelarCmd(ANA, relevo.id);
      await cancelar.ejecutar(comando);
      assert.equal((await cancelar.ejecutar(comando)).repetido, true);
      await assert.rejects(
        cancelar.ejecutar(cancelarCmd(ANA, relevo.id)),
        rechazo(409, 'RELEVO_YA_RESUELTO', { estadoRelevo: 'cancelado' }),
      );
      await assert.rejects(
        aceptar.ejecutar(aceptarCmd(BETO, relevo.id)),
        rechazo(409, 'RELEVO_YA_RESUELTO', { estadoRelevo: 'cancelado' }),
      );
      assert.equal((await proponer.ejecutar(proponerCmd(ANA, { destinatarioId: CARLA }))).relevo.estado, 'pendiente');
    });

    it('un relevo ya aceptado no se cancela: 409 RELEVO_YA_RESUELTO con estado aceptado', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      await aceptar.ejecutar(aceptarCmd(BETO, relevo.id));
      await assert.rejects(
        cancelar.ejecutar(cancelarCmd(ANA, relevo.id)),
        rechazo(409, 'RELEVO_YA_RESUELTO', { estadoRelevo: 'aceptado' }),
      );
      assert.equal(dao.transferencias.length, 1);
    });

    it('un caso cerrado tras la propuesta: 409 INCIDENTE_CERRADO y el relevo no cambia', async () => {
      const { relevo } = await proponer.ejecutar(proponerCmd(ANA));
      dao.filas[0].incidente = { ...dao.filas[0].incidente, estado: 'cerrado' };
      await assert.rejects(cancelar.ejecutar(cancelarCmd(ANA, relevo.id)), rechazo(409, 'INCIDENTE_CERRADO'));
      assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
    });

    it('un error inesperado del DAO se propaga sin traducirse', async () => {
      const dao500 = { cancelarRelevo: async () => { throw new ErrorAplicacion(500, 'fallo interno'); } } as unknown as IRelevoDAO;
      await assert.rejects(new CancelarRelevo(dao500).ejecutar(cancelarCmd(ANA, crypto.randomUUID())), rechazo(500, undefined as unknown as string));
    });
  });

  describe('RESPUESTAS_RELEVO: estados HTTP coherentes con HU-39', () => {
    const esperados: Record<CodigoErrorRelevo, number> = {
      DATOS_INVALIDOS: 400,
      DESTINATARIO_INVALIDO: 400,
      DESTINATARIO_NO_VALIDADO: 400,
      NO_ES_RESCATISTA: 403,
      NO_ES_RESPONSABLE: 403,
      NO_ES_DESTINATARIO: 403,
      NO_ES_PROPONENTE: 403,
      INCIDENTE_NO_ENCONTRADO: 404,
      RELEVO_NO_ENCONTRADO: 404,
      INCIDENTE_CERRADO: 409,
      RELEVO_PENDIENTE: 409,
      VERSION_DESACTUALIZADA: 409,
      RELEVO_YA_RESUELTO: 409,
    };

    it('cada código de la RPC tiene su estado y ninguno es 401', () => {
      assert.deepEqual(Object.keys(RESPUESTAS_RELEVO).sort(), Object.keys(esperados).sort());
      for (const [codigo, estado] of Object.entries(esperados)) {
        assert.equal(RESPUESTAS_RELEVO[codigo as CodigoErrorRelevo].estado, estado, codigo);
        assert.notEqual(RESPUESTAS_RELEVO[codigo as CodigoErrorRelevo].estado, 401);
      }
    });

    it('los códigos que comparte con HU-39 mantienen su estado (400, 403)', () => {
      assert.equal(RESPUESTAS_RELEVO.DATOS_INVALIDOS.estado, 400);
      assert.equal(RESPUESTAS_RELEVO.NO_ES_RESCATISTA.estado, 403);
    });
  });

  it('el error de dominio sigue siendo de la misma clase que el de HU-39', () => {
    assert.ok(new ErrorCoordinacion('COORDINACION_YA_ASUMIDA') instanceof ErrorCoordinacion);
    assert.ok(new ErrorCoordinacion<CodigoErrorRelevo>('RELEVO_PENDIENTE') instanceof ErrorCoordinacion);
  });
});
