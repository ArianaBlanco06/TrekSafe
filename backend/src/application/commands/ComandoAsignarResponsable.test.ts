import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { ComandoAsignarResponsable } from './ComandoAsignarResponsable.js';

const RESCATISTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXPEDICION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERACION = '11111111-1111-4111-8111-111111111111';

describe('ComandoAsignarResponsable', () => {
  it('se crea con identidad y parámetros válidos', () => {
    const comando = ComandoAsignarResponsable.crear(RESCATISTA, EXPEDICION, { operacionId: OPERACION });
    assert.equal(comando.operacionId, OPERACION);
    assert.equal(comando.expedicionId, EXPEDICION);
    assert.equal(comando.rescatistaId, RESCATISTA);
  });

  it('es inmutable', () => {
    const comando = ComandoAsignarResponsable.crear(RESCATISTA, EXPEDICION, { operacionId: OPERACION });
    assert.equal(Object.isFrozen(comando), true);
    assert.throws(() => {
      (comando as { operacionId: string }).operacionId = '22222222-2222-4222-8222-222222222222';
    }, TypeError);
    assert.throws(() => {
      (comando as unknown as Record<string, unknown>).otro = 1;
    }, TypeError);
    assert.equal(comando.operacionId, OPERACION);
  });

  it('el rescatista y la expedición vienen de la identidad y de la ruta, no del cuerpo', () => {
    const comando = ComandoAsignarResponsable.crear(RESCATISTA, EXPEDICION, {
      operacionId: OPERACION,
      rescatistaId: '99999999-9999-4999-8999-999999999999',
      expedicionId: '88888888-8888-4888-8888-888888888888',
    });
    assert.equal(comando.rescatistaId, RESCATISTA);
    assert.equal(comando.expedicionId, EXPEDICION);
  });

  it('rechaza con ZodError un cuerpo sin operacionId, nulo o con una operación que no es UUID', () => {
    for (const cuerpo of [undefined, null, {}, 'texto', 7, { operacionId: 'no-es-uuid' }, { operacionId: 5 }]) {
      assert.throws(() => ComandoAsignarResponsable.crear(RESCATISTA, EXPEDICION, cuerpo), ZodError);
    }
  });

  it('rechaza con ZodError una expedición o un rescatista que no son UUID', () => {
    assert.throws(() => ComandoAsignarResponsable.crear(RESCATISTA, 'no-es-uuid', { operacionId: OPERACION }), ZodError);
    assert.throws(() => ComandoAsignarResponsable.crear('no-es-uuid', EXPEDICION, { operacionId: OPERACION }), ZodError);
  });
});
