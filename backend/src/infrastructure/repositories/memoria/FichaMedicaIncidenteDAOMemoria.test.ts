import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  verificarContratoFichaMedicaIncidenteDAO,
  type ContextoContratoFicha,
} from '../../../testing/contratoFichaMedicaIncidenteDAO.js';
import { FichaMedicaIncidenteDAOMemoria } from './FichaMedicaIncidenteDAOMemoria.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function crearContexto(): ContextoContratoFicha & { memoria: FichaMedicaIncidenteDAOMemoria } {
  const memoria = new FichaMedicaIncidenteDAOMemoria();
  memoria.sembrarRescatista(ANA);
  memoria.sembrarRescatista(BETO);
  return {
    memoria,
    dao: memoria,
    responsableA: ANA,
    rescatistaB: BETO,
    async crearIncidente(responsable = ANA) {
      const incidenteId = randomUUID();
      const senderistaId = randomUUID();
      const ficha = { tipoSangre: 'AB-', cargaCifrada: `CIFRADO-SECRETO-${incidenteId}` };
      memoria.sembrarIncidente({ id: incidenteId, expedicionId: randomUUID(), senderistaId, responsableId: responsable });
      memoria.sembrarFicha(senderistaId, ficha);
      return { incidenteId, senderistaId, ficha };
    },
    async relevar(incidenteId, nuevo) {
      memoria.transferir(incidenteId, nuevo);
    },
    async marcarLocalizado(incidenteId) {
      memoria.localizar(incidenteId);
    },
    async cerrar(incidenteId) {
      memoria.cerrar(incidenteId);
    },
    async revocarConsentimiento(senderistaId) {
      memoria.revocarConsentimiento(senderistaId);
    },
  };
}

verificarContratoFichaMedicaIncidenteDAO('Contrato IFichaMedicaIncidenteDAO: memoria', () => crearContexto());

describe('FichaMedicaIncidenteDAOMemoria', () => {
  it('expone los accesos como lista de solo lectura del más antiguo al más reciente', async () => {
    const c = crearContexto();
    const f = await c.crearIncidente();
    await c.dao.registrar({ incidenteId: f.incidenteId, actorId: ANA, resultado: 'permitido', motivo: 'RESPONSABLE_VIGENTE' });
    await c.dao.registrar({ incidenteId: f.incidenteId, actorId: BETO, resultado: 'denegado', motivo: 'NO_ES_RESPONSABLE' });
    assert.deepEqual(c.memoria.accesos.map((a) => a.motivo), ['RESPONSABLE_VIGENTE', 'NO_ES_RESPONSABLE']);
    assert.equal(Object.isFrozen(c.memoria.accesos[0]), true);
  });

  it('los registros rechazados no quedan en la lista', async () => {
    const c = crearContexto();
    const f = await c.crearIncidente();
    await assert.rejects(c.dao.registrar({ incidenteId: f.incidenteId, actorId: ANA, resultado: 'permitido', motivo: 'NO_ES_RESPONSABLE' }));
    assert.equal(c.memoria.accesos.length, 0);
  });
});
