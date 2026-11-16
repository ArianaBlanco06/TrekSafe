import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCoordinacion, type CodigoErrorCoordinacion } from '../../domain/errors/ErrorCoordinacion.js';
import type { IIncidenteDAO } from '../../domain/repositories/IIncidenteDAO.js';
import { IncidenteDAOMemoria } from '../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ComandoAsignarResponsable } from '../commands/ComandoAsignarResponsable.js';
import { AsignarResponsable, RESPUESTAS_COORDINACION } from './AsignarResponsable.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SENDERISTA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // sin perfil de rescatista
const ALERTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTRA_ALERTA = '99999999-9999-4999-8999-999999999999';
const EN_PROGRESO = '77777777-7777-4777-8777-777777777777';
const COMPLETADA = '66666666-6666-4666-8666-666666666666';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';
const OPERACION = '11111111-1111-4111-8111-111111111111';

const comando = (rescatista: string, expedicion = ALERTA, operacion = crypto.randomUUID()) =>
  ComandoAsignarResponsable.crear(rescatista, expedicion, { operacionId: operacion });

/** Verifica que el rechazo sea un ErrorAplicacion con ese estado, código y extras. */
const rechazo = (estado: number, codigo: string, extras?: Record<string, unknown>) => (e: unknown) => {
  assert.ok(e instanceof ErrorAplicacion, `se esperaba ErrorAplicacion y llegó ${String(e)}`);
  assert.equal(e.codigoEstado, estado);
  assert.equal(e.codigo, codigo);
  assert.deepEqual(e.extras, extras);
  return true;
};

