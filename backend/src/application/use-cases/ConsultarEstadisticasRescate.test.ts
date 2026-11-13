import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZodError } from 'zod';
import type { IReporteIncidentesDAO } from '../../domain/repositories/IReporteIncidentesDAO.js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ConsultarEstadisticasRescate } from './ConsultarEstadisticasRescate.js';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rango = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-13' };

describe('ConsultarEstadisticasRescate (HU-47)', () => {
  it('pasa el actor y filtros normalizados al DAO y explica el conjunto consultado', async () => {
    const dao: IReporteIncidentesDAO = {
      async consultar(actor, filtros) {
        assert.equal(actor, ACTOR);
        assert.ok(filtros instanceof FiltrosReporteIncidentes);
        assert.equal(filtros.zona, 'Huaraz');
        assert.equal(filtros.criterioFecha, 'cierre');
        assert.equal(filtros.resultado, 'evacuado');
        assert.equal(filtros.hastaExclusivo, '2026-11-14T00:00:00.000Z');
        return { atendidos: 3, abiertos: 0, cerrados: 3 };
      },
    };
    const reporte = await new ConsultarEstadisticasRescate(dao).ejecutar(ACTOR, {
      ...rango, zona: ' Huaraz ', criterioFecha: 'cierre', resultado: 'evacuado',
    });
    assert.deepEqual(reporte.resumen, { atendidos: 3, abiertos: 0, cerrados: 3 });
    assert.equal(reporte.filtros.zonaHoraria, 'UTC');
    assert.equal(reporte.filtros.fechaHasta, rango.fechaHasta);
  });

  it('conserva los filtros cuando no hay coincidencias', async () => {
    const consulta = new ConsultarEstadisticasRescate({ consultar: async () => ({ atendidos: 0, abiertos: 0, cerrados: 0 }) });
    const reporte = await consulta.ejecutar(ACTOR, { ...rango, zona: 'Destino inexistente' });
    assert.deepEqual(reporte.resumen, { atendidos: 0, abiertos: 0, cerrados: 0 });
    assert.equal(reporte.filtros.zona, 'Destino inexistente');
  });

  it('rechaza errores de calendario, rango, criterio y resultado antes de consultar', async () => {
    let llamadas = 0;
    const consulta = new ConsultarEstadisticasRescate({ consultar: async () => {
      llamadas += 1;
      return { atendidos: 0, abiertos: 0, cerrados: 0 };
    } });
    for (const [extra, codigo] of [
      [{ fechaDesde: '2026-02-30' }, 'FECHA_REPORTE_INVALIDA'],
      [{ fechaDesde: '2026-11-15' }, 'RANGO_REPORTE_INVALIDO'],
      [{ criterioFecha: 'retorno' }, 'CRITERIO_FECHA_INVALIDO'],
      [{ resultado: 'otro' }, 'RESULTADO_REPORTE_INVALIDO'],
      [{ zona: 'a'.repeat(121) }, 'ZONA_REPORTE_INVALIDA'],
    ] as const) {
      await assert.rejects(consulta.ejecutar(ACTOR, { ...rango, ...extra }), (error: unknown) => {
        assert.ok(error instanceof ErrorAplicacion);
        assert.equal(error.codigoEstado, 400);
        assert.equal(error.codigo, codigo);
        return true;
      });
    }
    assert.equal(llamadas, 0);
  });

  it('rechaza parámetros desconocidos, repetidos, objetos y actores inválidos', async () => {
    const consulta = new ConsultarEstadisticasRescate({ consultar: async () => assert.fail('No debe consultar') });
    for (const datos of [
      {}, { ...rango, rescatistaId: ACTOR }, { ...rango, responsableId: ACTOR },
      { ...rango, fechaDesde: ['2026-11-01', '2026-11-02'] },
      { ...rango, zona: { texto: 'Huaraz' } }, { ...rango, resultado: null },
    ]) await assert.rejects(consulta.ejecutar(ACTOR, datos), ZodError);
    await assert.rejects(consulta.ejecutar('actor-invalido', rango), ZodError);
  });

  it('no oculta un rechazo de perfil ni lo transforma en un reporte vacío', async () => {
    const error = new ErrorAplicacion(403, 'Perfil no validado', 'RESCATISTA_NO_VALIDADO');
    const consulta = new ConsultarEstadisticasRescate({ consultar: async () => { throw error; } });
    await assert.rejects(consulta.ejecutar(ACTOR, rango), (recibido) => recibido === error);
  });

  it('solo publica los conteos aunque el adaptador devuelva campos adicionales', async () => {
    const consulta = new ConsultarEstadisticasRescate({ consultar: async () => ({
      atendidos: 2, abiertos: 1, cerrados: 1, fichaMedica: 'No publicar', responsableId: ACTOR,
    }) });
    const reporte = await consulta.ejecutar(ACTOR, rango);
    assert.deepEqual(Object.keys(reporte).sort(), ['filtros', 'resumen']);
    assert.deepEqual(reporte.resumen, { atendidos: 2, abiertos: 1, cerrados: 1 });
  });
});
