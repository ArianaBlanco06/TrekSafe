import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isoADatetimeLocal } from './fechaLocal';
import {
  SIN_VALOR,
  etiquetaAutor,
  etiquetaCampo,
  etiquetaTipo,
  formatearFecha,
  formatearValor,
  minutosAmpliados,
  presentarEntrada,
} from './historialCambiosPresentacion';
import type { EntradaHistorialCambios } from '../services/historialCambios';

const ampliacion: EntradaHistorialCambios = {
  id: 'e1', tipo: 'RETORNO_AMPLIADO', ocurridoEn: '2026-11-01T10:00:00Z', version: 3,
  autor: { esPropietario: true }, motivo: 'Retraso por clima', anonimizado: false,
  cambios: [{ campo: 'horaRetornoEstimada', antes: '2026-11-15T18:00:00Z', despues: '2026-11-15T18:45:00Z' }],
};

describe('HU-36: presentación del historial de cambios', () => {
  it('traduce tipos, campos y autor', () => {
    assert.equal(etiquetaTipo('EDITADA'), 'Edición');
    assert.equal(etiquetaTipo('CANCELADA'), 'Cancelación');
    assert.equal(etiquetaTipo('RETORNO_AMPLIADO'), 'Ampliación de retorno');
    assert.equal(etiquetaCampo('lugarFin'), 'Destino');
    assert.equal(etiquetaCampo('horaRetornoEstimada'), 'Retorno estimado');
    assert.equal(etiquetaAutor({ esPropietario: true }), 'Tú');
    assert.equal(etiquetaAutor({ esPropietario: false }), 'Otro usuario');
  });

  it('formatea fechas en hora local con la misma conversión que los formularios', () => {
    const iso = '2026-11-15T18:00:00Z';
    assert.equal(formatearFecha(iso), isoADatetimeLocal(iso).replace('T', ' '));
    assert.match(formatearFecha(iso), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(formatearFecha('no-es-fecha'), SIN_VALOR);
    assert.equal(formatearValor('horaInicio', iso), formatearFecha(iso));
  });

  it('muestra contactos solo como cantidad, nunca sus identificadores', () => {
    assert.equal(formatearValor('idsContactos', ['c1']), '1 contacto');
    assert.equal(formatearValor('idsContactos', ['c1', 'c2']), '2 contactos');
    assert.equal(formatearValor('idsContactos', []), '0 contactos');
    assert.equal(formatearValor('idsContactos', null), '0 contactos');
  });

  it('formatea listas, nulos, tolerancia y estado', () => {
    assert.equal(formatearValor('coordenadasInicio', null), SIN_VALOR);
    assert.equal(formatearValor('lugarFin', ''), SIN_VALOR);
    assert.equal(formatearValor('nombresAcompanantes', ['Ana', 'Luis']), 'Ana, Luis');
    assert.equal(formatearValor('nombresAcompanantes', []), 'Ninguno');
    assert.equal(formatearValor('minutosTolerancia', 45), '45 min');
    assert.equal(formatearValor('estado', 'cancelada'), 'Cancelada');
    assert.equal(formatearValor('lugarFin', 'Laguna 69'), 'Laguna 69');
  });

  it('deriva los minutos ampliados de antes y después', () => {
    assert.equal(minutosAmpliados(ampliacion), 45);
    assert.equal(minutosAmpliados({ ...ampliacion, tipo: 'EDITADA' }), null);
    assert.equal(minutosAmpliados({ ...ampliacion, cambios: [] }), null);
    assert.equal(presentarEntrada({ ...ampliacion, cambios: [
      { campo: 'horaRetornoEstimada', antes: '2026-11-15T18:00:00Z', despues: '2026-11-15T18:01:00Z' },
    ] }).detalleAmpliacion, '+1 minuto');
  });

  it('distingue sin detalle de anonimizado', () => {
    const vacia = { ...ampliacion, tipo: 'EDITADA' as const, motivo: null, cambios: [] };
    assert.equal(presentarEntrada({ ...vacia, anonimizado: false }).sinDetalle, true);
    assert.equal(presentarEntrada({ ...vacia, anonimizado: true }).sinDetalle, false);
    assert.equal(presentarEntrada({ ...vacia, motivo: 'Mal clima' }).sinDetalle, false);
    assert.equal(presentarEntrada(ampliacion).sinDetalle, false);
  });

  it('presenta una entrada completa en el orden recibido', () => {
    const presentada = presentarEntrada(ampliacion);
    assert.equal(presentada.titulo, 'Ampliación de retorno');
    assert.equal(presentada.autor, 'Tú');
    assert.equal(presentada.detalleAmpliacion, '+45 minutos');
    assert.equal(presentada.motivo, 'Retraso por clima');
    assert.deepEqual(presentada.filas.map((fila) => fila.etiqueta), ['Retorno estimado']);
  });
});
