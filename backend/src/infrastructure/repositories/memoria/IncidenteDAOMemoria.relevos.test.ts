import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../../domain/errors/ErrorCoordinacion.js';
import type { Incidente } from '../../../domain/repositories/IIncidenteDAO.js';
import { IncidenteDAOMemoria } from './IncidenteDAOMemoria.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // responsable
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // destinatario
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // tercera rescatista
const SIN_PERFIL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const E1 = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const E2 = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'; // sin incidente
const E3 = 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3'; // incidente cerrado
const E4 = 'e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4'; // coordina Beto
const INC1 = '00000000-0000-4000-8000-000000000001';

const incidente = (id: string, expedicionId: string, estado: Incidente['estado'], responsableId = ANA, version = 1): Incidente => ({
  id,
  expedicionId,
  estado,
  version,
  responsableId,
  nombreResponsable: responsableId === ANA ? 'Ana Rescate' : 'Beto Rescate',
  asumidoEn: '2030-01-15T12:00:00.000Z',
});

const proponer = (dao: IncidenteDAOMemoria, extra: Partial<Parameters<IncidenteDAOMemoria['proponerRelevo']>[0]> = {}) =>
  dao.proponerRelevo({
    expedicionId: E1,
    rescatistaId: ANA,
    destinatarioId: BETO,
    motivo: 'Cambio de turno',
    versionIncidente: 1,
    operacionId: randomUUID(),
    ...extra,
  });

const aceptar = (dao: IncidenteDAOMemoria, relevoId: string, extra: Partial<Parameters<IncidenteDAOMemoria['aceptarRelevo']>[0]> = {}) =>
  dao.aceptarRelevo({ expedicionId: E1, rescatistaId: BETO, relevoId, operacionId: randomUUID(), ...extra });

const rechaza = (codigo: CodigoErrorRelevo) => (e: unknown) => {
  assert.ok(e instanceof ErrorCoordinacion, `se esperaba ErrorCoordinacion y llegó ${String(e)}`);
  assert.equal(e.codigo, codigo);
  return true;
};

