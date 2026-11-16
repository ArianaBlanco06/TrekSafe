import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { ComandoAgregarEntradaBitacora } from './ComandoAgregarEntradaBitacora.js';

const AUTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERACION = '11111111-1111-4111-8111-111111111111';
const ENTRADA = '22222222-2222-4222-8222-222222222222';

describe('ComandoAgregarEntradaBitacora', () => {
  it('se crea con identidad y parámetros válidos; el texto se recorta y corrigeEntradaId ausente queda en null', () => {
    const comando = ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, { operacionId: OPERACION, texto: '  Llegamos  ' });
    assert.equal(comando.operacionId, OPERACION);
    assert.equal(comando.incidenteId, INCIDENTE);
    assert.equal(comando.autorId, AUTOR);
    assert.equal(comando.texto, 'Llegamos');
    assert.equal(comando.corrigeEntradaId, null);
  });

  it('conserva corrigeEntradaId cuando viene y acepta null explícito', () => {
    const corrige = ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, {
      operacionId: OPERACION, texto: 'Corrección', corrigeEntradaId: ENTRADA,
    });
    assert.equal(corrige.corrigeEntradaId, ENTRADA);
    const nula = ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, {
      operacionId: OPERACION, texto: 'Nota', corrigeEntradaId: null,
    });
    assert.equal(nula.corrigeEntradaId, null);
  });

  it('es inmutable', () => {
    const comando = ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, { operacionId: OPERACION, texto: 'x' });
    assert.equal(Object.isFrozen(comando), true);
    assert.throws(() => {
      (comando as { texto: string }).texto = 'otro';
    }, TypeError);
    assert.throws(() => {
      (comando as unknown as Record<string, unknown>).otro = 1;
    }, TypeError);
    assert.equal(comando.texto, 'x');
  });

  it('rechaza con ZodError: cuerpo vacío o que no es objeto, UUID inválidos, texto vacío, solo espacios o de 2001 caracteres', () => {
    const invalidos: unknown[] = [
      undefined, null, 'texto', 7, [], {},
      { texto: 'x' },
      { operacionId: OPERACION },
      { operacionId: 'no-es-uuid', texto: 'x' },
      { operacionId: OPERACION, texto: '' },
      { operacionId: OPERACION, texto: '  ' },
      { operacionId: OPERACION, texto: 'a'.repeat(2001) },
      { operacionId: OPERACION, texto: 5 },
      { operacionId: OPERACION, texto: 'x', corrigeEntradaId: 'no-es-uuid' },
    ];
    for (const cuerpo of invalidos) {
      assert.throws(() => ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, cuerpo), ZodError, JSON.stringify(cuerpo));
    }
  });

  it('acepta exactamente 2000 caracteres', () => {
    const comando = ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, { operacionId: OPERACION, texto: 'a'.repeat(2000) });
    assert.equal(comando.texto.length, 2000);
  });

  it('el autor sale de la identidad: claves extra como tipo o autorId dan ZodError', () => {
    for (const extra of [{ tipo: 'cierre' }, { autorId: '99999999-9999-4999-8999-999999999999' }, { registradaEn: '2000-01-01' }]) {
      assert.throws(
        () => ComandoAgregarEntradaBitacora.crear(AUTOR, INCIDENTE, { operacionId: OPERACION, texto: 'x', ...extra }),
        ZodError,
      );
    }
  });

  it('rechaza con ZodError un incidente o un autor que no son UUID', () => {
    const cuerpo = { operacionId: OPERACION, texto: 'x' };
    assert.throws(() => ComandoAgregarEntradaBitacora.crear(AUTOR, 'no-es-uuid', cuerpo), ZodError);
    assert.throws(() => ComandoAgregarEntradaBitacora.crear('no-es-uuid', INCIDENTE, cuerpo), ZodError);
  });
});
