import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ReporteIncidentesDAOSupabase } from './ReporteIncidentesDAOSupabase.js';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const filtros = new FiltrosReporteIncidentes({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-13', zona: 'Huaraz', criterioFecha: 'cierre', resultado: 'evacuado' });
const fila = { id: ACTOR, zona: 'Huaraz', abiertoEn: '2026-11-01T12:00:00+00:00', cerradoEn: '2026-11-02T12:00:00+00:00', estado: 'cerrado', resultado: 'evacuado' };
const cliente = (respuesta: unknown) => ({ rpc: async () => respuesta }) as unknown as Pick<SupabaseClient, 'rpc'>;

describe('HU-48: páginas en ReporteIncidentesDAOSupabase', () => {
  it('envía filtros, actor, cursor exclusivo y límite en una sola RPC', async () => {
    const llamadas: unknown[] = [];
    const c = { rpc: async (...args: unknown[]) => {
      llamadas.push(args); return { data: { incidentes: [fila], hayMas: true }, error: null };
    } } as unknown as Pick<SupabaseClient, 'rpc'>;
    const pagina = await new ReporteIncidentesDAOSupabase(c).leerPagina(ACTOR, filtros, { despuesDe: ACTOR, tamano: 200 });
    assert.deepEqual(llamadas, [['treksafe_leer_pagina_incidentes_reporte', {
      p_rescatista_id: ACTOR, p_desde: filtros.desdeInclusivo, p_hasta_exclusivo: filtros.hastaExclusivo,
      p_criterio_fecha: 'cierre', p_zona: 'Huaraz', p_resultado: 'evacuado', p_despues_de: ACTOR, p_limite: 200,
    }]]);
    assert.equal(pagina.incidentes[0].cerradoEn, '2026-11-02T12:00:00.000Z');
    assert.ok(Object.isFrozen(pagina.incidentes));
  });

  it('selecciona solo seis campos, conservando un cierre histórico sin resultado', async () => {
    const dao = new ReporteIncidentesDAOSupabase(cliente({ data: { incidentes: [{ ...fila, resultado: null, fichaMedica: 'no publicar' }], hayMas: false }, error: null }));
    const pagina = await dao.leerPagina(ACTOR, filtros, { despuesDe: null, tamano: 200 });
    assert.deepEqual(Object.keys(pagina.incidentes[0]).sort(), ['abiertoEn', 'cerradoEn', 'estado', 'id', 'resultado', 'zona']);
    assert.equal(pagina.incidentes[0].resultado, null);
  });

  it('rechaza respuestas incompletas, estados/fechas inválidos y páginas demasiado grandes', async () => {
    for (const data of [null, {}, { incidentes: [], hayMas: true },
      ...[{ id: 'invalido' }, { estado: 'otro' }, { abiertoEn: 'ayer' }, { cerradoEn: null }, { resultado: 'otro' }, { zona: null }]
        .map(extra => ({ incidentes: [{ ...fila, ...extra }], hayMas: false })),
      { incidentes: [fila, fila], hayMas: false },
    ]) await assert.rejects(new ReporteIncidentesDAOSupabase(cliente({ data, error: null })).leerPagina(ACTOR, filtros, { despuesDe: null, tamano: 1 }), ErrorAplicacion);
  });

  it('rechaza límites y cursores inválidos sin ejecutar RPC', async () => {
    const c = { rpc: async () => assert.fail('No debe invocar') } as unknown as Pick<SupabaseClient, 'rpc'>;
    for (const tamano of [0, -1, 501, 1.5]) await assert.rejects(new ReporteIncidentesDAOSupabase(c).leerPagina(ACTOR, filtros, { despuesDe: null, tamano }), ErrorAplicacion);
    await assert.rejects(new ReporteIncidentesDAOSupabase(c).leerPagina(ACTOR, filtros, { despuesDe: 'invalido', tamano: 200 }), ErrorAplicacion);
  });

  it('aplica los mismos errores de permisos y privacidad que la consulta de HU-47', async () => {
    for (const [code, message, estado] of [['42501', 'RESCATISTA_NO_VALIDADO', 403], ['PGRST202', 'Detalles privados de SQL', 500]]) {
      const dao = new ReporteIncidentesDAOSupabase(cliente({ data: null, error: { code, message } }));
      await assert.rejects(dao.leerPagina(ACTOR, filtros, { despuesDe: null, tamano: 200 }), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion); assert.equal(e.codigoEstado, estado); assert.ok(!e.message.includes('SQL')); return true;
      });
    }
  });
});
