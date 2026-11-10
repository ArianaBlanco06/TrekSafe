import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { ComandoAceptarRelevo } from './ComandoAceptarRelevo.js';
import { ComandoProponerRelevo } from './ComandoProponerRelevo.js';

const RESCATISTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DESTINATARIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPEDICION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RELEVO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OPERACION = '11111111-1111-4111-8111-111111111111';

const cuerpoProponer = (extra: Record<string, unknown> = {}) => ({
  operacionId: OPERACION,
  destinatarioId: DESTINATARIO,
  motivo: 'Cambio de turno',
  versionIncidente: 1,
  ...extra,
});

describe('ComandoProponerRelevo', () => {
  it('se crea con identidad y parámetros válidos', () => {
    const comando = ComandoProponerRelevo.crear(RESCATISTA, EXPEDICION, cuerpoProponer());
    assert.equal(comando.operacionId, OPERACION);
    assert.equal(comando.expedicionId, EXPEDICION);
    assert.equal(comando.rescatistaId, RESCATISTA);
    assert.equal(comando.destinatarioId, DESTINATARIO);
    assert.equal(comando.motivo, 'Cambio de turno');
    assert.equal(comando.versionIncidente, 1);
  });

  it('es inmutable', () => {
    const comando = ComandoProponerRelevo.crear(RESCATISTA, EXPEDICION, cuerpoProponer());
    assert.equal(Object.isFrozen(comando), true);
    assert.throws(() => {
      (comando as { motivo: string }).motivo = 'otro';
    }, TypeError);
    assert.throws(() => {
      (comando as unknown as Record<string, unknown>).otro = 1;
    }, TypeError);
    assert.equal(comando.motivo, 'Cambio de turno');
  });

  it('quien propone y la expedición vienen del JWT y de la ruta, no del cuerpo', () => {
    const comando = ComandoProponerRelevo.crear(
      RESCATISTA,
      EXPEDICION,
      cuerpoProponer({
        rescatistaId: '99999999-9999-4999-8999-999999999999',
        expedicionId: '88888888-8888-4888-8888-888888888888',
      }),
    );
    assert.equal(comando.rescatistaId, RESCATISTA);
    assert.equal(comando.expedicionId, EXPEDICION);
  });

  it('recorta los espacios del motivo', () => {
    assert.equal(ComandoProponerRelevo.crear(RESCATISTA, EXPEDICION, cuerpoProponer({ motivo: '  Turno  ' })).motivo, 'Turno');
  });

  it('acepta un motivo de exactamente 280 caracteres', () => {
    const motivo = 'x'.repeat(280);
    assert.equal(ComandoProponerRelevo.crear(RESCATISTA, EXPEDICION, cuerpoProponer({ motivo })).motivo, motivo);
  });

  const invalidos: [string, unknown][] = [
    ['sin cuerpo', undefined],
    ['cuerpo nulo', null],
    ['cuerpo que no es objeto', 'texto'],
    ['sin operacionId', cuerpoProponer({ operacionId: undefined })],
    ['operacionId que no es UUID', cuerpoProponer({ operacionId: 'no-es-uuid' })],
    ['sin destinatario', cuerpoProponer({ destinatarioId: undefined })],
    ['destinatario que no es UUID', cuerpoProponer({ destinatarioId: 'luis' })],
    ['sin motivo', cuerpoProponer({ motivo: undefined })],
    ['motivo vacío', cuerpoProponer({ motivo: '' })],
    ['motivo solo con espacios', cuerpoProponer({ motivo: '    ' })],
    ['motivo de 281 caracteres', cuerpoProponer({ motivo: 'x'.repeat(281) })],
    ['motivo que no es texto', cuerpoProponer({ motivo: 5 })],
    ['sin versión', cuerpoProponer({ versionIncidente: undefined })],
    ['versión cero', cuerpoProponer({ versionIncidente: 0 })],
    ['versión negativa', cuerpoProponer({ versionIncidente: -1 })],
    ['versión decimal', cuerpoProponer({ versionIncidente: 1.5 })],
    ['versión como texto', cuerpoProponer({ versionIncidente: '1' })],
  ];
  for (const [descripcion, cuerpo] of invalidos) {
    it(`rechaza con ZodError: ${descripcion}`, () => {
      assert.throws(() => ComandoProponerRelevo.crear(RESCATISTA, EXPEDICION, cuerpo), ZodError);
    });
  }

  it('rechaza una expedición o un rescatista que no son UUID', () => {
    assert.throws(() => ComandoProponerRelevo.crear(RESCATISTA, 'no-es-uuid', cuerpoProponer()), ZodError);
    assert.throws(() => ComandoProponerRelevo.crear('no-es-uuid', EXPEDICION, cuerpoProponer()), ZodError);
  });
});

describe('ComandoAceptarRelevo', () => {
  it('se crea con identidad y parámetros válidos, sin versión', () => {
    const comando = ComandoAceptarRelevo.crear(DESTINATARIO, EXPEDICION, RELEVO, { operacionId: OPERACION });
    assert.equal(comando.operacionId, OPERACION);
    assert.equal(comando.expedicionId, EXPEDICION);
    assert.equal(comando.relevoId, RELEVO);
    assert.equal(comando.rescatistaId, DESTINATARIO);
    assert.equal('versionIncidente' in comando, false, 'aceptar no lleva versión');
  });

  it('es inmutable', () => {
    const comando = ComandoAceptarRelevo.crear(DESTINATARIO, EXPEDICION, RELEVO, { operacionId: OPERACION });
    assert.equal(Object.isFrozen(comando), true);
    assert.throws(() => {
      (comando as { operacionId: string }).operacionId = '22222222-2222-4222-8222-222222222222';
    }, TypeError);
    assert.equal(comando.operacionId, OPERACION);
  });

  it('quien acepta, la expedición y el relevo vienen del JWT y de la ruta, no del cuerpo', () => {
    const comando = ComandoAceptarRelevo.crear(DESTINATARIO, EXPEDICION, RELEVO, {
      operacionId: OPERACION,
      rescatistaId: '99999999-9999-4999-8999-999999999999',
      expedicionId: '88888888-8888-4888-8888-888888888888',
      relevoId: '77777777-7777-4777-8777-777777777777',
    });
    assert.equal(comando.rescatistaId, DESTINATARIO);
    assert.equal(comando.expedicionId, EXPEDICION);
    assert.equal(comando.relevoId, RELEVO);
  });

  for (const [descripcion, cuerpo] of [
    ['sin cuerpo', undefined],
    ['cuerpo nulo', null],
    ['sin operacionId', {}],
    ['operacionId que no es UUID', { operacionId: 'no-es-uuid' }],
    ['operacionId que no es texto', { operacionId: 7 }],
  ] as [string, unknown][]) {
    it(`rechaza con ZodError: ${descripcion}`, () => {
      assert.throws(() => ComandoAceptarRelevo.crear(DESTINATARIO, EXPEDICION, RELEVO, cuerpo), ZodError);
    });
  }

  it('rechaza un relevo, una expedición o un rescatista que no son UUID', () => {
    const cuerpo = { operacionId: OPERACION };
    assert.throws(() => ComandoAceptarRelevo.crear(DESTINATARIO, EXPEDICION, 'no-es-uuid', cuerpo), ZodError);
    assert.throws(() => ComandoAceptarRelevo.crear(DESTINATARIO, 'no-es-uuid', RELEVO, cuerpo), ZodError);
    assert.throws(() => ComandoAceptarRelevo.crear('no-es-uuid', EXPEDICION, RELEVO, cuerpo), ZodError);
  });
});
