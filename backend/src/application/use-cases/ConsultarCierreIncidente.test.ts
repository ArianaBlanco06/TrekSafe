import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import type { ILectorCierreIncidente, InformeCierre } from '../../domain/repositories/ICierreIncidenteDAO.js';
import { ConsultarCierreIncidente } from './ConsultarCierreIncidente.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPEDICION = '33333333-3333-4333-8333-333333333333';

const informe: InformeCierre = {
  id: '22222222-2222-4222-8222-222222222222', incidenteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  expedicionId: EXPEDICION, resultado: 'falsa_alarma', resumen: 'Sin novedad',
  cerradoPorId: ANA, nombreCerradoPor: 'Ana Rescate', cerradoEn: '2030-01-15T12:00:00.000Z',
  entradaBitacoraId: '44444444-4444-4444-8444-444444444444', estadoExpedicion: 'alerta',
};

describe('ConsultarCierreIncidente', () => {
  it('devuelve la vista del último cierre con esMio según el actor y consulta por la expedición', async () => {
    const consultadas: string[] = [];
    const lector: ILectorCierreIncidente = {
      ultimoCierreDeExpedicion: async (id) => {
        consultadas.push(id);
        return informe;
      },
    };
    const caso = new ConsultarCierreIncidente(lector);
    const mio = await caso.ejecutar(ANA, EXPEDICION);
    assert.equal(mio?.cerradoPor.esMio, true);
    assert.equal(mio?.tipoCierre, 'operativo');
    assert.equal(mio?.retornoConfirmadoPorSenderista, false);
    assert.equal((await caso.ejecutar(OTRO, EXPEDICION))?.cerradoPor.esMio, false);
    assert.deepEqual(consultadas, [EXPEDICION, EXPEDICION]);
  });

  it('sin cierre devuelve null', async () => {
    const lector: ILectorCierreIncidente = { ultimoCierreDeExpedicion: async () => null };
    assert.equal(await new ConsultarCierreIncidente(lector).ejecutar(ANA, EXPEDICION), null);
  });

  it('un id que no es UUID da ZodError y no consulta', async () => {
    let llamadas = 0;
    const lector: ILectorCierreIncidente = { ultimoCierreDeExpedicion: async () => { llamadas += 1; return null; } };
    await assert.rejects(new ConsultarCierreIncidente(lector).ejecutar(ANA, 'no-es-uuid'), ZodError);
    await assert.rejects(new ConsultarCierreIncidente(lector).ejecutar('no-es-uuid', EXPEDICION), ZodError);
    assert.equal(llamadas, 0);
  });
});