describe('AsignarResponsable', () => {
  let dao: IncidenteDAOMemoria;
  let ejecutor: AsignarResponsable;

  beforeEach(() => {
    dao = new IncidenteDAOMemoria(
      new Map([
        [ANA, 'Ana Rescate'],
        [BETO, 'Beto Rescate'],
      ]),
      new Map([
        [ALERTA, 'alerta'],
        [OTRA_ALERTA, 'alerta'],
        [EN_PROGRESO, 'en_progreso'],
        [COMPLETADA, 'completada'],
      ]),
    );
    ejecutor = new AsignarResponsable(dao);
  });

  it('CA-01: un rescatista validado asume una alerta sin responsable', async () => {
    const { incidente, repetido } = await ejecutor.ejecutar(comando(ANA));
    assert.equal(repetido, false);
    assert.equal(incidente.expedicionId, ALERTA);
    assert.equal(incidente.estado, 'abierto');
    assert.equal(incidente.version, 1);
    assert.equal(incidente.responsableId, ANA);
    assert.equal(incidente.nombreResponsable, 'Ana Rescate');
    assert.ok(!Number.isNaN(Date.parse(incidente.asumidoEn)));
    assert.equal(dao.filas.length, 1);
  });

  it('quien no es rescatista recibe 403 NO_ES_RESCATISTA y no se crea nada', async () => {
    await assert.rejects(ejecutor.ejecutar(comando(SENDERISTA)), rechazo(403, 'NO_ES_RESCATISTA'));
    assert.equal(dao.filas.length, 0);
  });

  it('una alerta inexistente recibe 404 ALERTA_NO_ENCONTRADA', async () => {
    await assert.rejects(ejecutor.ejecutar(comando(ANA, INEXISTENTE)), rechazo(404, 'ALERTA_NO_ENCONTRADA'));
    assert.equal(dao.filas.length, 0);
  });

  it('una expedición que ya no está en alerta recibe 404 ALERTA_NO_ENCONTRADA', async () => {
    for (const expedicion of [EN_PROGRESO, COMPLETADA]) {
      await assert.rejects(ejecutor.ejecutar(comando(ANA, expedicion)), rechazo(404, 'ALERTA_NO_ENCONTRADA'));
    }
    assert.equal(dao.filas.length, 0);
  });

  it('CA-02: si otro rescatista ya coordina, recibe 409 con el responsable vigente', async () => {
    await ejecutor.ejecutar(comando(ANA));
    await assert.rejects(
      ejecutor.ejecutar(comando(BETO)),
      rechazo(409, 'COORDINACION_YA_ASUMIDA', {
        responsableVigente: { responsableId: ANA, nombreResponsable: 'Ana Rescate' },
      }),
    );
    assert.equal(dao.filas.length, 1);
    assert.equal(dao.filas[0]?.incidente.responsableId, ANA);
  });

  it('el mismo comando enviado dos veces devuelve el mismo incidente con repetido=true y un solo registro', async () => {
    const orden = comando(ANA, ALERTA, OPERACION);
    const primera = await ejecutor.ejecutar(orden);
    const segunda = await ejecutor.ejecutar(orden);
    assert.equal(primera.repetido, false);
    assert.equal(segunda.repetido, true);
    assert.deepEqual(segunda.incidente, primera.incidente);
    assert.equal(dao.filas.length, 1);
  });

  it('el mismo responsable con otra operación recibe el incidente vigente sin duplicarlo', async () => {
    const primera = await ejecutor.ejecutar(comando(ANA));
    const segunda = await ejecutor.ejecutar(comando(ANA));
    assert.equal(segunda.repetido, true);
    assert.equal(segunda.incidente.id, primera.incidente.id);
    assert.equal(dao.filas.length, 1);
  });

  it('un operacionId de otro rescatista o de otra alerta recibe 404 y no revela nada', async () => {
    await ejecutor.ejecutar(comando(ANA, ALERTA, OPERACION));
    await assert.rejects(ejecutor.ejecutar(comando(BETO, ALERTA, OPERACION)), rechazo(404, 'ALERTA_NO_ENCONTRADA'));
    await assert.rejects(ejecutor.ejecutar(comando(ANA, OTRA_ALERTA, OPERACION)), rechazo(404, 'ALERTA_NO_ENCONTRADA'));
    assert.equal(dao.filas.length, 1);
  });

  it('un operacionId ya usado en otro tipo de operación recibe 400 DATOS_INVALIDOS', async () => {
    dao.operacionesDeOtroTipo.add(OPERACION);
    await assert.rejects(ejecutor.ejecutar(comando(ANA, ALERTA, OPERACION)), rechazo(400, 'DATOS_INVALIDOS'));
    assert.equal(dao.filas.length, 0);
  });

  it('CA-02: dos asunciones simultáneas con Promise.all dejan un solo responsable y la otra recibe 409 con el vigente', async () => {
    for (let ronda = 0; ronda < 20; ronda += 1) {
      const alerta = crypto.randomUUID();
      const local = new IncidenteDAOMemoria(
        new Map([
          [ANA, 'Ana Rescate'],
          [BETO, 'Beto Rescate'],
        ]),
        new Map([[alerta, 'alerta']]),
      );
      const ejecutorLocal = new AsignarResponsable(local);
      // Se alterna quién lanza primero para no fijar el ganador.
      const pedidos = ronda % 2 === 0 ? [ANA, BETO] : [BETO, ANA];
      const resultados = await Promise.allSettled(pedidos.map((r) => ejecutorLocal.ejecutar(comando(r, alerta))));

      const ganadoras = resultados.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<AsignarResponsable['ejecutar']>>> => r.status === 'fulfilled');
      const perdedoras = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      assert.equal(ganadoras.length, 1, `ronda ${ronda}: debía ganar exactamente una`);
      assert.equal(perdedoras.length, 1);
      const ganador = ganadoras[0]!.value.incidente;
      assert.equal(ganadoras[0]!.value.repetido, false);
      assert.ok(
        rechazo(409, 'COORDINACION_YA_ASUMIDA', {
          responsableVigente: { responsableId: ganador.responsableId, nombreResponsable: ganador.nombreResponsable },
        })(perdedoras[0]!.reason),
      );
      assert.equal(local.filas.length, 1);
    }
  });

  it('el mismo comando enviado dos veces a la vez devuelve el mismo incidente y un solo registro', async () => {
    const orden = comando(ANA, ALERTA, OPERACION);
    const [a, b] = await Promise.all([ejecutor.ejecutar(orden), ejecutor.ejecutar(orden)]);
    assert.equal(a.incidente.id, b.incidente.id);
    assert.equal([a, b].filter((r) => r.repetido === false).length, 1);
    assert.equal([a, b].filter((r) => r.repetido === true).length, 1);
    assert.equal(dao.filas.length, 1);
  });

  it('ningún código de coordinación se traduce a 401 y cada uno tiene su estado', () => {
    const esperados: Record<CodigoErrorCoordinacion, number> = {
      NO_ES_RESCATISTA: 403,
      ALERTA_NO_ENCONTRADA: 404,
      DATOS_INVALIDOS: 400,
      COORDINACION_YA_ASUMIDA: 409,
    };
    for (const [codigo, estado] of Object.entries(esperados)) {
      const { estado: real } = RESPUESTAS_COORDINACION[codigo as CodigoErrorCoordinacion];
      assert.equal(real, estado, codigo);
      assert.notEqual(real, 401, codigo);
    }
    assert.equal(Object.keys(RESPUESTAS_COORDINACION).length, Object.keys(esperados).length);
  });

  it('un fallo que no es de negocio se propaga sin traducir', async () => {
    const roto: IIncidenteDAO = {
      asumir: async () => {
        throw new Error('fallo de base de datos');
      },
      leerCoordinaciones: async () => new Map(),
    };
    await assert.rejects(new AsignarResponsable(roto).ejecutar(comando(ANA)), (e: unknown) => {
      assert.ok(e instanceof Error && !(e instanceof ErrorAplicacion) && !(e instanceof ErrorCoordinacion));
      return true;
    });
  });
});
