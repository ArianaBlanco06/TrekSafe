import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filtrosEstadisticasIniciales, presentarDiaReporte, validarFechasEstadisticas } from './estadisticasRescate';

describe('HU-47: fechas del reporte', () => {
  it('incluye hoy y los 29 días previos usando UTC aunque el navegador esté en otro día', () => {
    assert.deepEqual(filtrosEstadisticasIniciales(new Date('2026-01-01T23:30:00-05:00')), {
      fechaDesde: '2025-12-04', fechaHasta: '2026-01-02', criterioFecha: 'apertura',
    });
  });
  it('admite el mismo día y el 29 de febrero de un año bisiesto', () => {
    assert.equal(validarFechasEstadisticas('2028-02-29', '2028-02-29'), null);
  });
  it('rechaza extremos inexistentes, ausentes, ambiguos e invertidos', () => {
    for (const fecha of ['', '2026-02-29', '2026-11-31', '13/11/2026', '0000-01-01']) {
      assert.ok(validarFechasEstadisticas(fecha, '2026-11-13'));
      assert.ok(validarFechasEstadisticas('2026-11-01', fecha));
    }
    assert.ok(validarFechasEstadisticas('2026-11-14', '2026-11-13'));
  });
  it('presenta un día sin convertirlo a la zona horaria del navegador', () => {
    assert.equal(presentarDiaReporte('2026-11-13'), '13/11/2026');
  });
});
