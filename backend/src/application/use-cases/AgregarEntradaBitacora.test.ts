import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorBitacoraIncidente, type CodigoErrorBitacoraIncidente } from '../../domain/errors/ErrorBitacoraIncidente.js';
import type {
  IRegistroBitacoraIncidente,
  ResultadoEntradaBitacora,
  SolicitudEntradaBitacora,
} from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ComandoAgregarEntradaBitacora } from '../commands/ComandoAgregarEntradaBitacora.js';
import { AgregarEntradaBitacora, RESPUESTAS_BITACORA } from './AgregarEntradaBitacora.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERACION = '11111111-1111-4111-8111-111111111111';
const ENTRADA = '22222222-2222-4222-8222-222222222222';

const comando = () =>
  ComandoAgregarEntradaBitacora.crear(ANA, INCIDENTE, { operacionId: OPERACION, texto: ' Nota ', corrigeEntradaId: ENTRADA });

const resultado: ResultadoEntradaBitacora = {
  entrada: {
    id: ENTRADA, incidenteId: INCIDENTE, tipo: 'correccion', texto: 'Nota', autorId: ANA, nombreAutor: 'Ana Rescate',
    registradaEn: '2030-01-15T12:00:00.000Z', corrigeEntradaId: ENTRADA,
  },
  repetido: false,
};

function registroQueLanza(error: unknown): IRegistroBitacoraIncidente {
  return {
    agregar: async () => {
      throw error;
    },
  };
}

describe('AgregarEntradaBitacora', () => {
  it('delega exactamente una vez con la solicitud exacta y devuelve su resultado', async () => {
    const solicitudes: SolicitudEntradaBitacora[] = [];
    const registro: IRegistroBitacoraIncidente = {
      agregar: async (s) => {
        solicitudes.push(s);
        return resultado;
      },
    };
    const salida = await new AgregarEntradaBitacora(registro).ejecutar(comando());
    assert.equal(salida, resultado);
    assert.deepEqual(solicitudes, [
      { incidenteId: INCIDENTE, autorId: ANA, texto: 'Nota', corrigeEntradaId: ENTRADA, operacionId: OPERACION },
    ]);
  });

  it('cada código de negocio se traduce a su estado HTTP y ninguno es 401', async () => {
    const esperados: Record<CodigoErrorBitacoraIncidente, number> = {
      DATOS_INVALIDOS: 400,
      CORRECCION_INVALIDA: 400,
      NO_ES_RESPONSABLE: 403,
      INCIDENTE_NO_ENCONTRADO: 404,
      INCIDENTE_CERRADO: 409,
      OPERACION_YA_REGISTRADA: 409,
    };
    assert.equal(Object.keys(RESPUESTAS_BITACORA).length, Object.keys(esperados).length);
    for (const [codigo, estado] of Object.entries(esperados) as [CodigoErrorBitacoraIncidente, number][]) {
      assert.equal(RESPUESTAS_BITACORA[codigo].estado, estado, codigo);
      assert.notEqual(RESPUESTAS_BITACORA[codigo].estado, 401, codigo);
      const ejecutor = new AgregarEntradaBitacora(registroQueLanza(new ErrorBitacoraIncidente(codigo)));
      await assert.rejects(ejecutor.ejecutar(comando()), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, estado);
        assert.equal(e.codigo, codigo);
        assert.equal(e.extras, undefined);
        return true;
      });
    }
  });

  it('NO_ES_RESPONSABLE incluye el responsable vigente en extras', async () => {
    const vigente = { responsableId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombreResponsable: 'Beto Rescate' };
    const ejecutor = new AgregarEntradaBitacora(registroQueLanza(new ErrorBitacoraIncidente('NO_ES_RESPONSABLE', vigente)));
    await assert.rejects(ejecutor.ejecutar(comando()), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.equal(e.codigoEstado, 403);
      assert.deepEqual(e.extras, { responsableVigente: vigente });
      return true;
    });
  });

  it('un fallo que no es de negocio se propaga sin traducir', async () => {
    const original = new Error('fallo de base de datos');
    await assert.rejects(new AgregarEntradaBitacora(registroQueLanza(original)).ejecutar(comando()), (e: unknown) => {
      assert.equal(e, original);
      return true;
    });
  });
});
