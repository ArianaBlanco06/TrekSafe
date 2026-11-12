import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCierreIncidente, type CodigoErrorCierreIncidente } from '../../domain/errors/ErrorCierreIncidente.js';
import type {
  InformeCierre,
  IRegistroCierreIncidente,
  ResultadoRegistroCierre,
  SolicitudCierreIncidente,
} from '../../domain/repositories/ICierreIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ComandoCerrarIncidente } from '../commands/ComandoCerrarIncidente.js';
import { CerrarIncidente, RESPUESTAS_CIERRE } from './CerrarIncidente.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMANDO = '11111111-1111-4111-8111-111111111111';

const comando = () =>
  ComandoCerrarIncidente.crear(ANA, INCIDENTE, { comandoId: COMANDO, resultado: 'evacuado', resumen: ' Evacuada ' });

const informe: InformeCierre = {
  id: '22222222-2222-4222-8222-222222222222', incidenteId: INCIDENTE,
  expedicionId: '33333333-3333-4333-8333-333333333333', resultado: 'evacuado', resumen: 'Evacuada',
  cerradoPorId: ANA, nombreCerradoPor: 'Ana Rescate', cerradoEn: '2030-01-15T12:00:00.000Z',
  entradaBitacoraId: '44444444-4444-4444-8444-444444444444', estadoExpedicion: 'alerta',
};

function registroQueLanza(error: unknown): IRegistroCierreIncidente {
  return {
    cerrar: async () => {
      throw error;
    },
  };
}

describe('CerrarIncidente', () => {
  it('delega exactamente una vez con la solicitud exacta y devuelve tipo cerrado', async () => {
    const solicitudes: SolicitudCierreIncidente[] = [];
    const registro: IRegistroCierreIncidente = {
      cerrar: async (s): Promise<ResultadoRegistroCierre> => {
        solicitudes.push(s);
        return { informe, repetido: false };
      },
    };
    const salida = await new CerrarIncidente(registro).ejecutar(comando());
    assert.equal(salida.tipo, 'cerrado');
    assert.equal(salida.informe, informe);
    assert.deepEqual(solicitudes, [
      { comandoId: COMANDO, incidenteId: INCIDENTE, rescatistaId: ANA, resultado: 'evacuado', resumen: 'Evacuada' },
    ]);
  });

  it('una repetición del mismo comando devuelve ya_cerrado_mismo_comando con el mismo informe', async () => {
    const registro: IRegistroCierreIncidente = { cerrar: async () => ({ informe, repetido: true }) };
    const salida = await new CerrarIncidente(registro).ejecutar(comando());
    assert.equal(salida.tipo, 'ya_cerrado_mismo_comando');
    assert.equal(salida.informe, informe);
  });

  it('cada código de negocio se traduce a su estado HTTP y ninguno es 401', async () => {
    const esperados: Record<CodigoErrorCierreIncidente, number> = {
      DATOS_INVALIDOS: 400,
      NO_ES_RESPONSABLE: 403,
      INCIDENTE_NO_ENCONTRADO: 404,
      INCIDENTE_NO_LOCALIZADO: 409,
      INCIDENTE_CERRADO: 409,
      OPERACION_YA_REGISTRADA: 409,
    };
    assert.equal(Object.keys(RESPUESTAS_CIERRE).length, Object.keys(esperados).length);
    for (const [codigo, estado] of Object.entries(esperados) as [CodigoErrorCierreIncidente, number][]) {
      assert.equal(RESPUESTAS_CIERRE[codigo].estado, estado, codigo);
      assert.notEqual(RESPUESTAS_CIERRE[codigo].estado, 401, codigo);
      await assert.rejects(new CerrarIncidente(registroQueLanza(new ErrorCierreIncidente(codigo))).ejecutar(comando()), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, estado);
        assert.equal(e.codigo, codigo);
        assert.equal(e.extras, undefined);
        return true;
      });
    }
  });

  it('NO_ES_RESPONSABLE incluye el responsable vigente en extras (solo en el 403)', async () => {
    const vigente = { responsableId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombreResponsable: 'Beto Rescate' };
    await assert.rejects(
      new CerrarIncidente(registroQueLanza(new ErrorCierreIncidente('NO_ES_RESPONSABLE', vigente))).ejecutar(comando()),
      (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 403);
        assert.deepEqual(e.extras, { responsableVigente: vigente });
        return true;
      });
  });

  it('un fallo que no es de negocio se propaga sin traducir', async () => {
    const original = new Error('fallo de base de datos');
    await assert.rejects(new CerrarIncidente(registroQueLanza(original)).ejecutar(comando()), (e: unknown) => {
      assert.equal(e, original);
      return true;
    });
  });
});
