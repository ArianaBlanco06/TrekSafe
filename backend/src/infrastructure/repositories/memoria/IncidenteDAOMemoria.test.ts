import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Incidente } from '../../../domain/repositories/IIncidenteDAO.js';
import { IncidenteDAOMemoria } from './IncidenteDAOMemoria.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const E1 = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const E2 = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const E3 = 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3';
const E4 = 'e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4';

const incidente = (id: string, expedicionId: string, estado: Incidente['estado'], responsableId = ANA): Incidente => ({
  id,
  expedicionId,
  estado,
  version: 3,
  responsableId,
  nombreResponsable: responsableId === ANA ? 'Ana Rescate' : 'Beto Rescate',
  asumidoEn: '2030-01-15T12:00:00.000Z',
});

describe('IncidenteDAOMemoria.leerCoordinaciones (contrato de CA-03)', () => {
  let dao: IncidenteDAOMemoria;

  beforeEach(() => {
    dao = new IncidenteDAOMemoria(new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]), new Map());
    dao.sembrar(incidente('00000000-0000-4000-8000-000000000001', E1, 'abierto', ANA));
    dao.sembrar(incidente('00000000-0000-4000-8000-000000000002', E2, 'localizado', BETO));
    dao.sembrar(incidente('00000000-0000-4000-8000-000000000003', E3, 'cerrado', ANA));
  });

  it('devuelve solo incidentes no cerrados de las expediciones pedidas', async () => {
    const mapa = await dao.leerCoordinaciones([E1, E2, E3, E4], ANA);
    assert.deepEqual([...mapa.keys()].sort(), [E1, E2].sort());
    assert.equal(mapa.has(E3), false, 'un incidente cerrado no es coordinación vigente');
    assert.equal(mapa.has(E4), false, 'sin incidente no aparece');
  });

  it('calcula esMia comparando con el rescatista que consulta', async () => {
    const comoAna = await dao.leerCoordinaciones([E1, E2], ANA);
    assert.equal(comoAna.get(E1)?.esMia, true);
    assert.equal(comoAna.get(E2)?.esMia, false);
    const comoBeto = await dao.leerCoordinaciones([E1, E2], BETO);
    assert.equal(comoBeto.get(E1)?.esMia, false);
    assert.equal(comoBeto.get(E2)?.esMia, true);
  });

  it('expone exactamente los campos del contrato y ningún dato médico', async () => {
    const coordinacion = (await dao.leerCoordinaciones([E1], BETO)).get(E1);
    assert.deepEqual(coordinacion, {
      incidenteId: '00000000-0000-4000-8000-000000000001',
      version: 3,
      responsableId: ANA,
      nombreResponsable: 'Ana Rescate',
      asumidoEn: '2030-01-15T12:00:00.000Z',
      esMia: false,
    });
  });

  it('una lista vacía devuelve un mapa vacío', async () => {
    assert.equal((await dao.leerCoordinaciones([], ANA)).size, 0);
  });
});
