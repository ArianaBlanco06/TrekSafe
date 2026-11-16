import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ErrorBitacoraIncidente } from '../../../domain/errors/ErrorBitacoraIncidente.js';
import {
  verificarContratoBitacoraIncidenteDAO,
  type ContextoContratoBitacora,
} from '../../../testing/contratoBitacoraIncidenteDAO.js';
import { BitacoraIncidenteDAOMemoria } from './BitacoraIncidenteDAOMemoria.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function crearContexto(): ContextoContratoBitacora & { memoria: BitacoraIncidenteDAOMemoria } {
  const memoria = new BitacoraIncidenteDAOMemoria(new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]));
  return {
    memoria,
    dao: memoria,
    responsableA: ANA,
    rescatistaB: BETO,
    async crearIncidente(responsable = ANA) {
      const id = randomUUID();
      memoria.sembrarIncidente({ id, expedicionId: randomUUID(), responsableId: responsable });
      return id;
    },
    async relevar(incidenteId, nuevo) {
      memoria.relevar(incidenteId, nuevo);
    },
    async marcarLocalizado(incidenteId) {
      memoria.cambiarEstado(incidenteId, 'localizado');
    },
    async cerrar(incidenteId) {
      memoria.cambiarEstado(incidenteId, 'cerrado');
    },
  };
}

verificarContratoBitacoraIncidenteDAO('Contrato IBitacoraIncidenteDAO: memoria', () => crearContexto());

describe('BitacoraIncidenteDAOMemoria (apoyo para HU-42)', () => {
  it('anexarInterna admite un cierre, solo uno por incidente, y la lectura lo conserva al final', async () => {
    const c = crearContexto();
    const id = await c.crearIncidente();
    await c.dao.agregar({ incidenteId: id, autorId: ANA, texto: 'Nota', corrigeEntradaId: null, operacionId: randomUUID() });
    const cierre = c.memoria.anexarInterna(id, ANA, 'cierre', 'Cerrado sin novedad', randomUUID());
    assert.equal(cierre.tipo, 'cierre');
    assert.throws(
      () => c.memoria.anexarInterna(id, ANA, 'cierre', 'Otro cierre', randomUUID()),
      (e: unknown) => e instanceof ErrorBitacoraIncidente && e.codigo === 'OPERACION_YA_REGISTRADA',
    );
    c.memoria.cambiarEstado(id, 'cerrado');
    const entradas = (await c.dao.listar(id))?.entradas ?? [];
    assert.deepEqual(entradas.map((e) => e.tipo), ['nota', 'cierre']);
  });

  it('un UUID usado en otro tipo de operación da OPERACION_YA_REGISTRADA', async () => {
    const c = crearContexto();
    const id = await c.crearIncidente();
    const operacion = randomUUID();
    c.memoria.operacionesDeOtroTipo.add(operacion);
    await assert.rejects(
      c.dao.agregar({ incidenteId: id, autorId: ANA, texto: 'x', corrigeEntradaId: null, operacionId: operacion }),
      (e: unknown) => e instanceof ErrorBitacoraIncidente && e.codigo === 'OPERACION_YA_REGISTRADA',
    );
  });
});
