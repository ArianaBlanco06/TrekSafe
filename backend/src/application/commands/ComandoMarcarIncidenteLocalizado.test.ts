import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { ComandoMarcarIncidenteLocalizado } from './ComandoMarcarIncidenteLocalizado.js';

const RESCATISTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERACION = '11111111-1111-4111-8111-111111111111';

describe('ComandoMarcarIncidenteLocalizado', () => {
  it('se crea con identidad y parámetros válidos y es inmutable', () => {
    const c = ComandoMarcarIncidenteLocalizado.crear(RESCATISTA, INCIDENTE, { operacionId: OPERACION });
    assert.equal(c.operacionId, OPERACION);
    assert.equal(c.incidenteId, INCIDENTE);
    assert.equal(c.rescatistaId, RESCATISTA);
    assert.equal(Object.isFrozen(c), true);
  });

  it('rechaza con ZodError: cuerpo vacío o no objeto, UUID inválidos y claves extra', () => {
    const invalidos: unknown[] = [undefined, null, 'x', [], {}, { operacionId: 'no-es-uuid' }, { operacionId: OPERACION, estado: 'cerrado' },
      { operacionId: OPERACION, rescatistaId: RESCATISTA }];
    for (const cuerpo of invalidos) {
      assert.throws(() => ComandoMarcarIncidenteLocalizado.crear(RESCATISTA, INCIDENTE, cuerpo), ZodError, JSON.stringify(cuerpo));
    }
    assert.throws(() => ComandoMarcarIncidenteLocalizado.crear(RESCATISTA, 'no-es-uuid', { operacionId: OPERACION }), ZodError);
    assert.throws(() => ComandoMarcarIncidenteLocalizado.crear('no-es-uuid', INCIDENTE, { operacionId: OPERACION }), ZodError);
  });
});