describe('IncidenteDAOMemoria: relevo de la coordinación (HU-40)', () => {
  let dao: IncidenteDAOMemoria;

  beforeEach(() => {
    dao = new IncidenteDAOMemoria(
      new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate'], [CARLA, 'Carla Rescate']]),
      new Map(),
    );
    dao.sembrar(incidente(INC1, E1, 'abierto', ANA));
    dao.sembrar(incidente('00000000-0000-4000-8000-000000000003', E3, 'cerrado', ANA));
    dao.sembrar(incidente('00000000-0000-4000-8000-000000000004', E4, 'abierto', BETO));
  });

  describe('proponerRelevo', () => {
    it('CA-01: el responsable propone a un rescatista validado; el caso no cambia', async () => {
      const { incidente: inc, relevo, repetido } = await proponer(dao);
      assert.equal(repetido, false);
      assert.equal(relevo.estado, 'pendiente');
      assert.equal(relevo.responsableAnteriorId, ANA);
      assert.equal(relevo.nombreResponsableAnterior, 'Ana Rescate');
      assert.equal(relevo.destinatarioId, BETO);
      assert.equal(relevo.nombreDestinatario, 'Beto Rescate');
      assert.equal(relevo.motivo, 'Cambio de turno');
      assert.equal(relevo.resueltoEn, null);
      assert.equal(relevo.versionIncidente, 1);
      assert.ok(!Number.isNaN(Date.parse(relevo.solicitadoEn)));
      // CA-02: mientras está pendiente, el responsable anterior conserva el caso.
      assert.equal(inc.responsableId, ANA);
      assert.equal(inc.version, 1);
      assert.equal(dao.filas[0].incidente.responsableId, ANA);
      assert.equal(dao.transferencias.length, 0);
    });

    it('es idempotente por operacionId: mismo relevo, repetido y sin escribir', async () => {
      const operacionId = randomUUID();
      const primero = await proponer(dao, { operacionId });
      const segundo = await proponer(dao, { operacionId });
      assert.equal(segundo.repetido, true);
      assert.equal(segundo.relevo.id, primero.relevo.id);
      assert.equal(dao.relevos.length, 1);
    });

    it('una operación ajena (otro actor u otra expedición) no revela nada', async () => {
      const operacionId = randomUUID();
      await proponer(dao, { operacionId });
      await assert.rejects(proponer(dao, { operacionId, rescatistaId: BETO, destinatarioId: CARLA }), rechaza('INCIDENTE_NO_ENCONTRADO'));
      await assert.rejects(
        proponer(dao, { operacionId, expedicionId: E4, rescatistaId: BETO, destinatarioId: ANA }),
        rechaza('INCIDENTE_NO_ENCONTRADO'),
      );
      assert.equal(dao.relevos.length, 1);
    });

    it('rechaza una operación ya usada por una asunción o por otro tipo de operación', async () => {
      await assert.rejects(proponer(dao, { operacionId: dao.filas[0].operacionId }), rechaza('DATOS_INVALIDOS'));
      const otra = randomUUID();
      dao.operacionesDeOtroTipo.add(otra);
      await assert.rejects(proponer(dao, { operacionId: otra }), rechaza('DATOS_INVALIDOS'));
      assert.equal(dao.relevos.length, 0);
    });

    for (const [descripcion, extra, codigo] of [
      ['motivo vacío', { motivo: '   ' }, 'DATOS_INVALIDOS'],
      ['motivo de 281 caracteres', { motivo: 'x'.repeat(281) }, 'DATOS_INVALIDOS'],
      ['versión menor que 1', { versionIncidente: 0 }, 'DATOS_INVALIDOS'],
      ['actor sin perfil de rescatista', { rescatistaId: SIN_PERFIL }, 'NO_ES_RESCATISTA'],
      ['expedición sin incidente', { expedicionId: E2 }, 'INCIDENTE_NO_ENCONTRADO'],
      ['incidente cerrado', { expedicionId: E3 }, 'INCIDENTE_CERRADO'],
      ['actor que no es el responsable', { rescatistaId: CARLA, destinatarioId: BETO }, 'NO_ES_RESPONSABLE'],
      ['destinatario igual al actor', { destinatarioId: ANA }, 'DESTINATARIO_INVALIDO'],
      ['destinatario no validado', { destinatarioId: SIN_PERFIL }, 'DESTINATARIO_NO_VALIDADO'],
    ] as [string, Record<string, unknown>, CodigoErrorRelevo][]) {
      it(`rechaza ${descripcion}: ${codigo}`, async () => {
        await assert.rejects(proponer(dao, extra), rechaza(codigo));
        assert.equal(dao.relevos.length, 0);
      });
    }

    it('versión desactualizada: VERSION_DESACTUALIZADA con la versión vigente', async () => {
      await assert.rejects(proponer(dao, { versionIncidente: 5 }), (e) => {
        rechaza('VERSION_DESACTUALIZADA')(e);
        assert.deepEqual((e as ErrorCoordinacion<CodigoErrorRelevo>).detalle, { versionActual: 1 });
        return true;
      });
    });

    it('CA-03: un segundo relevo con uno pendiente da RELEVO_PENDIENTE con el vigente, sin motivo', async () => {
      const { relevo } = await proponer(dao);
      await assert.rejects(proponer(dao, { destinatarioId: CARLA }), (e) => {
        rechaza('RELEVO_PENDIENTE')(e);
        const pendiente = (e as ErrorCoordinacion<CodigoErrorRelevo>).detalle?.relevoPendiente;
        assert.deepEqual(pendiente, {
          relevoId: relevo.id,
          destinatarioId: BETO,
          nombreDestinatario: 'Beto Rescate',
          solicitadoEn: relevo.solicitadoEn,
        });
        assert.equal('motivo' in (pendiente ?? {}), false);
        return true;
      });
      assert.equal(dao.relevos.length, 1);
    });

    it('dos propuestas simultáneas dejan un solo relevo y la otra recibe RELEVO_PENDIENTE', async () => {
      for (let ronda = 0; ronda < 20; ronda += 1) {
        const incidenteId = randomUUID();
        const expedicionId = randomUUID();
        dao.sembrar(incidente(incidenteId, expedicionId, 'abierto', ANA));
        const resultados = await Promise.allSettled([
          proponer(dao, { expedicionId, destinatarioId: BETO }),
          proponer(dao, { expedicionId, destinatarioId: CARLA }),
        ]);
        const ok = resultados.filter((r) => r.status === 'fulfilled');
        const mal = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        assert.equal(ok.length, 1, `ronda ${ronda}`);
        rechaza('RELEVO_PENDIENTE')(mal[0].reason);
        assert.equal(dao.relevos.filter((r) => r.incidenteId === incidenteId).length, 1);
      }
    });
  });

  describe('aceptarRelevo', () => {
    it('CA-02: aceptar pasa el responsable al destinatario, sube la versión y registra la transferencia', async () => {
      const { relevo: propuesto } = await proponer(dao);
      const { incidente: inc, relevo, repetido } = await aceptar(dao, propuesto.id);
      assert.equal(repetido, false);
      assert.equal(inc.responsableId, BETO);
      assert.equal(inc.nombreResponsable, 'Beto Rescate');
      assert.equal(inc.version, 2);
      assert.equal(relevo.estado, 'aceptado');
      assert.ok(relevo.resueltoEn);
      assert.equal(inc.asumidoEn, relevo.resueltoEn, 'asumidoEn = desde cuándo coordina el responsable actual');
      assert.equal(dao.filas[0].incidente.responsableId, BETO);
      // Ambos responsables, el motivo y la hora quedan registrados.
      assert.deepEqual(dao.transferencias, [
        {
          incidenteId: INC1,
          relevoId: propuesto.id,
          responsableAnteriorId: ANA,
          responsableNuevoId: BETO,
          motivo: 'Cambio de turno',
          versionAnterior: 1,
          versionNueva: 2,
          ocurridoEn: relevo.resueltoEn,
        },
      ]);
    });

    it('aceptar no compara versión: aplica sobre la versión vigente aunque cambiara tras la propuesta', async () => {
      const { relevo } = await proponer(dao);
      dao.filas[0].incidente = { ...dao.filas[0].incidente, version: 4 };
      const resultado = await aceptar(dao, relevo.id);
      assert.equal(resultado.incidente.version, 5);
      assert.equal(resultado.relevo.versionIncidente, 1, 'conserva la versión en la que se propuso');
    });

    it('rechaza por actor incorrecto: un tercero y el propio responsable anterior', async () => {
      const { relevo } = await proponer(dao);
      await assert.rejects(aceptar(dao, relevo.id, { rescatistaId: CARLA }), rechaza('NO_ES_DESTINATARIO'));
      await assert.rejects(aceptar(dao, relevo.id, { rescatistaId: ANA }), rechaza('NO_ES_DESTINATARIO'));
      await assert.rejects(aceptar(dao, relevo.id, { rescatistaId: SIN_PERFIL }), rechaza('NO_ES_RESCATISTA'));
      assert.equal(dao.filas[0].incidente.responsableId, ANA);
      assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
      assert.equal(dao.transferencias.length, 0);
    });

    it('relevo inexistente o de otra expedición: RELEVO_NO_ENCONTRADO', async () => {
      const { relevo } = await proponer(dao);
      await assert.rejects(aceptar(dao, randomUUID()), rechaza('RELEVO_NO_ENCONTRADO'));
      await assert.rejects(aceptar(dao, relevo.id, { expedicionId: E4 }), rechaza('RELEVO_NO_ENCONTRADO'));
    });

    it('la operación de la propuesta o de una asunción no sirve para aceptar: DATOS_INVALIDOS', async () => {
      const operacionId = randomUUID();
      const { relevo } = await proponer(dao, { operacionId });
      await assert.rejects(aceptar(dao, relevo.id, { operacionId }), rechaza('DATOS_INVALIDOS'));
      await assert.rejects(aceptar(dao, relevo.id, { operacionId: dao.filas[0].operacionId }), rechaza('DATOS_INVALIDOS'));
    });

    it('aceptar dos veces: la misma operación repite; otra operación da RELEVO_YA_RESUELTO', async () => {
      const { relevo } = await proponer(dao);
      const operacionId = randomUUID();
      const primero = await aceptar(dao, relevo.id, { operacionId });
      const repetida = await aceptar(dao, relevo.id, { operacionId });
      assert.equal(repetida.repetido, true);
      assert.equal(repetida.incidente.version, primero.incidente.version);
      await assert.rejects(aceptar(dao, relevo.id), rechaza('RELEVO_YA_RESUELTO'));
      // La operación vale solo para su destinatario y su relevo.
      await assert.rejects(aceptar(dao, relevo.id, { operacionId, rescatistaId: CARLA }), rechaza('RELEVO_NO_ENCONTRADO'));
      assert.equal(dao.transferencias.length, 1);
      assert.equal(dao.filas[0].incidente.version, 2);
    });

    it('aceptar dos veces a la vez deja una sola transferencia', async () => {
      for (let ronda = 0; ronda < 20; ronda += 1) {
        const incidenteId = randomUUID();
        const expedicionId = randomUUID();
        dao.sembrar(incidente(incidenteId, expedicionId, 'abierto', ANA));
        const { relevo } = await proponer(dao, { expedicionId });
        const operacionId = randomUUID();
        const [a, b] = await Promise.all([
          aceptar(dao, relevo.id, { expedicionId, operacionId }),
          aceptar(dao, relevo.id, { expedicionId, operacionId }),
        ]);
        assert.equal([a, b].filter((r) => !r.repetido).length, 1, `ronda ${ronda}`);
        assert.equal(dao.transferencias.filter((t) => t.incidenteId === incidenteId).length, 1);
      }
    });

    it('proponer contra aceptar: la aceptación gana y la propuesta no deja un segundo relevo', async () => {
      for (let ronda = 0; ronda < 20; ronda += 1) {
        const incidenteId = randomUUID();
        const expedicionId = randomUUID();
        dao.sembrar(incidente(incidenteId, expedicionId, 'abierto', ANA));
        const { relevo } = await proponer(dao, { expedicionId });
        const [propuesta, aceptacion] = await Promise.allSettled([
          proponer(dao, { expedicionId, destinatarioId: CARLA }),
          aceptar(dao, relevo.id, { expedicionId }),
        ]);
        assert.equal(aceptacion.status, 'fulfilled', `ronda ${ronda}`);
        assert.equal(propuesta.status, 'rejected');
        assert.ok(
          ['NO_ES_RESPONSABLE', 'RELEVO_PENDIENTE'].includes((propuesta as PromiseRejectedResult).reason.codigo),
        );
        assert.equal(dao.relevos.filter((r) => r.incidenteId === incidenteId).length, 1);
      }
    });

    it('CA-03: un caso cerrado después de la propuesta no se transfiere', async () => {
      const { relevo } = await proponer(dao);
      dao.filas[0].incidente = { ...dao.filas[0].incidente, estado: 'cerrado' };
      await assert.rejects(aceptar(dao, relevo.id), rechaza('INCIDENTE_CERRADO'));
      await assert.rejects(proponer(dao, { destinatarioId: CARLA }), rechaza('INCIDENTE_CERRADO'));
      assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
      assert.equal(dao.transferencias.length, 0);
    });

    it('un destinatario que ya no es rescatista validado no puede aceptar (NO_ES_RESCATISTA)', async () => {
      // En memoria el paso 4 (actor validado) se anticipa al 9b. El 9b (el destinatario
      // deja de estar validado mientras se espera el bloqueo) solo se puede probar con
      // sesiones reales: caso DESTINATARIO_NO_VALIDADO de test-hu40-postgres.mjs.
      const validados = new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]);
      const dao2 = new IncidenteDAOMemoria(validados, new Map());
      dao2.sembrar(incidente(INC1, E1, 'abierto', ANA));
      const { relevo } = await proponer(dao2);
      validados.delete(BETO);
      await assert.rejects(aceptar(dao2, relevo.id), rechaza('NO_ES_RESCATISTA'));
      assert.equal(dao2.transferencias.length, 0);
    });

    it('un relevo encadenado: el nuevo responsable puede proponer con la versión nueva', async () => {
      const { relevo } = await proponer(dao);
      await aceptar(dao, relevo.id);
      await assert.rejects(proponer(dao, { versionIncidente: 1, rescatistaId: BETO, destinatarioId: CARLA }), rechaza('VERSION_DESACTUALIZADA'));
      const segundo = await proponer(dao, { versionIncidente: 2, rescatistaId: BETO, destinatarioId: CARLA });
      assert.equal(segundo.relevo.versionIncidente, 2);
      await assert.rejects(proponer(dao, { versionIncidente: 2, destinatarioId: CARLA }), rechaza('NO_ES_RESPONSABLE'));
    });
  });

  describe('leerCoordinaciones: relevoPendiente', () => {
    it('sin relevo pendiente la coordinación no lleva la clave (forma de HU-39)', async () => {
      const coordinacion = (await dao.leerCoordinaciones([E1], ANA)).get(E1);
      assert.equal('relevoPendiente' in (coordinacion ?? {}), false);
    });

    it('con un relevo pendiente: lo ven todos; el motivo solo el responsable y el destinatario', async () => {
      const { relevo } = await proponer(dao);
      const comoAna = (await dao.leerCoordinaciones([E1], ANA)).get(E1)?.relevoPendiente;
      const comoBeto = (await dao.leerCoordinaciones([E1], BETO)).get(E1)?.relevoPendiente;
      const comoCarla = (await dao.leerCoordinaciones([E1], CARLA)).get(E1)?.relevoPendiente;
      const base = {
        relevoId: relevo.id,
        destinatarioId: BETO,
        nombreDestinatario: 'Beto Rescate',
        solicitadoEn: relevo.solicitadoEn,
      };
      assert.deepEqual(comoAna, { ...base, esParaMi: false, motivo: 'Cambio de turno' });
      assert.deepEqual(comoBeto, { ...base, esParaMi: true, motivo: 'Cambio de turno' });
      assert.deepEqual(comoCarla, { ...base, esParaMi: false });
      assert.equal('motivo' in (comoCarla ?? {}), false);
    });

    it('tras aceptar, el relevo deja de estar pendiente y el responsable es el nuevo', async () => {
      const { relevo } = await proponer(dao);
      await aceptar(dao, relevo.id);
      const coordinacion = (await dao.leerCoordinaciones([E1], BETO)).get(E1);
      assert.equal('relevoPendiente' in (coordinacion ?? {}), false);
      assert.equal(coordinacion?.responsableId, BETO);
      assert.equal(coordinacion?.esMia, true);
      assert.equal(coordinacion?.version, 2);
    });
  });
});
