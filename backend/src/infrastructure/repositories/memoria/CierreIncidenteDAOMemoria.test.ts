import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  verificarContratoCierreIncidenteDAO,
  type ContextoContratoCierre,
} from '../../../testing/contratoCierreIncidenteDAO.js';
import { BitacoraIncidenteDAOMemoria } from './BitacoraIncidenteDAOMemoria.js';
import { CierreIncidenteDAOMemoria } from './CierreIncidenteDAOMemoria.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function crearContexto(): ContextoContratoCierre & { memoria: CierreIncidenteDAOMemoria } {
  const rescatistas = new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]);
  const bitacora = new BitacoraIncidenteDAOMemoria(rescatistas);
  const memoria = new CierreIncidenteDAOMemoria(bitacora, rescatistas);
  const expediciones = new Map<string, string>();
  return {
    memoria,
    dao: memoria,
    bitacora,
    responsableA: ANA,
    rescatistaB: BETO,
    async crearIncidente(responsable = ANA) {
      const id = randomUUID();
      const expedicionId = randomUUID();
      bitacora.sembrarIncidente({ id, expedicionId, responsableId: responsable });
      memoria.sembrarExpedicion(expedicionId, 'alerta');
      expediciones.set(id, expedicionId);
      return id;
    },
    async expedicionDe(incidenteId) {
      return expediciones.get(incidenteId)!;
    },
    async relevar(incidenteId, nuevo) {
      bitacora.relevar(incidenteId, nuevo);
    },
    async estadoExpedicion(expedicionId) {
      return memoria.estadoExpedicion(expedicionId);
    },
  };
}

verificarContratoCierreIncidenteDAO('Contrato ICierreIncidenteDAO: memoria', () => crearContexto());

describe('CierreIncidenteDAOMemoria', () => {
  it('cuenta las llamadas a cerrar y nunca modifica la expedición, ni siquiera si ya estaba completada', async () => {
    const c = crearContexto();
    const id = await c.crearIncidente();
    const expedicion = await c.expedicionDe(id);
    c.memoria.sembrarExpedicion(expedicion, 'completada');
    await c.dao.marcarLocalizado({ operacionId: randomUUID(), incidenteId: id, rescatistaId: ANA });
    const { informe } = await c.dao.cerrar({
      comandoId: randomUUID(), incidenteId: id, rescatistaId: ANA, resultado: 'falsa_alarma', resumen: 'Sin novedad',
    });
    assert.equal(c.memoria.llamadasCerrar, 1);
    assert.equal(c.memoria.estadoExpedicion(expedicion), 'completada');
    assert.equal(informe.estadoExpedicion, 'completada');
  });

  it('rechaza datos inválidos con DATOS_INVALIDOS sin escribir', async () => {
    const c = crearContexto();
    const id = await c.crearIncidente();
    await c.dao.marcarLocalizado({ operacionId: randomUUID(), incidenteId: id, rescatistaId: ANA });
    const base = { comandoId: randomUUID(), incidenteId: id, rescatistaId: ANA };
    for (const extra of [
      { resultado: 'fallecido', resumen: 'x' },
      { resultado: 'evacuado', resumen: '   ' },
      { resultado: 'evacuado', resumen: 'a'.repeat(2001) },
    ]) {
      await assert.rejects(
        c.dao.cerrar({ ...base, ...extra } as never),
        (e: unknown) => (e as { codigo?: string }).codigo === 'DATOS_INVALIDOS');
    }
    assert.equal((await c.bitacora.listar(id))!.incidente.estado, 'localizado');
  });
});
