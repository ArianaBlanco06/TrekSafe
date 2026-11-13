import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCierreIncidente } from '../../domain/errors/ErrorCierreIncidente.js';
import type {
  IRegistroLocalizacionIncidente,
  ResultadoLocalizacion,
  SolicitudLocalizacionIncidente,
} from '../../domain/repositories/ICierreIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ComandoMarcarIncidenteLocalizado } from '../commands/ComandoMarcarIncidenteLocalizado.js';
import { MarcarIncidenteLocalizado } from './MarcarIncidenteLocalizado.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERACION = '11111111-1111-4111-8111-111111111111';

const comando = () => ComandoMarcarIncidenteLocalizado.crear(ANA, INCIDENTE, { operacionId: OPERACION });

const resultado: ResultadoLocalizacion = {
  incidente: {
    id: INCIDENTE, expedicionId: '33333333-3333-4333-8333-333333333333', estado: 'localizado', version: 2,
    responsableId: ANA, nombreResponsable: 'Ana Rescate',
  },
  repetido: false,
};

describe('MarcarIncidenteLocalizado', () => {
  it('delega una vez con la solicitud exacta y devuelve su resultado', async () => {
    const solicitudes: SolicitudLocalizacionIncidente[] = [];
    const registro: IRegistroLocalizacionIncidente = {
      marcarLocalizado: async (s) => {
        solicitudes.push(s);
        return resultado;
      },
    };
    assert.equal(await new MarcarIncidenteLocalizado(registro).ejecutar(comando()), resultado);
    assert.deepEqual(solicitudes, [{ operacionId: OPERACION, incidenteId: INCIDENTE, rescatistaId: ANA }]);
  });

  it('traduce los rechazos de negocio (403 con el vigente, 404, 409) y propaga los demás fallos', async () => {
    const vigente = { responsableId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombreResponsable: 'Beto' };
    const casos: [ErrorCierreIncidente, number][] = [
      [new ErrorCierreIncidente('NO_ES_RESPONSABLE', vigente), 403],
      [new ErrorCierreIncidente('INCIDENTE_NO_ENCONTRADO'), 404],
      [new ErrorCierreIncidente('INCIDENTE_CERRADO'), 409],
      [new ErrorCierreIncidente('OPERACION_YA_REGISTRADA'), 409],
    ];
    for (const [error, estado] of casos) {
      const registro: IRegistroLocalizacionIncidente = { marcarLocalizado: async () => { throw error; } };
      await assert.rejects(new MarcarIncidenteLocalizado(registro).ejecutar(comando()), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, estado);
        assert.equal(e.codigo, error.codigo);
        assert.deepEqual(e.extras, error.responsableVigente ? { responsableVigente: vigente } : undefined);
        return true;
      });
    }
    const original = new Error('fallo');
    const registro: IRegistroLocalizacionIncidente = { marcarLocalizado: async () => { throw original; } };
    await assert.rejects(new MarcarIncidenteLocalizado(registro).ejecutar(comando()), (e: unknown) => e === original);
  });
});
