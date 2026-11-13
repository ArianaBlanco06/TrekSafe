import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InformeCierre } from '../../domain/repositories/ICierreIncidenteDAO.js';
import { aVistaEstadoIncidente, aVistaInformeCierre } from './cierreIncidente.dto.js';

const RESCATISTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const informe = (estadoExpedicion: InformeCierre['estadoExpedicion']): InformeCierre => ({
  id: '11111111-1111-4111-8111-111111111111',
  incidenteId: '22222222-2222-4222-8222-222222222222',
  expedicionId: '33333333-3333-4333-8333-333333333333',
  resultado: 'evacuado',
  resumen: 'Evacuada al refugio',
  cerradoPorId: RESCATISTA,
  nombreCerradoPor: 'Ana Rescate',
  cerradoEn: '2030-01-15T12:00:00.000Z',
  entradaBitacoraId: '44444444-4444-4444-8444-444444444444',
  estadoExpedicion,
});

describe('HU-42: vistas del cierre', () => {
  it('CA-3: el cierre es operativo y el retorno no está confirmado mientras la expedición siga en alerta', () => {
    for (const estado of ['alerta', 'en_progreso'] as const) {
      const v = aVistaInformeCierre(informe(estado), RESCATISTA);
      assert.equal(v.tipoCierre, 'operativo');
      assert.equal(v.retornoConfirmadoPorSenderista, false, estado);
      assert.equal(v.estadoExpedicion, estado);
    }
  });

  it('el retorno figura confirmado solo si la expedición está completada (lo hizo el senderista, no el cierre)', () => {
    assert.equal(aVistaInformeCierre(informe('completada'), RESCATISTA).retornoConfirmadoPorSenderista, true);
  });

  it('esMio depende del actor y la vista no expone más claves de las esperadas', () => {
    assert.equal(aVistaInformeCierre(informe('alerta'), RESCATISTA).cerradoPor.esMio, true);
    assert.equal(aVistaInformeCierre(informe('alerta'), OTRO).cerradoPor.esMio, false);
    assert.deepEqual(Object.keys(aVistaInformeCierre(informe('alerta'), RESCATISTA)).sort(), [
      'cerradoEn', 'cerradoPor', 'entradaBitacoraId', 'estadoExpedicion', 'expedicionId', 'id', 'incidenteId',
      'resultado', 'resumen', 'retornoConfirmadoPorSenderista', 'tipoCierre',
    ]);
  });

  it('la vista del estado del incidente usa los nombres de la API', () => {
    const v = aVistaEstadoIncidente({
      id: 'i', expedicionId: 'e', estado: 'localizado', version: 3, responsableId: 'r', nombreResponsable: 'Ana',
    });
    assert.deepEqual(v, {
      incidenteId: 'i', expedicionId: 'e', estado: 'localizado', version: 3,
      responsable: { responsableId: 'r', nombreResponsable: 'Ana' },
    });
  });
});
