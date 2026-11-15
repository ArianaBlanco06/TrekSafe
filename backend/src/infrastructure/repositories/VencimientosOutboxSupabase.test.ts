import assert from 'node:assert/strict';
import { it } from 'node:test';
import { VencimientosOutboxSupabase } from './VencimientosOutboxSupabase.js';

it('productor usa exclusivamenteRPC024 sin fallback no transaccional', async () => {
  const repo = new VencimientosOutboxSupabase({ rpc: async (nombre: string, entrada: unknown) => {
    assert.equal(nombre, 'treksafe_evaluar_vencimientos_con_outbox');
    assert.deepEqual(entrada, { p_limite: 100 });
    return { data: { enAlerta: 1, pendientes: 2, sinDestinatarios: [] }, error: null };
  } } as never);
  assert.deepEqual(await repo.evaluar(100), { enAlerta: 1, pendientes: 2, sinDestinatarios: [] });
});

it('SQL ausente o respuesta inválida bloquea el ciclo sin filtrar detalles internos', async () => {
  const ausente = new VencimientosOutboxSupabase({ rpc: async () => ({ data: null,
    error: { message: 'credencial-ficticia-no-publicar' } }) } as never);
  await assert.rejects(() => ausente.evaluar(100), { message: 'VENCIMIENTOS_PERSISTENCIA_NO_DISPONIBLE' });
  const invalido = new VencimientosOutboxSupabase({ rpc: async () => ({ data: {}, error: null }) } as never);
  await assert.rejects(() => invalido.evaluar(100), { message: 'VENCIMIENTOS_RESPUESTA_INVALIDA' });
});
