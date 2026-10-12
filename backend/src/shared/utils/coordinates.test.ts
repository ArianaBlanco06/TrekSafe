import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularNivelRiesgoExpedicion,
} from '../../application/services/servicioRescate.js';
import { parseDecimalCoordinates, validateCoordinateInput } from './coordinates.js';

describe('calcularNivelRiesgoExpedicion', () => {
  const fechaLimite = new Date(Date.now() + 60 * 60_000).toISOString();

  it('devuelve verde cuando hay bastante tiempo restante', () => {
    const resultado = calcularNivelRiesgoExpedicion('en_progreso', fechaLimite);
    assert.equal(resultado.nivelRiesgo, 'verde');
    assert.ok(resultado.minutosRestantes && resultado.minutosRestantes > 30);
  });

  it('devuelve amarillo dentro de 30 minutos', () => {
    const pronto = new Date(Date.now() + 20 * 60_000).toISOString();
    const resultado = calcularNivelRiesgoExpedicion('en_progreso', pronto);
    assert.equal(resultado.nivelRiesgo, 'amarillo');
  });

  it('devuelve rojo para estado alerta', () => {
    const resultado = calcularNivelRiesgoExpedicion('alerta', fechaLimite);
    assert.equal(resultado.nivelRiesgo, 'rojo');
  });
});

describe('parseDecimalCoordinates', () => {
  it('acepta coordenadas decimales válidas', () => {
    const analizado = parseDecimalCoordinates('-9.5300, -77.5300');
    assert.ok(analizado);
    assert.equal(analizado.lat, -9.53);
    assert.equal(analizado.lon, -77.53);
  });

  it('rechaza entrada malformada', () => {
    assert.equal(parseDecimalCoordinates('not-coords'), null);
  });

  it('rechaza coordenadas fuera de Perú vía validateCoordinateInput', () => {
    assert.ok(validateCoordinateInput('40.7128, -74.0060'));
  });
});
