import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ReporteIncidentesDAOSupabase } from './ReporteIncidentesDAOSupabase.js';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const filtros = new FiltrosReporteIncidentes({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-13' });

function cliente(respuesta: unknown) {
  return { rpc: async () => respuesta } as unknown as Pick<SupabaseClient, 'rpc'>;
}

describe('ReporteIncidentesDAOSupabase (HU-47)', () => {
  it('usa una sola RPC con el actor y el rango semiabierto, sin paginar incidentes', async () => {
    const llamadas: unknown[] = [];
    const c = { rpc: async (...args: unknown[]) => {
      llamadas.push(args);
      return { data: { atendidos: 1500, abiertos: 500, cerrados: 1000 }, error: null };
    } } as unknown as Pick<SupabaseClient, 'rpc'>;
    const resumen = await new ReporteIncidentesDAOSupabase(c).consultar(ACTOR, filtros);
    assert.deepEqual(llamadas, [['treksafe_consultar_estadisticas_incidentes', {
      p_rescatista_id: ACTOR, p_desde: '2026-11-01T00:00:00.000Z',
      p_hasta_exclusivo: '2026-11-14T00:00:00.000Z', p_criterio_fecha: 'apertura',
      p_zona: null, p_resultado: null,
    }]]);
    assert.deepEqual(resumen, { atendidos: 1500, abiertos: 500, cerrados: 1000 });
  });

  it('pasa zona literal y resultado, conservando caracteres de patrón como texto', async () => {
    const c = { rpc: async (_nombre: string, args: Record<string, unknown>) => {
      assert.equal(args.p_zona, 'Ruta_50%');
      assert.equal(args.p_resultado, 'evacuado');
      assert.equal(args.p_criterio_fecha, 'cierre');
      return { data: { atendidos: 1, abiertos: 0, cerrados: 1 }, error: null };
    } } as unknown as Pick<SupabaseClient, 'rpc'>;
    await new ReporteIncidentesDAOSupabase(c).consultar(ACTOR, new FiltrosReporteIncidentes({
      fechaDesde: '2026-11-01', fechaHasta: '2026-11-13', zona: 'Ruta_50%', criterioFecha: 'cierre', resultado: 'evacuado',
    }));
  });

  it('traduce únicamente el rechazo confirmado de perfil a 403', async () => {
    const dao = new ReporteIncidentesDAOSupabase(cliente({ data: null, error: { code: '42501', message: 'RESCATISTA_NO_VALIDADO' } }));
    await assert.rejects(dao.consultar(ACTOR, filtros), (error: unknown) => {
      assert.ok(error instanceof ErrorAplicacion);
      assert.equal(error.codigoEstado, 403);
      assert.equal(error.codigo, 'RESCATISTA_NO_VALIDADO');
      return true;
    });
  });

  it('un error de base o una RPC ausente da 500 genérico, nunca cero incidentes', async () => {
    for (const code of ['42501', 'PGRST202', 'XX000']) {
      const dao = new ReporteIncidentesDAOSupabase(cliente({ data: null, error: {
        code, message: 'Mensaje privado de la base', details: 'Contenido privado',
      } }));
      await assert.rejects(dao.consultar(ACTOR, filtros), (error: unknown) => {
        assert.ok(error instanceof ErrorAplicacion);
        assert.equal(error.codigoEstado, 500);
        assert.equal(error.codigo, 'REPORTE_NO_DISPONIBLE');
        assert.ok(!JSON.stringify(error).includes('privado'));
        return true;
      });
    }
  });

  it('oculta también errores de transporte', async () => {
    const c = { rpc: async () => { throw new Error('URL o clave privada'); } } as unknown as Pick<SupabaseClient, 'rpc'>;
    await assert.rejects(new ReporteIncidentesDAOSupabase(c).consultar(ACTOR, filtros), (error: unknown) => {
      assert.ok(error instanceof ErrorAplicacion);
      assert.equal(error.codigoEstado, 500);
      assert.ok(!error.message.includes('privada'));
      return true;
    });
  });

  it('rechaza conteos ausentes, negativos, fraccionarios, inseguros o inconsistentes', async () => {
    for (const data of [
      null, [], {}, { atendidos: '3', abiertos: 1, cerrados: 2 },
      { atendidos: 3, abiertos: -1, cerrados: 4 },
      { atendidos: 3, abiertos: 1.5, cerrados: 1.5 },
      { atendidos: 3, abiertos: 1, cerrados: 1 },
      { atendidos: Number.MAX_SAFE_INTEGER + 1, abiertos: 0, cerrados: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      await assert.rejects(new ReporteIncidentesDAOSupabase(cliente({ data, error: null })).consultar(ACTOR, filtros), ErrorAplicacion);
    }
  });

  it('acepta ceros y elimina campos ajenos al resumen', async () => {
    const resumen = await new ReporteIncidentesDAOSupabase(cliente({
      data: { atendidos: 0, abiertos: 0, cerrados: 0, resumenCierre: 'No publicar' }, error: null,
    })).consultar(ACTOR, filtros);
    assert.deepEqual(resumen, { atendidos: 0, abiertos: 0, cerrados: 0 });
    assert.ok(Object.isFrozen(resumen));
  });
});
