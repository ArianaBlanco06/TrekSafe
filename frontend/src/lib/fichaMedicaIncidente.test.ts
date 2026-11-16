import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MENSAJES_DENEGACION_FICHA,
  MENSAJE_AUDITORIA_NO_DISPONIBLE,
  MENSAJE_ERROR_GENERICO,
  MENSAJE_SIN_CONEXION,
  MOTIVOS_DENEGACION_FICHA,
  mensajeErrorFicha,
  textoCampoFicha,
} from './fichaMedicaIncidente';
import { ErrorClienteApi } from '../services/clienteApi';

describe('lib/fichaMedicaIncidente (HU-50)', () => {
  it('cada motivo de denegación tiene un mensaje no vacío', () => {
    assert.equal(MOTIVOS_DENEGACION_FICHA.length, 6);
    for (const motivo of MOTIVOS_DENEGACION_FICHA) assert.ok(MENSAJES_DENEGACION_FICHA[motivo].length > 10, motivo);
  });

  it('un error con motivo conocido da su mensaje', () => {
    const error = new ErrorClienteApi('x', 403, 'ACCESO_FICHA_DENEGADO', undefined, { motivo: 'NO_ES_RESPONSABLE' });
    assert.equal(mensajeErrorFicha(error), 'Solo el responsable vigente del incidente puede consultar la ficha médica.');
    assert.equal(
      mensajeErrorFicha({ status: 409, extras: { motivo: 'CONTEXTO_CAMBIADO' } }),
      'La coordinación cambió durante la consulta. Actualiza e inténtalo de nuevo.',
    );
    assert.equal(
      mensajeErrorFicha({ status: 403, extras: { motivo: 'SIN_CONSENTIMIENTO' } }),
      'El senderista no tiene una ficha médica autorizada.',
    );
  });

  it('status 0 es sin conexión y 503 es auditoría no disponible', () => {
    assert.equal(mensajeErrorFicha(new ErrorClienteApi('red', 0)), MENSAJE_SIN_CONEXION);
    assert.equal(mensajeErrorFicha(new ErrorClienteApi('x', 503, 'AUDITORIA_NO_DISPONIBLE')), MENSAJE_AUDITORIA_NO_DISPONIBLE);
  });

  it('un motivo desconocido, un error sin forma o un valor que no es objeto dan el mensaje genérico', () => {
    assert.equal(mensajeErrorFicha({ status: 403, extras: { motivo: 'INVENTADO' } }), MENSAJE_ERROR_GENERICO);
    assert.equal(mensajeErrorFicha(new ErrorClienteApi('x', 500, 'FICHA_ILEGIBLE')), MENSAJE_ERROR_GENERICO);
    for (const valor of [null, undefined, 'texto', 42]) assert.equal(mensajeErrorFicha(valor), MENSAJE_ERROR_GENERICO);
  });

  it('un campo vacío o en blanco se muestra como no declarado, con el género correcto', () => {
    assert.equal(textoCampoFicha('', false), 'No declaradas');
    assert.equal(textoCampoFicha('   ', true), 'No declarada');
    assert.equal(textoCampoFicha('Penicilina', false), 'Penicilina');
  });
});
