import assert from 'node:assert/strict';
import { it } from 'node:test';
import { procesarPlazosOperativos, type DependenciasPlazosOperativos } from './ProcesarPlazosOperativos.js';

function dependencias(eventos: string[]): DependenciasPlazosOperativos {
  return {
    expediciones: { promoverProgramadasListas: async () => { eventos.push('promover'); return 1; } },
    vencimientos: { evaluar: async (limite) => {
      assert.equal(limite, 100); eventos.push('transaccion');
      return { enAlerta: 2, pendientes: 3, sinDestinatarios: [] };
    } },
    recordatorios: { procesarRecordatorios: async () => {
      eventos.push('recordatorios'); return { evaluadas: 2, avisosGenerados: 1, avisosOmitidosPorDuplicidad: 0 };
    } },
  };
}

it('el ciclo produce avisos duraderos sin transporte ni doble envío legado', async () => {
  const eventos: string[] = [];
  assert.deepEqual(await procesarPlazosOperativos(dependencias(eventos)), {
    promovidas: 1, enAlerta: 2, pendientes: 3, sinDestinatarios: [], recordatoriosGenerados: 1,
  });
  assert.deepEqual(eventos, ['promover', 'transaccion', 'recordatorios']);
});

it('fallo transaccional no se sustituye por un cambio de estado o envío no atómico', async () => {
  const eventos: string[] = [];
  const deps = dependencias(eventos);
  deps.vencimientos.evaluar = async () => { throw new Error('TRANSACCION_REVERTIDA'); };
  await assert.rejects(() => procesarPlazosOperativos(deps), /TRANSACCION_REVERTIDA/);
  assert.deepEqual(eventos, ['promover']);
});

it('una falla de recordatorio se propaga y no permite heartbeat de éxito', async () => {
  const deps = dependencias([]);
  deps.recordatorios.procesarRecordatorios = async () => { throw new Error('RECORDATORIO_FALLIDO'); };
  await assert.rejects(() => procesarPlazosOperativos(deps), /RECORDATORIO_FALLIDO/);
});
