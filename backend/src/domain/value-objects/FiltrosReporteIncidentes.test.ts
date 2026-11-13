import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ErrorFiltrosReporteIncidentes,
  type CodigoErrorFiltrosReporteIncidentes,
} from '../errors/ErrorFiltrosReporteIncidentes.js';
import { RESULTADOS_RESCATE } from './cierreIncidente.js';
import { FiltrosReporteIncidentes } from './FiltrosReporteIncidentes.js';

const rango = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-13' };

function conCodigo(codigo: CodigoErrorFiltrosReporteIncidentes) {
  return (error: unknown) => error instanceof ErrorFiltrosReporteIncidentes && error.codigo === codigo;
}

describe('HU-47: filtros del reporte de incidentes', () => {
  it('incluye completos ambos días y declara la fecha base y la zona horaria', () => {
    const filtros = new FiltrosReporteIncidentes(rango);
    assert.equal(filtros.desdeInclusivo, '2026-11-01T00:00:00.000Z');
    assert.equal(filtros.hastaExclusivo, '2026-11-14T00:00:00.000Z');
    assert.equal(filtros.fechaDesde, rango.fechaDesde);
    assert.equal(filtros.fechaHasta, rango.fechaHasta);
    assert.equal(filtros.criterioFecha, 'apertura');
    assert.equal(filtros.zonaHoraria, 'UTC');
    assert.equal(filtros.zona, null);
    assert.equal(filtros.resultado, null);
  });

  it('admite un solo día sin convertirlo en un intervalo vacío', () => {
    const filtros = new FiltrosReporteIncidentes({ fechaDesde: '2026-11-13', fechaHasta: '2026-11-13' });
    assert.equal(filtros.desdeInclusivo, '2026-11-13T00:00:00.000Z');
    assert.equal(filtros.hastaExclusivo, '2026-11-14T00:00:00.000Z');
  });

  it('permite elegir fecha de cierre', () => {
    assert.equal(new FiltrosReporteIncidentes({ ...rango, criterioFecha: 'cierre' }).criterioFecha, 'cierre');
  });

  it('respeta el final de mes, el año y los años bisiestos', () => {
    for (const [dia, siguiente] of [
      ['2026-11-30', '2026-12-01'],
      ['2026-12-31', '2027-01-01'],
      ['2028-02-29', '2028-03-01'],
      ['2000-02-29', '2000-03-01'],
      ['1900-02-28', '1900-03-01'],
    ]) {
      const filtros = new FiltrosReporteIncidentes({ fechaDesde: dia, fechaHasta: dia });
      assert.equal(filtros.hastaExclusivo, `${siguiente}T00:00:00.000Z`);
    }
  });

  it('mantiene un intervalo UTC estable durante cambios de horario de otras zonas', () => {
    const filtros = new FiltrosReporteIncidentes({ fechaDesde: '2026-03-08', fechaHasta: '2026-03-08' });
    assert.equal(Date.parse(filtros.hastaExclusivo) - Date.parse(filtros.desdeInclusivo), 86_400_000);
  });

  it('rechaza días inexistentes en cualquiera de los extremos', () => {
    for (const fecha of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-11-00', '2026-13-01', '0000-01-01']) {
      assert.throws(() => new FiltrosReporteIncidentes({ ...rango, fechaDesde: fecha }), conCodigo('FECHA_REPORTE_INVALIDA'));
      assert.throws(() => new FiltrosReporteIncidentes({ ...rango, fechaHasta: fecha }), conCodigo('FECHA_REPORTE_INVALIDA'));
    }
  });

  it('rechaza horas, fechas ambiguas y espacios en vez de reinterpretarlos', () => {
    for (const fecha of ['', '01/11/2026', '2026-1-01', ' 2026-11-01', '2026-11-01 ', '2026-11-01T00:00:00Z']) {
      assert.throws(() => new FiltrosReporteIncidentes({ ...rango, fechaDesde: fecha }), conCodigo('FECHA_REPORTE_INVALIDA'));
    }
  });

  it('rechaza un rango invertido', () => {
    assert.throws(() => new FiltrosReporteIncidentes({
      fechaDesde: '2026-11-14', fechaHasta: '2026-11-13',
    }), conCodigo('RANGO_REPORTE_INVALIDO'));
  });

  it('rechaza criterios de fecha desconocidos', () => {
    for (const criterioFecha of ['', 'retorno', 'cerrado_en', 'APERTURA']) {
      assert.throws(() => new FiltrosReporteIncidentes({ ...rango, criterioFecha }), conCodigo('CRITERIO_FECHA_INVALIDO'));
    }
  });

  it('normaliza la zona sin cambiar su texto ni interpretar comodines', () => {
    const filtros = new FiltrosReporteIncidentes({ ...rango, zona: '  Laguna 69_50%  ' });
    assert.equal(filtros.zona, 'Laguna 69_50%');
    assert.equal(new FiltrosReporteIncidentes({ ...rango, zona: '   ' }).zona, null);
  });

  it('admite hasta 120 caracteres de zona después de recortar espacios', () => {
    assert.equal(new FiltrosReporteIncidentes({ ...rango, zona: ` ${'a'.repeat(120)} ` }).zona?.length, 120);
    assert.throws(() => new FiltrosReporteIncidentes({ ...rango, zona: 'a'.repeat(121) }), conCodigo('ZONA_REPORTE_INVALIDA'));
  });

  it('reutiliza los cuatro resultados de HU-42 con ambos criterios de fecha', () => {
    for (const resultado of RESULTADOS_RESCATE) {
      for (const criterioFecha of ['apertura', 'cierre']) {
        const filtros = new FiltrosReporteIncidentes({ ...rango, criterioFecha, resultado });
        assert.equal(filtros.resultado, resultado);
        assert.equal(filtros.criterioFecha, criterioFecha);
      }
    }
  });

  it('rechaza resultados ajenos al catálogo y valores vacíos', () => {
    for (const resultado of ['', 'otro', 'EVACUADO', ' evacuado ']) {
      assert.throws(() => new FiltrosReporteIncidentes({ ...rango, resultado }), conCodigo('RESULTADO_REPORTE_INVALIDO'));
    }
  });

  it('conserva una instantánea inmutable de los filtros aplicados', () => {
    const datos = { ...rango, zona: 'Huaraz' };
    const filtros = new FiltrosReporteIncidentes(datos);
    datos.zona = 'Cusco';
    datos.fechaDesde = '2026-12-01';
    assert.equal(filtros.zona, 'Huaraz');
    assert.equal(filtros.fechaDesde, '2026-11-01');
    assert.throws(() => Object.assign(filtros, { zona: 'Cusco' }), TypeError);
  });
});
